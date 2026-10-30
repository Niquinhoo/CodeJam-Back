// ETAPA 6 · PULIDO EXACTO
// Probar todos los casos del problema completo es imposible (con 40 pedidos hay más órdenes
// posibles que átomos en la Tierra). Pero para UNA ruta corta sí: con programación dinámica
// (Held-Karp) encontramos el orden óptimo de cada ruta de hasta 12 pedidos, en vez de
// confiar en 2-opt. Antes se hace una última búsqueda local sobre lo que dejó el recocido.
import { d, distanciaRuta } from "../nucleo/instancia.ts";
import type { Instancia, Solucion } from "../nucleo/instancia.ts";
import { busquedaLocal } from "../etapa4-busqueda-local/busquedaLocal.ts";
import type { ConteoMovimientos } from "../etapa4-busqueda-local/busquedaLocal.ts";

export const MAX_PEDIDOS_EXACTO = 12;

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
  sol.rutas = sol.rutas.map((ruta) => {
    if (ruta.length === 0 || ruta.length > MAX_PEDIDOS_EXACTO) return ruta;
    rutasExactas++;
    const optima = ordenOptimo(inst, ruta);
    if (distanciaRuta(inst, optima) < distanciaRuta(inst, ruta)) {
      rutasMejoradas++;
      return optima;
    }
    return ruta;
  });
  return { sol, movimientos, rutasExactas, rutasMejoradas };
}
