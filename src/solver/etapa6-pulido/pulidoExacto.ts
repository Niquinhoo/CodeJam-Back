// ETAPA 6 · PULIDO EXACTO
// Probar todos los casos del problema completo es imposible (con 40 pedidos hay más órdenes
// posibles que átomos en la Tierra). Pero para UNA ruta corta sí:
//   · Ruta sin premium (hasta 12 pedidos): programación dinámica (Held-Karp) da el orden de
//     menor distancia, que también es el de menor tiempo.
//   · Ruta con premium (hasta 9 pedidos, Evento 1): la demora de cada premium depende de todo
//     lo recorrido antes, así que Held-Karp no alcanza. Usamos ramificación y poda: se arman
//     los órdenes parada por parada y se descarta un camino apenas su costo parcial supera al
//     mejor completo encontrado.
// Antes se hace una última búsqueda local sobre lo que dejó el recocido.
import { costoSolucion, d } from "../nucleo/instancia.ts";
import type { Instancia, Solucion } from "../nucleo/instancia.ts";
import { busquedaLocal } from "../etapa4-busqueda-local/busquedaLocal.ts";
import type { ConteoMovimientos } from "../etapa4-busqueda-local/busquedaLocal.ts";
import { costoRuta } from "../etapa3-ruta-inicial/rutaInicial.ts";

export const MAX_PEDIDOS_EXACTO = 12;
export const MAX_PEDIDOS_EXACTO_PREMIUM = 9;

/** Orden de menor distancia para visitar todos los nodos saliendo y volviendo al depósito. */
export function ordenOptimo(inst: Instancia, nodos: number[]): number[] {
  const m = nodos.length;
  if (m <= 2) return [...nodos];
  const estados = 1 << m;
  // costo[mask * m + j]: menor distancia saliendo del depósito, visitando "mask" y terminando en j.
  const costo = new Float64Array(estados * m).fill(Infinity);
  const previo = new Int8Array(estados * m).fill(-1);
  for (let j = 0; j < m; j++) costo[(1 << j) * m + j] = d(inst, 0, nodos[j]);

  for (let mask = 1; mask < estados; mask++) {
    for (let j = 0; j < m; j++) {
      const actual = costo[mask * m + j];
      if (!(mask & (1 << j)) || actual === Infinity) continue;
      for (let s = 0; s < m; s++) {
        if (mask & (1 << s)) continue;
        const sig = mask | (1 << s);
        const nuevo = actual + d(inst, nodos[j], nodos[s]);
        if (nuevo < costo[sig * m + s]) {
          costo[sig * m + s] = nuevo;
          previo[sig * m + s] = j;
        }
      }
    }
  }

  const completo = estados - 1;
  let ultimo = 0;
  for (let j = 1; j < m; j++) {
    if (costo[completo * m + j] + d(inst, nodos[j], 0) < costo[completo * m + ultimo] + d(inst, nodos[ultimo], 0)) ultimo = j;
  }
  const orden: number[] = [];
  let mask = completo;
  let j = ultimo;
  while (j !== -1) {
    orden.push(nodos[j]);
    const p = previo[mask * m + j];
    mask &= ~(1 << j);
    j = p;
  }
  return orden.reverse();
}

/**
 * Orden de menor costo de ruta (distancia + tiempo + demora premium) por ramificación y poda.
 * Todos los términos solo crecen al agregar paradas, así que el costo parcial es una cota válida.
 */
export function ordenOptimoPremium(inst: Instancia, vehiculo: number, ruta: number[]): number[] {
  const mpc = inst.minPorCuadra[vehiculo];
  const porTramo = inst.porCuadra + inst.porMinuto * mpc; // cada cuadra suma distancia y tiempo
  let mejor = [...ruta];
  let mejorCosto = costoRuta(inst, vehiculo, ruta);
  const camino: number[] = [];
  const usado = new Array<boolean>(ruta.length).fill(false);

  const explorar = (previo: number, t: number, parcial: number) => {
    if (parcial >= mejorCosto) return; // poda
    if (camino.length === ruta.length) {
      const total = parcial + porTramo * d(inst, previo, 0);
      if (total < mejorCosto) {
        mejorCosto = total;
        mejor = [...camino];
      }
      return;
    }
    for (let i = 0; i < ruta.length; i++) {
      if (usado[i]) continue;
      const nodo = ruta[i];
      const tramo = d(inst, previo, nodo);
      const llegada = t + tramo * mpc;
      const extra = porTramo * tramo + inst.porMinuto * inst.servicio + (inst.premium[nodo] ? inst.porMinutoPremium * llegada : 0);
      usado[i] = true;
      camino.push(nodo);
      explorar(nodo, llegada + inst.servicio, parcial + extra);
      camino.pop();
      usado[i] = false;
    }
  };
  explorar(0, 0, 0);
  return mejor;
}

export interface ResultadoPulido {
  sol: Solucion;
  movimientos: ConteoMovimientos;
  rutasExactas: number;
  rutasMejoradas: number;
}

export function pulir(inst: Instancia, inicial: Solucion): ResultadoPulido {
  const { sol, movimientos } = busquedaLocal(inst, inicial);
  let rutasExactas = 0;
  let rutasMejoradas = 0;
  sol.rutas.forEach((ruta, vehiculo) => {
    const conPremium = inst.hayPremium && ruta.some((n) => inst.premium[n]);
    const limite = conPremium ? MAX_PEDIDOS_EXACTO_PREMIUM : MAX_PEDIDOS_EXACTO;
    if (ruta.length === 0 || ruta.length > limite) return;
    rutasExactas++;
    const optima = conPremium ? ordenOptimoPremium(inst, vehiculo, ruta) : ordenOptimo(inst, ruta);
    // Solo se acepta si baja el costo TOTAL (el makespan depende de todas las rutas).
    const antes = costoSolucion(inst, sol);
    sol.rutas[vehiculo] = optima;
    if (costoSolucion(inst, sol) < antes - 1e-9) rutasMejoradas++;
    else sol.rutas[vehiculo] = ruta;
  });
  return { sol, movimientos, rutasExactas, rutasMejoradas };
}
