# frozen_string_literal: true
require 'eth'
begin
  require 'eth/abi'
rescue LoadError
  Rails.logger.warn('[Blockchain] eth/abi not available; falling back to manual ABI encoder')
end

require 'net/http'
require 'json'

# Thin client to interact with PropertyRegistry contract (with raw JSON-RPC fallback)
class BlockchainPropertyRegistryClient
  # Support both Hardhat artifact (hash with 'abi') and raw ABI array
  RAW_ABI_SOURCE = PROPERTY_REGISTRY_ABI
  PARSED_ABI = begin
    if RAW_ABI_SOURCE.is_a?(Hash)
      raw = RAW_ABI_SOURCE['abi']
      if raw.is_a?(String)
        JSON.parse(raw)
      else
        raw
      end
    elsif RAW_ABI_SOURCE.is_a?(String)
      JSON.parse(RAW_ABI_SOURCE)
    else
      RAW_ABI_SOURCE
    end
  rescue JSON::ParserError => e
    Rails.logger.error("[Blockchain] ABI JSON parse error: #{e.message}; usando arreglo vacío")
    []
  end
  ABI = PARSED_ABI || []

  def initialize(private_key: ENV['PRIVATE_KEY_SELLER'])
    raise 'RPC_URL missing' if ENV['RPC_URL'].blank?
    raise 'CONTRACT_ADDRESS missing' if ENV['CONTRACT_ADDRESS'].blank?
    @rpc = ENV['RPC_URL']
    @contract_address = ENV['CONTRACT_ADDRESS']
    @client = begin
      if defined?(Eth::Client)
        Eth::Client.create(@rpc)
      else
        Rails.logger.warn('[Blockchain] Eth::Client no disponible, usando RawRpcClient')
        raw_rpc_client
      end
    rescue StandardError => e
      Rails.logger.error("[Blockchain] Error creando cliente RPC: #{e.class}: #{e.message}; usando RawRpcClient")
      raw_rpc_client
    end
    @key = build_key(private_key)
  end

  def register_property(doc_hash:, buyer:, notary:)
    func = find_function('registerProperty')
    data = encode_calldata(func, [doc_hash, buyer, notary])
    send_tx(data)
  end

  def notary_approve(id, key: ENV['PRIVATE_KEY_NOTARY'])
    function_call('notaryApprove', [id], key)
  end

  def buyer_approve(id, key: ENV['PRIVATE_KEY_BUYER'])
    function_call('buyerApprove', [id], key)
  end

  def government_seal(id, key: ENV['PRIVATE_KEY_GOV'])
    function_call('governmentSeal', [id], key)
  end

  def get_property(id)
    func = find_function('getProperty')
    data = encode_calldata(func, [id])
    raw = @client.call(@contract_address, data)
    # Decoding left minimal for brevity
    raw
  end

  # Grant NOTARY role to an address (caller must have admin role)
  def grant_notary_role(address, key: ENV['PRIVATE_KEY_ADMIN'] || ENV['PRIVATE_KEY_SELLER'])
    grant_role('NOTARY_ROLE', address, key: key)
  end

  # Grant GOVERNMENT role to an address (caller must have admin role)
  def grant_government_role(address, key: ENV['PRIVATE_KEY_ADMIN'] || ENV['PRIVATE_KEY_SELLER'])
    grant_role('GOVERNMENT_ROLE', address, key: key)
  end

  # Generic grantRole wrapper
  def grant_role(role_name, address, key: ENV['PRIVATE_KEY_ADMIN'] || ENV['PRIVATE_KEY_SELLER'])
  role_bytes32 = keccak(role_name) # matches contract constant definition keccak256("#{role_name}")
    function_call('grantRole', [role_bytes32, address], key)
  end

  # Check if an address has a given role (returns true/false)
  def has_role?(role_name, address)
    func = find_function('hasRole')
  role_bytes32 = keccak(role_name)
    data = encode_calldata(func, [role_bytes32, address])
    raw = @client.call(@contract_address, data)
    # raw is a 32-byte boolean slot -> 0x...1 for true, 0x...0 for false
    raw.to_s.downcase.end_with?('1')
  rescue StandardError => e
    Rails.logger.warn("[Blockchain] has_role? error: #{e.class}: #{e.message}")
    false
  end

  private

  def find_function(name)
    entry = ABI.find { |f| f.is_a?(Hash) && f['type'] == 'function' && f['name'] == name }
    raise "ABI function #{name} not found" unless entry
    entry
  end

  def function_call(name, args, priv)
  func = find_function(name)
  data = encode_calldata(func, args)
  send_tx(data, priv)
  end

    # Wrapper choosing eth gem ABI encoder or manual fallback
    def encode_calldata(func, args)
      # Always manual encode for deterministic selectors; eth gem ABI encoding unreliable for custom function map
      manual_encode(func, args)
    end

    # Manual minimal encoder (supports uint256,address,bytes32) – static types only
    def manual_encode(func, args)
  signature = "#{func['name']}(#{func['inputs'].map { |i| i['type'] }.join(',')})"
  full_hash = keccak(signature)
  selector = '0x' + full_hash[2,8] # take first 4 bytes
      encoded = func['inputs'].each_with_index.map do |input, idx|
        encode_arg(input['type'], args[idx])
      end.join
      selector + encoded
    end

    def encode_arg(type, value)
      case type
      when 'uint256'
        v = value.to_i
        v.to_s(16).rjust(64, '0')
      when 'address'
        addr = value.to_s.downcase
        addr = addr[2..] if addr.start_with?('0x')
        addr.rjust(64, '0')
      when 'bytes32'
        hex = value.to_s.downcase
        hex = hex[2..] if hex.start_with?('0x')
        raise 'bytes32 length mismatch' unless hex.length == 64
        hex
      else
        raise "Unsupported type #{type} in manual encoder"
      end
    end

  def send_tx(data, priv = @key&.priv)
    if priv.blank?
      raise 'Private key missing for transaction. Define PRIVATE_KEY_* en .env (64 hex, puede comenzar con 0x). Ejemplo Hardhat Account #0: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    end
    @client ||= ensure_client!
    raise 'RPC client not initialized (¿Hardhat node corriendo?)' unless @client
    normalized_priv = normalize_priv(priv)
    raise 'Private key formato inválido (debe ser 64 hex chars, opcional prefijo 0x)' unless normalized_priv
    begin
      key = Eth::Key.new(priv: normalized_priv)
    rescue MoneyTree::Key::KeyFormatNotFound, ArgumentError => e
      raise "Private key no aceptada por Eth::Key: #{e.class}: #{e.message}. Verifica que sea una clave Hardhat de 64 hex (sin frases, sin espacios)."
    end
    nonce = with_retries { @client.get_nonce(key.address) }
    gas_price = begin
      with_retries { @client.gas_price }
    rescue StandardError
      1_000_000_000 # fallback 1 gwei if RPC fails
    end
    chain_id = ENV['CHAIN_ID'].to_i
    raise 'CHAIN_ID inválido o ausente en .env' if chain_id.zero?
    # Algunos builds de la gema eth requieren value explícito y dirección normalizada
    to_address = @contract_address.downcase
    tx = Eth::Tx.new(
      data: data,
      to: to_address,
      value: 0,
      gas_limit: 300_000,
      gas_price: gas_price,
      nonce: nonce,
      chain_id: chain_id
    )
    # Firma directa (sin mensajes específicos de OpenSSL). Si falla, cambia al flujo MetaMask.
    tx.sign(key)
    tx_hash = with_retries { @client.send_raw_transaction(tx.hex) }
    tx_hash
  end

  # Broadcast a raw signed transaction hex (already signed client-side)
  def broadcast_raw(hex)
    @client ||= ensure_client!
    raise 'RPC client not initialized' unless @client
    with_retries { @client.send_raw_transaction(hex) }
  end

  def build_key(pk)
    return nil if pk.blank? || pk.include?('__RELLENA__')
    hex = pk.start_with?('0x') ? pk[2..] : pk
    unless hex.length == 64 && hex =~ /\A[0-9a-fA-F]{64}\z/
      Rails.logger.warn("[Blockchain] Private key formato inválido (len=#{hex.length}) - se omite clave para operaciones read-only")
      return nil
    end
    Eth::Key.new(priv: hex)
  rescue StandardError => e
    Rails.logger.warn("[Blockchain] Error creando clave: #{e.class}: #{e.message}; se omite")
    nil
  end

  def normalize_priv(pk)
    return nil if pk.blank?
    hex = pk.start_with?('0x') ? pk[2..] : pk
    return nil unless hex.length == 64 && hex =~ /\A[0-9a-fA-F]{64}\z/
    hex
  end

  def ensure_client!
    return @client if @client
    @client = if defined?(Eth::Client)
                Eth::Client.create(@rpc)
              else
                raw_rpc_client
              end
  rescue StandardError => e
    Rails.logger.error("[Blockchain] Lazy init RPC falló: #{e.class}: #{e.message}; usando RawRpcClient")
    @client = raw_rpc_client
  end

  # Generic retry wrapper for transient RPC failures
  def with_retries(attempts: 3, base_sleep: 0.25)
    tries = 0
    begin
      yield
    rescue StandardError => e
      tries += 1
      if tries < attempts
        sleep(base_sleep * tries)
        Rails.logger.warn("[Blockchain] RPC retry #{tries}/#{attempts} tras error: #{e.class}: #{e.message}")
        retry
      else
        Rails.logger.error("[Blockchain] RPC agotó reintentos: #{e.class}: #{e.message}")
        raise
      end
    end
  end

  # Quick health check (returns true/false) without raising
  def healthy?
    c = ensure_client!
    return false unless c
    with_retries(attempts: 1) { c.block_number }
    true
  rescue StandardError
    false
  end

  public

  # Attempt to extract property id from receipt logs for PropertyRegistered event
  def extract_property_id_from_receipt(tx_hash)
    return nil unless @client && tx_hash
    # eth gem does not expose a direct receipt parser; implement minimal JSON-RPC call
    receipt = raw_receipt(tx_hash)
    return nil unless receipt && receipt['logs']
  event = ABI.find { |x| x.is_a?(Hash) && x['type'] == 'event' && x['name'] == 'PropertyRegistered' }
    return nil unless event
    topic0 = keccak("#{event['name']}(#{event['inputs'].map { |i| i['type'] }.join(',')})")
    log = receipt['logs'].find { |l| l['topics'][0].casecmp(topic0).zero? }
    return nil unless log
    # Assuming first non-indexed arg is propertyId or indexed order; adapt if indexed
    # For simplicity, parse data as 32-byte slots
    data = log['data'].sub(/^0x/, '')
    # Each 64 hex chars = 32 bytes. propertyId likely first slot.
    first_slot = data[0,64]
    first_slot.to_i(16)
  rescue => e
    Rails.logger.warn("[Blockchain] extract_property_id_from_receipt error: #{e.message}")
    nil
  end

  def raw_receipt(tx_hash)
    payload = {
      jsonrpc: '2.0',
      method: 'eth_getTransactionReceipt',
      params: [tx_hash],
      id: 1
    }
    uri = URI(@rpc)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == 'https'
    res = http.post(uri.path.empty? ? '/' : uri.path, payload.to_json, 'Content-Type' => 'application/json')
    JSON.parse(res.body)['result']
  end

  # Raw JSON-RPC minimal client
  def raw_rpc_client
    RawRpcClient.new(@rpc)
  end

  class RawRpcClient
    def initialize(rpc_url)
      @rpc_url = rpc_url
    end

    def rpc_post(method, params)
      uri = URI(@rpc_url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'
      payload = { jsonrpc: '2.0', id: 1, method: method, params: params }
      res = http.post(uri.path.empty? ? '/' : uri.path, payload.to_json, 'Content-Type' => 'application/json')
      body = JSON.parse(res.body) rescue {}
      raise body['error'].inspect if body['error']
      body['result']
    end

    def get_nonce(address)
      hex = rpc_post('eth_getTransactionCount', [address, 'latest'])
      hex.to_i(16)
    end

    def gas_price
      hex = rpc_post('eth_gasPrice', [])
      hex.to_i(16)
    end

    def send_raw_transaction(hex_tx)
      rpc_post('eth_sendRawTransaction', [hex_tx])
    end

    def call(to, data)
      rpc_post('eth_call', [{ to: to, data: data }, 'latest'])
    end

    def block_number
      hex = rpc_post('eth_blockNumber', [])
      hex.to_i(16)
    end
  end

  def keccak(signature)
    # eth gem exposes Eth::Utils.keccak256 returning binary string
    bytes = Eth::Utils.keccak256(signature)
    '0x' + bytes.unpack1('H*')
  end
end
