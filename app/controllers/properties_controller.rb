class PropertiesController < ApplicationController
  before_action :set_property, only: %i[show notary_approve buyer_approve government_seal mark_completed cancel]

  def index
    @properties = PropertyRecord.order(created_at: :desc)
  end

  def new
    # Valores por defecto para agilizar pruebas en entorno Hardhat
    @property = PropertyRecord.new(
      seller_address:  ENV['DEFAULT_SELLER']    || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      buyer_address:   ENV['DEFAULT_BUYER']     || '0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2',
      notary_address:  ENV['DEFAULT_NOTARY']    || '0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c',
      government_address: ENV['DEFAULT_GOV']    || '0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db'
    )
  end

  def create
    uploaded = params.dig(:property_record, :document_file)
    # Guardar archivo primero para poder validar presence de document_path
    stored_relative_path = nil
    doc_hash = nil
    if uploaded.present?
      begin
        require 'fileutils'
        require 'eth'
        dir = Rails.root.join('storage','property_documents')
        FileUtils.mkdir_p(dir)
        original_ext = File.extname(uploaded.original_filename).presence || '.bin'
        filename = "prop_#{SecureRandom.hex(8)}#{original_ext}"
        path = dir.join(filename)
        file_bytes = uploaded.read
        File.open(path,'wb'){|f| f.write(file_bytes)}
        # keccak256 para alinear con hash usado on-chain
        raw = Eth::Utils.keccak256(file_bytes)
        doc_hash = '0x' + raw.unpack1('H*')
        stored_relative_path = path.relative_path_from(Rails.root).to_s
      rescue => e
        Rails.logger.error("[Property#create] Error guardando documento: #{e.class}: #{e.message}")
      end
    end
    attrs = property_params.merge(status: :pending_notary, document_path: stored_relative_path, doc_hash: doc_hash)
    @property = PropertyRecord.new(attrs)
    respond_to do |format|
      if @property.save
        # Siempre flujo MetaMask (server signing removido)
        format.html do
          flash[:notice] = 'Propiedad creada. Ahora firma el registro on-chain con MetaMask.'
          redirect_to @property
        end
        format.json { render json: { id: @property.id }, status: :created }
      else
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: { errors: @property.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def show; end

  def document
    @property = PropertyRecord.find(params[:id])
    if @property.document_path.blank?
      redirect_to @property, alert: 'Documento no subido.' and return
    end
    file = Rails.root.join(@property.document_path)
    unless File.exist?(file)
      redirect_to @property, alert: 'Archivo faltante en storage.' and return
    end
    ext = File.extname(file).downcase
    mime = case ext
           when '.pdf' then 'application/pdf'
           when '.txt' then 'text/plain'
           when '.png' then 'image/png'
           when '.jpg','.jpeg' then 'image/jpeg'
           when '.json' then 'application/json'
           else 'application/octet-stream'
           end
    send_file file, disposition: 'inline', type: mime
  end

  def notary_approve
    ensure_role!(:notary)
    @property.update(status: :notary_approved)
    PropertyTransactionRecorder.new.record(property: @property, action: 'notaryApprove', tx_hash: params[:tx_hash]) if params[:tx_hash].present?
    turbo_stream_replace_status
  end

  def buyer_approve
    @property.update(status: :buyer_approved)
    PropertyTransactionRecorder.new.record(property: @property, action: 'buyerApprove', tx_hash: params[:tx_hash]) if params[:tx_hash].present?
    turbo_stream_replace_status
  end

  def government_seal
    ensure_role!(:government)
    unless @property.buyer_approved?
      redirect_to @property, alert: 'Falta aprobación del comprador.' and return
    end
    @property.update(status: :government_sealed)
    PropertyTransactionRecorder.new.record(property: @property, action: 'governmentSeal', tx_hash: params[:tx_hash]) if params[:tx_hash].present?
    turbo_stream_replace_status
  end

  def mark_completed
    if @property.government_sealed?
      @property.update(status: :completed)
  PropertyTransactionRecorder.new.record(property: @property, action: 'complete', tx_hash: params[:tx_hash]) if params[:tx_hash].present?
      turbo_stream_replace_status
    else
      redirect_to @property, alert: 'No sellada por gobierno todavía.'
    end
  end

  def cancel
    @property.update(status: :cancelled)
  PropertyTransactionRecorder.new.record(property: @property, action: 'cancel', tx_hash: params[:tx_hash]) if params[:tx_hash].present?
    turbo_stream_replace_status
  end

  private

  def set_property
    @property = PropertyRecord.find(params[:id])
  end

  def property_params
    params.require(:property_record).permit(:seller_address, :buyer_address, :notary_address, :government_address)
  end

  def ensure_role!(role)
    # Placeholder: implement real role validation (e.g., compare current_user wallet)
    true
  end

  def turbo_stream_replace_status
    respond_to do |format|
      format.turbo_stream do
        streams = []
        # Ahora los parciales incluyen su propio wrapper con id, podemos usar replace de forma segura
        streams << turbo_stream.replace("status_#{@property.id}", partial: 'properties/status', locals: { property: @property })
        streams << turbo_stream.replace("transactions_#{@property.id}", partial: 'properties/transactions', locals: { property: @property })
        streams << turbo_stream.replace("progress_#{@property.id}", partial: 'properties/progress', locals: { property: @property })
        streams << turbo_stream.replace("actions_#{@property.id}", partial: 'properties/actions', locals: { property: @property })
        render turbo_stream: streams
      end
      format.html { redirect_to @property }
    end
  end

  def serialize_tx(t)
    {
      id: t.id,
      action: t.action,
      tx_hash: t.tx_hash,
      short_hash: t.short_hash,
      block_number: t.block_number,
      gas_used: t.gas_used,
      gas_price: t.gas_price,
      effective_gas_price: t.effective_gas_price,
      from_address: t.from_address,
      to_address: t.to_address,
      status: t.status,
      decoded: decode_calldata(t)
    }
  end

  def decode_calldata(t)
    return nil unless t.input_data.present? && t.input_data.start_with?('0x')
    sig = t.input_data[0,10]
    data = t.input_data[10..]
    signatures = {
      'registerProperty' => 'registerProperty(bytes32,address,address)',
      'notaryApprove' => 'notaryApprove(uint256)',
      'buyerApprove' => 'buyerApprove(uint256)',
      'governmentSeal' => 'governmentSeal(uint256)'
    }
    match = signatures.find do |name, full|
      hash = '0x' + Eth::Utils.keccak256(full).unpack1('H*')
      ('0x' + hash[2,8]) == sig && name
    end
    return nil unless match
    func_name = match[0]
    slots = data.scan(/.{64}/)
    case func_name
    when 'registerProperty'
      doc_hash = '0x' + slots[0]
      buyer = '0x' + slots[1][24..]
      notary = '0x' + slots[2][24..]
      { function: func_name, doc_hash: doc_hash, buyer: buyer, notary: notary }
    when 'notaryApprove','buyerApprove','governmentSeal'
      id = slots[0].to_i(16)
      { function: func_name, property_id: id }
    else
      nil
    end
  rescue => e
    Rails.logger.warn("[Decode] fallo #{e.class}: #{e.message}")
    nil
  end

  # persist_tx reemplazado por PropertyTransactionRecorder
end
