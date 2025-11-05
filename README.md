# Property Registry Rails + Solidity

Aplicación de demostración para flujo de registro y validación de propiedades con roles: vendedor, notario, comprador y gobierno.

## Stack
Ruby 3.1.4 / Rails 7.2
PostgreSQL (usuario: postgres / password: pg)
Hotwire (Turbo + Stimulus)
Contrato Solidity `PropertyRegistry.sol` (ABI en `abi/PropertyRegistry.json`)
Gemas: eth, dotenv-rails, pg, rspec-rails

## Configuración rápida
1. Clonar repositorio y entrar en `rails_app`.
2. Crear archivo `.env` con:
```
RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=0x<direccion_del_contrato>
CHAIN_ID=31337 # Hardhat por defecto
PRIVATE_KEY_SELLER=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # Account #0
PRIVATE_KEY_NOTARY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # Account #1
PRIVATE_KEY_BUYER=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a    # Account #2
PRIVATE_KEY_GOV=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6      # Account #3
# Valores por defecto opcionales para el formulario
DEFAULT_SELLER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266      # Account #0
DEFAULT_BUYER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8       # Account #1 (puede intercambiarse con BUYER)
DEFAULT_NOTARY=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC      # Account #2
DEFAULT_GOV=0x90F79bf6EB2c4f870365E785982E1f101E93b906         # Account #3
```
Luego ejecuta:
```
bundle install
```
Si ves errores como `Eth::Client no definido` el cliente ahora usa fallback raw JSON-RPC automáticamente.
3. `bundle install`
4. `rails db:create db:migrate`
5. Iniciar servidor: `rails server`
6. (Opcional) Ejecutar salud RPC: `rake blockchain:health`

### Despliegue y contrato
El ABI del contrato `PropertyRegistry.sol` debe colocarse en `abi/PropertyRegistry.json` y la dirección desplegada en `CONTRACT_ADDRESS`. Si usas Hardhat, tras desplegar se genera `deployments/localhost/PropertyRegistry.json` y el initializer puede autoload la dirección si la variable está vacía.

Para desplegar con Hardhat (en carpeta `smart-contracts`):
```
cd smart-contracts
npx hardhat node
# En una segunda terminal (misma carpeta smart-contracts)
npx hardhat run scripts/deploy.js --network localhost
```
El script genera `deployments/localhost/PropertyRegistry.json` con `address` y `abi`.
Si `CONTRACT_ADDRESS` está vacío en `.env`, la app Rails intentará autoload desde ese artifact al iniciar (initializer `contract_address_placeholder`).

Opcional: define `PRIVATE_KEY_ADMIN` si quieres separar la cuenta admin de `PRIVATE_KEY_SELLER` para tareas de rol.

### Asignación de roles (NOTARY_ROLE / GOVERNMENT_ROLE)
Tras el despliegue, concede los roles necesarios para que notario y gobierno puedan sellar:
```
NOTARY_ADDRESS=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
GOVERNMENT_ADDRESS=0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
PRIVATE_KEY_ADMIN=<clave_privada_admin> \
rake blockchain:grant_roles
```
La tarea envía dos transacciones `grantRole(bytes32,address)` usando el cliente `BlockchainPropertyRegistryClient`.
Verifica desde Hardhat console:
```
await registry.hasRole(await registry.NOTARY_ROLE(), NOTARY_ADDRESS)
await registry.hasRole(await registry.GOVERNMENT_ROLE(), GOVERNMENT_ADDRESS)
```

Consulta del estado de roles desde Rails:
```
rake blockchain:roles_status
```
### Troubleshooting red local / fondos
Si MetaMask muestra alerta de red BNB o falta de fondos:
1. Asegúrate de que el nodo Hardhat está activo (`npx hardhat node`) en la carpeta `smart-contracts`.
2. Tu navegador puede estar en otra red (BSC). Al enviar el formulario, el controlador intenta cambiar a chainId 31337 (Hardhat). Si no cambia:
	 - Abre MetaMask > Redes > Agregar red manual:
		 - Nombre: Hardhat Local
		 - RPC URL: http://127.0.0.1:8545
		 - Chain ID: 31337
		 - Símbolo: ETH
3. Importa una de las private keys que Hardhat imprime al iniciar para tener ETH de prueba.
4. Refresca la página y vuelve a enviar.

Si sigue fallando, revisa la consola del navegador y busca mensajes "No se logró fijar chainId".

### Troubleshooting "<unrecognized-selector>" en Hardhat
Si en la terminal del nodo Hardhat ves muchas líneas `PropertyRegistry#<unrecognized-selector>`:
1. Verifica que el ABI cargado en Rails sea el correcto: archivo `deployments/localhost/PropertyRegistry.json` debe contener `abi` y `address`.
2. Asegúrate de haber reiniciado Rails tras el despliegue (para que el initializer autoload lea el artifact).
3. Comprueba que no estás llamando funciones con doc_hash inválido (debe ser bytes32: `0x` + 64 hex).
4. La causa habitual es una codificación de calldata incorrecta: tras el parche, el cliente usa un encoder manual estable. Si persiste:
	 - Borra caches (`spring stop` si usas Spring).
	 - Re-despliega el contrato y reinicia Rails.
5. Usa el método de diagnóstico rápido en consola Rails:
```ruby
client = BlockchainPropertyRegistryClient.new
%w[registerProperty notaryApprove buyerApprove governmentSeal grantRole hasRole getProperty].each do |fn|
	puts fn
	begin
		f = client.send(:find_function, fn)
		sig = "#{f['name']}(#{f['inputs'].map{|i| i['type']}.join(',')})"
		puts '  selector=' + client.send(:keccak, sig)[0,10]
	rescue => e
		puts '  error=' + e.message
	end
end
```
Si algún selector no aparece, el ABI está incompleto.

### Verificación rápida de claves privadas
Ejecuta:
```
rake blockchain:keys
```
Muestra cada rol configurado (SELLER, NOTARY, BUYER, GOV, ADMIN), su dirección derivada y avisa si falta, formato inválido o duplicados.
Usa cuentas distintas para NOTARY y GOVERNMENT cuando pruebes roles.

### Troubleshooting "Received invalid block tag" al reiniciar Hardhat
Esto ocurre porque Hardhat vuelve a altura de bloque 0 y alguna tarea intenta leer bloques más altos (ej. 11) de una sesión anterior.
Solución:
1. Reinicia Rails tras reiniciar el nodo Hardhat para limpiar cualquier caché.
2. El servicio `BlockchainEventSync` ahora detecta altura baja (<5) y limita el rango.
3. Si persiste el error, ejecuta manualmente una transacción (registro de propiedad) para avanzar la altura y reintenta:
```sh
rails runner "BlockchainEventSync.new.sync!"
```
4. Evita almacenar en ENV un bloque inicial fijo; usa siempre el último (`eth_blockNumber`).
5. Si añadiste nuevas llaves privadas o cambiaste roles, valida con `rake blockchain:keys`.

### Troubleshooting firma / OpenSSL (SSLeay) y modo sólo MetaMask
Si ves errores tipo `Function 'SSLeay' not found` o fallos al firmar transacciones en Windows y NO quieres instalar OpenSSL:

Activa modo sólo MetaMask: en `.env` añade
```
SERVER_SIGNING_DISABLED=1
```
Efectos:
- El backend deja de firmar transacciones para: notary_approve, buyer_approve, government_seal.
- La vista `show` muestra botones MetaMask (Stimulus controller `property_approval_controller.js`).
- Tras confirmar la tx en MetaMask, el navegador hace `PATCH /properties/:id/<accion>` con `tx_hash` y el servidor sólo actualiza el estado off-chain.

Flujo ejemplo Notario:
1. Abres la propiedad (estado `pending_notary`).
2. Click "MetaMask: Aprobar Notario" -> se llama `notaryApprove(id)` on-chain.
3. Espera receipt -> envía `tx_hash` al servidor -> estado pasa a `notary_approved`.
4. UI recarga y muestra siguiente botón.

Funciones ABI usadas en aprobaciones cliente:
```
function notaryApprove(uint256 id)
function buyerApprove(uint256 id)
function governmentSeal(uint256 id)
```

Requisitos:
- `property_id_on_chain` debe existir (registrar primero la propiedad con MetaMask para obtener id).
- `CONTRACT_ADDRESS` válido (0x + 40 hex) presente en `<body data-contract-address>`.

Si prefieres flujo híbrido, quita la variable y vuelve al modo firma servidor (requiere OpenSSL operativo).
Salida esperada:
```
Contract: 0x...
NOTARY_ROLE (<addr>): YES
GOVERNMENT_ROLE (<addr>): YES
```

## Flujo (off-chain + on-chain)
1. Registrar propiedad (crea `PropertyRecord` con estado inicial `pending_notary` y envía transacción `registerProperty`).
2. Evento `PropertyRegistered` (sync) puede actualizar `property_id_on_chain` si está disponible.
3. Notario aprueba -> `notaryApprove` -> estado `notary_approved`.
4. Comprador aprueba -> `buyerApprove` -> estado `buyer_approved`.
5. Gobierno sella -> `governmentSeal` -> estado `government_sealed`.
6. Marcar completada -> off-chain `completed`.
7. Cancelar -> `cancelled`.

La UI muestra una barra de progreso y toasts para feedback inmediato.

### Firma cliente (MetaMask)
El formulario de nueva propiedad soporta envío vía MetaMask: el navegador firma y envía la transacción y luego hace callback al endpoint `blockchain/tx_callback` para crear el registro off-chain.

### Hash de documento (file upload)
Si adjuntas un archivo, el backend calcula automáticamente `doc_hash = keccak256(contenido)` (bytes32 -> hex de 64 chars con prefijo 0x). Si no hay archivo, se usa el valor introducido o uno aleatorio por defecto.

## Rutas principales
`GET /` listado propiedades
`GET /properties/new` formulario + MetaMask
`PATCH /properties/:id/notary_approve`
`PATCH /properties/:id/buyer_approve`
`PATCH /properties/:id/government_seal`
`PATCH /properties/:id/mark_completed`
`PATCH /properties/:id/cancel`
`POST /blockchain/tx_callback` callback de transacción firmada cliente

## Sincronización de eventos
Hay una tarea de sincronización que lee los últimos bloques y decodifica eventos para reflejar estados en la base de datos:
```
rake blockchain:sync_events
```
Esta usa un decodificador manual (`blockchain_log_decoder.rb`) para eventos estáticos.

## Mejoras futuras
- Decodificar dinámicamente tipos complejos y arrays.
- Persistir archivo en ActiveStorage y almacenar hash verificable + checksum.
- Roles y autenticación reales (Devise, Pundit) vinculados a wallets.
- Integración DID / credenciales verificables para notario y gobierno.
- Monitoreo background de eventos (Sidekiq) y confirmaciones.
- Paginación y filtrado avanzado.
 - Automatizar asignación de roles en el propio script de deploy (post-deploy) y recuperar automáticamente bytes32 via llamadas ABI.

## Seguridad
- Nunca subas llaves privadas reales. `.env` va en `.gitignore`.
- Valida que `doc_hash` sea un Keccak256 de 32 bytes.
- Revisa salida de `brakeman` y `rubocop` antes de desplegar.
- Para producción, usar provider con TLS y rotación de claves.

## Smoke Test
```
rails runner "puts PropertyRecord.count" # debe mostrar 0 al inicio
RAILS_ENV=test rspec --format documentation
rubocop -f simple
brakeman -q
```

## Licencia
Demostración interna.
