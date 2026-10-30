import { bindings, defineConfig, exports, triggers } from "cf/config";

export default defineConfig(({ mode }) => {
const staging = mode === "staging";
const workerName = staging ? "codejam-back-push-test" : "codejam-back";
const workflowName = staging ? "quickdrop-rutas-test" : "quickdrop-rutas";
return {
  accountId: "6d93a005ece548efa7de48c051ace6fb",
  worker: {
    name: workerName,
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-10-28",
    compatibilityFlags: ["nodejs_compat"],
    limits: { cpuMs: 300_000 },
    exports: {
      RutasWorkflow: exports.workflow({ name: workflowName, defaultRetention: { successRetention: "7 days", errorRetention: "7 days" } }),
    },
    triggers: [triggers.scheduled({ schedule: "17 4 * * *" })],
    observability: {
      enabled: true,
      headSamplingRate: 0.1,
      logs: { enabled: true, headSamplingRate: 0.1 },
      traces: { enabled: true, headSamplingRate: 0.1 },
    },
    env: {
      RUTAS_WORKFLOW: bindings.workflow({ name: workflowName, worker: workerName, exportName: "RutasWorkflow" }),
      JOBS_LIMIT: bindings.rateLimit({ namespace: "1001", simple: { limit: 10, period: 60 } }),
      VAPID_PUBLIC_KEY: bindings.secret(),
      VAPID_PRIVATE_KEY: bindings.secret(),
      VAPID_SUBJECT: bindings.secret(),
      DB: bindings.d1({
        id: staging ? "bc3b2c5a-4c3f-485f-b9d6-28033bc1c76f" : "e2f4df7c-b346-456f-be62-ba09fff1f0fd",
        name: staging ? "quickdrop-push-test" : "codejam-db",
      }),
    },
  },
};
});
