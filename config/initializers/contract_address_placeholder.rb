# frozen_string_literal: true
# Warn if CONTRACT_ADDRESS env var is still a placeholder to avoid front-end ENS resolution errors.
placeholder_patterns = [/^0xTU_CONTRATO$/i, /^0x0{40}$/]
addr = ENV['CONTRACT_ADDRESS']

# Intento de carga automática desde artifact si ENV vacío
if addr.blank?
  artifact_path = Rails.root.join('..','smart-contracts','deployments','localhost','PropertyRegistry.json')
  if File.exist?(artifact_path)
    begin
      json = JSON.parse(File.read(artifact_path))
      artifact_addr = json['address']
      if artifact_addr =~ /^0x[0-9a-fA-F]{40}$/
        ENV['CONTRACT_ADDRESS'] = artifact_addr
        addr = artifact_addr
        Rails.logger.info("[Blockchain] CONTRACT_ADDRESS cargado desde artifact: #{addr}")
      else
        Rails.logger.warn("[Blockchain] Artifact encontrado pero dirección inválida: #{artifact_addr}")
      end
    rescue => e
      Rails.logger.warn("[Blockchain] Error leyendo artifact: #{e.message}")
    end
  else
    Rails.logger.info('[Blockchain] Artifact de despliegue no encontrado para autoload.')
  end
end

if addr.present? && placeholder_patterns.any? { |rx| addr.match?(rx) }
  Rails.logger.warn("[Blockchain] CONTRACT_ADDRESS parece placeholder (#{addr}). Establece la dirección real del despliegue Hardhat.")
end
if addr.present? && addr !~ /^0x[0-9a-fA-F]{40}$/
  Rails.logger.warn("[Blockchain] CONTRACT_ADDRESS formato inválido: #{addr}. Debe ser 0x + 40 hex.")
end
