require 'rails_helper'

RSpec.describe 'Property lifecycle', type: :request do
  let(:seller) { '0x5FbDB2315678afecb367f032d93F642f64180aa3' }
  let(:buyer)  { '0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2' }
  let(:notary) { '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' }
  let(:gov)    { '0x90F79bf6EB2c4f870365E785982E1f101E93b906' }

  def create_record
    PropertyRecord.create!(seller_address: seller, buyer_address: buyer, notary_address: notary, government_address: gov, document_path: 'storage/property_documents/dummy.txt', status: :pending_notary, property_id_on_chain: 1)
  end

  before do
    # Stub blockchain client to avoid real RPC calls
    allow(BlockchainPropertyRegistryClient).to receive(:new).and_return(double(notary_approve: true, buyer_approve: true, government_seal: true))
  end

  it 'advances to notary_approved' do
    record = create_record
    patch notary_approve_property_path(record)
    expect(response).to have_http_status(302)
    expect(record.reload.status).to eq('notary_approved')
  end

  it 'advances to buyer_approved' do
    record = create_record
    record.update!(status: :notary_approved)
    patch buyer_approve_property_path(record)
    expect(record.reload.status).to eq('buyer_approved')
  end

  it 'advances to government_sealed' do
    record = create_record
    record.update!(status: :buyer_approved)
    patch government_seal_property_path(record)
    expect(record.reload.status).to eq('government_sealed')
  end
end
