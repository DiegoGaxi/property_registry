import { Controller } from "@hotwired/stimulus";
import { hexWeiToGwei, formatFee } from "../lib/eth_utils";

// Polls /properties/:id/transactions until all have block_number
export default class extends Controller {
  static values = { propertyId: Number, interval: { type: Number, default: 4000 } }
  static targets = ["container"]

  connect() {
    this.start()
  }

  disconnect() {
    this.stop()
  }

  start() {
    if (this._timer) return
  }

  stop() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
  }

  render(txs) {
    const rows = txs.map(t => this.rowHTML(t)).join('')
    const table = this.element.querySelector('table')
    if (table) {
      const tbody = table.querySelector('tbody')
      if (tbody) tbody.innerHTML = rows
    }
  }

  rowHTML(t) {
    const statusClass = t.status || 'unknown'
    const decoded = t.decoded ? this.decodedHTML(t.decoded) : ''
    const feeEth = formatFee(t.gas_used, t.effective_gas_price)
    const confirmations = (t.block_number && this._latestBlock()) ? (this._latestBlock() - t.block_number) : ''
    const blockPart = t.block_number ? `<span class='confirms'>block ${t.block_number}${confirmations!==''?` (+${confirmations})`:''}</span>` : ''
    return `<tr class="tx-row ${statusClass}">
      <td>${t.action}</td>
      <td class="mono" title="${t.tx_hash}">${t.short_hash}<button class="copy-btn" onclick="navigator.clipboard.writeText('${t.tx_hash}')">Copiar</button></td>
      <td><span class="badge ${statusClass}">${statusClass}</span>${decoded}${blockPart}${feeEth?`<div class='fee'>fee ${feeEth} ETH</div>`:''}</td>
    </tr>`
  }

  _latestBlockCache = null
  _latestBlockTs = 0
  _latestBlock() {
    // store latest fetched block number in window (from refresh) to use in rowHTML
    if (window.__latestBlockNumber) return window.__latestBlockNumber
    return null
  }

  decodedHTML(d) {
    if (d.function === 'registerProperty') {
  return `<div class='decoded'>buyer: ${d.buyer}<br>notary: ${d.notary}</div>`
    }
    if (d.property_id !== undefined) {
      return `<div class='decoded'>propertyId: ${d.property_id}</div>`
    }
    return ''
  }
}
