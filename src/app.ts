import express from "express";
import { healthRoutes } from "./routes/healthRoutes.js";

const app = express();
const allowedOrigins = new Set([
  "https://codejam-front.nicotrib699.workers.dev",
  "http://localhost:5173",
]);

app.use((request, response, next) => {
  const origin = request.get("Origin");
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (request.method === "OPTIONS") {
    response.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
    return;
  }
  next();
});

app.use("/api", healthRoutes);
app.use((_request, response) => response.status(404).json({ error: "Not found" }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(JSON.stringify({ level: "error", message: "Unhandled API error" }));
  response.status(500).json({ error: "Internal server error" });
});

export { app };
