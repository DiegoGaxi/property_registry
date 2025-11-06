class CreatePropertyRecords < ActiveRecord::Migration[7.1]
  def change
    create_table :property_records do |t|
      t.string :seller_address, null: false
      t.string :buyer_address, null: false
      t.string :notary_address, null: false
      t.string :government_address
      t.string :doc_hash, null: false
      t.integer :status, null: false, default: 0
      t.integer :property_id_on_chain
      t.integer :chain_id
      t.timestamps
    end
    add_index :property_records, :seller_address
    add_index :property_records, :buyer_address
    add_index :property_records, :notary_address
  end
end
