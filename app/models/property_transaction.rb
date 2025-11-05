class PropertyTransaction < ApplicationRecord
  belongs_to :property_record
  validates :action, :tx_hash, presence: true
  validates :tx_hash, format: /\A0x[0-9a-fA-F]{64}\z/

  scope :recent, -> { order(created_at: :asc) }

  def short_hash
    tx_hash[0,10] + '…' + tx_hash[-6,6]
  end
end
