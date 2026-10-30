import { ErrorDatos, leerDataset } from "../solver/etapa1-lectura/leerDataset.ts";
import type { Archivos } from "../solver/etapa1-lectura/leerDataset.ts";

export class ErrorPeticion extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}

export async function identificarInstalacion(authorization?: string): Promise<string> {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(authorization ?? "");
  if (!match) throw new ErrorPeticion(401, "Se requiere la clave de esta instalación.");
  return hash(match[1]);
}

export function validarId(id: string): void {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
    throw new ErrorPeticion(400, "Identificador de trabajo inválido.");
  }
}

function objeto(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface SolicitudTrabajo {
  archivos: Archivos;
  opciones: { iteraciones: number; semilla: number };
}

export function validarSolicitud(body: unknown): SolicitudTrabajo {
  if (!objeto(body) || !objeto(body.archivos) || !Object.values(body.archivos).every(v => typeof v === "string")) {
    throw new ErrorPeticion(400, "Se espera { archivos: { nombre: contenido }, opciones }." );
  }
  const archivos = Object.fromEntries(Object.entries(body.archivos).sort(([a],[b]) => a.localeCompare(b))) as Archivos;
  if (Object.keys(archivos).length > 6 || new TextEncoder().encode(JSON.stringify(archivos)).length > 512_000) {
    throw new ErrorPeticion(413, "El dataset excede el límite de 512 KB o 6 archivos.");
  }
  if (body.opciones !== undefined && !objeto(body.opciones)) throw new ErrorPeticion(400, "Opciones inválidas.");
  const opciones = (body.opciones ?? {}) as Record<string, unknown>;
  const iteraciones = opciones.iteraciones ?? 60_000;
  const semilla = opciones.semilla ?? 2026;
  if (typeof iteraciones !== "number" || !Number.isSafeInteger(iteraciones) || iteraciones < 0 || iteraciones > 300_000 || typeof semilla !== "number" || !Number.isSafeInteger(semilla) || semilla < 0 || semilla > 2 ** 31) {
    throw new ErrorPeticion(400, "Usá de 0 a 300.000 iteraciones y una semilla entera entre 0 y 2147483648.");
  }
  try {
    const { dataset } = leerDataset(archivos);
    if (dataset.pedidos.length < 1 || dataset.pedidos.length > 120 || dataset.vehiculos.length > 8 || dataset.mundo.ancho > 200 || dataset.mundo.alto > 200) {
      throw new ErrorPeticion(400, "Se admiten 1 a 120 pedidos, hasta 8 vehículos y una grilla de hasta 200 × 200.");
    }
  } catch (error) {
    if (error instanceof ErrorPeticion) throw error;
    throw new ErrorPeticion(400, error instanceof ErrorDatos ? error.message : "Dataset inválido.");
  }
  return { archivos, opciones: { iteraciones, semilla } };
}
