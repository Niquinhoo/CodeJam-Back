# CodeJam Back

Express 5 and TypeScript 7, deployed as a Cloudflare Worker with a D1 binding. The initial API is intentionally small: `GET /api/health` checks D1 with `SELECT 1`; the project brief will define any domain tables and endpoints.

Requires Node.js 22.23 or newer (`.nvmrc`). The `codejam-db` database binding is configured in `cloudflare.config.ts`. `cf` reads that file; do not add a Wrangler config.

```sh
npm install
npm run dev
```

Local development serves the API at `http://localhost:8787`. The D1 binding uses the local simulator. `npm run typecheck` generates Cloudflare binding types, `npm run self-check` checks the health model with Node's built-in assertions, and `npm run deploy` publishes the Worker.

## Structure

- `routes/` maps API paths.
- `controllers/` owns HTTP status codes and JSON responses.
- `models/` owns database access.
- React in `CODEJAMFRONT` is the view layer; this API does not render HTML.
