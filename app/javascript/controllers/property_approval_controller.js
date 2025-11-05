import { Controller } from "@hotwired/stimulus";
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.10.0/dist/ethers.min.js";

function weiToEth(wei) { if (!wei) return null; return (Number(wei) / 1e18).toFixed(6); }

// Controller para aprobar pasos vía MetaMask cuando SERVER_SIGNING_DISABLED=1
export default class extends Controller {
  static values = { propertyId: Number, sellerAddress: String, buyerAddress: String, notaryAddress: String, governmentAddress: String }

  async notaryApprove(e) { e.preventDefault(); return this._guardedFlow(e,'notaryApprove', 'notario', this.notaryAddressValue); }
  async buyerApprove(e) { e.preventDefault(); return this._guardedFlow(e,'buyerApprove', 'comprador', this.buyerAddressValue); }
  async governmentSeal(e) { e.preventDefault(); return this._guardedFlow(e,'governmentSeal', 'gobierno', this.governmentAddressValue); }

  async _guardedFlow(event, fnName, etiqueta, expectedAddress) {
    const current = await this._currentAccount();
    if (!current) { return this._flash('Conecta MetaMask primero'); }
    if (expectedAddress && current.toLowerCase() !== expectedAddress.toLowerCase()) {
      this._showRoleWarning(`Cuenta conectada (${current.slice(0,10)}…) no coincide con dirección esperada para ${etiqueta}. Cambia de cuenta.`);
      return;
    }
    this._hideRoleWarning();
    const hasPanel = this.element.querySelector('.gas-estimate-panel');
    if (!hasPanel) {
      await this._estimateGas(fnName, etiqueta);
      return;
    }
    return this._flow(fnName, etiqueta);
  }

  async _flow(fnName, etiqueta) {
    if (!window.ethereum) { return this._flash('MetaMask requerido'); }
    const contractAddress = document.body.dataset.contractAddress;
    if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress || '')) {
      return this._flash('CONTRACT_ADDRESS inválido');
    }
    const id = this.propertyIdValue;
    if (!id) { return this._flash('property_id_on_chain faltante'); }
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      // asegurar red correcta
      await this._ensureNetwork();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const abi = [
        'function notaryApprove(uint256 id)',
        'function buyerApprove(uint256 id)',
        'function governmentSeal(uint256 id)'
      ];
      const contract = new ethers.Contract(contractAddress, abi, signer);
  this._flash(`Enviando aprobación (${etiqueta})...`);
      const tx = await contract[fnName](id);
      this._flash('Esperando confirmación...');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Transacción revertida');
  // POST al endpoint Rails (PATCH) con tx_hash
  await this._postRails(fnName, tx.hash);
  this._flash('Estado off-chain actualizado');
  this._dispatchSigned(tx.hash, fnName);
  // Recargar para reflejar y exigir nueva conexión en siguiente rol
  setTimeout(() => window.location.reload(), 350);
    } catch (e) {
      console.error(e);
      this._flash('Error: ' + (e.message || e));
    }
  }

  async _ensureNetwork() {
    const desired = '0x7a69'; // 31337
    try {
      const current = await window.ethereum.request({ method: 'eth_chainId' });
      if (current !== desired) {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: desired }] });
      }
    } catch (e) {
      this._flash('No se pudo fijar red Hardhat: ' + (e.message || e));
    }
  }

  async _postRails(fnName, txHash) {
    let path;
    switch (fnName) {
      case 'notaryApprove': path = 'notary_approve'; break;
      case 'buyerApprove': path = 'buyer_approve'; break;
      case 'governmentSeal': path = 'government_seal'; break;
      default: throw new Error('Función desconocida');
    }
    const url = `/properties/${this.propertyIdValue}/${path}`;
    const formData = new FormData();
    formData.append('tx_hash', txHash);
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': this._csrf(), 'Accept': 'text/vnd.turbo-stream.html' },
      body: formData
    });
    if (!resp.ok) throw new Error('Rails error ' + resp.status);
  }

  _csrf() {
    const meta = document.querySelector('meta[name=csrf-token]');
    return meta && meta.getAttribute('content');
  }

  _flash(msg) {
    let box = document.getElementById('flash-messages');
    if (!box) { box = document.createElement('div'); box.id = 'flash-messages'; document.body.prepend(box); }
    box.innerHTML = `<div class="flash">${msg}</div>`;
  }

  _dispatchSigned(hash, action) {
    const evt = new CustomEvent('tx:signed', { detail: { hash, action } });
    window.dispatchEvent(evt);
  }

  async _estimateGas(fnName, etiqueta) {
    try {
      if (!window.ethereum) return;
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      await this._ensureNetwork();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contractAddress = document.body.dataset.contractAddress;
      const abi = [
        'function notaryApprove(uint256 id)',
        'function buyerApprove(uint256 id)',
        'function governmentSeal(uint256 id)'
      ];
      const contract = new ethers.Contract(contractAddress, abi, signer);
      const id = this.propertyIdValue;
      const populated = await contract[fnName].populateTransaction(id);
      const gasEstimate = await provider.estimateGas(populated);
      const gasPriceHex = await window.ethereum.request({ method: 'eth_gasPrice' });
      const gasPrice = BigInt(gasPriceHex);
      const feeWei = gasEstimate * gasPrice;
      const panel = document.createElement('div');
      panel.className = 'gas-estimate-panel';
      panel.innerHTML = `<strong>Estimación (${etiqueta})</strong><br>Gas: ${gasEstimate.toString()}<br>Gas Price: ${(Number(gasPrice)/1e9).toFixed(2)} gwei<br>Fee estimada: ${weiToEth(feeWei)} ETH<br><em>Click nuevamente para confirmar envío.</em>`;
      this.element.appendChild(panel);
    } catch (e) {
      console.warn(e); this._flash('No se pudo estimar gas: '+(e.message||e));
    }
  }

  async _currentAccount() {
    try { const accs = await window.ethereum.request({ method: 'eth_accounts' }); return accs && accs[0]; } catch { return null; }
  }
  _showRoleWarning(msg) { const box = document.getElementById('role-warning'); if (box){ box.style.display='block'; box.textContent=msg; } }
  _hideRoleWarning() { const box = document.getElementById('role-warning'); if (box){ box.style.display='none'; } }
}
