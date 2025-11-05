require 'rails_helper'

RSpec.describe 'Properties', type: :request do
  describe 'POST /properties' do
    it 'persists uploaded file and sets document_path' do
      file_content = 'test file content'
      # Tempfile to simulate upload
      temp = Tempfile.new('propdoc')
      begin
        temp.write(file_content)
        temp.rewind
        uploaded = Rack::Test::UploadedFile.new(temp.path, 'text/plain')
  provided_doc_hash = 'IGNORED'

        # Stub blockchain client to avoid needing private key and RPC in test
        allow(BlockchainPropertyRegistryClient).to receive(:new).and_return(
          double(register_property: '0xtxhash', extract_property_id_from_receipt: nil)
        )

        post properties_path, params: {
          property_record: {
            seller_address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
            buyer_address:  '0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2',
            notary_address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
            government_address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
            document_file: uploaded
          }
        }
        expect(response).to have_http_status(302) # redirected to show
        created = PropertyRecord.last
        expect(created.document_path).to be_present
        expect(File.exist?(Rails.root.join(created.document_path))).to be true
        expect(created.status).to eq('pending_notary')
        # Verifica que el archivo físico existe
        expect(File.read(Rails.root.join(created.document_path))).to eq(file_content)
      ensure
        temp.close
        temp.unlink
      end
    end
  end
end
