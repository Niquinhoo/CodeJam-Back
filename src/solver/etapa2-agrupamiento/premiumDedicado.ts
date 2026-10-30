// ETAPA 2 · AGRUPAMIENTO (método C, Evento 1: vehículo dedicado a premium)
// Un vehículo lleva SOLO los pedidos premium, así ninguno espera detrás de pedidos comunes;
// los demás pedidos se reparten entre los k − 1 vehículos restantes con k-means y barrido.
// Solo tiene sentido si hay premium y al menos 2 vehículos. Si conviene o no, lo decide el
// costo real en la etapa 3, igual que con los otros métodos.
import type { Azar } from "../nucleo/azar.ts";
import type { Instancia } from "../nucleo/instancia.ts";
import { barridos } from "./barrido.ts";
import { kmeans, todosLosNodos } from "./kmeans.ts";
import type { Agrupamiento } from "./tipos.ts";

export function premiumDedicado(inst: Instancia, k: number, azar: Azar, semillasKmeans: number): Agrupamiento[] {
  const nodos = todosLosNodos(inst);
  const premium = nodos.filter((n) => inst.premium[n]);
  const comunes = nodos.filter((n) => !inst.premium[n]);
  if (!inst.hayPremium || k < 2 || comunes.length === 0) return [];

  const restos: Agrupamiento[] = [];
  for (let s = 0; s < semillasKmeans; s++) restos.push(kmeans(inst, k - 1, azar, comunes));
  restos.push(...barridos(inst, k - 1, comunes));
  return restos.map((resto) => ({ metodo: "premium-dedicado", grupos: [premium, ...resto.grupos] }));
}
