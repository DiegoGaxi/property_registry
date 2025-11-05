require 'rails_helper'

RSpec.describe PropertyRecord, type: :model do
  let(:seller) { '0x5FbDB2315678afecb367f032d93F642f64180aa3' }
  let(:buyer)  { '0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2' }
  let(:notary) { '0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c' }
  let(:gov)    { '0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db' }
  let(:document_path) { 'storage/property_documents/example.txt' }

  subject do
    described_class.new(
      seller_address: seller,
      buyer_address: buyer,
      notary_address: notary,
      government_address: gov,
  document_path: document_path,
      status: :pending_notary
    )
  end

  describe 'enums' do
    it 'defines the expected statuses' do
      expect(described_class.statuses.keys).to contain_exactly(
        'pending_notary','notary_approved','buyer_approved','government_sealed','completed','cancelled'
      )
    end
  end

  describe 'validations' do
    it 'is valid with all required attributes' do
      expect(subject).to be_valid
    end

    it 'requires seller_address' do
      subject.seller_address = nil
      expect(subject).not_to be_valid
      expect(subject.errors[:seller_address]).to be_present
    end

    it 'requires notary_address' do
      subject.notary_address = nil
      expect(subject).not_to be_valid
    end

    it 'requires buyer_address' do
      subject.buyer_address = nil
      expect(subject).not_to be_valid
    end

    it 'requires document_path' do
      subject.document_path = nil
      expect(subject).not_to be_valid
      expect(subject.errors[:document_path]).to be_present
    end
  end

  describe '#human_status' do
    it 'titleizes the status' do
      subject.status = :notary_approved
      expect(subject.human_status).to eq('Notary Approved')
    end
  end
end
