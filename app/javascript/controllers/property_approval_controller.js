import { Controller } from "@hotwired/stimulus";
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.10.0/dist/ethers.min.js";

// Controlador híbrido: cada aprobación se firma on-chain y luego se PATCH-ea el estado en Rails con el tx_hash.
export default class extends Controller {
  static values = { propertyId: Number };

  connect(){
    if(!window.ethereum){ this._toast('MetaMask no detectado'); }
  }

  async notaryApprove(e){ return this._run(e,'notaryApprove','notary_approve','Aprobación notario'); }
  async buyerApprove(e){ return this._run(e,'buyerApprove','buyer_approve','Aprobación comprador'); }
  async governmentSeal(e){ return this._run(e,'governmentSeal','government_seal','Sellado gobierno'); }

  async _run(event, contractFn, railsPath, human){
    event.preventDefault();
    try {
      const onChainId = this.propertyIdValue; // Se pasa desde el partial como property.property_id_on_chain
      if(onChainId == null){ throw new Error('ID on-chain no disponible aún'); }
      if(!window.ethereum) throw new Error('MetaMask requerido');
      await this._ensureNetwork();
      await window.ethereum.request({ method:'eth_requestAccounts' });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contractAddress = document.body.dataset.contractAddress;
      if(!/^0x[0-9a-fA-F]{40}$/.test(contractAddress||'')) throw new Error('CONTRACT_ADDRESS inválido');
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
      } catch(eExist){
        this._toast('No existe propertyId '+ onChainId +' en contrato actual. Posible redeploy. Registra de nuevo.');
        return;
      }
      this._toast('Firmando ' + human + '...');
      const tx = await contract[contractFn](onChainId);
      this._toast('Tx enviada, esperando confirmación...');
      const receipt = await tx.wait();
      await this._patchRails(railsPath, receipt.hash, human);
      this._toast(human + ' confirmada');
    } catch(err){
      console.error(err);
      this._toast('Error: ' + (err.message || err));
    }
  }

  async _patchRails(path, txHash, human){
    const url = `/properties/${this.propertyIdValue}/${path}`;
    const fd = new FormData();
    fd.append('tx_hash', txHash);
    const resp = await fetch(url, { method:'PATCH', headers:{ 'X-CSRF-Token': this._csrf(), 'Accept':'text/vnd.turbo-stream.html' }, body: fd });
    if(!resp.ok){ throw new Error('Rails rechazo ' + resp.status); }
  }

  async _ensureNetwork(){
    const desired = '0x7a69'; // 31337
    const current = await window.ethereum.request({ method:'eth_chainId' });
    if(current !== desired){
      try {
        await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{ chainId: desired }] });
      } catch(e){
        if(e.code === 4902){
          await window.ethereum.request({ method:'wallet_addEthereumChain', params:[{ chainId: desired, chainName:'Hardhat Local', rpcUrls:['http://127.0.0.1:8545'], nativeCurrency:{ name:'Ether', symbol:'ETH', decimals:18 } }] });
        } else { throw e; }
      }
    }
  }

  _csrf(){ const m = document.querySelector('meta[name=csrf-token]'); return m && m.content; }
  _toast(msg){
    let box = document.getElementById('flash-messages');
    if(!box){ box = document.createElement('div'); box.id='flash-messages'; document.body.prepend(box); }
    box.innerHTML = `<div class="flash">${msg}</div>`;
  }
}
