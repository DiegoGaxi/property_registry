# frozen_string_literal: true

# Service to perform blockchain RPC health diagnostics.
# Provides structured status for UI or rake tasks.
require "net/http"
require "json"
class BlockchainRpcHealth
  attr_reader :rpc_url

  def initialize(rpc_url: ENV["RPC_URL"])
    @rpc_url = rpc_url
  end

  def status
    return offline("RPC_URL missing ENV") if rpc_url.blank?
    client_mode_status || fallback_mode_status
  rescue StandardError => e
    offline("#{e.class}: #{e.message}")
  end

  private

  def safe_client
    Eth::Client.create(rpc_url)
  rescue StandardError
    nil
  end

  def client_mode_status
    return nil unless defined?(Eth::Client)
    client = safe_client
    return offline("Eth::Client init failed") unless client
    start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    number = client.block_number
    latency = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start) * 1000).round(1)
    online(number, latency, "eth-client")
  rescue StandardError => e
    offline("client-error: #{e.message}")
  end

  def fallback_mode_status
    raw = raw_block_number
    return offline(raw[:error]) unless raw[:number]
    online(raw[:number], raw[:latency_ms], "raw-jsonrpc")
  end

  def raw_block_number
    start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    payload = { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }
    uri = URI(rpc_url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    res = http.post(uri.path.empty? ? "/" : uri.path, payload.to_json, "Content-Type" => "application/json")
    body = JSON.parse(res.body) rescue {}
    hex = body.dig("result")
    return { number: nil, error: "no-result" } unless hex
    num = hex.to_i(16)
    latency = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start) * 1000).round(1)
    { number: num, latency_ms: latency }
  rescue Errno::ECONNREFUSED => e
    { number: nil, error: "connection-refused" }
  rescue StandardError => e
    { number: nil, error: e.message }
  end

  def online(number, latency, mode)
    {
      online: true,
      block_number: number,
      latency_ms: latency,
      url: rpc_url,
      mode: mode
    }
  end

  def offline(reason)
    { online: false, reason: reason, url: rpc_url }
  end
end
