class RegistrationStep < ApplicationRecord
  # Columns: property_record_id, actor_role (seller|notary|buyer|government), actor_address, done:boolean, done_at:datetime
  belongs_to :property_record
  validates :actor_role, inclusion: { in: %w[seller notary buyer government] }

  scope :pending, -> { where(done: false) }
end
