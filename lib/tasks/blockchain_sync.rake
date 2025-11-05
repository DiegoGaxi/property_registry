# frozen_string_literal: true
namespace :blockchain do
  desc 'Sync PropertyRegistry events (placeholder)'
  task sync: :environment do
    puts 'Iniciando sync de eventos...' 
    BlockchainEventSync.new.sync!
    puts 'Sync finalizado.'
  end
end
