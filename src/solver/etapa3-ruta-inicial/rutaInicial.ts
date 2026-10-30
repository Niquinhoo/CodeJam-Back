// ETAPA 3 · RUTA INICIAL
// Cada grupo de la etapa 2 se convierte en una ruta ordenada:
//   1. Vecino más cercano: desde el depósito, ir siempre al pedido pendiente más próximo.
//   2. 2-opt: si invertir un tramo de la ruta la acorta, se invierte (elimina los cruces).
// Dentro de una ruta, acortar la distancia también acorta el tiempo, así que acá basta con
// minimizar cuadras.
import { d } from "../nucleo/instancia.ts";
import type { Instancia, Solucion } from "../nucleo/instancia.ts";
import type { Agrupamiento } from "../etapa2-agrupamiento/tipos.ts";

export function vecinoMasCercano(inst: Instancia, grupo: number[]): number[] {
  const pendientes = new Set(grupo);
  const ruta: number[] = [];
  let actual = 0;
  while (pendientes.size > 0) {
    let mejor = -1;
    for (const nodo of pendientes) {
      if (mejor === -1 || d(inst, actual, nodo) < d(inst, actual, mejor) || (d(inst, actual, nodo) === d(inst, actual, mejor) && nodo < mejor)) mejor = nodo;
    }
    ruta.push(mejor);
    pendientes.delete(mejor);
    actual = mejor;
  }
  return ruta;
}

/** Mejora una ruta con 2-opt hasta que ninguna inversión la acorte. Devuelve las inversiones hechas. */
export function dosOpt(inst: Instancia, ruta: number[]): number {
  let inversiones = 0;
  let mejoro = true;
  while (mejoro) {
    mejoro = false;
    for (let i = 0; i < ruta.length - 1; i++) {
      const antes = i === 0 ? 0 : ruta[i - 1];
      for (let j = i + 1; j < ruta.length; j++) {
        const despues = j === ruta.length - 1 ? 0 : ruta[j + 1];
        // Invertir ruta[i..j] cambia solo los dos bordes del tramo.
        const delta = d(inst, antes, ruta[j]) + d(inst, ruta[i], despues) - d(inst, antes, ruta[i]) - d(inst, ruta[j], despues);
        if (delta < 0) {
          ruta.splice(i, j - i + 1, ...ruta.slice(i, j + 1).reverse());
          inversiones++;
          mejoro = true;
        }
      }
    }
  }
  return inversiones;
}

export function construirSolucion(inst: Instancia, agrupamiento: Agrupamiento): Solucion {
  return {
    rutas: agrupamiento.grupos.map((grupo) => {
      const ruta = vecinoMasCercano(inst, grupo);
      dosOpt(inst, ruta);
      return ruta;
    }),
    sinAsignar: [],
  };
}
