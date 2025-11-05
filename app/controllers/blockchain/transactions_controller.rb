# frozen_string_literal: true
module Blockchain
  class TransactionsController < ApplicationController
    protect_from_forgery with: :null_session

  # POST /blockchain/tx_callback
  # Params: property_id, buyer_address, notary_address, seller_address (wallet used), tx_hash
    def create
      required = %i[property_id buyer_address notary_address seller_address tx_hash]
      missing = required.select { |k| params[k].blank? }
      return render json: { error: "Missing params: #{missing.join(', ')}" }, status: :unprocessable_entity if missing.any?

      pr = PropertyRecord.find_by(id: params[:property_id])
      return render json: { error: 'Property not found' }, status: :not_found unless pr

      # Validar coherencia básica de direcciones si se desea (no estricto aún)
      if pr.buyer_address.downcase != params[:buyer_address].downcase || pr.notary_address.downcase != params[:notary_address].downcase || pr.seller_address.downcase != params[:seller_address].downcase
        Rails.logger.warn("[tx_callback] Dirección desalineada contra record existente")
      end

      # Registrar transacción asociada al property existente
      PropertyTransactionRecorder.new.record(property: pr, action: 'registerProperty', tx_hash: params[:tx_hash])
      render json: { ok: true, property_id: pr.id, tx_hash: params[:tx_hash] }
    end
  end
end
