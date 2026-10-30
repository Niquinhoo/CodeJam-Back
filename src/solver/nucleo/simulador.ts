// Copia fiel de quickdrop/simulador.py (simulador oficial). Es la "verdad": todo costo que
// mostramos sale de acá, así coincide con lo que calcula el evaluador.
import { DEPOSITO, distancia } from "./modelo.ts";
import type { Dataset, Parada, Plan, Punto } from "./modelo.ts";

export type EstadoVisita = "ENTREGADO" | "RECARGA" | "REGRESO";

export interface Visita {
  vehiculo: string;
  viaje: number;
  parada: Parada;
  x: number;
  y: number;
  cuadras: number;
  llegada: number;
  salida: number;
  estado: EstadoVisita;
}

export interface Desglose {
  distancia: number;
  vehiculos: number;
  tiempo: number;
  fallas: number;
  premium: number;
  total: number;
}

export interface Metricas {
  pedidos: number;
  entregados: number;
  fallidos: number;
  distanciaTotal: number;
  vehiculosUsados: number;
  makespan: number;
  horaFin: number;
  premiumTotal: number;
  premiumEntregados: number;
  minutosPremium: number; // Σ minutos desde la salida hasta la entrega de cada premium
}

export interface Evaluacion {
  valido: boolean;
  errores: string[];
  visitas: Visita[];
  sinAsignar: number[];
  metricas: Metricas | null;
  costo: Desglose | null;
}

export function validarPlan(dataset: Dataset, plan: Plan): string[] {
  const errores: string[] = [];
  const vehiculos = new Map(dataset.vehiculos.map((v) => [v.id, v]));
  const pedidos = new Set(dataset.pedidos.map((p) => p.id));
  const vehiculosVistos = new Set<string>();
  const pedidosVistos = new Map<number, string>();

  plan.rutas.forEach((ruta, i) => {
    if (!vehiculos.has(ruta.vehiculo)) {
      errores.push(`Ruta ${i + 1}: el vehículo '${ruta.vehiculo}' no existe.`);
      return;
    }
    if (vehiculosVistos.has(ruta.vehiculo)) {
      errores.push(`El vehículo '${ruta.vehiculo}' aparece en más de una ruta.`);
      return;
    }
    vehiculosVistos.add(ruta.vehiculo);
    for (const parada of ruta.paradas) {
      if (parada === DEPOSITO) continue;
      if (!pedidos.has(parada)) {
        errores.push(`Vehículo ${ruta.vehiculo}: el pedido ${parada} no existe.`);
        continue;
      }
      const otro = pedidosVistos.get(parada);
      if (otro !== undefined) {
        errores.push(`El pedido ${parada} aparece más de una vez (vehículos ${otro} y ${ruta.vehiculo}).`);
        continue;
      }
      pedidosVistos.set(parada, ruta.vehiculo);
    }
  });
  return errores;
}

export function simularPlan(dataset: Dataset, plan: Plan): Evaluacion {
  const errores = validarPlan(dataset, plan);
  if (errores.length > 0) {
    return { valido: false, errores, visitas: [], sinAsignar: [], metricas: null, costo: null };
  }

  const { mundo } = dataset;
  const dep = mundo.deposito;
  const vehiculos = new Map(dataset.vehiculos.map((v) => [v.id, v]));
  const pedidos = new Map(dataset.pedidos.map((p) => [p.id, p]));
  const visitas: Visita[] = [];
  const asignados = new Set<number>();
  let distanciaTotal = 0;
  let finUltimo = mundo.horaSalida;
  let entregados = 0;
  let costoVehiculos = 0;
  let usados = 0;
  let premiumEntregados = 0;
  let minutosPremium = 0;

  for (const ruta of plan.rutas) {
    const v = vehiculos.get(ruta.vehiculo)!;
    if (!ruta.paradas.some((p) => p !== DEPOSITO)) continue; // sin pedidos: no se usa
    usados += 1;
    costoVehiculos += v.costoFijo;
    let t = mundo.horaSalida;
    let pos: Punto = dep;
    let viaje = 1;

    for (const parada of ruta.paradas) {
      if (parada === DEPOSITO) {
        const d = distancia(pos, dep);
        t += d * v.minPorCuadra;
        const llegada = t;
        t += mundo.tiempoCarga;
        visitas.push({ vehiculo: v.id, viaje, parada, x: dep.x, y: dep.y, cuadras: d, llegada, salida: t, estado: "RECARGA" });
        distanciaTotal += d;
        pos = dep;
        viaje += 1;
        continue;
      }
      const p = pedidos.get(parada)!;
      asignados.add(p.id);
      const d = distancia(pos, p);
      t += d * v.minPorCuadra;
      distanciaTotal += d;
      pos = p;
      const llegada = t;
      t += mundo.tiempoServicio;
      entregados += 1;
      if (p.premium) {
        premiumEntregados += 1;
        minutosPremium += llegada - mundo.horaSalida;
      }
      visitas.push({ vehiculo: v.id, viaje, parada: p.id, x: p.x, y: p.y, cuadras: d, llegada, salida: t, estado: "ENTREGADO" });
    }

    const d = distancia(pos, dep);
    t += d * v.minPorCuadra;
    distanciaTotal += d;
    visitas.push({ vehiculo: v.id, viaje, parada: DEPOSITO, x: dep.x, y: dep.y, cuadras: d, llegada: t, salida: t, estado: "REGRESO" });
    finUltimo = Math.max(finUltimo, t);
  }

  const sinAsignar = dataset.pedidos.filter((p) => !asignados.has(p.id)).map((p) => p.id);
  const makespan = finUltimo - mundo.horaSalida;
  const c = mundo.costos;
  const costo: Desglose = {
    distancia: distanciaTotal * c.porCuadra,
    vehiculos: costoVehiculos,
    tiempo: makespan * c.porMinutoTotal,
    fallas: sinAsignar.length * c.porFalla,
    premium: minutosPremium * (c.porMinutoPremium ?? 1),
    total: 0,
  };
  costo.total = costo.distancia + costo.vehiculos + costo.tiempo + costo.fallas + costo.premium;

  return {
    valido: true,
    errores: [],
    visitas,
    sinAsignar,
    metricas: {
      pedidos: dataset.pedidos.length,
      entregados,
      fallidos: sinAsignar.length,
      distanciaTotal,
      vehiculosUsados: usados,
      makespan,
      horaFin: finUltimo,
      premiumTotal: dataset.pedidos.filter((p) => p.premium).length,
      premiumEntregados,
      minutosPremium,
    },
    costo,
  };
}
