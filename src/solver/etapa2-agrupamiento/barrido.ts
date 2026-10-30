// ETAPA 2 · AGRUPAMIENTO (método B: barrido angular, "sweep")
// Ordena los pedidos por el ángulo que forman con el depósito y los corta en k porciones
// seguidas, como una pizza con el depósito en el centro. A diferencia de k-means, sí tiene en
// cuenta dónde está el depósito. Probamos todos los puntos de corte posibles.
import type { Instancia } from "../nucleo/instancia.ts";
import type { Agrupamiento } from "./tipos.ts";

export function barridos(inst: Instancia, k: number): Agrupamiento[] {
  const { deposito } = inst.dataset.mundo;
  const ordenados = inst.dataset.pedidos
    .map((p, i) => ({ nodo: i + 1, angulo: Math.atan2(p.y - deposito.y, p.x - deposito.x), radio: Math.abs(p.x - deposito.x) + Math.abs(p.y - deposito.y) }))
    .sort((a, b) => a.angulo - b.angulo || a.radio - b.radio)
    .map((p) => p.nodo);

  const n = ordenados.length;
  const resultado: Agrupamiento[] = [];
  const paso = Math.max(1, Math.floor(n / 60)); // con datasets grandes no probamos todos los inicios
  for (let inicio = 0; inicio < Math.max(n, 1); inicio += paso) {
    const rotados = [...ordenados.slice(inicio), ...ordenados.slice(0, inicio)];
    const grupos: number[][] = [];
    for (let g = 0; g < k; g++) {
      // Porciones de tamaño parejo: el grupo g se queda con los nodos [desde, hasta).
      const desde = Math.round((g * n) / k);
      const hasta = Math.round(((g + 1) * n) / k);
      grupos.push(rotados.slice(desde, hasta));
    }
    resultado.push({ metodo: "barrido", grupos, inicioBarrido: inicio });
  }
  return resultado;
}
