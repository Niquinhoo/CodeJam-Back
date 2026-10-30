import express from "express";
import { healthRoutes } from "./routes/healthRoutes.js";
import { resolverRoutes } from "./routes/resolverRoutes.js";
import { trabajoRoutes } from "./routes/trabajoRoutes.js";
import { pushRoutes } from "./routes/pushRoutes.js";
import { ErrorPeticion } from "./services/validacion.ts";

const app = express();
const allowedOrigins = new Set([
  "https://codejam.citax.com.ar",
  "https://codejam-front.nicotrib699.workers.dev",
  "https://codejam-front-push-test.nicotrib699.workers.dev",
  "http://localhost:5173",
  "http://localhost:5175",
]);

app.use((request, response, next) => {
  const origin = request.get("Origin");
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (request.method === "OPTIONS") {
    response.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
    return;
  }
  if (origin && !allowedOrigins.has(origin)) {
    response.status(403).json({ error: "Origen no autorizado" });
    return;
  }
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use("/api", healthRoutes);
app.use("/api", resolverRoutes);
app.use("/api", trabajoRoutes);
app.use("/api", pushRoutes);
app.use((_request, response) => response.status(404).json({ error: "Not found" }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ErrorPeticion) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof SyntaxError && "status" in error && error.status === 400) {
    response.status(400).json({error:"JSON inválido"});
    return;
  }
  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
    response.status(413).json({error:"La solicitud excede el límite de 1 MB"});
    return;
  }
  console.error(JSON.stringify({ level: "error", message: "Unhandled API error" }));
  response.status(500).json({ error: "Internal server error" });
});

export { app };
