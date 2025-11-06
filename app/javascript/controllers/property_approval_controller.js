import { Controller } from "@hotwired/stimulus";
import { Turbo } from "@hotwired/turbo-rails";
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.10.0/dist/ethers.min.js";

// Controlador híbrido: cada aprobación se firma on-chain y luego se PATCH-ea el estado en Rails con el tx_hash.
export default class extends Controller {
  // recordId: id en BD (PropertyRecord.id), onChainId: id del contrato
  static values = { recordId: Number, onChainId: Number };

  connect() {
    if (!window.ethereum) { this._toast('MetaMask no detectado'); }
  }

  async notaryApprove(e) { return this._run(e, 'notaryApprove', 'notary_approve', 'Aprobación notario'); }
  async buyerApprove(e) { return this._run(e, 'buyerApprove', 'buyer_approve', 'Aprobación comprador'); }
  async governmentSeal(e) { return this._run(e, 'governmentSeal', 'government_seal', 'Sellado gobierno'); }

  async _run(event, contractFn, railsPath, human) {
    event.preventDefault();
    try {
      if (this._busy) { return; }
      this._busy = true;
      const onChainId = this.onChainIdValue; // ID on-chain para la transacción
      const recordId = this.recordIdValue;  // ID persistente en Rails para rutas
      if (onChainId == null) { throw new Error('ID on-chain no disponible aún'); }
      if (recordId == null) { throw new Error('ID de registro Rails faltante'); }
      if (!window.ethereum) throw new Error('MetaMask requerido');
      await this._ensureNetwork();
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contractAddress = document.body.dataset.contractAddress;
      if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress || '')) throw new Error('CONTRACT_ADDRESS inválido');
      const abi = [
        'function getProperty(uint256 propertyId) view returns (tuple(uint256 id,address seller,address buyer,address notary,address government,bytes32 docHash,uint8 status,uint64 createdAt,uint64 updatedAt,bool buyerApproved,bool notaryApproved,bool governmentSealed))',
        'function notaryApprove(uint256 propertyId)',
        'function buyerApprove(uint256 propertyId)',
        'function governmentSeal(uint256 propertyId)'
      ];
      const contract = new ethers.Contract(contractAddress, abi, signer);
      // Preflight: verificar existencia (evita revert en estimateGas por Property: not found)
      try {
        await contract.getProperty(onChainId);
      } catch (eExist) {
        this._toast('No existe propertyId ' + onChainId + ' en contrato actual. Posible redeploy. Registra de nuevo.');
        return;
      }
      // Deshabilitar botón fuente para evitar doble click
      const btn = event.currentTarget;
      if (btn && btn.disabled !== undefined) { btn.disabled = true; btn.dataset.originalText = btn.textContent; btn.textContent = 'Firmando...'; }
      this._toast('Firmando ' + human + '...', 'info');
      const tx = await contract[contractFn](onChainId);
      this._toast('Tx enviada, esperando confirmación...', 'info');
      // Esperar receipt con pequeño fallback si MetaMask UI se queda abierta
      let receipt;
      try {
        receipt = await tx.wait();
      } catch (waitErr) {
        // Log y reintento: a veces provider se invalida temporalmente
        console.warn('tx.wait fallo inicial, reintentando', waitErr);
        receipt = await tx.wait();
      }
      await this._patchRails(recordId, railsPath, receipt.hash, human);
      this._toast(human + ' confirmada', 'success');
      if (btn) { btn.textContent = btn.dataset.originalText || btn.textContent; }
    } catch (err) {
      console.error(err);
      this._toast(this._friendlyError(err), 'error');
    }
    finally {
      this._busy = false;
      const btn = event.currentTarget;
      if (btn && btn.disabled !== undefined) { btn.disabled = false; }
    }
  }

  async _patchRails(recordId, path, txHash, human) {
    const url = `/properties/${recordId}/${path}`;
    const fd = new FormData();
    fd.append('tx_hash', txHash);
    const resp = await fetch(url, { method: 'PATCH', headers: { 'X-CSRF-Token': this._csrf(), 'Accept': 'text/vnd.turbo-stream.html' }, body: fd });
    if (!resp.ok) { throw new Error('Rails rechazo ' + resp.status); }
    const streamHtml = await resp.text();
    // Consumir manualmente los turbo-stream recibidos (fetch no los procesa solo)
    if (streamHtml.includes('<turbo-stream')) {
      Turbo.renderStreamMessage(streamHtml);
      this._postStreamValidate(recordId, path);
    } else {
      // Fallback: si no llega turbo-stream (redirect HTML), recargar secciones
      try {
        const full = await fetch(`/properties/${recordId}`, { headers: { 'Accept': 'text/html' } });
        if (full.ok) {
          const html = await full.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          ['status', 'progress', 'actions', 'transactions'].forEach(section => {
            const newEl = doc.getElementById(`${section}_${recordId}`);
            if (newEl) {
              const current = document.getElementById(`${section}_${recordId}`);
              if (current) { current.innerHTML = newEl.innerHTML; }
            }
          });
          this._postStreamValidate(recordId, path);
        }
      } catch (fallbackErr) { console.warn('Fallback turbo fetch fallo', fallbackErr); }
    }
  }

  _postStreamValidate(recordId, path) {
    // Validar que el status se actualizó; si no, intentar una recarga específica.
    try {
      const statusEl = document.querySelector(`#status_${recordId} .status`);
      if (!statusEl) return;
      const text = (statusEl.textContent || '').toLowerCase();
      if (path === 'buyer_approve' && !text.includes('buyer') && !text.includes('buyer approved')) {
        this._forceReloadSection(recordId);
      } else if (path === 'notary_approve' && !text.includes('notary') && !text.includes('notary approved')) {
        this._forceReloadSection(recordId);
      } else if (path === 'government_seal' && !text.includes('government') && !text.includes('government sealed')) {
        this._forceReloadSection(recordId);
      }
    } catch (e) { console.warn('postStream validate error', e); }
  }

  async _forceReloadSection(recordId) {
    try {
      const full = await fetch(`/properties/${recordId}`, { headers: { 'Accept': 'text/html' } });
      if (!full.ok) return;
      const html = await full.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const statusWrap = doc.getElementById(`status_${recordId}`);
      if (statusWrap) {
        const current = document.getElementById(`status_${recordId}`);
        if (current) { current.innerHTML = statusWrap.innerHTML; }
      }
      const actionsWrap = doc.getElementById(`actions_${recordId}`);
      if (actionsWrap) {
        const currentA = document.getElementById(`actions_${recordId}`);
        if (currentA) { currentA.innerHTML = actionsWrap.innerHTML; }
      }
    } catch (e) { console.warn('forceReloadSection fallo', e); }
  }

  async _ensureNetwork() {
    const desired = '0x7a69'; // 31337
    const current = await window.ethereum.request({ method: 'eth_chainId' });
    if (current !== desired) {
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: desired }] });
      } catch (e) {
        if (e.code === 4902) {
          await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: desired, chainName: 'Hardhat Local', rpcUrls: ['http://127.0.0.1:8545'], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }] });
        } else { throw e; }
      }
    }
  }

  _csrf() { const m = document.querySelector('meta[name=csrf-token]'); return m && m.content; }
  _toast(msg, type = 'info') {
    let box = document.getElementById('flash-messages');
    if (!box) { box = document.createElement('div'); box.id = 'flash-messages'; document.body.prepend(box); }
    // Normalizar mensaje evitando vacío
    if (msg == null) msg = '';
    msg = String(msg).trim();
    if (!msg.length) {
      msg = (type === 'error') ? 'Ocurrió un error inesperado.' : 'Acción completada.';
    }
    const el = document.createElement('div');
    el.className = 'flash ' + (type === 'error' ? 'flash--error' : type === 'success' ? 'flash--success' : type === 'warn' ? 'flash--warn' : '');
    const span = document.createElement('span');
    span.className = 'flash-msg';
    span.textContent = msg;
    const btn = document.createElement('button');
    btn.className = 'flash-close';
    btn.setAttribute('aria-label', 'Cerrar');
    btn.textContent = '×';
    el.appendChild(span);
    el.appendChild(btn);
    box.appendChild(el);
    const remove = () => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 380); };
    btn.addEventListener('click', remove);
    setTimeout(remove, type === 'error' ? 8000 : 5000);
  }

  _friendlyError(err) {
    if (!err) return 'Error desconocido';
    // Ethers v6 suele incluir shortMessage y reason
    const known = {
      'Property: caller not notary': 'Esta acción requiere la firma de la DIRECCIÓN del notario registrado. Cambia la cuenta activa en MetaMask y reintenta.',
      'Property: caller not buyer': 'Debes firmar con la dirección del comprador configurado en el registro. Abre MetaMask y selecciona esa cuenta.',
      'Property: caller not government': 'Solo la billetera de gobierno registrada puede sellar. Cambia de cuenta antes de firmar.',
      'Property: not found': 'Propiedad no encontrada en el contrato: probablemente hiciste redeploy. Registra nuevamente para obtener un nuevo ID on-chain.'
    };
    let base = err.shortMessage || err.reason || err.message || String(err);
    // Extraer razón de revert si viene dentro de un mensaje largo
    const revertMatch = base.match(/execution reverted[^:]*:\s*'?([^"'\n]+)'?/i) || base.match(/reverted:\s*'?([^"'\n]+)'?/i);
    if (revertMatch && revertMatch[1]) {
      const rawReason = revertMatch[1].trim();
      if (known[rawReason]) return known[rawReason];
      // Si es muy técnica, devolverla limpia
      return rawReason.length > 120 ? rawReason.slice(0, 117) + '…' : rawReason;
    }
    // Truncar mensaje genérico si es gigante
    if (base.length > 160) base = base.slice(0, 157) + '…';
    // Mapear directamente si coincide exacto
    if (known[base]) return known[base];
    return 'Error: ' + base;
  }
}
