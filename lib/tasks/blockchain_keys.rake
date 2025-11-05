# frozen_string_literal: true

namespace :blockchain do
  desc 'Mostrar y validar claves privadas configuradas (SELLER, NOTARY, BUYER, GOV, ADMIN)'
  task keys: :environment do
    require 'eth'

    keys = {
      seller: ENV['PRIVATE_KEY_SELLER'],
      notary: ENV['PRIVATE_KEY_NOTARY'],
      buyer:  ENV['PRIVATE_KEY_BUYER'],
      gov:    ENV['PRIVATE_KEY_GOV'],
      admin:  ENV['PRIVATE_KEY_ADMIN'] || ENV['PRIVATE_KEY_SELLER']
    }

    puts '== Validación de Private Keys =='
    keys.each do |role, pk|
      status = 'OK'
      warning = nil
      if pk.nil? || pk.strip.empty? || pk.include?('__RELLENA__')
        status = 'FALTANTE'
        puts "#{role.to_s.upcase}: (faltante)"
        next
      end
      hex = pk.start_with?('0x') ? pk[2..] : pk
      unless hex.length == 64 && hex =~ /\A[0-9a-fA-F]{64}\z/
        status = 'INVALIDO'
        warning = "Formato incorrecto (longitud=#{hex.length})"
      end
      begin
        key_obj = Eth::Key.new(priv: hex)
        addr = key_obj.address
        # Heurística: mostrar aviso si dos roles comparten dirección (excepto admin= seller intencional)
        puts "#{role.to_s.upcase}: #{addr} (#{status})"
        puts "   AVISO: #{warning}" if warning
      rescue StandardError => e
        puts "#{role.to_s.upcase}: ERROR al derivar -> #{e.class}: #{e.message}"
      end
    end

    # Detección de duplicados
    derived = keys.map do |role, pk|
      next if pk.nil? || pk.include?('__RELLENA__')
      hex = pk.start_with?('0x') ? pk[2..] : pk
      begin
        [role, Eth::Key.new(priv: hex).address]
      rescue
        nil
      end
    end.compact

    grouped = derived.group_by { |(_, addr)| addr }
    duplicates = grouped.select { |_addr, arr| arr.size > 1 }
    if duplicates.any?
      puts '\n== Direcciones duplicadas detectadas ==' \
        "\n(Si es intencional, ignora este aviso)"
      duplicates.each do |addr, arr|
        roles = arr.map(&:first).map(&:to_s).join(', ')
        puts "#{addr}: #{roles}"
      end
    end

    puts '\nSugerencia: usa cuentas distintas para NOTARY y GOVERNMENT para simular privilegios separados.'
    puts 'Fin de la validación.'
  end
end
