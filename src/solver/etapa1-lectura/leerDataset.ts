// ETAPA 1 · LECTURA
// Convierte los archivos del dataset (JSON o CSV) en un Dataset tipado, con las mismas reglas
// que quickdrop/cargar.py: un campo que falta, vale null o está vacío toma su valor por
// defecto; los campos desconocidos se ignoran. Nada se supone: ni el depósito en (0,0) ni los
// costos; todo sale del archivo mundo.
import { DEPOSITO } from "../nucleo/modelo.ts";
import type { Dataset, Mundo, Pedido, Vehiculo } from "../nucleo/modelo.ts";
import { leerCsv } from "./csv.ts";

export class ErrorDatos extends Error {}

/** Contenido de cada archivo, por nombre ("mundo.json", "pedidos.csv", …). */
export type Archivos = Record<string, string>;

export interface ResumenLectura {
  formatos: Record<"mundo" | "pedidos" | "vehiculos", "json" | "csv" | "por defecto">;
}

type Crudo = unknown;

function vacio(v: Crudo): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function entero(v: Crudo, donde: string): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (typeof v === "boolean" || !Number.isInteger(n)) throw new ErrorDatos(`${donde}: se esperaba un entero y vino ${JSON.stringify(v)}`);
  return n;
}

function numero(v: Crudo, donde: string): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim().replace(",", ".")) : NaN;
  if (typeof v === "boolean" || !Number.isFinite(n)) throw new ErrorDatos(`${donde}: se esperaba un número y vino ${JSON.stringify(v)}`);
  return n;
}

function booleano(v: Crudo, donde: string): boolean {
  if (typeof v === "boolean") return v;
  if (v === 0 || v === 1) return v === 1;
  const t = String(v).trim().toLowerCase();
  if (["1", "true", "si", "sí", "verdadero"].includes(t)) return true;
  if (["0", "false", "no", "falso"].includes(t)) return false;
  throw new ErrorDatos(`${donde}: se esperaba un booleano (1/0) y vino ${JSON.stringify(v)}`);
}

function hora(v: Crudo, donde: string): number {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  const m = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(String(v));
  const h = m ? Number(m[1]) : NaN;
  const min = m ? Number(m[2]) : NaN;
  if (!m || h >= 24 || min >= 60) throw new ErrorDatos(`${donde}: hora inválida ${JSON.stringify(v)} (se espera HH:MM)`);
  return h * 60 + min;
}

// (clave en el archivo, tipo, valor por defecto), igual que CAMPOS_MUNDO del simulador.
const CAMPOS_MUNDO = [
  ["grilla_ancho", "entero", 20],
  ["grilla_alto", "entero", 20],
  ["deposito_x", "entero", 0],
  ["deposito_y", "entero", 0],
  ["hora_salida", "hora", "08:00"],
  ["tiempo_servicio", "entero", 5],
  ["tiempo_carga", "entero", 10],
  ["min_por_cuadra", "entero", 3],
  ["costo_por_cuadra", "numero", 3],
  ["costo_por_vehiculo", "numero", 60],
  ["costo_por_minuto_total", "numero", 1],
  ["costo_por_falla", "numero", 200],
  ["costo_por_minuto_premium", "numero", 1], // Evento 1
] as const;

const LECTORES = { entero, numero, hora };

function mundoDesdeObjeto(d: Crudo): Mundo {
  if (typeof d !== "object" || d === null || Array.isArray(d)) throw new ErrorDatos("mundo: se esperaba un objeto con claves");
  const fuente = d as Record<string, Crudo>;
  const v: Record<string, number> = {};
  for (const [clave, tipo, defecto] of CAMPOS_MUNDO) {
    const crudo = vacio(fuente[clave]) ? defecto : fuente[clave];
    v[clave] = LECTORES[tipo](crudo, `mundo.${clave}`);
  }
  const mundo: Mundo = {
    ancho: v.grilla_ancho,
    alto: v.grilla_alto,
    deposito: { x: v.deposito_x, y: v.deposito_y },
    horaSalida: v.hora_salida,
    tiempoServicio: v.tiempo_servicio,
    tiempoCarga: v.tiempo_carga,
    minPorCuadra: v.min_por_cuadra,
    costos: {
      porCuadra: v.costo_por_cuadra,
      porVehiculo: v.costo_por_vehiculo,
      porMinutoTotal: v.costo_por_minuto_total,
      porFalla: v.costo_por_falla,
      porMinutoPremium: v.costo_por_minuto_premium,
    },
  };
  if (mundo.ancho <= 0 || mundo.alto <= 0) throw new ErrorDatos("mundo: la grilla debe tener tamaño positivo");
  if (!dentro(mundo, mundo.deposito.x, mundo.deposito.y)) throw new ErrorDatos("mundo: el depósito está fuera de la grilla");
  if (mundo.minPorCuadra <= 0 || mundo.tiempoServicio < 0 || mundo.tiempoCarga < 0) throw new ErrorDatos("mundo: tiempos inválidos");
  return mundo;
}

function dentro(mundo: Mundo, x: number, y: number): boolean {
  return x >= 0 && x < mundo.ancho && y >= 0 && y < mundo.alto;
}

function pedidosDesdeFilas(filas: Crudo, mundo: Mundo): Pedido[] {
  if (!Array.isArray(filas)) throw new ErrorDatos("pedidos: se esperaba una lista");
  const vistos = new Set<number>();
  return filas.map((f: Record<string, Crudo>, i) => {
    if (typeof f !== "object" || f === null) throw new ErrorDatos(`pedidos, elemento ${i + 1}: se esperaba un objeto`);
    for (const req of ["id", "x", "y", "peso"]) {
      if (vacio(f[req])) throw new ErrorDatos(`pedidos, elemento ${i + 1}: falta '${req}'`);
    }
    const id = entero(f.id, `pedidos, elemento ${i + 1}, id`);
    const donde = `pedido ${id}`;
    const pedido: Pedido = {
      id,
      x: entero(f.x, `${donde}, x`),
      y: entero(f.y, `${donde}, y`),
      peso: entero(f.peso, `${donde}, peso`),
      premium: vacio(f.premium) ? false : booleano(f.premium, `${donde}, premium`),
    };
    if (vistos.has(id)) throw new ErrorDatos(`${donde}: id repetido`);
    if (!dentro(mundo, pedido.x, pedido.y)) throw new ErrorDatos(`${donde}: (${pedido.x},${pedido.y}) está fuera de la grilla`);
    if (pedido.peso < 0) throw new ErrorDatos(`${donde}: peso negativo`);
    vistos.add(id);
    return pedido;
  });
}

function vehiculosDesdeFilas(filas: Crudo, mundo: Mundo): Vehiculo[] {
  if (!Array.isArray(filas)) throw new ErrorDatos("vehiculos: se esperaba una lista");
  const vistos = new Set<string>();
  return filas.map((f: Record<string, Crudo>, i) => {
    if (typeof f !== "object" || f === null || vacio(f.id)) throw new ErrorDatos(`vehiculos, elemento ${i + 1}: falta 'id'`);
    const id = String(f.id).trim();
    if (vistos.has(id)) throw new ErrorDatos(`vehículo ${id}: id repetido`);
    if (id.toUpperCase() === DEPOSITO) throw new ErrorDatos(`vehículo ${id}: '${DEPOSITO}' no puede usarse como id de vehículo`);
    vistos.add(id);
    return { id, minPorCuadra: mundo.minPorCuadra, costoFijo: mundo.costos.porVehiculo };
  });
}

/** Busca "nombre.json" (preferido, como el simulador) o "nombre.csv" entre los archivos. */
function elegir(archivos: Archivos, nombre: string): { formato: "json" | "csv"; texto: string } | null {
  const porNombre = new Map(Object.entries(archivos).map(([ruta, texto]) => [ruta.replace(/\\/g, "/").split("/").pop()!.toLowerCase(), texto]));
  for (const formato of ["json", "csv"] as const) {
    const texto = porNombre.get(`${nombre}.${formato}`);
    if (texto !== undefined) return { formato, texto };
  }
  return null;
}

function parsearJson(texto: string, archivo: string): Crudo {
  try {
    return JSON.parse(texto.replace(/^﻿/, ""));
  } catch {
    throw new ErrorDatos(`${archivo}: JSON inválido`);
  }
}

export function leerDataset(archivos: Archivos): { dataset: Dataset; resumen: ResumenLectura } {
  const formatos: ResumenLectura["formatos"] = { mundo: "por defecto", pedidos: "por defecto", vehiculos: "por defecto" };

  const archivoMundo = elegir(archivos, "mundo");
  let mundo: Mundo;
  if (!archivoMundo) {
    mundo = mundoDesdeObjeto({});
  } else if (archivoMundo.formato === "json") {
    mundo = mundoDesdeObjeto(parsearJson(archivoMundo.texto, "mundo.json"));
  } else {
    const filas = leerCsv(archivoMundo.texto);
    if (filas.length > 0 && !("clave" in filas[0] && "valor" in filas[0])) throw new ErrorDatos("mundo.csv: se esperan las columnas 'clave,valor'");
    mundo = mundoDesdeObjeto(Object.fromEntries(filas.map((f) => [f.clave, f.valor])));
  }
  if (archivoMundo) formatos.mundo = archivoMundo.formato;

  const leerLista = (nombre: "pedidos" | "vehiculos"): Crudo => {
    const archivo = elegir(archivos, nombre);
    if (!archivo) throw new ErrorDatos(`falta ${nombre}.json o ${nombre}.csv`);
    formatos[nombre] = archivo.formato;
    return archivo.formato === "json" ? parsearJson(archivo.texto, `${nombre}.json`) : leerCsv(archivo.texto);
  };

  const pedidos = pedidosDesdeFilas(leerLista("pedidos"), mundo);
  const vehiculos = vehiculosDesdeFilas(leerLista("vehiculos"), mundo);
  if (vehiculos.length === 0) throw new ErrorDatos("vehiculos: no hay ningún vehículo");
  return { dataset: { mundo, pedidos, vehiculos }, resumen: { formatos } };
}
