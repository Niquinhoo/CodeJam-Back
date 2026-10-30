import type { Request, Response } from "express";
import { ErrorDatos } from "../solver/etapa1-lectura/leerDataset.ts";
import { resolverDesdeArchivos } from "../solver/resolver.ts";

// Las iteraciones son de CPU: la API acepta menos que el comando local (npm run resolver).
const MAX_ITERACIONES_API = 300_000;

export function postResolver(request: Request, response: Response): void {
  const { archivos, opciones } = (request.body ?? {}) as { archivos?: unknown; opciones?: Record<string, unknown> };
  if (typeof archivos !== "object" || archivos === null || Array.isArray(archivos) || !Object.values(archivos).every((v) => typeof v === "string")) {
    response.status(400).json({ error: "Se espera { archivos: { \"mundo.json\": \"…\", \"pedidos.csv\": \"…\", … } }" });
    return;
  }
  const iteraciones = typeof opciones?.iteraciones === "number" ? Math.min(opciones.iteraciones, MAX_ITERACIONES_API) : undefined;

  try {
    const informe = resolverDesdeArchivos(archivos as Record<string, string>, {
      iteraciones,
      semilla: typeof opciones?.semilla === "number" ? opciones.semilla : undefined,
    });
    response.json(informe);
  } catch (error) {
    if (error instanceof ErrorDatos) {
      response.status(400).json({ error: error.message });
      return;
    }
    console.error(JSON.stringify({ level: "error", message: "Solver failed" }));
    response.status(500).json({ error: "No se pudo resolver el dataset" });
  }
}
