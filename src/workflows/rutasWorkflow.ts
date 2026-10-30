import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { guardarAviso, marcarFallido } from "../models/trabajoModel.ts";
import { notificarTrabajo, procesarTrabajo } from "../services/trabajos.ts";
import { retrasoPush } from "../services/webPush.ts";

export class RutasWorkflow extends WorkflowEntrypoint<Env, { jobId: string }> {
  async run(event: WorkflowEvent<{ jobId: string }>, step: WorkflowStep): Promise<void> {
    const id = event.payload.jobId;
    try {
      await step.do("resolver-y-guardar",{ retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "5 minutes" },async () => {
        await procesarTrabajo(this.env.DB,id);
      });
    } catch {
      await step.do("guardar-fallo",async () => { await marcarFallido(this.env.DB,id); });
    }
    try {
      await step.do("notificar-rutas",{ retries: { limit: 5, delay: ({ctx,error}) => retrasoPush(error,ctx.attempt) }, timeout: "30 seconds" },async () => {
        await notificarTrabajo(this.env,id);
      });
    } catch {
      await step.do("guardar-fallo-de-aviso",async () => {
        await guardarAviso(this.env.DB,id,"fallido");
        console.error(JSON.stringify({ event: "push_exhausted", jobId: id }));
      });
    }
  }
}
