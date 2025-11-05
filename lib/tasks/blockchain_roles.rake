# frozen_string_literal: true

namespace :blockchain do
  desc 'Grant default NOTARY and GOVERNMENT roles to configured addresses'
  task grant_roles: :environment do
    notary = ENV['NOTARY_ADDRESS'] || ENV['DEFAULT_NOTARY'] || '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
    government = ENV['GOVERNMENT_ADDRESS'] || ENV['DEFAULT_GOVERNMENT'] || '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
    admin_pk = ENV['PRIVATE_KEY_ADMIN'] || ENV['PRIVATE_KEY_SELLER']

    if admin_pk.blank? || admin_pk.include?('__RELLENA__')
      puts '[blockchain:grant_roles] Admin private key missing (PRIVATE_KEY_ADMIN or PRIVATE_KEY_SELLER). Aborting.'
      exit 1
    end

    client = BlockchainPropertyRegistryClient.new(private_key: admin_pk)

    puts "Granting NOTARY_ROLE to #{notary}..."
    tx1 = client.grant_notary_role(notary)
    puts " => tx hash: #{tx1}"

    puts "Granting GOVERNMENT_ROLE to #{government}..."
    tx2 = client.grant_government_role(government)
    puts " => tx hash: #{tx2}"

    puts 'Roles granted. Verify on-chain (e.g., using hardhat console):'
    puts '  await registry.hasRole(await registry.NOTARY_ROLE(), \"<notary_address>\")'
    puts '  await registry.hasRole(await registry.GOVERNMENT_ROLE(), \"<government_address>\")'
  rescue StandardError => e
    puts "[blockchain:grant_roles] Error: #{e.class}: #{e.message}"
    exit 1
  end
end
