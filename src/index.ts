import { httpServerHandler } from "cloudflare:node";
import { app } from "./app.js";
import { limpiarVencidos } from "./models/trabajoModel.ts";

export { RutasWorkflow } from "./workflows/rutasWorkflow.ts";

app.listen(3000);

export default {
  ...httpServerHandler({ port: 3000 }),
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await limpiarVencidos(env.DB);
  },
};
