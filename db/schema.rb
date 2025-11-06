# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[7.2].define(version: 2025_11_05_183000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "property_records", force: :cascade do |t|
    t.string "seller_address", null: false
    t.string "buyer_address", null: false
    t.string "notary_address", null: false
    t.string "government_address"
    t.string "doc_hash", null: false
    t.integer "status", default: 0, null: false
    t.integer "property_id_on_chain"
    t.integer "chain_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "document_path"
    t.index ["buyer_address"], name: "index_property_records_on_buyer_address"
    t.index ["document_path"], name: "index_property_records_on_document_path"
    t.index ["notary_address"], name: "index_property_records_on_notary_address"
    t.index ["seller_address"], name: "index_property_records_on_seller_address"
  end

  create_table "property_transactions", force: :cascade do |t|
    t.bigint "property_record_id", null: false
    t.string "action", null: false
    t.string "tx_hash", null: false
    t.string "from_address"
    t.string "to_address"
    t.integer "block_number"
    t.integer "gas_used"
    t.string "status"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "input_data"
    t.bigint "gas_price"
    t.bigint "effective_gas_price"
    t.index ["property_record_id", "action"], name: "index_property_transactions_on_property_record_id_and_action"
    t.index ["property_record_id"], name: "index_property_transactions_on_property_record_id"
    t.index ["tx_hash"], name: "index_property_transactions_on_tx_hash", unique: true
  end

  create_table "registration_steps", force: :cascade do |t|
    t.bigint "property_record_id", null: false
    t.string "actor_role", null: false
    t.string "actor_address"
    t.boolean "done", default: false
    t.datetime "done_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["actor_role"], name: "index_registration_steps_on_actor_role"
    t.index ["property_record_id"], name: "index_registration_steps_on_property_record_id"
  end

  add_foreign_key "property_transactions", "property_records"
  add_foreign_key "registration_steps", "property_records"
end
