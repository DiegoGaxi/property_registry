require 'net/http'
require 'json'
require 'uri'
namespace :blockchain do
  desc 'Sync PropertyRegistry events (graceful)'
  task sync: :environment do
    puts '[blockchain:sync] Iniciando...'
    BlockchainEventSync.new.sync!
    puts '[blockchain:sync] Finalizado.'
  end

  desc 'Prunea IDs on-chain huérfanos tras reinicio Hardhat según altura de bloque'
  task prune_orphans: :environment do
    threshold = (ENV['ORPHAN_BLOCK_THRESHOLD'] || 50).to_i
    rpc = ENV['RPC_URL'] || 'http://127.0.0.1:8545'
    addr = ENV['CONTRACT_ADDRESS']
    unless addr.present?
      puts '[blockchain:prune_orphans] CONTRACT_ADDRESS no definido'; next
    end
    begin
      height_hex = rpc_call(rpc, 'eth_blockNumber')
      height = height_hex.to_i(16)
      puts "[blockchain:prune_orphans] Altura actual: #{height}"
      if height < threshold
        count = PropertyRecord.where.not(id: nil).count
        if count.zero?
          puts '[blockchain:prune_orphans] No hay registros on-chain para limpiar.'; next
        end
        PropertyRecord.where.not(id: nil).update_all(id: nil)
        puts "[blockchain:prune_orphans] Limpieza realizada: #{count} registros limpiados."
      else
        puts '[blockchain:prune_orphans] Altura > umbral; no se asume reinicio, nada que hacer.'
      end
    rescue => e
      puts "[blockchain:prune_orphans] Error: #{e.class}: #{e.message}"
    end
  end
end

def rpc_call(rpc_url, method, params = [])
  uri = URI(rpc_url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'
  payload = { jsonrpc: '2.0', id: 1, method: method, params: params }
  res = http.post(uri.path.empty? ? '/' : uri.path, payload.to_json, 'Content-Type' => 'application/json')
  body = JSON.parse(res.body) rescue {}
  raise body['error'].inspect if body['error']
  body['result']
end
