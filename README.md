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
