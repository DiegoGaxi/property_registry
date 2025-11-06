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
  let seller = this.sellerTarget.value.trim();
  let buyer = this.buyerTarget.value.trim();
  let notary = this.notaryTarget.value.trim();
  let gov = this.governmentTarget.value.trim();
    const fileInput = this.fileTarget;
    if (!fileInput.files || fileInput.files.length === 0) {
      this._flash('Sube un documento antes de registrar');
      return;
    }

    // Validación de direcciones para evitar resolución ENS en red Hardhat (sin soporte ENS)
    const isAddr = (v) => /^0x[0-9a-fA-F]{40}$/.test(v);
    const missing = [];
    if (!isAddr(seller)) missing.push('seller');
    if (!isAddr(buyer)) missing.push('buyer');
    if (!isAddr(notary)) missing.push('notary');
    if (!isAddr(gov)) missing.push('government');
    if (missing.length) {
      this._flash('Direcciones inválidas o vacías: ' + missing.join(', ') + '. Usa hex 0x...');
      return;
    }

    try {
      if (!this.id) {
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
  this.id = dataCreate.id;
  this._flash('Propiedad creada (#'+this.id+'). Registrando');
      }

      // Paso 2: registrar
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
      // Normalizar direcciones (checksum) y reforzar validación para evitar que ethers intente ENS
      try {
        buyer = ethers.getAddress(buyer);
        notary = ethers.getAddress(notary);
        // Normalizamos también seller y gov si fueron ingresadas (aunque seller se sustituye por signer más abajo)
        if (seller) seller = ethers.getAddress(seller);
        if (gov) gov = ethers.getAddress(gov);
      } catch(addrErr) {
        this._flash('Direcciones inválidas (checksum): ' + (addrErr.message || addrErr));
        return;
      }

    const abi = [
      "function registerProperty(bytes32 docHash,address buyer,address notary) returns (uint256)",
      // Evento real en el contrato: id, seller, buyer indexados; data: notary, docHash
      "event PropertyRegistered(uint256 indexed id,address indexed seller,address indexed buyer,address notary,bytes32 docHash)"
    ];
    const contract = new ethers.Contract(contractAddress, abi, signer);
    // Hash real del documento (keccak256 del contenido) para trazabilidad on-chain
    const fileBuffer = await fileInput.files[0].arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);
    const docHash = ethers.keccak256(fileBytes);
    this._flash('Enviando transacción (hash documento calculado)...');
    let tx;
    try {
      tx = await contract.registerProperty(docHash, buyer, notary);
    } catch(callErr) {
      if (/UNSUPPORTED_OPERATION/.test(callErr.message) && /ENS/.test(callErr.message)) {
        this._flash('Error ENS: Ingresa direcciones hex válidas (0x...40hex).');
        return;
      }
      throw callErr;
    }
      this._flash('Tx enviada, esperando recibo...');
      const receipt = await tx.wait();
      const txHash = receipt.hash;
      let onChainId = null;
      try {
        const log = receipt.logs.find(l => l.address && l.address.toLowerCase() === contractAddress.toLowerCase() && l.topics && l.topics.length === 4);
        if (log) {
          try {
            // topic[1] => id
            onChainId = BigInt(log.topics[1]).toString();
            // Extra validations opcionales
            const buyerTopic  = log.topics[3];
            const buyerAddr  = '0x' + buyerTopic.slice(26);
            if (buyerAddr.toLowerCase() !== buyer.toLowerCase()) {
              console.warn('Buyer en evento difiere de formulario', buyerAddr, buyer);
            }
            // data: notary (32 bytes) + docHash (32 bytes)
            const dataHex = log.data.slice(2);
            if (dataHex.length === 128) {
              const notarySlot = dataHex.slice(0,64);
              const docHashSlot = dataHex.slice(64,128);
              const notaryAddr = '0x' + notarySlot.slice(24);
              const docHashEvt = '0x' + docHashSlot;
              if (notaryAddr.toLowerCase() !== notary.toLowerCase()) {
                console.warn('Notary en evento difiere de formulario', notaryAddr, notary);
              }
              if (docHashEvt.toLowerCase() !== docHash.toLowerCase()) {
                console.warn('docHash evento != docHash calculado', docHashEvt, docHash);
              }
            } else {
              console.warn('Tamaño data inesperado para PropertyRegistered:', dataHex.length);
            }
          } catch (inner) {
            console.warn('Error decodificando log PropertyRegistered', inner);
          }
        } else {
          console.warn('Log PropertyRegistered no encontrado (topics!=4 o dirección distinta)');
        }
      } catch (outer) {
        console.warn('Fallo general decodificando evento PropertyRegistered', outer);
      }
debugger
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

  _flash(msg) {
    if (this.hasStatusTarget) this.statusTarget.textContent = msg;
    const evt = new CustomEvent('toast', { detail: { message: msg } });
    window.dispatchEvent(evt);
  }
}
