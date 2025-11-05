# frozen_string_literal: true

namespace :blockchain do
  desc 'List NOTARY_ROLE and GOVERNMENT_ROLE membership for configured addresses'
  task roles_status: :environment do
    client = BlockchainPropertyRegistryClient.new
    notary = ENV['NOTARY_ADDRESS'] || ENV['DEFAULT_NOTARY'] || '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
    government = ENV['GOVERNMENT_ADDRESS'] || ENV['DEFAULT_GOVERNMENT'] || '0x90F79bf6EB2c4f870365E785982E1f101E93b906'

    puts "Contract: #{ENV['CONTRACT_ADDRESS']}"
    puts "RPC: #{ENV['RPC_URL']}"

    n_has = client.has_role?('NOTARY_ROLE', notary)
    g_has = client.has_role?('GOVERNMENT_ROLE', government)

    puts "NOTARY_ROLE (#{notary}): #{n_has ? 'YES' : 'NO'}"
    puts "GOVERNMENT_ROLE (#{government}): #{g_has ? 'YES' : 'NO'}"
  rescue StandardError => e
    puts "[blockchain:roles_status] Error: #{e.class}: #{e.message}"
    exit 1
  end
end
