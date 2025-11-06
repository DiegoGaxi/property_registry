import { Controller } from "@hotwired/stimulus";
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.10.0/dist/ethers.min.js";

// Controller to perform client-side registerProperty via MetaMask and callback to Rails
export default class extends Controller {
  static targets = ["seller", "buyer", "notary", "government", "file", "status", "metamaskBtn"];

  connect() {
    if (!window.ethereum && this.hasStatusTarget) {
      this.statusTarget.textContent = 'MetaMask no encontrado';
    }
    // Intento temprano de asegurar red correcta (no bloquea UI)
    this.ensureNetwork().catch(e => console.warn('ensureNetwork early error', e));
  }

  async register(event) {
    event.preventDefault();

    // Evitar doble click / ejecución concurrente
    if (this._registering) { this._flash('Registro en curso...'); return; }
    this._registering = true;
    if (this.hasMetamaskBtnTarget) this.metamaskBtnTarget.disabled = true;

    // Helper para liberar estado si retornamos antes
    const cleanupEarly = () => {
      this._registering = false;
      if (this.hasMetamaskBtnTarget) this.metamaskBtnTarget.disabled = false;
    };

    // Datos formulario
    let seller = this.sellerTarget.value.trim();
    let buyer = this.buyerTarget.value.trim();
    let notary = this.notaryTarget.value.trim();
    let gov = this.governmentTarget.value.trim();
    const fileInput = this.fileTarget;
    if (!fileInput.files || fileInput.files.length === 0) {
      this._flash('Sube un documento antes de registrar');
      cleanupEarly();
      return;
    }

    // Validación de direcciones hex (evita intentos ENS)
    const isAddr = (v) => /^0x[0-9a-fA-F]{40}$/.test(v);
    const missing = [];
    if (!isAddr(seller)) missing.push('seller');
    if (!isAddr(buyer)) missing.push('buyer');
    if (!isAddr(notary)) missing.push('notary');
    if (!isAddr(gov)) missing.push('government');
    if (missing.length) {
      this._flash('Direcciones inválidas o vacías: ' + missing.join(', ') + ' (usa 0x...40hex)');
      cleanupEarly();
      return;
    }

    try {
      // Paso 1: crear registro off-chain si no existe
      if (!this.id) {
        const fd = new FormData();
        fd.append('property_record[seller_address]', seller);
        fd.append('property_record[buyer_address]', buyer);
        fd.append('property_record[notary_address]', notary);
        fd.append('property_record[government_address]', gov);
        fd.append('property_record[document_file]', fileInput.files[0]);
        const csrf = document.querySelector('meta[name="csrf-token"]');
        const headers = { 'Accept': 'application/json' };
        if (csrf) headers['X-CSRF-Token'] = csrf.content;
        const resCreate = await fetch('/properties.json', {
          method: 'POST',
          headers,
          body: fd,
          credentials: 'same-origin'
        });
        const dataCreate = await resCreate.json().catch(() => ({}));
        if (!resCreate.ok) {
          this._flash('Error creando propiedad: ' + (dataCreate.errors || dataCreate.error || 'desconocido'));
          cleanupEarly();
          return;
        }
        this.id = dataCreate.id;
        this._flash('Propiedad creada (#' + this.id + '). Registrando on-chain...');
      }

      // Paso 2: interacción on-chain
      if (!window.ethereum) { this._flash('MetaMask requerido'); cleanupEarly(); return; }
      if (!(await this.ensureNetwork())) { cleanupEarly(); return; }
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const from = await signer.getAddress();
      const contractAddress = document.body.dataset.contractAddress;
      if (!contractAddress) { this._flash('CONTRACT_ADDRESS faltante'); cleanupEarly(); return; }
      if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) { this._flash('CONTRACT_ADDRESS inválido'); cleanupEarly(); return; }

      // Normalizar checksum
      try {
        buyer = ethers.getAddress(buyer);
        notary = ethers.getAddress(notary);
        if (seller) seller = ethers.getAddress(seller);
        if (gov) gov = ethers.getAddress(gov);
      } catch (addrErr) {
        this._flash('Direcciones inválidas (checksum): ' + (addrErr.message || addrErr));
        cleanupEarly();
        return;
      }

      const abi = [
        'function registerProperty(bytes32 docHash,address buyer,address notary) returns (uint256)',
        'event PropertyRegistered(uint256 indexed id,address indexed seller,address indexed buyer,address notary,bytes32 docHash)'
      ];
      const contract = new ethers.Contract(contractAddress, abi, signer);

      // Hash documento
      const fileBuffer = await fileInput.files[0].arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);
      const docHash = ethers.keccak256(fileBytes);
      this._flash('Enviando transacción (hash calculado)...');

      let tx;
      try {
        tx = await contract.registerProperty(docHash, buyer, notary);
      } catch (callErr) {
        if (/UNSUPPORTED_OPERATION/.test(callErr.message) && /ENS/.test(callErr.message)) {
          this._flash('Error ENS: usa direcciones hex válidas (0x...40hex)');
          cleanupEarly();
          return;
        }
        throw callErr;
      }

      this._flash('Tx enviada, esperando recibo...');
      const receipt = await tx.wait();
      const txHash = receipt.hash;

      // Decodificar evento
      let onChainId = null;
      try {
        const log = receipt.logs.find(l => l.address && l.address.toLowerCase() === contractAddress.toLowerCase() && l.topics && l.topics.length === 4);
        if (log) {
          try {
            onChainId = BigInt(log.topics[1]).toString();
            const buyerTopic = log.topics[3];
            const buyerAddr = '0x' + buyerTopic.slice(26);
            if (buyerAddr.toLowerCase() !== buyer.toLowerCase()) console.warn('Buyer evento difiere', buyerAddr, buyer);
            const dataHex = log.data.slice(2);
            if (dataHex.length === 128) {
              const notarySlot = dataHex.slice(0, 64);
              const docHashSlot = dataHex.slice(64, 128);
              const notaryAddr = '0x' + notarySlot.slice(24);
              const docHashEvt = '0x' + docHashSlot;
              if (notaryAddr.toLowerCase() !== notary.toLowerCase()) console.warn('Notary evento difiere', notaryAddr, notary);
              if (docHashEvt.toLowerCase() !== docHash.toLowerCase()) console.warn('docHash evento != calculado', docHashEvt, docHash);
            } else {
              console.warn('Tamaño data inesperado PropertyRegistered:', dataHex.length);
            }
          } catch (inner) {
            console.warn('Error decodificando log PropertyRegistered', inner);
          }
        } else {
          console.warn('Log PropertyRegistered no encontrado');
        }
      } catch (outer) {
        console.warn('Fallo general decodificando PropertyRegistered', outer);
      }

      await this._callback({
        property_id: this.id,
        property_id_on_chain: onChainId,
        seller_address: from,
        buyer_address: buyer,
        notary_address: notary,
        government_address: gov,
        tx_hash: txHash
      });

      window.location.href = '/properties';
    } catch (e) {
      console.error(e);
      this._flash('Error: ' + (e.message || 'falló registro'));
    } finally {
      this._registering = false;
      if (this.hasMetamaskBtnTarget) this.metamaskBtnTarget.disabled = false;
    }
  }

  async ensureNetwork() {
    const desiredChainHex = '0x7a69'; // 31337 Hardhat
    try {
      const currentChain = await window.ethereum.request({ method: 'eth_chainId' });
      // Aviso si está en BSC (0x38 mainnet, 0x61 testnet)
      if (currentChain === '0x38' || currentChain === '0x61') {
        this._flash('Estás en BSC, cambiando a Hardhat local...');
      }
      if (currentChain !== desiredChainHex) {
        this._flash('Cambiando a red Hardhat (31337)...');
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: desiredChainHex }]
          });
        } catch (switchErr) {
          if (switchErr.code === 4902) { // red no agregada
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: desiredChainHex,
                chainName: 'Hardhat Local',
                rpcUrls: ['http://127.0.0.1:8545'],
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
              }]
            });
          } else {
            this._flash('Error cambiando red: ' + (switchErr.message || switchErr));
            return false;
          }
        }
        // Validar que realmente cambió
        const after = await window.ethereum.request({ method: 'eth_chainId' });
        if (after !== desiredChainHex) {
          this._flash('No se logró fijar chainId 31337. Cambia manualmente en MetaMask.');
          return false;
        }
        this._flash('Red Hardhat lista');
      }
      return true;
    } catch (e) {
      this._flash('Error obteniendo chainId: ' + (e.message || e));
      return false;
    }
  }

  async _callback(payload) {
    const res = await fetch('/blockchain/tx_callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'callback error');
    }
  }

  _flash(msg, type = 'info') {
    if (msg == null) msg = '';
    msg = String(msg).trim();
    if (!msg.length) msg = (type === 'error') ? 'Ocurrió un error inesperado.' : 'Acción realizada.';
    if (this.hasStatusTarget) this.statusTarget.textContent = msg;
    let box = document.getElementById('flash-messages');
    if (!box) { box = document.createElement('div'); box.id = 'flash-messages'; document.body.prepend(box); }
    const el = document.createElement('div');
    el.className = 'flash ' + (type === 'error' ? 'flash--error' : type === 'success' ? 'flash--success' : type === 'warn' ? 'flash--warn' : '');
    const span = document.createElement('span'); span.className = 'flash-msg'; span.textContent = msg;
    const btn = document.createElement('button'); btn.className = 'flash-close'; btn.setAttribute('aria-label', 'Cerrar'); btn.textContent = '×';
    el.appendChild(span); el.appendChild(btn); box.appendChild(el);
    const remove = () => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 380); };
    btn.addEventListener('click', remove);
    setTimeout(remove, type === 'error' ? 8000 : 5000);
  }
}
