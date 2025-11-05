import { Controller } from "@hotwired/stimulus";
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.10.0/dist/ethers.min.js";

// Simple Metamask connect demo; production should handle chainId & errors properly
export default class extends Controller {
  static targets = ["address", "status"];

  async connect() {
    if (!window.ethereum) {
      this.statusTarget.textContent = 'Metamask no detectado';
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const addr = accounts[0];
      this.addressTarget.textContent = addr;
      this.statusTarget.textContent = 'Conectado';
    } catch (e) {
      this.statusTarget.textContent = 'Error conexión';
    }
  }
}
