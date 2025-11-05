class RemoveDocHashFromPropertyRecords < ActiveRecord::Migration[7.2]
  def up
    add_column :property_records, :document_path, :string
    add_index :property_records, :document_path
    remove_column :property_records, :doc_hash, :string
  end

  def down
    add_column :property_records, :doc_hash, :string
    remove_index :property_records, :document_path if index_exists?(:property_records, :document_path)
    remove_column :property_records, :document_path
  end
end