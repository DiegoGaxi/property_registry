# Property Registry (Rails + Solidity + Hotwire)

Sistema de demostración para el ciclo de vida de registro y validación de propiedades usando un contrato inteligente con roles (Seller, Notary, Buyer, Government). Combina persistencia off-chain (PostgreSQL) con verificación y transiciones on-chain (Ethereum / Hardhat) y una interfaz reactiva estilo SPA con Hotwire (Turbo + Stimulus) y Ethers.js vía CDN.

## Arquitectura resumida
* Rails 7.2 (Ruby 3.1.4) como backend MVC, tareas Rake y sincronización de eventos.
* PostgreSQL para datos off-chain (tabla `property_records`). Usuario por defecto: `postgres` / password: `pg`.
* Smart Contracts (Solidity 0.8.21) administrados con Hardhat (local + testnet).
* Interacción on-chain desde el servidor (gem `eth`) y/o desde el cliente (MetaMask + `ethers@6` CDN).
* Hotwire para actualizaciones en tiempo real: Turbo Streams reemplazan secciones (`status_`, `actions_`, `progress_`, `transactions_`).
* Modo dual de firma: servidor (llaves privadas en `.env`) o sólo cliente (`SERVER_SIGNING_DISABLED=1`).
* Sincronizador `BlockchainEventSync` (ejecución manual o background) para reflejar eventos y estados (PropertyRegistered, aprobaciones, etc.).

## Principales componentes
| Capa | Archivo clave | Descripción |
|------|---------------|-------------|
| Contrato | `smart-contracts/contracts/PropertyRegistry.sol` | Registro y flujo de aprobación con roles y eventos. |
| Deploy | `smart-contracts/scripts/deploy.js` | Despliega, guarda artifact y concede roles opcionales. |
| Config Hardhat | `smart-contracts/hardhat.config.js` | Redes (localhost, sepolia), versión Solidity, optimizer. |
| Cliente on-chain (Ruby) | `app/services/blockchain_property_registry_client.rb` | Encapsula llamadas (registerProperty, approves, seal, roles). |
| Sincronizador eventos | `app/services/blockchain_event_sync.rb` | Lee logs y actualiza DB. |
| Controlador propiedades | `app/controllers/properties_controller.rb` | Acciones REST + aprobaciones.
| Stimulus registro | `app/javascript/controllers/property_registration_controller.js` | Flujo de registro vía MetaMask. |
| Stimulus aprobaciones | `app/javascript/controllers/property_approval_controller.js` | Botones de aprobación MetaMask, toasts y fallback. |
| Modal documento | `app/javascript/controllers/document_viewer_controller.js` | Iframe PDF centrado y hash de documento. |

## Stack y versiones
* Ruby: 3.1.4
* Rails: ~> 7.2.2.2
* PostgreSQL: >= 13 (config local usa host 127.0.0.1)
* Solidity: 0.8.21
* Hardhat: ^2.22.0 + `@nomicfoundation/hardhat-toolbox`
* OpenZeppelin Contracts: ^4.9.6
* Ethers.js (cliente): 6.10.0 vía CDN jsDelivr
* Gemas clave: `eth (~>0.4.18)`, `dotenv-rails`, `pg`, `turbo-rails`, `stimulus-rails`, `rspec-rails`
* Seguridad/análisis: `brakeman`, `rubocop-rails-omakase`
* (Opcional) Sidekiq: puede usarse para mover sincronización a background (no incluido actualmente en Gemfile; agregar `gem 'sidekiq'` si se habilita).

## Variables de entorno (.env)
Se incluyen literalmente llaves de prueba (Hardhat genera cuentas deterministas). Estas NO son seguras para producción.

Ejemplo completo `.env` para modo servidor híbrido (firma backend + cliente):
```
# RPC local Hardhat
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337

# Dirección del contrato desplegado (actualízala después de deploy). Se puede dejar en 0x... y autoload si se programa así.
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000

# Llaves privadas Hardhat (accounts #0..#3)
PRIVATE_KEY_SELLER=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
PRIVATE_KEY_NOTARY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
PRIVATE_KEY_BUYER=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
PRIVATE_KEY_GOV=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

# Admin (puede usar la misma que seller si no separas rol)
PRIVATE_KEY_ADMIN=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Direcciones por defecto en formularios (coinciden con las cuentas Hardhat)
DEFAULT_SELLER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
DEFAULT_BUYER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
DEFAULT_NOTARY=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
DEFAULT_GOV=0x90F79bf6EB2c4f870365E785982E1f101E93b906
# Para script deploy (usa DEFAULT_GOVERNMENT si está presente)
DEFAULT_GOVERNMENT=0x90F79bf6EB2c4f870365E785982E1f101E93b906

# Asignación de roles directa (opcional)
NOTARY_ADDRESS=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
GOVERNMENT_ADDRESS=0x90F79bf6EB2c4f870365E785982E1f101E93b906

# Modo firma (0 = híbrido servidor/cliente, 1 = sólo MetaMask)
SERVER_SIGNING_DISABLED=1

REDIS_URL=redis://127.0.0.1:6379/0

# Credenciales básicas (solo si proteges el panel)
HTTP_BASIC_USER=admin
HTTP_BASIC_PASSWORD=secret

# URL base (usada en callbacks o generación de links absolutos)
BASIC_RAILS_APP_URL=http://localhost:3000
```

Ejemplo `.env` para modo sólo MetaMask (sin llaves privadas en servidor):
```
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
SERVER_SIGNING_DISABLED=1
DEFAULT_SELLER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
DEFAULT_BUYER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
DEFAULT_NOTARY=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
DEFAULT_GOV=0x90F79bf6EB2c4f870365E785982E1f101E93b906
REDIS_URL=redis://127.0.0.1:6379/0
HTTP_BASIC_USER=admin
HTTP_BASIC_PASSWORD=secret
BASIC_RAILS_APP_URL=http://localhost:3000
```

Validación: la app registra en logs si falta `RPC_URL`, `CONTRACT_ADDRESS` o `CHAIN_ID`; la dirección debe ser `0x` + 40 hex. Si `CONTRACT_ADDRESS` es placeholder, después del deploy reemplázala por la real.

## Flujo de instalación (local)
1. Clonar repo y abrir dos terminales: `rails_app` y `smart-contracts`.
2. Crear `.env` en `rails_app` (usar ejemplo literal arriba).
3. (Opcional) Añadir `gem 'sidekiq'` al `Gemfile` si no está y luego `bundle install`.
4. Instalar gemas:
	```
	bundle install
	```
5. Base de datos:
	```
	rails db:create db:migrate
	```
6. Iniciar Redis (elige una opción):
	```
	# Si tienes redis instalado nativo
	redis-server
	# O vía Docker
	docker run -p 6379:6379 --name redis-local -d redis:7
	```
7. Iniciar Hardhat (terminal smart-contracts):
	```
	npx hardhat node
	```
8. Desplegar contrato (segunda terminal smart-contracts):
	```
	npx hardhat run scripts/deploy.js --network localhost
	```
	Se genera `smart-contracts/deployments/localhost/PropertyRegistry.json` con `address` y `abi`.
9. Actualiza `CONTRACT_ADDRESS` en `.env` con la dirección desplegada real.
10. (Opcional) Copiar ABI a Rails: `rails_app/abi/PropertyRegistry.json` (si no hay autoload).
11. Iniciar Sidekiq (si lo usas para sync/eventos):
	```
	bundle exec sidekiq
	```
12. Iniciar servidor Rails (otra terminal):
	```
	rails server
	```
13. (Opcional) Sincronización inicial de eventos:
	```
	rake blockchain:sync_events
	```

## Firma y modos de operación
| Modo | Requisito | Flujo |
|------|-----------|-------|
| Servidor | Llaves privadas en `.env` | Rails firma y envía transacciones al RPC. |
| Sólo MetaMask | `SERVER_SIGNING_DISABLED=1` | Cliente firma (ethers.js) y envía; Rails recibe `tx_hash` y actualiza estado. |

Cambiar de modo requiere reiniciar el servidor para limpiar caches/config.

## Tareas Rake relevantes
| Tarea | Propósito |
|-------|-----------|
| `rake blockchain:health` | Comprueba RPC y formato de dirección. |
| `rake blockchain:sync_events` | Sincroniza eventos recientes del contrato. |
| `rake blockchain:grant_roles` | Concede `NOTARY_ROLE` y `GOVERNMENT_ROLE`. |
| `rake blockchain:roles_status` | Muestra estado actual de roles. |
| `rake blockchain:keys` | Valida llaves privadas y direcciones derivadas. |
| `rake blockchain:prune_orphans` | Limpia registros off-chain sin evento válido (si procede). |

## Flujo de una propiedad
1. Registro: se envía `registerProperty(docHash, seller, buyer, notary, government)` creando evento y registro off-chain.
2. Notario aprueba: `notaryApprove(id)`.
3. Comprador aprueba: `buyerApprove(id)`.
4. Gobierno sella: `governmentSeal(id)`.
5. Off-chain se puede marcar completada o cancelar.

Cada transición actualiza vista vía Turbo Streams y dispara toasts (éxito/error).

## Documento y hash
* Si se sube archivo: se calcula `keccak256` del contenido (`doc_hash`).
* Modal PDF centrado (`document_viewer_controller.js`) oculta barra lateral (parámetros `#toolbar=0&navpanes=0`).

## Uso de Ethers.js (CDN)
`import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.10.0/dist/ethers.min.js"` en controladores Stimulus permite:
* Validación y normalización de direcciones (`ethers.getAddress`).
* Calcular `keccak256` para archivos.
* Firma y envío de transacciones en modo MetaMask.

## Seguridad y buenas prácticas
* No comprometer llaves privadas reales en `.env`.
* Verificar formato de direcciones (utiliza `ethers.getAddress`).
* Mantener ABI actualizado tras cambios en Solidity (recompilar antes de copiar artifact).
* Ejecutar `brakeman` y `rubocop` antes de desplegar.
* Para producción: usar provider RPC seguro (HTTPS), rotar llaves, activar monitoreo de eventos con jobs (Sidekiq / Cron).

## Troubleshooting rápido
| Problema | Causa común | Solución |
|----------|-------------|----------|
| `Missing ENV vars: RPC_URL...` | `.env` incompleto | Revisar variables y reiniciar servidor. |
| Selector no reconocido en Hardhat | ABI desactualizado | Recompilar y copiar artifact correcto. |
| `Received invalid block tag` | Reinicio de Hardhat a bloque 0 | Reiniciar Rails y generar nueva transacción. |
| MetaMask red incorrecta | No configurada Hardhat 31337 | Agregar red manual / cambiar chainId en MetaMask. |
| Hash documento inválido | Formato no bytes32 | Recalcular `keccak256` o subir archivo. |

## Pruebas y verificación
```
rails runner "puts PropertyRecord.count"
RAILS_ENV=test rspec --format documentation
rubocop -f simple
brakeman -q
```

## Próximas mejoras sugeridas
* Background jobs para sync continuo (Sidekiq + Redis).
* Autenticación por wallet y roles dinámicos (Devise + firma EIP-4361). 
* Storage de documento (ActiveStorage) y verificación hash.
* Indexación de eventos con confirmaciones y reorg handling.
* Integración DID / credenciales verificables.
* UI avanzada para historial de transacciones y gas.

## Licencia
Uso interno / demostración educativa.
