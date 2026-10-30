import type { Punto } from "../nucleo/modelo.ts";

export type MetodoAgrupamiento = "kmeans" | "barrido";

/** k grupos de nodos (sin orden todavía). grupos[g] = pedidos que llevaría el vehículo g. */
export interface Agrupamiento {
  metodo: MetodoAgrupamiento;
  grupos: number[][];
  centros?: Punto[]; // solo k-means
  inicioBarrido?: number; // solo barrido: desde qué posición del orden angular empezó el corte
}
