// Evaluación incremental: al probar un cambio solo se recalculan las rutas que tocó, y el
// resto se toma del estado guardado. Lo usan la búsqueda local y el recocido.
import { costoSolucion, distanciaRuta, tiempoRuta } from "./instancia.ts";
import type { Instancia, Solucion } from "./instancia.ts";

/** Índice especial que representa la lista de pedidos sin asignar (los que fallan). */
export const SIN_ASIGNAR = -1;

export interface Cambio {
  ruta: number; // índice de vehículo o SIN_ASIGNAR
  nodos: number[];
}

export interface Estado {
  sol: Solucion;
  cuadras: number[];
  tiempo: number[];
  costo: number;
}

export function crearEstado(inst: Instancia, sol: Solucion): Estado {
  const cuadras = sol.rutas.map((r) => distanciaRuta(inst, r));
  const tiempo = sol.rutas.map((r, s) => tiempoRuta(inst, s, r, cuadras[s]));
  return { sol, cuadras, tiempo, costo: costoSolucion(inst, sol) };
}

/** Costo que tendría la solución si se aplicaran los cambios (no modifica el estado). */
export function costoSi(inst: Instancia, est: Estado, cambios: Cambio[]): number {
  let cuadras = 0;
  let fijo = 0;
  let makespan = 0;
  let fallas = est.sol.sinAsignar.length;
  for (const c of cambios) if (c.ruta === SIN_ASIGNAR) fallas = c.nodos.length;

  for (let s = 0; s < est.sol.rutas.length; s++) {
    const cambio = cambios.find((c) => c.ruta === s);
    let largo = est.sol.rutas[s].length;
    let dr = est.cuadras[s];
    let tr = est.tiempo[s];
    if (cambio) {
      largo = cambio.nodos.length;
      dr = distanciaRuta(inst, cambio.nodos);
      tr = tiempoRuta(inst, s, cambio.nodos, dr);
    }
    if (largo === 0) continue;
    cuadras += dr;
    fijo += inst.costoFijo[s];
    if (tr > makespan) makespan = tr;
  }
  return inst.porCuadra * cuadras + fijo + inst.porMinuto * makespan + inst.porFalla * fallas;
}

export function aplicar(inst: Instancia, est: Estado, cambios: Cambio[], costoNuevo: number): void {
  for (const c of cambios) {
    if (c.ruta === SIN_ASIGNAR) {
      est.sol.sinAsignar = c.nodos;
      continue;
    }
    est.sol.rutas[c.ruta] = c.nodos;
    est.cuadras[c.ruta] = distanciaRuta(inst, c.nodos);
    est.tiempo[c.ruta] = tiempoRuta(inst, c.ruta, c.nodos, est.cuadras[c.ruta]);
  }
  est.costo = costoNuevo;
}

/** Posición donde insertar un nodo en una ruta para que agregue la menor distancia. */
export function mejorInsercion(inst: Instancia, ruta: number[], nodo: number): number {
  const n1 = inst.n + 1;
  let mejor = 0;
  let mejorDelta = Infinity;
  for (let i = 0; i <= ruta.length; i++) {
    const antes = i === 0 ? 0 : ruta[i - 1];
    const despues = i === ruta.length ? 0 : ruta[i];
    const delta = inst.dist[antes * n1 + nodo] + inst.dist[nodo * n1 + despues] - inst.dist[antes * n1 + despues];
    if (delta < mejorDelta) {
      mejorDelta = delta;
      mejor = i;
    }
  }
  return mejor;
}

export function insertar(ruta: number[], posicion: number, nodos: number[]): number[] {
  return [...ruta.slice(0, posicion), ...nodos, ...ruta.slice(posicion)];
}
