class AddBackDocumentPathToPropertyRecords < ActiveRecord::Migration[7.2]
  def change
    unless column_exists?(:property_records, :document_path)
      add_column :property_records, :document_path, :string
      add_index  :property_records, :document_path
    end
  end
end
