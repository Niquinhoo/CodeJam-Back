import type { Request, Response } from "express";
import { env } from "cloudflare:workers";
import { checkDatabase } from "../models/healthModel.js";

export async function getHealth(_request: Request, response: Response): Promise<void> {
  try {
    const connected = await checkDatabase(env.DB);
    response.status(connected ? 200 : 503).json({ status: connected ? "ok" : "unavailable" });
  } catch {
    console.error(JSON.stringify({ level: "error", message: "D1 health check failed" }));
    response.status(503).json({ status: "unavailable" });
  }
}
