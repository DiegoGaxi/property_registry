require 'rails_helper'

RSpec.describe BlockchainRpcHealth do
  let(:url) { 'http://localhost:8545' }

  describe '#status' do
    context 'without RPC_URL' do
      it 'returns offline when URL missing' do
        health = described_class.new(rpc_url: nil)
        st = health.status
        expect(st[:online]).to be(false)
        expect(st[:reason]).to include('RPC_URL')
      end
    end

    context 'fallback raw-jsonrpc mode' do
      before do
        # Ensure Eth::Client is undefined to force fallback
        hide_const('Eth::Client') if defined?(Eth::Client)
        # Stub Net::HTTP response
        fake_body = { jsonrpc: '2.0', id: 1, result: '0x10' }.to_json
        allow(Net::HTTP).to receive(:new).and_wrap_original do |m, *args|
          http = m.call(*args)
          allow(http).to receive(:use_ssl=)
          allow(http).to receive(:post).and_return(double(body: fake_body))
          http
        end
      end

      it 'returns online with block number via raw-jsonrpc' do
        st = described_class.new(rpc_url: url).status
        expect(st[:online]).to be(true)
        expect(st[:block_number]).to eq(16) # 0x10 -> 16 decimal
        expect(st[:mode]).to eq('raw-jsonrpc')
      end
    end

    context 'client eth-client mode' do
      before do
        stub_const('Eth::Client', Class.new do
          def self.create(_u); new; end
          def block_number; 42; end
        end)
      end

      it 'returns online using eth-client' do
        st = described_class.new(rpc_url: url).status
        expect(st[:online]).to be(true)
        expect(st[:block_number]).to eq(42)
        expect(st[:mode]).to eq('eth-client')
      end
    end
  end
end
