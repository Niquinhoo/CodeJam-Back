import { bindings, defineConfig } from "cf/config";

export default defineConfig({
  accountId: "6d93a005ece548efa7de48c051ace6fb",
  worker: {
    name: "codejam-back",
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-10-28",
    compatibilityFlags: ["nodejs_compat"],
    observability: {
      enabled: true,
      headSamplingRate: 0.1,
      logs: { enabled: true, headSamplingRate: 0.1 },
      traces: { enabled: true, headSamplingRate: 0.1 },
    },
    env: {
      DB: bindings.d1({
        id: "e2f4df7c-b346-456f-be62-ba09fff1f0fd",
        name: "codejam-db",
      }),
    },
  },
});
