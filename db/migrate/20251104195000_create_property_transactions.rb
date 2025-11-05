class CreatePropertyTransactions < ActiveRecord::Migration[7.2]
  def change
    create_table :property_transactions do |t|
      t.references :property_record, null: false, foreign_key: true
      t.string :action, null: false  # register|notaryApprove|buyerApprove|governmentSeal|cancel|complete
      t.string :tx_hash, null: false
      t.string :from_address
      t.string :to_address
      t.integer :block_number
      t.integer :gas_used
      t.string :status  # success|reverted|unknown
      t.timestamps
    end
    add_index :property_transactions, :tx_hash, unique: true
    add_index :property_transactions, [:property_record_id, :action]
  end
end
