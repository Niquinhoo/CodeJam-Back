// Representación interna rápida. El optimizador prueba cientos de miles de cambios, así que
// precalculamos las distancias y trabajamos con índices de nodo en lugar de objetos:
// nodo 0 = depósito, nodo i (1..n) = pedidos[i - 1].
import { DEPOSITO, distancia } from "./modelo.ts";
import type { Dataset, Plan } from "./modelo.ts";

export interface Instancia {
  dataset: Dataset;
  n: number;
  dist: Int32Array; // matriz (n + 1) × (n + 1)
  servicio: number;
  porCuadra: number;
  porMinuto: number;
  porFalla: number;
  minPorCuadra: number[]; // por vehículo, en el orden del dataset
  costoFijo: number[];
}

/**
 * Una solución: rutas[s] es la lista ordenada de nodos que visita el vehículo s
 * (vacía = vehículo sin usar). sinAsignar son los pedidos que decidimos dejar fallar.
 */
export interface Solucion {
  rutas: number[][];
  sinAsignar: number[];
}

export function crearInstancia(dataset: Dataset): Instancia {
  const puntos = [dataset.mundo.deposito, ...dataset.pedidos];
  const n = dataset.pedidos.length;
  const dist = new Int32Array((n + 1) * (n + 1));
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) dist[i * (n + 1) + j] = distancia(puntos[i], puntos[j]);
  }
  const c = dataset.mundo.costos;
  return {
    dataset,
    n,
    dist,
    servicio: dataset.mundo.tiempoServicio,
    porCuadra: c.porCuadra,
    porMinuto: c.porMinutoTotal,
    porFalla: c.porFalla,
    minPorCuadra: dataset.vehiculos.map((v) => v.minPorCuadra),
    costoFijo: dataset.vehiculos.map((v) => v.costoFijo),
  };
}

export function d(inst: Instancia, a: number, b: number): number {
  return inst.dist[a * (inst.n + 1) + b];
}

/** Cuadras de una ruta, saliendo y volviendo al depósito. */
export function distanciaRuta(inst: Instancia, ruta: number[]): number {
  if (ruta.length === 0) return 0;
  let total = d(inst, 0, ruta[0]);
  for (let i = 1; i < ruta.length; i++) total += d(inst, ruta[i - 1], ruta[i]);
  return total + d(inst, ruta[ruta.length - 1], 0);
}

/** Minutos desde la salida hasta que el vehículo vuelve al depósito. */
export function tiempoRuta(inst: Instancia, vehiculo: number, ruta: number[], cuadras = distanciaRuta(inst, ruta)): number {
  return cuadras * inst.minPorCuadra[vehiculo] + ruta.length * inst.servicio;
}

/** Mismo costo que el simulador, calculado directo sobre la solución interna. */
export function costoSolucion(inst: Instancia, sol: Solucion): number {
  let cuadras = 0;
  let fijo = 0;
  let makespan = 0;
  sol.rutas.forEach((ruta, s) => {
    if (ruta.length === 0) return;
    const dr = distanciaRuta(inst, ruta);
    cuadras += dr;
    fijo += inst.costoFijo[s];
    makespan = Math.max(makespan, tiempoRuta(inst, s, ruta, dr));
  });
  return inst.porCuadra * cuadras + fijo + inst.porMinuto * makespan + inst.porFalla * sol.sinAsignar.length;
}

export function clonar(sol: Solucion): Solucion {
  return { rutas: sol.rutas.map((r) => [...r]), sinAsignar: [...sol.sinAsignar] };
}

export function vehiculosUsados(sol: Solucion): number {
  return sol.rutas.filter((r) => r.length > 0).length;
}

/** Traduce la solución interna al formato de plan que pide la consigna. */
export function aPlan(inst: Instancia, sol: Solucion): Plan {
  const { pedidos, vehiculos } = inst.dataset;
  return {
    rutas: sol.rutas
      .map((ruta, s) => ({ vehiculo: vehiculos[s].id, paradas: ruta.map((nodo) => pedidos[nodo - 1].id) }))
      .filter((r) => r.paradas.length > 0),
  };
}

export function planACsv(plan: Plan): string {
  const filas = plan.rutas.flatMap((r) => r.paradas.map((p) => `${r.vehiculo},${p === DEPOSITO ? DEPOSITO : p}`));
  return ["vehiculo,parada", ...filas].join("\n") + "\n";
}
