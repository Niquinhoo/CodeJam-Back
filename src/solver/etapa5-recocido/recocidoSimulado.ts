// ETAPA 5 · RECOCIDO SIMULADO (simulated annealing)
// La búsqueda local se traba en un "mínimo local": ningún cambio chico mejora, aunque exista
// una solución mejor más lejos. El recocido aplica cambios al azar y a veces acepta uno que
// EMPEORA, con probabilidad e^(−Δ/T). La temperatura T arranca alta (explora mucho) y baja de
// a poco (se vuelve exigente). Siempre guardamos la mejor solución vista.
// El largo se mide en iteraciones y no en segundos: en Cloudflare Workers el reloj no avanza
// durante un cálculo, y además así el resultado es reproducible.
import { enteroAzar } from "../nucleo/azar.ts";
import type { Azar } from "../nucleo/azar.ts";
import { aplicar, costoSi, crearEstado, insertar, mejorInsercion, SIN_ASIGNAR } from "../nucleo/evaluador.ts";
import type { Cambio, Estado } from "../nucleo/evaluador.ts";
import { clonar } from "../nucleo/instancia.ts";
import type { Instancia, Solucion } from "../nucleo/instancia.ts";

export interface PuntoConvergencia {
  iteracion: number;
  actual: number;
  mejor: number;
  temperatura: number;
}

export interface ResultadoRecocido {
  sol: Solucion;
  iteraciones: number;
  aceptados: number;
  empeorasAceptadas: number;
  mejorasDelMejor: number;
  temperaturaInicial: number;
  historial: PuntoConvergencia[];
}

const EPS = 1e-9;

/** Un cambio al azar sobre el estado actual (o null si no aplica, p. ej. ruta muy corta). */
function movimientoAzar(inst: Instancia, est: Estado, azar: Azar): Cambio[] | null {
  const { rutas, sinAsignar } = est.sol;
  const k = rutas.length;
  const r = azar();

  if (r < 0.4) {
    // Reubicar: un pedido cualquiera (asignado o no) va a otro vehículo o a "sin asignar".
    const total = rutas.reduce((a, ruta) => a + ruta.length, 0) + sinAsignar.length;
    if (total === 0) return null;
    let elegido = enteroAzar(azar, total);
    let a = SIN_ASIGNAR;
    for (let s = 0; s < k; s++) {
      if (elegido < rutas[s].length) {
        a = s;
        break;
      }
      elegido -= rutas[s].length;
    }
    const origen = a === SIN_ASIGNAR ? sinAsignar : rutas[a];
    const nodo = origen[elegido];
    const b = azar() < 0.05 ? SIN_ASIGNAR : enteroAzar(azar, k);
    if (b === a) return null;
    const resto = origen.filter((_, i) => i !== elegido);
    if (b === SIN_ASIGNAR) return [{ ruta: a, nodos: resto }, { ruta: b, nodos: [...sinAsignar, nodo] }];
    const destino = rutas[b];
    const pos = azar() < 0.7 ? mejorInsercion(inst, destino, nodo) : enteroAzar(azar, destino.length + 1);
    return [{ ruta: a, nodos: resto }, { ruta: b, nodos: insertar(destino, pos, [nodo]) }];
  }

  if (r < 0.6) {
    // Intercambiar dos pedidos de vehículos distintos.
    const a = enteroAzar(azar, k);
    const b = enteroAzar(azar, k);
    if (a === b || rutas[a].length === 0 || rutas[b].length === 0) return null;
    const i = enteroAzar(azar, rutas[a].length);
    const j = enteroAzar(azar, rutas[b].length);
    const nuevaA = [...rutas[a]];
    const nuevaB = [...rutas[b]];
    [nuevaA[i], nuevaB[j]] = [rutas[b][j], rutas[a][i]];
    return [{ ruta: a, nodos: nuevaA }, { ruta: b, nodos: nuevaB }];
  }

  const s = enteroAzar(azar, k);
  const ruta = rutas[s];
  if (ruta.length < 3) return null;

  if (r < 0.8) {
    // 2-opt al azar: invertir un tramo.
    const i = enteroAzar(azar, ruta.length - 1);
    const j = i + 1 + enteroAzar(azar, ruta.length - i - 1);
    return [{ ruta: s, nodos: [...ruta.slice(0, i), ...ruta.slice(i, j + 1).reverse(), ...ruta.slice(j + 1)] }];
  }

  // Or-opt al azar: mover un tramo de 1 a 3 pedidos dentro de la misma ruta.
  const largo = 1 + enteroAzar(azar, Math.min(3, ruta.length - 1));
  const i = enteroAzar(azar, ruta.length - largo + 1);
  const resto = [...ruta.slice(0, i), ...ruta.slice(i + largo)];
  return [{ ruta: s, nodos: insertar(resto, enteroAzar(azar, resto.length + 1), ruta.slice(i, i + largo)) }];
}

/** Temperatura inicial: la que acepta la mitad de los empeoramientos típicos. */
function calibrarTemperatura(inst: Instancia, est: Estado, azar: Azar): number {
  const deltas: number[] = [];
  for (let i = 0; i < 300 && deltas.length < 100; i++) {
    const cambios = movimientoAzar(inst, est, azar);
    if (!cambios) continue;
    const delta = costoSi(inst, est, cambios) - est.costo;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return 1;
  return deltas.reduce((a, b) => a + b, 0) / deltas.length / Math.LN2;
}

export function recocidoSimulado(inst: Instancia, inicial: Solucion, azar: Azar, iteraciones: number): ResultadoRecocido {
  const est = crearEstado(inst, clonar(inicial));
  let mejor = clonar(est.sol);
  let mejorCosto = est.costo;
  const t0 = calibrarTemperatura(inst, est, azar);
  const tFinal = Math.max(t0 * 1e-3, 1e-3);
  const historial: PuntoConvergencia[] = [{ iteracion: 0, actual: est.costo, mejor: mejorCosto, temperatura: t0 }];
  const cadaCuanto = Math.max(1, Math.floor(iteraciones / 150));
  let aceptados = 0;
  let empeorasAceptadas = 0;
  let mejorasDelMejor = 0;

  for (let it = 1; it <= iteraciones; it++) {
    const temperatura = t0 * (tFinal / t0) ** (it / iteraciones); // enfriamiento geométrico
    const cambios = movimientoAzar(inst, est, azar);
    if (cambios) {
      const costo = costoSi(inst, est, cambios);
      const delta = costo - est.costo;
      if (delta <= 0 || azar() < Math.exp(-delta / temperatura)) {
        aplicar(inst, est, cambios, costo);
        aceptados++;
        if (delta > EPS) empeorasAceptadas++;
        if (est.costo < mejorCosto - EPS) {
          mejor = clonar(est.sol);
          mejorCosto = est.costo;
          mejorasDelMejor++;
        }
      }
    }
    if (it % cadaCuanto === 0 || it === iteraciones) historial.push({ iteracion: it, actual: est.costo, mejor: mejorCosto, temperatura });
  }

  return { sol: mejor, iteraciones, aceptados, empeorasAceptadas, mejorasDelMejor, temperaturaInicial: t0, historial };
}
