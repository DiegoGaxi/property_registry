import { Controller } from "@hotwired/stimulus";
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.10.0/dist/ethers.min.js";

// Controller to perform client-side registerProperty via MetaMask and callback to Rails
export default class extends Controller {
  static targets = ["seller","buyer","notary","government","file","status","metamaskBtn"];

  connect() {
    if (!window.ethereum && this.hasStatusTarget) {
      this.statusTarget.textContent = 'MetaMask no encontrado';
    }
    // Intento temprano de asegurar red correcta (no bloquea UI)
    this.ensureNetwork().catch(e => console.warn('ensureNetwork early error', e));
  }

  async register(event) {
    event.preventDefault();
    // Paso 1: crear propiedad off-chain (si aún no existe en esta sesión)
    const seller = this.sellerTarget.value.trim();
    const buyer = this.buyerTarget.value.trim();
    const notary = this.notaryTarget.value.trim();
    const gov = this.governmentTarget.value.trim();
    const fileInput = this.fileTarget;
    if (!fileInput.files || fileInput.files.length === 0) {
      this._flash('Sube un documento antes de registrar');
      return;
    }

    try {
      if (!this.propertyId) {
        // Construimos FormData manual para garantizar estructura property_record[...] y evitar problemas de model_name
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
        const dataCreate = await resCreate.json().catch(()=>({}));
        if (!resCreate.ok) {
          this._flash('Error creando propiedad: ' + (dataCreate.errors || dataCreate.error || 'desconocido'));
          return;
        }
        this.propertyId = dataCreate.id;
        this._flash('Propiedad creada (#'+this.propertyId+'). Registrando on-chain...');
      }

      // Paso 2: registrar on-chain
      if (!window.ethereum) { this._flash('MetaMask requerido'); return; }
      if (!(await this.ensureNetwork())) return;
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const from = await signer.getAddress();
      const contractAddress = document.body.dataset.contractAddress;
      if (!contractAddress) { this._flash('CONTRACT_ADDRESS faltante'); return; }
      if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
        this._flash('CONTRACT_ADDRESS inválido');
        return;
      }
      const abi = ["function registerProperty(bytes32 docHash,address buyer,address notary) returns (uint256)"];
      const contract = new ethers.Contract(contractAddress, abi, signer);
      const zeroDocHash = '0x' + '0'.repeat(64); // Placeholder mientras no se requiera hash
      this._flash('Enviando transacción...');
      const tx = await contract.registerProperty(zeroDocHash, buyer, notary);
      this._flash('Tx enviada, esperando recibo...');
      const receipt = await tx.wait();
      const txHash = receipt.hash;
      console.log('[registerProperty] receipt', receipt);
      // Extraer propertyId del evento PropertyRegistered
      const propertyIdOnChain = this._extractRegisteredId(receipt) || null;
      console.log('[registerProperty] extracted propertyIdOnChain', propertyIdOnChain);
      if (propertyIdOnChain) {
        await this._persistOnChainId(propertyIdOnChain);
        this._flash('ID on-chain='+propertyIdOnChain+' sincronizado');
      } else {
        this._flash('No se pudo extraer propertyId del recibo; intenta sincronizar manualmente.');
      }
      await this._callback({ property_id: this.propertyId, seller_address: from, buyer_address: buyer, notary_address: notary, government_address: gov, tx_hash: txHash });
      this._flash('Registro on-chain registrado');
      window.location.href = `/properties/${this.propertyId}`;
    } catch (e) {
      console.error(e);
      this._flash('Error: ' + (e.message || 'falló registro'));
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

  _extractRegisteredId(receipt) {
    if (!receipt || !receipt.logs) return null;
    // Buscar evento PropertyRegistered por topic0 hash
    const iface = new ethers.Interface([
      'event PropertyRegistered(uint256 indexed id,address indexed seller,address indexed buyer,address notary,bytes32 docHash)'
    ]);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === 'PropertyRegistered') {
          return parsed.args.id.toString();
        }
      } catch (_) { /* ignorar logs que no matchean */ }
    }
    return null;
  }

  async _persistOnChainId(id) {
    try {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
      const formData = new FormData();
      formData.append('property_record[property_id_on_chain]', id);
      const resp = await fetch(`/properties/${this.propertyId}`, {
        method: 'PATCH',
        headers: { 'X-CSRF-Token': csrf },
        body: formData
      });
      if (!resp.ok) {
        console.warn('Persist property_id_on_chain fallo', resp.status);
      }
    } catch (e) {
      console.warn('Persist error', e);
    }
  }

  _flash(msg) {
    if (this.hasStatusTarget) this.statusTarget.textContent = msg;
    const evt = new CustomEvent('toast', { detail: { message: msg } });
    window.dispatchEvent(evt);
  }
}
