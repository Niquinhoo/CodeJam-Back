// Entidades del dominio QuickDrop, con los mismos nombres que ESPECIFICACION.md.

export const DEPOSITO = "DEPOSITO";

export type Parada = number | typeof DEPOSITO;

export interface Punto {
  x: number;
  y: number;
}

export interface Costos {
  porCuadra: number;
  porVehiculo: number;
  porMinutoTotal: number;
  porFalla: number;
  porMinutoPremium: number; // Evento 1: peso de la demora de cada pedido premium
}

export interface Mundo {
  ancho: number;
  alto: number;
  deposito: Punto;
  horaSalida: number; // minutos desde las 00:00
  tiempoServicio: number;
  tiempoCarga: number;
  minPorCuadra: number;
  costos: Costos;
}

export interface Pedido extends Punto {
  id: number;
  peso: number;
  premium: boolean; // Evento 1: cuenta cuánto tarda en recibir. Falso si el dataset no lo trae.
}

// Hoy todos los vehículos son iguales, pero el simulador oficial ya guarda la velocidad
// y el costo fijo por vehículo: si un evento los diferencia, solo cambia la lectura.
export interface Vehiculo {
  id: string;
  minPorCuadra: number;
  costoFijo: number;
}

export interface Dataset {
  mundo: Mundo;
  pedidos: Pedido[];
  vehiculos: Vehiculo[];
}

export interface RutaPlan {
  vehiculo: string;
  paradas: Parada[];
}

export interface Plan {
  rutas: RutaPlan[];
}

/** Único lugar donde se define cómo se mide la distancia (Manhattan, en cuadras). */
export function distancia(a: Punto, b: Punto): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function aHora(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}
