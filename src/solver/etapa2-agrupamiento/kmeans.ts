// ETAPA 2 · AGRUPAMIENTO (método A: k-means)
// Separa los pedidos en k grupos por cercanía entre ellos. Arranca con k-means++ (centros
// iniciales separados) y repite: asignar cada pedido al centro más cercano y mover cada
// centro al promedio de su grupo, hasta que nada cambia.
// Limitación conocida: k-means no sabe dónde está el depósito; las etapas 4 y 5 lo corrigen.
import { enteroAzar } from "../nucleo/azar.ts";
import type { Azar } from "../nucleo/azar.ts";
import type { Instancia } from "../nucleo/instancia.ts";
import type { Punto } from "../nucleo/modelo.ts";
import type { Agrupamiento } from "./tipos.ts";

export function todosLosNodos(inst: Instancia): number[] {
  return Array.from({ length: inst.n }, (_, i) => i + 1); // nodo = índice de pedido + 1
}

function dist2(a: Punto, b: Punto): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function centrosIniciales(puntos: Punto[], k: number, azar: Azar): Punto[] {
  const centros: Punto[] = [{ ...puntos[enteroAzar(azar, puntos.length)] }];
  while (centros.length < k) {
    // Cada punto tiene probabilidad proporcional a su distancia² al centro más cercano.
    const pesos = puntos.map((p) => Math.min(...centros.map((c) => dist2(p, c))));
    const total = pesos.reduce((a, b) => a + b, 0);
    if (total === 0) {
      centros.push({ ...puntos[enteroAzar(azar, puntos.length)] });
      continue;
    }
    let r = azar() * total;
    let i = 0;
    while (r >= pesos[i] && i < puntos.length - 1) r -= pesos[i++];
    centros.push({ ...puntos[i] });
  }
  return centros;
}

/** Agrupa los nodos indicados (por defecto, todos los pedidos) en k grupos. */
export function kmeans(inst: Instancia, k: number, azar: Azar, nodos = todosLosNodos(inst), maxIteraciones = 100): Agrupamiento {
  const puntos: Punto[] = nodos.map((nodo) => inst.dataset.pedidos[nodo - 1]);
  if (puntos.length === 0) return { metodo: "kmeans", grupos: Array.from({ length: k }, () => []), centros: [] };

  const centros = centrosIniciales(puntos, Math.min(k, puntos.length), azar);
  const asignacion = new Array<number>(puntos.length).fill(-1);

  for (let iter = 0; iter < maxIteraciones; iter++) {
    let cambio = false;
    puntos.forEach((p, i) => {
      let mejor = 0;
      for (let c = 1; c < centros.length; c++) if (dist2(p, centros[c]) < dist2(p, centros[mejor])) mejor = c;
      if (asignacion[i] !== mejor) {
        asignacion[i] = mejor;
        cambio = true;
      }
    });
    if (!cambio) break;

    centros.forEach((centro, c) => {
      const miembros = puntos.filter((_, i) => asignacion[i] === c);
      if (miembros.length === 0) {
        // Grupo vacío: lo reubicamos en el pedido más alejado de su centro actual.
        let lejos = 0;
        puntos.forEach((p, i) => {
          if (dist2(p, centros[asignacion[i]]) > dist2(puntos[lejos], centros[asignacion[lejos]])) lejos = i;
        });
        centro.x = puntos[lejos].x;
        centro.y = puntos[lejos].y;
        return;
      }
      centro.x = miembros.reduce((a, p) => a + p.x, 0) / miembros.length;
      centro.y = miembros.reduce((a, p) => a + p.y, 0) / miembros.length;
    });
  }

  const grupos: number[][] = Array.from({ length: k }, () => []);
  asignacion.forEach((c, i) => grupos[c].push(nodos[i]));
  return { metodo: "kmeans", grupos, centros: centros.map((c) => ({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 })) };
}
