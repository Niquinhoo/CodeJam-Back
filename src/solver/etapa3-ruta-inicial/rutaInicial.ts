// ETAPA 3 · RUTA INICIAL
// Cada grupo de la etapa 2 se convierte en una ruta ordenada:
//   1. Vecino más cercano: desde el depósito, ir siempre al pedido pendiente más próximo.
//   2. 2-opt: si invertir un tramo de la ruta la acorta, se invierte (elimina los cruces).
// Sin premium, acortar la distancia también acorta el tiempo, así que basta con minimizar cuadras.
// Con premium (Evento 1) también probamos "premium primero": visitar los premium al inicio de
// la ruta y después el resto. Nos quedamos con el orden que cuesta menos.
import { costoPropioRuta, d, medirRuta } from "../nucleo/instancia.ts";
import type { Instancia, Solucion } from "../nucleo/instancia.ts";
import type { Agrupamiento } from "../etapa2-agrupamiento/tipos.ts";

export function vecinoMasCercano(inst: Instancia, grupo: number[], desde = 0): number[] {
  const pendientes = new Set(grupo);
  const ruta: number[] = [];
  let actual = desde;
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

/**
 * Mejora con 2-opt el tramo ruta[desde..hasta) hasta que ninguna inversión lo acorte.
 * Devuelve las inversiones hechas. Por defecto trabaja sobre la ruta entera.
 */
export function dosOpt(inst: Instancia, ruta: number[], desde = 0, hasta = ruta.length): number {
  let inversiones = 0;
  let mejoro = true;
  while (mejoro) {
    mejoro = false;
    for (let i = desde; i < hasta - 1; i++) {
      const antes = i === 0 ? 0 : ruta[i - 1];
      for (let j = i + 1; j < hasta; j++) {
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

/** Premium primero: los premium en orden de cercanía, después el resto, cada bloque con 2-opt. */
export function premiumPrimero(inst: Instancia, grupo: number[]): number[] {
  const premium = vecinoMasCercano(inst, grupo.filter((n) => inst.premium[n]));
  const resto = vecinoMasCercano(inst, grupo.filter((n) => !inst.premium[n]), premium.at(-1) ?? 0);
  const ruta = [...premium, ...resto];
  dosOpt(inst, ruta, 0, premium.length);
  dosOpt(inst, ruta, premium.length, ruta.length);
  return ruta;
}

/** Lo que cuesta una ruta por sí sola: distancia, demora premium y su propio tiempo de vuelta. */
export function costoRuta(inst: Instancia, vehiculo: number, ruta: number[]): number {
  const m = medirRuta(inst, vehiculo, ruta);
  return costoPropioRuta(inst, m) + inst.porMinuto * m.tiempo;
}

export function ordenarGrupo(inst: Instancia, vehiculo: number, grupo: number[]): number[] {
  const ruta = vecinoMasCercano(inst, grupo);
  dosOpt(inst, ruta);
  if (!inst.hayPremium || !grupo.some((n) => inst.premium[n])) return ruta;
  const conPrioridad = premiumPrimero(inst, grupo);
  return costoRuta(inst, vehiculo, conPrioridad) < costoRuta(inst, vehiculo, ruta) ? conPrioridad : ruta;
}

export function construirSolucion(inst: Instancia, agrupamiento: Agrupamiento): Solucion {
  return {
    rutas: agrupamiento.grupos.map((grupo, vehiculo) => ordenarGrupo(inst, vehiculo, grupo)),
    sinAsignar: [],
  };
}
