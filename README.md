# CodeJam Back

Express 5 and TypeScript 7, deployed as a Cloudflare Worker with a D1 binding. The initial API is intentionally small: `GET /api/health` checks D1 with `SELECT 1`; the project brief will define any domain tables and endpoints.

Requires Node.js 22.23 or newer (`.nvmrc`). The `codejam-db` database binding is configured in `cloudflare.config.ts`. `cf` reads that file; do not add a Wrangler config.

```sh
npm install
npm run dev
```

Local development serves the API at `http://localhost:8787`. The D1 binding uses the local simulator. `npm run typecheck` generates Cloudflare binding types, `npm run self-check` checks the health model with Node's built-in assertions, and `npm run deploy` publishes the Worker.

## Automatic deploys

Every push to `main` deploys the Worker; you can also run **Deploy Worker** manually from the repository's Actions tab. Add a repository Actions secret named `CLOUDFLARE_API_TOKEN` containing a Cloudflare API token with Workers Scripts Edit permission, scoped to the account in `cloudflare.config.ts`. D1 Read is not needed to deploy a Worker with a D1 binding. The workflow runs `npm ci`, `npm run typecheck`, `npm run self-check`, and `npm run build` before deploying that build with `npm run deploy -- --prebuilt`.

## Structure

- `routes/` maps API paths.
- `controllers/` owns HTTP status codes and JSON responses.
- `models/` owns database access.
- React in `CODEJAMFRONT` is the view layer; this API does not render HTML.

## Solver QuickDrop

El backend también contiene el optimizador del plan. Para correrlo sobre un dataset, usá:

```sh
npm run resolver -- <directorio_dataset> --iteraciones 60000 --semilla 2026
```

Para comparar una carpeta con muchos datasets y ver costo, pedidos fallidos y tiempo por caso:

```sh
npm run evaluar-datasets -- <raiz_datasets> --iteraciones 3000 --semilla 2026
```

El generador de variantes está en el repositorio `quickdrop-sim`:

```sh
python <quickdrop-sim>/scripts/generar_datasets.py --entrada <quickdrop-sim>/datos --salida <carpeta_generados> --semilla 2026
```

`npm test` corre las pruebas del optimizador; `npm run self-check` también prueba el solver con
un dataset de 40 pedidos.

## Rutas asíncronas y push

El front envía el dataset con `PUT /api/trabajos/:id`. La API valida y persiste el trabajo antes de despacharlo a Cloudflare Workflows y responder 202. El workflow guarda el informe en D1 y envía el push en un paso separado con reintentos. Los reintentos de notificación no recalculan rutas. `GET /api/trabajos/:id` consulta estado; `GET /api/trabajos/:id/resultado` recupera el informe. El endpoint anterior `/api/resolver` se mantiene por compatibilidad.

Cada instalación genera un Bearer aleatorio de 256 bits; el backend almacena su hash y exige el token para acceder a sus trabajos y suscripción. El aviso contiene solo el identificador del trabajo. Los trabajos vencen a los 7 días; un cron elimina datos vencidos y suscripciones sin renovar durante 90 días. El push usa VAPID y cifrado Web Push, permite endpoints HTTPS de proveedores conocidos y no sigue redirecciones. Se eliminan suscripciones que devuelven 404/410; 429 y errores del proveedor se reintentan respetando `Retry-After` hasta 24 horas. La entrega es al menos una vez: el topic y el tag reducen duplicados, que siguen siendo posibles tras un corte entre la aceptación y el registro.

Se admiten hasta 120 pedidos, 8 vehículos, 300.000 iteraciones y 512 KB por dataset. El límite de 10 nuevos trabajos por minuto por IP ayuda a controlar carga, pero no sustituye autenticación ni protección contra abuso distribuido. Las instalaciones no se sincronizan entre dispositivos y borrar los datos del navegador hace perder su clave de acceso.

Para desarrollo local:

```sh
npm ci
npm run push:setup
npm run db:migrate:local
npm run dev
# En otra terminal:
npm run test:integration
```

`push:setup` crea claves de prueba en `.dev.vars`, ignorado por Git. No reemplaza claves existentes. `db:migrate:local` usa la misma carpeta `.cloudflare/state` que el servidor local. `npm run build && npm run test:push-runtime` prueba API, D1, Workflow y el envío cifrado a un proveedor simulado, sin credenciales de Cloudflare.

Antes de publicar, crear o usar una base D1 del entorno elegido y aplicar la migración `migrations/0001_async_routes_push.sql`; no aplicar la migración de prueba sobre producción. Generar una sola pareja de producción con `node scripts/setup-push.mjs --production`, cargar los valores de `.vapid.production.json` como secretos `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` del Worker, y conservarlos de manera segura. No regenerar la pareja en cada deploy: invalidaría las suscripciones. Una migración remota se aplica con `cf d1 migrations apply <DATABASE_ID> --dir migrations` en el entorno correspondiente. Configurar el origen del front en el allowlist de `src/app.ts` para cualquier preview.

El cálculo necesita Workers Paid: Workflows permite hasta 5 minutos de CPU por paso con `limits.cpuMs`, mientras que el plan gratuito limita cada paso a 10 ms. Antes de integrar a `main`, verificar cuota, migración, secretos y entrega en un dispositivo real. El flujo de deploy de `main` no aplica migraciones automáticamente.
