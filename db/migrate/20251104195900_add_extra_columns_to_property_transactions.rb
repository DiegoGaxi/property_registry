class AddExtraColumnsToPropertyTransactions < ActiveRecord::Migration[7.2]
  def change
    add_column :property_transactions, :input_data, :text
    add_column :property_transactions, :gas_price, :bigint
    add_column :property_transactions, :effective_gas_price, :bigint
  end
end
