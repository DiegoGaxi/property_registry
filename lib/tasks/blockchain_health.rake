# frozen_string_literal: true
namespace :blockchain do
  desc 'Check RPC connectivity and print diagnostic JSON'
  task health: :environment do
    health = BlockchainRpcHealth.new.status
    puts health.to_json
    if health[:online]
      puts "RPC OK block=#{health[:block_number]} latency=#{health[:latency_ms]}ms"
    else
      warn "RPC OFFLINE: #{health[:reason]}"
      exit 1
    end
  end
end
