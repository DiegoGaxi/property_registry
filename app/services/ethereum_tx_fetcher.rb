# Fetches transaction & receipt details via raw JSON-RPC for display
class EthereumTxFetcher
  def initialize(rpc: ENV['RPC_URL'])
    @rpc = rpc
  end

  def fetch(tx_hash)
    return {} if @rpc.blank? || tx_hash.blank?
    attempts = 0
    tx = nil
    receipt = nil
    begin
      tx = rpc_post('eth_getTransactionByHash', [tx_hash]) rescue nil
      receipt = rpc_post('eth_getTransactionReceipt', [tx_hash]) rescue nil
      # If receipt not yet mined, mark pending
      if receipt.nil? || receipt.empty?
        return pending_hash(tx_hash, tx)
      end
      normalize(tx, receipt)
    rescue StandardError => e
      attempts += 1
      if attempts < 3
        sleep 0.8 * attempts
        retry
      else
        Rails.logger.warn("[TxFetcher] error definitivo #{e.class}: #{e.message}")
        pending_hash(tx_hash, tx)
      end
    end
  rescue StandardError => e
    Rails.logger.warn("[TxFetcher] error #{e.class}: #{e.message}")
    {}
  end

  private

  def normalize(tx, receipt)
    return {} unless tx || receipt
    {
      hash: tx&.dig('hash') || receipt&.dig('transactionHash'),
      from: tx&.dig('from'),
      to: tx&.dig('to'),
      block_number: hex_to_i(receipt&.dig('blockNumber') || tx&.dig('blockNumber')),
      gas_used: hex_to_i(receipt&.dig('gasUsed')),
      gas_price: hex_to_i(tx&.dig('gasPrice')),
      effective_gas_price: hex_to_i(receipt&.dig('effectiveGasPrice')),
      input_data: tx&.dig('input'),
      status: status_from(receipt&.dig('status'))
    }
  end

  def pending_hash(tx_hash, tx)
    {
      hash: tx_hash,
      from: tx&.dig('from'),
      to: tx&.dig('to'),
      block_number: nil,
      gas_used: nil,
      gas_price: hex_to_i(tx&.dig('gasPrice')),
      effective_gas_price: nil,
      input_data: tx&.dig('input'),
      status: 'pending'
    }
  end

  def status_from(hex)
    return 'unknown' if hex.nil?
    hex.to_s.downcase == '0x1' ? 'success' : 'reverted'
  end

  def hex_to_i(h)
    return nil unless h
    h.to_s.sub(/^0x/, '').to_i(16)
  end

  def rpc_post(method, params)
    uri = URI(@rpc)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == 'https'
    payload = { jsonrpc: '2.0', id: 1, method: method, params: params }
    res = http.post(uri.path.empty? ? '/' : uri.path, payload.to_json, 'Content-Type' => 'application/json')
    body = JSON.parse(res.body) rescue {}
    raise body['error'].inspect if body['error']
    body['result']
  end
end
