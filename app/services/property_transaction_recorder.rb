# Centraliza la lógica de captura y persistencia de transacciones on-chain
class PropertyTransactionRecorder
  def initialize(fetcher: EthereumTxFetcher.new)
    @fetcher = fetcher
  end

  # action: registerProperty|notaryApprove|buyerApprove|governmentSeal|complete|cancel
  def record(property:, action:, tx_hash:)
    return if tx_hash.blank? || !tx_hash.start_with?('0x')
    details = @fetcher.fetch(tx_hash)
    tx = property.property_transactions.find_or_initialize_by(tx_hash: tx_hash)
    tx.action = action
    tx.from_address = details[:from]
    tx.to_address = details[:to]
    tx.block_number = details[:block_number]
    tx.gas_used = details[:gas_used]
    tx.gas_price = details[:gas_price]
    tx.effective_gas_price = details[:effective_gas_price]
    tx.input_data = details[:input_data]
    tx.status = details[:status]
    tx.save!
  rescue => e
    Rails.logger.warn("[TxRecorder] fallo al guardar #{action} #{tx_hash}: #{e.class}: #{e.message}")
  end
end
