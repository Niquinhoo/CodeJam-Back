import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../../migrations/0001_async_routes_push.sql", import.meta.url), "utf8"));
  return {
    prepare(sql) {
      let values = [];
      const query = {
        bind(...parameters) { values = parameters; return query; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
      };
      return query;
    },
    async batch(statements) { return Promise.all(statements.map(s => s.run())); },
  };
}
