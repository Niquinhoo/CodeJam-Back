// ETAPA 4 · BÚSQUEDA LOCAL
// Prueba cambios chicos sobre la solución y se queda con cualquiera que baje el COSTO TOTAL
// (distancia + vehículos + makespan + fallas), hasta que ningún cambio mejora:
//   · 2-opt        invierte un tramo dentro de una ruta
//   · or-opt       mueve 1 a 3 pedidos seguidos a otra posición de la misma ruta
//   · reubicar     pasa un pedido a otro vehículo (en su mejor posición). Si deja un vehículo
//                  vacío, se ahorra su costo fijo; si lo pasa a "sin asignar", acepta pagar
//                  una falla porque entregarlo salía más caro.
//   · intercambiar cambia dos pedidos de vehículos distintos
// Estos movimientos corrigen los defectos de la etapa 2: grupos desparejos y depósito ignorado.
// Con premium (Evento 1) el costo incluye la demora de cada premium, así que los mismos
// movimientos también adelantan premium dentro de su ruta o los pasan a un vehículo que llega antes.
import { aplicar, costoSi, crearEstado, insertar, mejorInsercionCosto, SIN_ASIGNAR } from "../nucleo/evaluador.ts";
import type { Cambio, Estado } from "../nucleo/evaluador.ts";
import { clonar, distanciaRuta } from "../nucleo/instancia.ts";
import type { Instancia, Solucion } from "../nucleo/instancia.ts";
import { dosOpt } from "../etapa3-ruta-inicial/rutaInicial.ts";

export interface ConteoMovimientos {
  dosOpt: number;
  orOpt: number;
  reubicar: number;
  intercambiar: number;
  aSinAsignar: number;
  desdeSinAsignar: number;
}

export function conteoVacio(): ConteoMovimientos {
  return { dosOpt: 0, orOpt: 0, reubicar: 0, intercambiar: 0, aSinAsignar: 0, desdeSinAsignar: 0 };
}

const EPS = 1e-9;

export function busquedaLocal(inst: Instancia, inicial: Solucion): { sol: Solucion; movimientos: ConteoMovimientos } {
  const est = crearEstado(inst, clonar(inicial));
  const movimientos = conteoVacio();

  const intentar = (cambios: Cambio[], clave: keyof ConteoMovimientos): boolean => {
    const costo = costoSi(inst, est, cambios);
    if (costo >= est.costo - EPS) return false;
    aplicar(inst, est, cambios, costo);
    movimientos[clave]++;
    return true;
  };

  // Cada vuelta aplica la primera mejora que encuentra y vuelve a empezar.
  while (mejorarDentroDeRutas(inst, est, intentar) || reubicar(inst, est, intentar) || intercambiar(est, intentar)) {
    // seguir mientras algo mejore
  }
  return { sol: est.sol, movimientos };
}

type Intentar = (cambios: Cambio[], clave: keyof ConteoMovimientos) => boolean;

function mejorarDentroDeRutas(inst: Instancia, est: Estado, intentar: Intentar): boolean {
  for (let s = 0; s < est.sol.rutas.length; s++) {
    const ruta = est.sol.rutas[s];
    if (ruta.length < 2) continue;

    const copia = [...ruta];
    if (dosOpt(inst, copia) > 0 && intentar([{ ruta: s, nodos: copia }], "dosOpt")) return true;

    for (let largo = 1; largo <= 3 && largo < ruta.length; largo++) {
      for (let i = 0; i + largo <= ruta.length; i++) {
        const tramo = ruta.slice(i, i + largo);
        const resto = [...ruta.slice(0, i), ...ruta.slice(i + largo)];
        for (let p = 0; p <= resto.length; p++) {
          if (p === i) continue;
          const nueva = insertar(resto, p, tramo);
          // Sin premium solo puede convenir si acorta la ruta; con premium, adelantar a un
          // premium puede valer más que las cuadras extra, así que decide el costo total.
          const candidato = inst.hayPremium || distanciaRuta(inst, nueva) < est.medidas[s].cuadras;
          if (candidato && intentar([{ ruta: s, nodos: nueva }], "orOpt")) return true;
        }
      }
    }
  }
  return false;
}

function reubicar(inst: Instancia, est: Estado, intentar: Intentar): boolean {
  const k = est.sol.rutas.length;
  const origenes = [...Array.from({ length: k }, (_, s) => s), SIN_ASIGNAR];
  const nodosDe = (r: number) => (r === SIN_ASIGNAR ? est.sol.sinAsignar : est.sol.rutas[r]);

  for (const a of origenes) {
    const origen = nodosDe(a);
    for (let i = 0; i < origen.length; i++) {
      const nodo = origen[i];
      const resto = [...origen.slice(0, i), ...origen.slice(i + 1)];
      let probamosVacio = false;
      for (const b of origenes) {
        if (b === a) continue;
        const destino = nodosDe(b);
        if (b !== SIN_ASIGNAR && destino.length === 0) {
          if (probamosVacio) continue; // todos los vehículos vacíos son equivalentes
          probamosVacio = true;
        }
        const nuevoDestino = b === SIN_ASIGNAR ? [...destino, nodo] : insertar(destino, mejorInsercionCosto(inst, b, destino, nodo), [nodo]);
        const clave = a === SIN_ASIGNAR ? "desdeSinAsignar" : b === SIN_ASIGNAR ? "aSinAsignar" : "reubicar";
        if (intentar([{ ruta: a, nodos: resto }, { ruta: b, nodos: nuevoDestino }], clave)) return true;
      }
    }
  }
  return false;
}

function intercambiar(est: Estado, intentar: Intentar): boolean {
  const rutas = est.sol.rutas;
  for (let a = 0; a < rutas.length; a++) {
    for (let b = a + 1; b < rutas.length; b++) {
      for (let i = 0; i < rutas[a].length; i++) {
        for (let j = 0; j < rutas[b].length; j++) {
          const nuevaA = [...rutas[a]];
          const nuevaB = [...rutas[b]];
          [nuevaA[i], nuevaB[j]] = [rutas[b][j], rutas[a][i]];
          if (intentar([{ ruta: a, nodos: nuevaA }, { ruta: b, nodos: nuevaB }], "intercambiar")) return true;
        }
      }
    }
  }
  return false;
}
