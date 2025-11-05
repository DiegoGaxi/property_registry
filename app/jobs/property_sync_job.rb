class PropertySyncJob < ApplicationJob
  queue_as :default

  def perform
    BlockchainEventSync.new.sync!
  end
end
