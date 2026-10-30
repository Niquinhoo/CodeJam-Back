import type { Punto } from "../nucleo/modelo.ts";

export type MetodoAgrupamiento = "kmeans" | "barrido" | "premium-dedicado";

export const NOMBRE_METODO: Record<MetodoAgrupamiento, string> = {
  kmeans: "k-means",
  barrido: "barrido",
  "premium-dedicado": "vehículo dedicado a premium",
};

/** k grupos de nodos (sin orden todavía). grupos[g] = pedidos que llevaría el vehículo g. */
export interface Agrupamiento {
  metodo: MetodoAgrupamiento;
  grupos: number[][];
  centros?: Punto[]; // solo k-means
  inicioBarrido?: number; // solo barrido: desde qué posición del orden angular empezó el corte
}
