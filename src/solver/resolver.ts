// ORQUESTADOR: encadena las etapas y decide cuántos vehículos usar.
//
//   1 Lectura ─► para cada k = 1..vehículos disponibles:
//                  2 Agrupamiento (k-means con varias semillas + barrido con todos los cortes)
//                  3 Ruta inicial (vecino más cercano + 2-opt) → nos quedamos con el mejor arranque
//                  4 Búsqueda local
//                  5 Recocido simulado
//                  6 Pulido exacto
//             ─► elegimos el k de menor costo total ─► plan
//
// Con "hasta k vehículos" la optimización puede dejar alguno vacío: por eso informamos
// tanto k como los vehículos realmente usados.
import { crearAzar } from "./nucleo/azar.ts";
import { aPlan, costoSolucion, crearInstancia, planACsv, vehiculosUsados } from "./nucleo/instancia.ts";
import type { Instancia, Solucion } from "./nucleo/instancia.ts";
import { aHora } from "./nucleo/modelo.ts";
import type { Dataset, Parada, Plan, Punto } from "./nucleo/modelo.ts";
import { simularPlan } from "./nucleo/simulador.ts";
import type { Desglose, Evaluacion, Metricas } from "./nucleo/simulador.ts";
import { leerDataset } from "./etapa1-lectura/leerDataset.ts";
import type { Archivos, ResumenLectura } from "./etapa1-lectura/leerDataset.ts";
import { barridos } from "./etapa2-agrupamiento/barrido.ts";
import { kmeans } from "./etapa2-agrupamiento/kmeans.ts";
import type { Agrupamiento, MetodoAgrupamiento } from "./etapa2-agrupamiento/tipos.ts";
import { construirSolucion } from "./etapa3-ruta-inicial/rutaInicial.ts";
import { busquedaLocal } from "./etapa4-busqueda-local/busquedaLocal.ts";
import type { ConteoMovimientos } from "./etapa4-busqueda-local/busquedaLocal.ts";
import { recocidoSimulado } from "./etapa5-recocido/recocidoSimulado.ts";
import type { PuntoConvergencia, ResultadoRecocido } from "./etapa5-recocido/recocidoSimulado.ts";
import { MAX_PEDIDOS_EXACTO, pulir } from "./etapa6-pulido/pulidoExacto.ts";
import type { ResultadoPulido } from "./etapa6-pulido/pulidoExacto.ts";

export interface OpcionesResolver {
  semilla: number;
  iteraciones: number; // del recocido, para cada k
  semillasKmeans: number;
}

export const OPCIONES_POR_DEFECTO: OpcionesResolver = { semilla: 2026, iteraciones: 60_000, semillasKmeans: 10 };
export const MAX_ITERACIONES = 2_000_000;

export interface Instantanea {
  ordenada: boolean; // false en el agrupamiento: los grupos todavía no tienen orden
  rutas: { vehiculo: string; paradas: Parada[] }[];
  sinAsignar: number[];
  costo: Desglose | null;
  metricas: Metricas | null;
  centros?: Punto[];
}

export interface Etapa {
  numero: number;
  clave: "lectura" | "agrupamiento" | "ruta-inicial" | "busqueda-local" | "recocido" | "pulido";
  titulo: string;
  descripcion: string;
  instantanea: Instantanea | null;
  detalles: Record<string, string | number>;
  ms: number;
}

export interface ResultadoPorK {
  k: number;
  costoKmeans: number;
  costoBarrido: number;
  metodo: MetodoAgrupamiento;
  construccion: number;
  busquedaLocal: number;
  recocido: number;
  final: number;
  vehiculosUsados: number;
  elegido: boolean;
}

export interface Informe {
  dataset: Dataset;
  lectura: ResumenLectura | null;
  opciones: OpcionesResolver;
  etapas: Etapa[];
  porK: ResultadoPorK[];
  convergencia: PuntoConvergencia[];
  plan: Plan;
  planCsv: string;
  evaluacion: Evaluacion;
  ms: number;
}

interface CorridaK {
  k: number;
  agrupamiento: Agrupamiento;
  agrupamientosProbados: number;
  iniciosRefinados: number;
  costoPorMetodo: Record<MetodoAgrupamiento, number>;
  inicial: Solucion;
  local: { sol: Solucion; movimientos: ConteoMovimientos };
  recocido: ResultadoRecocido;
  pulido: ResultadoPulido;
  costoFinal: number;
}

interface CandidatoInicial {
  agrupamiento: Agrupamiento;
  sol: Solucion;
  costo: number;
}

const MAX_INICIOS_REFINADOS = 3;
const ahora = () => performance.now();

export function normalizarOpciones(o: Partial<OpcionesResolver> = {}): OpcionesResolver {
  const entero = (v: unknown, defecto: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : defecto;
  return {
    semilla: entero(o.semilla, OPCIONES_POR_DEFECTO.semilla, 0, 2 ** 31),
    iteraciones: entero(o.iteraciones, OPCIONES_POR_DEFECTO.iteraciones, 0, MAX_ITERACIONES),
    semillasKmeans: entero(o.semillasKmeans, OPCIONES_POR_DEFECTO.semillasKmeans, 1, 50),
  };
}

export function resolverDesdeArchivos(archivos: Archivos, opciones?: Partial<OpcionesResolver>): Informe {
  const inicio = ahora();
  const { dataset, resumen } = leerDataset(archivos);
  const msLectura = ahora() - inicio;
  return resolver(dataset, opciones, resumen, msLectura);
}

export function resolver(dataset: Dataset, opcionesParciales?: Partial<OpcionesResolver>, lectura: ResumenLectura | null = null, msLectura = 0): Informe {
  const inicio = ahora();
  const opciones = normalizarOpciones(opcionesParciales);
  const inst = crearInstancia(dataset);
  const ms = { agrupamiento: 0, ruta: 0, local: 0, recocido: 0, pulido: 0 };

  const corridas: CorridaK[] = [];
  for (let k = 1; k <= dataset.vehiculos.length; k++) {
    // Misma semilla derivada para cada k: cambiar un k no altera los demás.
    corridas.push(resolverConK(inst, k, opciones, crearAzar(opciones.semilla * 1000 + k), ms));
  }

  const elegida = corridas.reduce((mejor, c) =>
    c.costoFinal < mejor.costoFinal - 1e-9 ||
    (Math.abs(c.costoFinal - mejor.costoFinal) <= 1e-9 && vehiculosUsados(c.pulido.sol) < vehiculosUsados(mejor.pulido.sol))
      ? c
      : mejor,
  );

  const plan = aPlan(inst, elegida.pulido.sol);
  const evaluacion = simularPlan(dataset, plan);
  if (!evaluacion.costo || Math.abs(evaluacion.costo.total - elegida.costoFinal) > 1e-6) {
    throw new Error("El costo interno no coincide con el simulador");
  }

  return {
    dataset,
    lectura,
    opciones,
    etapas: describirEtapas(inst, elegida, corridas.length, lectura, { ...ms, lectura: msLectura }),
    porK: corridas.map((c) => ({
      k: c.k,
      costoKmeans: c.costoPorMetodo.kmeans,
      costoBarrido: c.costoPorMetodo.barrido,
      metodo: c.agrupamiento.metodo,
      construccion: costoSolucion(inst, c.inicial),
      busquedaLocal: costoSolucion(inst, c.local.sol),
      recocido: costoSolucion(inst, c.recocido.sol),
      final: c.costoFinal,
      vehiculosUsados: vehiculosUsados(c.pulido.sol),
      elegido: c === elegida,
    })),
    convergencia: elegida.recocido.historial,
    plan,
    planCsv: planACsv(plan),
    evaluacion,
    ms: msLectura + ahora() - inicio,
  };
}

function resolverConK(inst: Instancia, k: number, opciones: OpcionesResolver, azar: () => number, ms: Record<string, number>): CorridaK {
  let t = ahora();
  const agrupamientos: Agrupamiento[] = [];
  for (let s = 0; s < opciones.semillasKmeans; s++) agrupamientos.push(kmeans(inst, k, azar));
  agrupamientos.push(...barridos(inst, k));
  ms.agrupamiento += ahora() - t;

  t = ahora();
  const costoPorMetodo: Record<MetodoAgrupamiento, number> = { kmeans: Infinity, barrido: Infinity };
  const candidatos: CandidatoInicial[] = [];
  for (const agrupamiento of agrupamientos) {
    const sol = construirSolucion(inst, agrupamiento);
    const costo = costoSolucion(inst, sol);
    costoPorMetodo[agrupamiento.metodo] = Math.min(costoPorMetodo[agrupamiento.metodo], costo);
    candidatos.push({ agrupamiento, sol, costo });
  }
  ms.ruta += ahora() - t;

  const candidatosOrdenados = [...candidatos].sort((a, b) => a.costo - b.costo);
  const inicios: CandidatoInicial[] = [];
  const firmas = new Set<string>();
  const agregarInicio = (candidato: CandidatoInicial | undefined) => {
    if (!candidato) return;
    const firma = candidato.agrupamiento.grupos
      .map((grupo) => [...grupo].sort((a, b) => a - b).join(","))
      .sort()
      .join("|");
    if (firmas.has(firma)) return;
    firmas.add(firma);
    inicios.push(candidato);
  };

  // Reservamos lugar para el mejor arranque de cada método para no depender de uno solo.
  agregarInicio(candidatosOrdenados[0]);
  agregarInicio(candidatosOrdenados.find((c) => c.agrupamiento.metodo === "kmeans"));
  agregarInicio(candidatosOrdenados.find((c) => c.agrupamiento.metodo === "barrido"));
  for (const candidato of candidatosOrdenados) {
    if (inicios.length >= MAX_INICIOS_REFINADOS) break;
    agregarInicio(candidato);
  }

  t = ahora();
  let mejorRefinado: { candidato: CandidatoInicial; local: ReturnType<typeof busquedaLocal>; costo: number } | null = null;
  let localBase: ReturnType<typeof busquedaLocal> | null = null;
  for (const candidato of inicios) {
    const local = busquedaLocal(inst, candidato.sol);
    const costo = costoSolucion(inst, local.sol);
    if (candidato === candidatosOrdenados[0]) localBase = local;
    if (!mejorRefinado || costo < mejorRefinado.costo) mejorRefinado = { candidato, local, costo };
  }
  ms.local += ahora() - t;
  const elegido = mejorRefinado!;
  const base = localBase!;

  t = ahora();
  let recocido = recocidoSimulado(inst, base.sol, azar, opciones.iteraciones);
  if (elegido.costo < costoSolucion(inst, base.sol) - 1e-9) {
    const alternativo = recocidoSimulado(inst, elegido.local.sol, azar, opciones.iteraciones);
    if (costoSolucion(inst, alternativo.sol) < costoSolucion(inst, recocido.sol) - 1e-9) recocido = alternativo;
  }
  ms.recocido += ahora() - t;

  t = ahora();
  const pulido = pulir(inst, recocido.sol);
  ms.pulido += ahora() - t;

  return {
    k,
    agrupamiento: elegido.candidato.agrupamiento,
    agrupamientosProbados: agrupamientos.length,
    iniciosRefinados: inicios.length,
    costoPorMetodo,
    inicial: elegido.candidato.sol,
    local: elegido.local,
    recocido,
    pulido,
    costoFinal: costoSolucion(inst, pulido.sol),
  };
}

function instantanea(inst: Instancia, sol: Solucion): Instantanea {
  const plan = aPlan(inst, sol);
  const ev = simularPlan(inst.dataset, plan);
  return {
    ordenada: true,
    rutas: plan.rutas,
    sinAsignar: sol.sinAsignar.map((n) => inst.dataset.pedidos[n - 1].id),
    costo: ev.costo,
    metricas: ev.metricas,
  };
}

function describirEtapas(
  inst: Instancia,
  c: CorridaK,
  ksProbados: number,
  lectura: ResumenLectura | null,
  ms: Record<string, number>,
): Etapa[] {
  const { mundo, pedidos, vehiculos } = inst.dataset;
  const ids = (nodos: number[]) => nodos.map((n) => pedidos[n - 1].id);
  const costo = (sol: Solucion) => costoSolucion(inst, sol);
  const mov = c.local.movimientos;
  const movPulido = c.pulido.movimientos;
  const redondear = (x: number) => Math.round(x);

  return [
    {
      numero: 1,
      clave: "lectura",
      titulo: "Lectura del dataset",
      descripcion: `Leímos ${pedidos.length} pedidos y ${vehiculos.length} vehículos. Todo sale del archivo mundo: el depósito está en (${mundo.deposito.x}, ${mundo.deposito.y}) y los vehículos salen a las ${aHora(mundo.horaSalida)}.`,
      instantanea: null,
      detalles: {
        Pedidos: pedidos.length,
        Vehículos: vehiculos.length,
        Depósito: `(${mundo.deposito.x}, ${mundo.deposito.y})`,
        Grilla: `${mundo.ancho} × ${mundo.alto}`,
        "Costo por cuadra": mundo.costos.porCuadra,
        "Costo por vehículo": mundo.costos.porVehiculo,
        "Costo por minuto": mundo.costos.porMinutoTotal,
        "Costo por falla": mundo.costos.porFalla,
        ...(lectura ? { Formatos: `mundo ${lectura.formatos.mundo}, pedidos ${lectura.formatos.pedidos}, vehículos ${lectura.formatos.vehiculos}` } : {}),
      },
      ms: redondear(ms.lectura),
    },
    {
      numero: 2,
      clave: "agrupamiento",
      titulo: "Agrupamiento",
      descripcion: `Para cada cantidad de vehículos (1 a ${ksProbados}) separamos los pedidos en grupos con k-means y con barrido angular. Acá se ve el agrupamiento que mejor arrancó para k = ${c.k} (${c.agrupamiento.metodo === "kmeans" ? "k-means" : "barrido"}).`,
      instantanea: {
        ordenada: false,
        rutas: c.agrupamiento.grupos.map((g, s) => ({ vehiculo: vehiculos[s].id, paradas: ids(g) })).filter((r) => r.paradas.length > 0),
        sinAsignar: [],
        costo: null,
        metricas: null,
        centros: c.agrupamiento.centros,
      },
      detalles: {
        "Agrupamientos probados (este k)": c.agrupamientosProbados,
        "Método ganador": c.agrupamiento.metodo === "kmeans" ? "k-means" : "barrido",
        "Mejor arranque con k-means": redondear(c.costoPorMetodo.kmeans),
        "Mejor arranque con barrido": redondear(c.costoPorMetodo.barrido),
      },
      ms: redondear(ms.agrupamiento),
    },
    {
      numero: 3,
      clave: "ruta-inicial",
      titulo: "Ruta inicial",
      descripcion: "Cada grupo se ordena con vecino más cercano (ir siempre al pedido más próximo) y se corrigen los cruces con 2-opt. Es la primera solución completa con costo.",
      instantanea: instantanea(inst, c.inicial),
      detalles: { Costo: redondear(costo(c.inicial)) },
      ms: redondear(ms.ruta),
    },
    {
      numero: 4,
      clave: "busqueda-local",
      titulo: "Búsqueda local",
      descripcion: `Probamos cambios chicos sobre ${c.iniciosRefinados} arranques distintos y nos quedamos con los que bajan el costo total: pasar pedidos entre vehículos balancea las rutas y corrige lo que el agrupamiento no veía.`,
      instantanea: instantanea(inst, c.local.sol),
      detalles: {
        Costo: redondear(costo(c.local.sol)),
        "Mejora vs. ruta inicial": redondear(costo(c.inicial) - costo(c.local.sol)),
        "Inicios refinados": c.iniciosRefinados,
        "2-opt": mov.dosOpt,
        "Or-opt": mov.orOpt,
        "Pedidos reubicados": mov.reubicar,
        Intercambios: mov.intercambiar,
        "Dejados sin asignar": mov.aSinAsignar,
      },
      ms: redondear(ms.local),
    },
    {
      numero: 5,
      clave: "recocido",
      titulo: "Recocido simulado",
      descripcion: "Cambios al azar que a veces se aceptan aunque empeoren, para salir del mínimo local. La temperatura baja de a poco y guardamos la mejor solución vista.",
      instantanea: instantanea(inst, c.recocido.sol),
      detalles: {
        Costo: redondear(costo(c.recocido.sol)),
        "Mejora vs. búsqueda local": redondear(costo(c.local.sol) - costo(c.recocido.sol)),
        Iteraciones: c.recocido.iteraciones,
        "Cambios aceptados": c.recocido.aceptados,
        "Empeoramientos aceptados": c.recocido.empeorasAceptadas,
        "Veces que mejoró el récord": c.recocido.mejorasDelMejor,
        "Temperatura inicial": Math.round(c.recocido.temperaturaInicial * 10) / 10,
      },
      ms: redondear(ms.recocido),
    },
    {
      numero: 6,
      clave: "pulido",
      titulo: "Pulido exacto",
      descripcion: `Una última búsqueda local y, para cada ruta de hasta ${MAX_PEDIDOS_EXACTO} pedidos, el orden óptimo exacto con programación dinámica (Held-Karp).`,
      instantanea: instantanea(inst, c.pulido.sol),
      detalles: {
        Costo: redondear(c.costoFinal),
        "Mejora vs. recocido": redondear(costo(c.recocido.sol) - c.costoFinal),
        "Rutas resueltas de forma exacta": c.pulido.rutasExactas,
        "Rutas que mejoraron": c.pulido.rutasMejoradas,
        "Movimientos de búsqueda local": Object.values(movPulido).reduce((a, b) => a + b, 0),
      },
      ms: redondear(ms.pulido),
    },
  ];
}
