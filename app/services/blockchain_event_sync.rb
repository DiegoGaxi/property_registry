# Service that scans recent blocks for PropertyRegistry events and updates local DB
class BlockchainEventSync
  RANGE_BLOCKS = 250 # number of recent blocks to scan

  def initialize(client: nil)
    @enabled = required_env_present?
    return unless @enabled
    @rpc = ENV['RPC_URL']
    @address = ENV['CONTRACT_ADDRESS'].downcase
    @abi = PROPERTY_REGISTRY_ABI.is_a?(Hash) ? PROPERTY_REGISTRY_ABI['abi'] : PROPERTY_REGISTRY_ABI
    @decoder = BlockchainLogDecoder.new(@abi)
  end

  def sync!
    unless @enabled
      Rails.logger.warn('[EventSync] Sync deshabilitado: faltan ENV (RPC_URL, CONTRACT_ADDRESS, CHAIN_ID).')
      return
    end
    latest = fetch_block_number
    return Rails.logger.warn('[EventSync] No se pudo obtener block number') unless latest
    # Hardhat se reinicia a bloque 0; si un estado previo guardó último bloque alto, evitamos pedir rangos inexistentes
    if latest < 5
      Rails.logger.info("[EventSync] Bloque actual muy bajo (#{latest}); usando rango reducido para evitar invalid block tag.")
      range = [latest, 0].max
      from = 0
      logs = fetch_logs(from, latest)
      logs.each { |log| process_log(log) }
      return
    end
    from = [latest - RANGE_BLOCKS, 0].max
    logs = fetch_logs(from, latest)
    Rails.logger.info("[EventSync] Procesando #{logs.length} logs (#{from}-#{latest})")
    logs.each { |log| process_log(log) }
    Rails.logger.info('[EventSync] Sync completado.')
  rescue => e
    Rails.logger.error("[EventSync] Error sync: #{e.class}: #{e.message}")
  end

  private

  def process_log(log)
    return unless log['address']&.downcase == @address
    decoded = @decoder.decode(log)
    return unless decoded
    name = decoded[:name]
    args = decoded[:args]
    case name
    when 'PropertyRegistered'
      id = args['id'] || args['propertyId'] || args.values.first
      pr = PropertyRecord.find_or_initialize_by(id: id)
      pr.seller_address ||= args['seller']
      pr.buyer_address  ||= args['buyer']
      pr.notary_address ||= args['notary']
      pr.doc_hash       ||= args['docHash']
      pr.status = :pending_notary if pr.status.blank?
      pr.save!
    when 'NotaryApproved'
      update_status(args, :notary_approved)
    when 'BuyerApproved'
      update_status(args, :buyer_approved)
    when 'GovernmentSealed'
      update_status(args, :government_sealed)
    when 'Cancelled'
      update_status(args, :cancelled)
    end
  rescue => e
    Rails.logger.warn("[EventSync] log processing error: #{e.class}: #{e.message}")
  end

  def update_status(args, status)
    id = args['id'] || args.values.first
    pr = PropertyRecord.find_by(id: id)
    return unless pr
    return if pr.status.to_sym == status
    pr.update(status: status)
  end

  def fetch_block_number
    raw = rpc_call('eth_blockNumber')
    num = raw&.to_i(16)
    return nil unless num
    num
  end

  def fetch_logs(from_block, to_block)
    params = [{
      address: @address,
      fromBlock: to_hex(from_block),
      toBlock: to_hex(to_block)
    }]
    result = rpc_call('eth_getLogs', params)
    Array(result)
  rescue => e
    if e.message.include?('invalid block tag')
      Rails.logger.warn("[EventSync] invalid block tag detectado. Reduciendo rango a 'latest'.")
      return []
    end
    Rails.logger.error("[EventSync] fetch_logs error: #{e.class}: #{e.message}")
    []
  end

  def rpc_call(method, params = [])
    uri = URI(@rpc)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == 'https'
    payload = { jsonrpc: '2.0', id: 1, method: method, params: params }
    res = http.post(uri.path.empty? ? '/' : uri.path, payload.to_json, 'Content-Type' => 'application/json')
    body = JSON.parse(res.body) rescue {}
    raise body['error'].inspect if body['error']
    body['result']
  end

  def to_hex(n)
    '0x' + n.to_i.to_s(16)
  end

  def required_env_present?
    %w[RPC_URL CONTRACT_ADDRESS CHAIN_ID].all? { |k| ENV[k].present? }
  end
end
