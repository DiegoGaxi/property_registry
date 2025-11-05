# frozen_string_literal: true

namespace :ruby do
  desc 'Mostrar versión actual y sugerir upgrade (sin eliminar versiones previas)'
  task :version_check do
    current = RUBY_VERSION
    target = ENV.fetch('TARGET_RUBY', '3.2.4')
    puts "Ruby actual: #{current}"
    puts "Versión objetivo recomendada: #{target}"
    if Gem::Version.new(current) < Gem::Version.new(target)
      puts 'Recomendación: actualizar. Ver docs/UPGRADE_RUBY.md (multi-version).'
    else
      puts 'OK: versión actual cumple o supera objetivo.'
    end
    puts 'Nota: No se eliminarán versiones previas; mantén rbenv/asdf configurado para switch.'
  end
end
