REQUIRED_ENV = %w[RPC_URL CONTRACT_ADDRESS CHAIN_ID PRIVATE_KEY_SELLER PRIVATE_KEY_NOTARY PRIVATE_KEY_BUYER PRIVATE_KEY_GOV]
missing = REQUIRED_ENV.select { |k| ENV[k].blank? }
if missing.any?
  Rails.logger.warn("[Blockchain] Missing ENV vars: #{missing.join(', ')} (placeholders in effect; DO NOT SHIP like this)")
end

if ENV['CONTRACT_ADDRESS'].present? && !(ENV['CONTRACT_ADDRESS'].start_with?('0x') && ENV['CONTRACT_ADDRESS'].length == 42)
  Rails.logger.warn('[Blockchain] CONTRACT_ADDRESS format invalid')
end

ABI_PATH = Rails.root.join('abi', 'PropertyRegistry.json')
PROPERTY_REGISTRY_ABI = if File.exist?(ABI_PATH)
                          JSON.parse(File.read(ABI_PATH))
                        else
                          Rails.logger.error('[Blockchain] ABI file missing at abi/PropertyRegistry.json')
                          []
                        end
