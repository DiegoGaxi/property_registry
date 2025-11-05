class PropertyRecord < ApplicationRecord
  # Columns: seller_address, buyer_address, notary_address, government_address, document_path, status, chain_id, property_id_on_chain
  # Positional enum syntax (Rails 8 compatible)
  enum :status, {
    pending_notary: 0,
    notary_approved: 1,
    buyer_approved: 2,
    government_sealed: 3,
    completed: 4,
    cancelled: 5
  }

  validates :seller_address, :buyer_address, :notary_address, presence: true
  validates :document_path, presence: true

  def human_status
    status.titleize
  end

  # Map polymorphic path helpers to resources :properties so link_to(record) works
  def self.model_name
    ActiveModel::Name.new(self, nil, 'Property')
  end
  # Ensure ActiveRecord still points to the correct existing table
  self.table_name = 'property_records'

  # Explicit foreign_key because custom model_name ('Property') made Rails infer property_id
  has_many :property_transactions, foreign_key: :property_record_id, inverse_of: :property_record, dependent: :destroy
end
