# Plan de Upgrade Ruby (3.1.4 -> 3.2.x / 3.3.x)

Este documento detalla pasos seguros para migrar la aplicación de Ruby 3.1.4 (EOL) a una versión mantenida (recomendado 3.2.4 o 3.3.x estable).

## 1. Seleccionar versión objetivo
- Producción conservadora: 3.2.4 (madura, estable, menor riesgo)
- Última con mejoras de rendimiento: 3.3.x (verificar changelog y gem compatibility)

## 2. Preparar entorno local
1. Instalar versión via asdf, rbenv o ruby-install.
   - rbenv: `rbenv install 3.2.4` / `rbenv install 3.3.0`
2. Verificar: `ruby -v` debe devolver versión objetivo.
3. Actualizar `.ruby-version` (pendiente hasta confirmar que todos los devs tienen la nueva versión).

## 3. Actualizar Gemfile (opcional ahora, definitivo tras verificación)
Agregar en la primera línea después del source:
```ruby
ruby "3.2.4"
```
(O usar `3.3.0` si optas por la más reciente.)

## 4. Regenerar dependencias
```bash
bundle update --bundler
bundle install
```
Si aparecen errores nativos (ffi, nokogiri), reinstalar gemas con:
```bash
bundle pristine
```

## 5. Ejecutar suite de validación
```bash
rspec --format progress
rubocop -f simple
brakeman -q
rake blockchain:health
```

## 6. Revisión de compatibilidad
- eth gem: probar registro de propiedad en Hardhat local.
- keccak / scrypt / ffi: verificar que compilan sin warnings críticos.
- Turbo / Stimulus: no dependen directamente de versión Ruby (solo Rails).

## 7. Entorno CI/CD
Actualizar imagen base (Dockerfile o pipeline) para usar Ruby objetivo.
Si Dockerfile existe, cambiar:
```Dockerfile
FROM ruby:3.2.4
```
Rebuild y ejecutar tests en contenedor.

## 8. Despliegue escalonado
1. Staging: migrar BD, ejecutar smoke tests.
2. Verificar logs (memoria, GC, latencia RPC).
3. Producción: deploy progresivo (canary 10%).

## 9. Rollback plan
Mantener artefacto previo (imagen Docker con Ruby 3.1.4). Si surge incompatibilidad en gem crítica (ej: nokogiri), revertir cambiando etiqueta en CI.

## 10. Checklist final
- [ ] `.ruby-version` actualizado
- [ ] Gemfile incluye `ruby` directive
- [ ] Tests verdes
- [ ] RuboCop sin errores severos
- [ ] Brakeman sin nuevas alertas
- [ ] Hardhat registro propiedad probado
- [ ] Docker/CI actualizado
- [ ] Documentación (README) menciona nueva versión

## 11. Post-upgrade
Monitorizar:
- Uso de memoria (heap) -> `ObjectSpace.memsize_of_all`
- Latencia transacciones RPC
- Tiempo promedio de RSpec suite

## Notas
No se modifica Gemfile automáticamente aquí para evitar fallo inmediato en entornos que aún ejecutan 3.1.4. Ejecuta los pasos cuando tengas la versión instalada localmente.

## Estrategia Multi-Version (No eliminar versiones antiguas)
Puedes mantener Ruby 3.1.4 para proyectos legados y usar 3.2.4/3.3.x para este proyecto:

1. rbenv:
   - `rbenv install 3.2.4`
   - En este repo: `rbenv local 3.2.4` (opcional, puedes omitir si deseas seguir con 3.1.4 hasta terminar pruebas).
   - Otros proyectos siguen usando su `.ruby-version` existente.
2. asdf:
   - `asdf install ruby 3.2.4`
   - `asdf local ruby 3.2.4` en este directorio.
3. Windows con RubyInstaller:
   - Instalar Ruby 3.2.x en ruta distinta (ej: `C:\Ruby32`).
   - Ajustar `RIDK_USE` o actualizar PATH solamente en una terminal al trabajar con este proyecto.
4. Archivo auxiliar `.ruby-version.next` incluido para documentar la versión objetivo sin afectar el actual `.ruby-version`.

Rake task de verificación:
```
rake ruby:version_check
```
Muestra la versión actual y sugiere upgrade sin forzar.
