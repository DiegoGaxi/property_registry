class CreateRegistrationSteps < ActiveRecord::Migration[7.1]
  def change
    create_table :registration_steps do |t|
      t.references :property_record, null: false, foreign_key: true
      t.string :actor_role, null: false
      t.string :actor_address
      t.boolean :done, default: false
      t.datetime :done_at
      t.timestamps
    end
    add_index :registration_steps, :actor_role
  end
end
