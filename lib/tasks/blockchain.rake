namespace :blockchain do
  desc 'Sync PropertyRegistry events (graceful)'
  task sync: :environment do
    puts '[blockchain:sync] Iniciando...'
    BlockchainEventSync.new.sync!
    puts '[blockchain:sync] Finalizado.'
  end
end
