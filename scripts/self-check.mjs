import assert from "node:assert/strict";
import { checkDatabase } from "../src/models/healthModel.ts";

let query;
const db = {
  prepare(sql) {
    query = sql;
    return { first: async () => ({ ok: 1 }) };
  },
};

assert.equal(await checkDatabase(db), true);
assert.equal(query, "SELECT 1 AS ok");
assert.equal(await checkDatabase({ prepare: () => ({ first: async () => null }) }), false);
await assert.rejects(() => checkDatabase({
  prepare: () => ({ first: async () => { throw new Error("database unavailable"); } }),
}));
console.log("health model self-check passed");
