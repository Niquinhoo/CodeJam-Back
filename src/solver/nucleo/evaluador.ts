// Evaluación incremental: al probar un cambio solo se recalculan las rutas que tocó, y el
// resto se toma del estado guardado. Lo usan la búsqueda local y el recocido.
import { costoPropioRuta, costoSolucion, medirRuta } from "./instancia.ts";
import type { Instancia, MedidaRuta, Solucion } from "./instancia.ts";

/** Índice especial que representa la lista de pedidos sin asignar (los que fallan). */
export const SIN_ASIGNAR = -1;

export interface Cambio {
  ruta: number; // índice de vehículo o SIN_ASIGNAR
  nodos: number[];
}

export interface Estado {
  sol: Solucion;
  medidas: MedidaRuta[]; // cuadras, tiempo y minutos premium de cada ruta
  costo: number;
}

export function crearEstado(inst: Instancia, sol: Solucion): Estado {
  return { sol, medidas: sol.rutas.map((r, s) => medirRuta(inst, s, r)), costo: costoSolucion(inst, sol) };
}

/** Costo que tendría la solución si se aplicaran los cambios (no modifica el estado). */
export function costoSi(inst: Instancia, est: Estado, cambios: Cambio[]): number {
  let propio = 0;
  let fijo = 0;
  let makespan = 0;
  let fallas = est.sol.sinAsignar.length;
  for (const c of cambios) if (c.ruta === SIN_ASIGNAR) fallas = c.nodos.length;

  for (let s = 0; s < est.sol.rutas.length; s++) {
    const cambio = cambios.find((c) => c.ruta === s);
    const largo = cambio ? cambio.nodos.length : est.sol.rutas[s].length;
    if (largo === 0) continue;
    const m = cambio ? medirRuta(inst, s, cambio.nodos) : est.medidas[s];
    propio += costoPropioRuta(inst, m);
    fijo += inst.costoFijo[s];
    if (m.tiempo > makespan) makespan = m.tiempo;
  }
  return propio + fijo + inst.porMinuto * makespan + inst.porFalla * fallas;
}

export function aplicar(inst: Instancia, est: Estado, cambios: Cambio[], costoNuevo: number): void {
  for (const c of cambios) {
    if (c.ruta === SIN_ASIGNAR) {
      est.sol.sinAsignar = c.nodos;
      continue;
    }
    est.sol.rutas[c.ruta] = c.nodos;
    est.medidas[c.ruta] = medirRuta(inst, c.ruta, c.nodos);
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

/**
 * Posición de inserción que menos sube el costo propio de la ruta (distancia + demora premium).
 * Sin premium coincide con mejorInsercion; con premium puede preferir adelantar un pedido.
 */
export function mejorInsercionCosto(inst: Instancia, vehiculo: number, ruta: number[], nodo: number): number {
  if (!inst.hayPremium) return mejorInsercion(inst, ruta, nodo);
  let mejor = 0;
  let mejorCosto = Infinity;
  for (let i = 0; i <= ruta.length; i++) {
    const m = medirRuta(inst, vehiculo, insertar(ruta, i, [nodo]));
    const costo = costoPropioRuta(inst, m) + inst.porMinuto * m.tiempo;
    if (costo < mejorCosto) {
      mejorCosto = costo;
      mejor = i;
    }
  }
  return mejor;
}

export function insertar(ruta: number[], posicion: number, nodos: number[]): number[] {
  return [...ruta.slice(0, posicion), ...nodos, ...ruta.slice(posicion)];
}
