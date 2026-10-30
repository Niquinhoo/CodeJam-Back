import { bindings, defineConfig, exports, triggers } from "cf/config";

export default defineConfig({
  accountId: "6d93a005ece548efa7de48c051ace6fb",
  worker: {
    name: "codejam-back",
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-10-28",
    compatibilityFlags: ["nodejs_compat"],
    limits: { cpuMs: 300_000 },
    exports: {
      RutasWorkflow: exports.workflow({ name: "quickdrop-rutas", defaultRetention: { successRetention: "7 days", errorRetention: "7 days" } }),
    },
    triggers: [triggers.scheduled({ schedule: "17 4 * * *" })],
    observability: {
      enabled: true,
      headSamplingRate: 0.1,
      logs: { enabled: true, headSamplingRate: 0.1 },
      traces: { enabled: true, headSamplingRate: 0.1 },
    },
    env: {
      RUTAS_WORKFLOW: bindings.workflow({ name: "quickdrop-rutas", worker: "codejam-back", exportName: "RutasWorkflow" }),
      JOBS_LIMIT: bindings.rateLimit({ namespace: "1001", simple: { limit: 10, period: 60 } }),
      VAPID_PUBLIC_KEY: bindings.secret(),
      VAPID_PRIVATE_KEY: bindings.secret(),
      VAPID_SUBJECT: bindings.secret(),
      DB: bindings.d1({
        id: "e2f4df7c-b346-456f-be62-ba09fff1f0fd",
        name: "codejam-db",
      }),
    },
  },
});
