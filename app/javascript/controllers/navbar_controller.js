import { Controller } from "@hotwired/stimulus";

// Navbar controller: MetaMask integration (theme toggle removed).
// Features:
// - Detect MetaMask, connect account, show address & balance.
// - Listen to account and chain changes.
// - Periodically refresh balance.
export default class extends Controller {
  static targets = ["network", "wallet", "connect", "account", "balance", "walletInfo", "connectWrapper"];

  connect() {
    this.initWallet();
    // Escuchar evento global tras firma para simular logout
    window.addEventListener('tx:signed', () => {
      this.resetWallet();
    });
  }

  // Theme toggle removed: functionality deprecated.

  /* METAMASK */
  initWallet() {
    if (typeof window.ethereum === 'undefined') {
      this.showNoMetamask();
      return;
    }
    // Try to get current accounts silently
    window.ethereum.request({ method: 'eth_accounts' })
      .then(accs => {
        if (accs && accs.length > 0) {
          this.setAccount(accs[0]);
          this.fetchBalance();
        }
      })
      .catch(() => {/* ignore silent errors */});

    // Listeners
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        this.resetWallet();
      } else {
        this.setAccount(accounts[0]);
        this.fetchBalance();
      }
    });
    window.ethereum.on('chainChanged', (_chainId) => {
      // Full reload ensures consistent state
      window.location.reload();
    });

    // Periodic balance refresh
    this.balanceInterval = setInterval(() => {
      if (this.currentAccount) this.fetchBalance();
    }, 15000);
  }

  connectWallet() {
    if (!window.ethereum) return this.showNoMetamask();
    window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(accs => {
        if (accs && accs[0]) {
          this.setAccount(accs[0]);
          this.fetchBalance();
        }
      })
      .catch(err => {
        console.warn('User rejected MetaMask connection', err);
      });
  }

  setAccount(account) {
    this.currentAccount = account;
    if (this.hasConnectWrapperTarget) this.connectWrapperTarget.hidden = true;
    if (this.hasWalletInfoTarget) this.walletInfoTarget.hidden = false;
    if (this.hasAccountTarget) this.accountTarget.textContent = account; // full address
    this.fetchNetworkMeta();
  }

  resetWallet() {
    this.currentAccount = null;
    if (this.hasAccountTarget) this.accountTarget.textContent = '';
    if (this.hasBalanceTarget) this.balanceTarget.textContent = '';
    if (this.hasWalletInfoTarget) this.walletInfoTarget.hidden = true;
    if (this.hasConnectWrapperTarget) this.connectWrapperTarget.hidden = false;
  }

  showNoMetamask() {
    if (!this.hasConnectWrapperTarget) return;
    this.connectWrapperTarget.innerHTML = '<span class="no-mm">MetaMask no detectado</span>';
  }

  copyAddress() {
    if (!this.currentAccount) return;
    navigator.clipboard.writeText(this.currentAccount).then(() => {
      this.flashCopied(this.accountTarget);
    }).catch(() => {});
  }

  flashCopied(el) {
    if (!el) return;
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 900);
  }

  fetchBalance() {
    if (!window.ethereum || !this.currentAccount) return;
    window.ethereum.request({ method: 'eth_getBalance', params: [this.currentAccount, 'latest'] })
      .then(wei => {
        if (!this.hasBalanceTarget) return;
        const eth = this._hexWeiToEth(wei);
        this.balanceTarget.textContent = eth + ' ETH';
      })
      .catch(err => console.warn('Balance error', err));
  }

  fetchNetworkMeta() {
    if (!window.ethereum) return;
    Promise.all([
      window.ethereum.request({ method: 'eth_chainId' }),
      window.ethereum.request({ method: 'eth_gasPrice' })
    ]).then(([chainId, gasHex]) => {
      if (!this.hasNetworkTarget) return;
      const gwei = this._hexWeiToGwei(gasHex);
      const name = this._chainName(chainId);
      this.networkTarget.innerHTML = `<span class="dot live"></span>${name} • Gas ${gwei} gwei`;
    }).catch(()=>{});
  }

  _chainName(chainId) {
    switch (chainId) {
      case '0x7a69': return 'Hardhat 31337';
      case '0x1': return 'Ethereum Mainnet';
      case '0x5': return 'Goerli';
      case '0xaa36a7': return 'Sepolia';
      default: return `Chain ${parseInt(chainId,16)}`;
    }
  }

  _hexWeiToEth(hex) {
    try {
      const value = BigInt(hex);
      return (Number(value) / 1e18).toFixed(4);
    } catch { return '0.0000'; }
  }

  _hexWeiToGwei(hex) {
    try {
      const value = BigInt(hex);
      return (Number(value) / 1e9).toFixed(1);
    } catch { return '0.0'; }
  }

  disconnect() { // Manual disconnect simulation
    this.resetWallet();
  }

  disconnectController() {
    if (this.balanceInterval) clearInterval(this.balanceInterval);
  }
}
