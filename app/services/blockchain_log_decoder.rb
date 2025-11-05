# frozen_string_literal: true
require 'eth'

# Generic log decoder for static solidity event types (address,uint256,bytes32,bool) using ABI.
# Limitations: does not handle dynamic types (string, bytes, arrays) yet.
class BlockchainLogDecoder
  def initialize(abi)
    @events = Array(abi).select { |e| e.is_a?(Hash) && e['type'] == 'event' }
    @event_by_topic = {}
    @events.each do |ev|
      sig = signature(ev)
      topic0 = keccak(sig)
      @event_by_topic[topic0.downcase] = ev
    end
  end

  def decode(log)
    topic0 = log['topics'][0].downcase
    ev = @event_by_topic[topic0]
    return nil unless ev
    indexed_inputs = ev['inputs'].select { |i| i['indexed'] }
    non_indexed_inputs = ev['inputs'].reject { |i| i['indexed'] }
    args = {}
    # Decode indexed params from topics[1..]
    indexed_inputs.each_with_index do |input, idx|
      raw = log['topics'][idx + 1]
      args[input['name']] = decode_indexed_arg(input['type'], raw)
    end
    # Decode data blob for non-indexed (concatenated 32-byte slots)
    data_hex = log['data'].to_s.sub(/^0x/, '')
    non_indexed_inputs.each_with_index do |input, idx|
      slice = data_hex[(idx * 64), 64]
      next unless slice
      args[input['name']] = decode_slot(input['type'], slice)
    end
    { name: ev['name'], args: args }
  rescue => e
    Rails.logger.warn("[LogDecoder] error: #{e.class}: #{e.message}")
    nil
  end

  private

  def signature(ev)
    types = ev['inputs'].map { |i| i['type'] }.join(',')
    "#{ev['name']}(#{types})"
  end

  def keccak(signature)
    '0x' + Eth::Utils.keccak256(signature).unpack1('H*')
  end

  def decode_indexed_arg(type, raw)
    hex = raw.sub(/^0x/, '')
    case type
    when 'uint256' then hex.to_i(16)
    when 'address' then '0x' + hex[-40..]
    when 'bytes32' then '0x' + hex
    when 'bool' then hex.to_i(16) == 1
    else raw
    end
  end

  def decode_slot(type, slice)
    case type
    when 'uint256' then slice.to_i(16)
    when 'address' then '0x' + slice[-40..]
    when 'bytes32' then '0x' + slice
    when 'bool' then slice.to_i(16) == 1
    else '0x' + slice
    end
  end
end
