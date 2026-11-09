# Resto

MVP operativo de atención de restaurantes con Next.js App Router, TypeScript, PostgreSQL y Prisma 7. Referencia de alcance: [Fudo](https://fu.do/es-uy/). Una instalación para un restaurante, con interfaz de salón, cocina/barra, caja y administración.

## Acceso en este equipo

- Aplicación: <https://devmachine.tail31d281.ts.net:27777> (Tailscale).
- Carta de consulta: <https://devmachine.tail31d281.ts.net:27777/menu/resto-demo>.
- Usuarios iniciales: `admin`, `mozo`, `cocina`, `caja`.
- Contraseñas aleatorias: `.local/access.txt`, fuera de Git y con permisos 600. Se pueden cambiar desde **Mi cuenta** o **Equipo**.
- La aplicación usa el rol PostgreSQL `resto` con SELECT, INSERT, UPDATE y DELETE sobre `resto_dev`. `DIRECT_URL` usa el propietario `resto_app` exclusivamente para migraciones. Las credenciales están en `.env` y no se versionan.

## Servicio persistente en este equipo

Resto se ejecuta en producción con `resto-web.service`, definido en `deploy/resto-web.service` e instalado en `/etc/systemd/system/resto-web.service`. Arranca con el equipo y se reinicia si falla. Next.js escucha en `127.0.0.1:27778`. Nginx termina HTTPS en `100.111.171.20:27777` con la configuración `deploy/resto-tailscale.conf`, instalada en `/etc/nginx/conf.d/resto-tailscale.conf`. HTTP en el mismo puerto redirige a HTTPS. Requiere acceso autorizado a la red Tailscale y usa el nombre MagicDNS `devmachine.tail31d281.ts.net`.

El certificado válido de Tailscale está en `/etc/nginx/tls/resto-tsnet/`. `resto-renew-cert.timer` comprueba diariamente su renovación mediante `deploy/resto-renew-cert.sh`, instalado en `/usr/local/sbin/resto-renew-cert`; solicita una vigencia mínima de 30 días y recarga nginx cuando cambia el certificado. Las unidades se conservan en `deploy/resto-renew-cert.service` y `deploy/resto-renew-cert.timer`. Se puede comprobar con `systemctl list-timers resto-renew-cert.timer` y ejecutar manualmente con `systemctl start resto-renew-cert.service`.

La IP anterior redirige al nombre de Tailscale; al entrar por HTTPS a la IP todavía se presenta el certificado autofirmado de esa IP. Usar siempre la URL `.ts.net` para evitar avisos. Para cambios de nginx: instalar `deploy/resto-tailscale.conf`, ejecutar `nginx -t` y luego `systemctl reload nginx`.

El proceso usa el usuario de sistema `resto-web`, carga la configuración desde `.env` y escribe únicamente en `.next`. `APP_URL` debe ser `https://devmachine.tail31d281.ts.net:27777` para que funcionen las escrituras y los QR.

```bash
systemctl status resto-web
journalctl -u resto-web -n 50 --no-pager
curl --fail https://devmachine.tail31d281.ts.net:27777/api/health
```

Para publicar cambios, desde `/repos/resto` como administrador del equipo: detener el servicio, ejecutar `pnpm db:deploy` si hay migraciones, ejecutar `CI=true pnpm build`, devolver la propiedad del build con `chown -R resto-web:resto-web .next` y arrancar el servicio. Verificar `/api/health`, login y carta después del arranque. La configuración de systemd debe reinstalarse con `install -m 644 deploy/resto-web.service /etc/systemd/system/resto-web.service` y `systemctl daemon-reload` si cambia.

## Funcionalidades implementadas

| Módulo       | Incluye                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Acceso       | Sesiones de 12 horas, contraseñas con scrypt, cierre de sesión, cambio de contraseña, bloqueo temporal tras intentos fallidos |
| Equipo       | Alta/edición de usuarios, roles y desactivación; revocación de sesiones al cambiar acceso                                     |
| Carta        | Categorías, productos, precios, descripción, adicionales con precio, estación, disponibilidad y archivo                       |
| QR           | Carta pública sin login y descarga de QR SVG para imprimir                                                                    |
| Salón        | Alta/edición de mesas, capacidad, apertura por comensales, cuenta, pedidos con notas y adicionales                            |
| Cocina/barra | Filtros por estación, pendiente → preparando → listo → entregado; actualización cada 5 segundos                               |
| Caja         | Apertura con fondo, cobro completo por mesa en efectivo/tarjeta/transferencia, cierre y diferencia de arqueo                  |
| Gestión      | Ventas cobradas del día local, ticket promedio, medios de pago, productos vendidos y últimas 100 acciones                     |
| Anulaciones  | Motivo obligatorio, responsable e historial; los consumos anulados no se cobran                                               |

Flujo de mesa: abrir mesa → armar y enviar pedido → preparar → marcar listo → entregar → registrar cobro. El turno de caja es independiente: puede cerrarse con mesas abiertas, y cada cobro se vincula al turno abierto al momento de cobrar.

### Permisos

| Rol           | Acceso                                                  |
| ------------- | ------------------------------------------------------- |
| Administrador | Todos los módulos, carta, mesas y equipo                |
| Mozo          | Mesas, pedidos, consulta de cocina, entrega y carta     |
| Cocina        | Preparación, marcar listo y disponibilidad de productos |
| Caja          | Mesas/pedidos, cobros, anulaciones, turnos y resumen    |

Las pantallas y cada operación de servidor verifican permisos. Cocina y mozos no reciben reportes, arqueos ni datos del equipo. Los usuarios desactivados no pueden seguir operando con una sesión antigua.

### Reglas de integridad

- Una cuenta abierta por mesa y un turno de caja abierto por restaurante, con índices únicos parciales en PostgreSQL.
- Pedidos y cobros transaccionales; bloqueo por restaurante para evitar carreras entre pedidos, entregas y pagos.
- Pedidos con clave de idempotencia y un único pago por cuenta. Reintentar no duplica operaciones.
- Precios, adicionales, notas y nombres conservados en los ítems; editar la carta no altera consumos anteriores.
- Totales y arqueos calculados con Decimal en servidor. El cobro rechaza importes desactualizados e ítems sin entregar.
- Cuentas cerradas inmutables. El cierre de turno permite dejar mesas abiertas; sus cobros se asignan al turno abierto cuando se paga. Las cuentas sin consumos se cierran sin generar una venta.

## Estilos: BEM y tokens

Sigue el patrón de `../gym`, con implementación propia:

```text
src/styles/themes/resto.css        Paleta clara/oscura; únicos colores literales
src/styles/tokens/primitives.css   Espacios, tamaños, fuente, radios, bordes, movimiento
src/styles/tokens/semantics.css    Superficies, texto, estados, selección, scrollbars
src/styles/tokens/components.css  Aliases de botones, campos, paneles y navegación
src/styles/ui.css                  Bloques BEM compartidos
src/styles/app.css                 Shell, salón, cocina, carta y login
```

Sin Tailwind ni estilos inline. Incluye estados hover, active, focus, disabled, readonly y selected, errores/autofill de campos, underline, scrollbars, márgenes, paddings y tipografía. El cambio de tema se guarda localmente. Los QR son imágenes de lectura por cámara y mantienen su contraste propio.

## Instalación local nueva

Node.js 22.12+, pnpm y PostgreSQL 18 (o Docker Compose). En este equipo **no reemplazar `.env`**, ya está configurado.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d --wait db
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Docker usa puerto 5433, volumen persistente y un script inicial para separar `resto` del usuario propietario de migraciones. Las contraseñas del ejemplo son exclusivamente para desarrollo local. La inicialización de roles de Docker se ejecuta solo con un volumen vacío.

`pnpm dev` y `pnpm start` escuchan en la IP Tailscale de este equipo, puerto 27777. En otro equipo ajustar `--hostname` y `APP_URL`. Para acceso local: `pnpm dev --hostname 127.0.0.1` con `APP_URL=http://127.0.0.1:27777`. `APP_URL` determina el origen permitido para escrituras, el destino de los QR y el uso de cookies Secure cuando empieza con HTTPS.

`pnpm db:seed` es idempotente: crea ejemplos faltantes y completa variedades de productos de ejemplo que todavía no tengan ninguna. Conserva contraseñas, precios y variedades ya configuradas. No genera ventas ficticias.

## Desarrollo y verificación

```bash
pnpm db:generate
pnpm db:deploy
pnpm db:check
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e               # Requiere pnpm dev en APP_URL
pnpm test:varieties         # Alta/edición, selección individual, agrupación e historial
pnpm exec tsx scripts/review-management.ts # Interacciones y capturas de administración
pnpm build
pnpm start
```

Los tests de integración y navegador crean un restaurante aislado y lo eliminan al terminar; no utilizan las cuentas o ventas de ejemplo. Cubren permisos, rollback, concurrencia, idempotencia, precios históricos, arqueo, login, QR, temas y móvil. Capturas locales en `.local/screenshots/`.

Después de cambiar el esquema: `pnpm db:migrate --name nombre_del_cambio` y `pnpm db:generate`. `migrate dev` necesita un propietario con permiso de crear una base shadow o una base shadow separada; `resto` no tiene esos permisos. Para aplicar migraciones existentes usar `db:deploy` con `DIRECT_URL`.

## Arquitectura

UI responsive → Route Handlers → servicios de consultas/comandos → Prisma + `@prisma/adapter-pg` → PostgreSQL. Sesiones en base con token aleatorio almacenado como hash; cookie HttpOnly/SameSite y comprobación de origen en escrituras. Un despliegue Node.js, sin Redis ni microservicios.

- `src/lib/restaurant`: validaciones, permisos, transacciones y consultas.
- `src/lib/auth`: contraseñas y sesiones.
- `src/app/api`: autenticación, estado del turno, comandos, QR y salud.
- `src/components`: pantallas y controles compartidos.
- `prisma`: modelos, migraciones y seed.
- `GET /api/health`: 200 con base/esquema disponibles; 503 en caso contrario.

## Variedades de productos

Se mantiene una sola entidad `Product`. Cada producto admite hasta 10 variedades configurables (punto de cocción, tamaño, presentación, línea, etc.), con 2–30 opciones por variedad. Las opciones no modifican el precio; los adicionales mantienen sus propios importes.

En Salón, agregar un producto con variedades abre opciones de selección única por variedad, verticales en móvil y horizontales en escritorio; con más de seis opciones usa un select nativo. La primera opción de cada variedad está preseleccionada; al editar se conservan las elecciones vigentes. La cantidad indicada comparte la misma combinación. El pie de confirmación permanece visible mientras se desplazan las opciones. El borrador agrupa por producto, combinación, adicionales, notas y precio; editar una línea agrupada modifica una unidad. Los botones + y − modifican la cantidad de la misma combinación sin abrir el selector; el lápiz permite cambiar sus opciones. Al enviar, el servidor valida las opciones vigentes y guarda IDs y nombres en `OrderItem.varieties`; cocina y cuenta muestran esa copia histórica aunque cambie la carta.

## Cobro desde Salón

Administración → Configuración permite habilitar «Los mozos pueden cobrar» (desactivado por defecto). El permiso se comprueba nuevamente en servidor y no concede acceso a apertura/cierre ni a los informes de caja.

En móvil la barra de mesa ofrece Carta, Listos para entregar, Pedido, Enviar y Pagar. En escritorio se muestran carta y pedido juntos; envío, entrega y cobro están en el pedido, sin barra inferior. Pagar aloja la cuenta. Si hay borrador sin enviar o productos sin entregar, primero se elige Descartar o Cobrarlos. Descartar anula los consumos pendientes y registra el borrador descartado en auditoría. Cobrarlos incorpora el borrador, marca los pendientes como entregados y conserva la decisión; la preparación es transaccional e idempotente.

Servicio es un importe monetario editable, sugerido inicialmente como el 10% de los consumos. Se guarda separado en el pago y se incluye en el importe cobrado y el arqueo. El cobro exige caja abierta, verifica el total vigente y solo admite un pago por cuenta. `pnpm test:payments` verifica este recorrido en navegador con datos aislados.

La edición de mesas permite eliminarlas con confirmación. Se bloquea si tienen una cuenta abierta; se conservan las cuentas históricas y el nombre queda disponible para una nueva mesa.

## Espacios de operación

Cocina concentra estaciones, estado y acciones de cada comanda. Caja separa cuentas, venta directa, cobros y cierres; el detalle se abre en un modal con acciones visibles. Carta y Equipo usan listados adaptables, búsqueda y editores con pie fijo. Carta separa Categorías y Productos en pestañas. Las categorías se ordenan arrastrando con mouse/táctil o con teclado (Espacio, flechas, Espacio); el orden persistente se comparte con la carta pública y la del mozo. Cada categoría se edita individualmente; el editor de producto separa Datos, Variedades y Adicionales y conserva los cambios entre pestañas. Resumen separa ventas y actividad. Configuración y Mi cuenta mantienen formularios acotados. Las opciones horizontales usan transiciones laterales direccionales; la navegación por menú y los cambios de rol usan desvanecimiento; se respeta movimiento reducido. Los estilos BEM de estos módulos viven en `src/styles/management.css` y consumen los tokens de la aplicación, sin modificar el espacio de Salón.

La revisión de administración genera capturas en `.local/management-review/`, prueba edición, disponibilidad, permisos, comandas, anulación, apertura y cierre con mesas abiertas, móvil, escritorio y ambos temas.

## Límites de esta versión

QR solo consulta; cobro completo por cuenta. No incluye pagos parciales, cuentas divididas, pasarelas, facturación electrónica, impresoras, reservas, delivery, inventario por ingredientes ni modo offline. La carta sin login utiliza el mismo host; en esta instalación necesita acceso a Tailscale. La estructura separa datos por restaurante, pero no incluye alta/autogestión de múltiples negocios.

Antes de publicar en internet: configurar HTTPS/APP_URL, copias de seguridad y revisar los avisos de dependencias. La implementación actual es una base de desarrollo, sin integración fiscal ni procesamiento de pagos.

Auditoría de dependencias al 03/10/2026: `pnpm audit` registra 3 avisos altos y 1 moderado en dependencias transitivas de tooling (`braces`, `deepmerge-ts` y `mysql2`). No se aplicaron downgrades mayores ni overrides incompatibles; quedan pendientes de actualización upstream. El driver de la aplicación es PostgreSQL, no MySQL.

## Venta directa y navegación

En escritorio, los roles asignados son las opciones principales del menú lateral, con sus secciones debajo. Salón abre todas las mesas y sus subítems abren las mesas con cuenta activa. El selector nativo de rol y mesa se reserva para móvil. Usuario, tema y salida permanecen al pie.

Caja → Venta permite armar productos, cantidades, variedades y adicionales y pasar directamente al cobro. Confirmar crea cuenta sin mesa, consumos históricos y pago en una sola transacción, asociado al turno abierto; la clave de solicitud evita cobros duplicados al reintentar. El servicio es opcional en estas ventas. Caja también puede descartar o incluir y marcar entregados los consumos pendientes de una mesa antes de cobrar.

Cocina presenta Empezar y Marcar listo juntos, con colores distintos. Marcar listo admite el paso directo desde Pendiente; los permisos y el estado esperado se verifican en servidor.

## Navegación y carta pública

- Las páginas, mesas y secciones de Caja/Carta/Resumen tienen URLs propias en `/dashboard`. La navegación usa `Link` y el router de Next.js, conserva el destino al recargar y admite Atrás/Adelante. El rol de la URL se valida contra los roles asignados; los permisos se siguen controlando en servidor.
- «Para entregar» abre directamente los productos listos de la mesa.
- Las categorías se crean y editan en un modal; el orden sigue gestionándose mediante arrastre.
- La carta pública permite buscar sin distinguir tildes y filtrar por categoría. `Product.imageUrl` se edita en los datos del producto y solo se muestra en la carta pública. El demo incluye diez fotografías locales y sus créditos/licencias en `public/images/menu/credits.json`.
- Verificación de navegador: `CHECK_DELIVERY_LINK_ONLY=1 REVIEW_PHASE=delivery-link pnpm exec tsx scripts/review-management.ts` y `CHECK_PUBLIC_ONLY=1 REVIEW_PHASE=public-menu pnpm exec tsx scripts/review-management.ts`.
