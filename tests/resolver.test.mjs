import assert from "node:assert/strict";
import test from "node:test";

import { crearAzar } from "../src/solver/nucleo/azar.ts";
import { resolver } from "../src/solver/resolver.ts";

function datasetCorredor() {
  const azar = crearAzar(1);
  return {
    mundo: {
      ancho: 20,
      alto: 20,
      deposito: { x: Math.floor(azar() * 19), y: Math.floor(azar() * 19) },
      horaSalida: 480,
      tiempoServicio: 5,
      tiempoCarga: 10,
      minPorCuadra: 3,
      costos: { porCuadra: 3, porVehiculo: 60, porMinutoTotal: 1, porFalla: 200 },
    },
    pedidos: Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      x: Math.floor(azar() * 20),
      y: Math.floor(azar() * 20),
      peso: 1 + Math.floor(azar() * 25),
    })),
    vehiculos: Array.from({ length: 3 }, (_, i) => ({ id: `V${i + 1}`, minPorCuadra: 3, costoFijo: 60 })),
  };
}

test("refina varias particiones iniciales y conserva el mejor costo", () => {
  const informe = resolver(datasetCorredor(), { semilla: 1, iteraciones: 0, semillasKmeans: 10 });
  assert.equal(informe.evaluacion.valido, true);
  assert.equal(informe.evaluacion.metricas.fallidos, 0);
  assert.ok(informe.evaluacion.costo.total <= 938, `costo obtenido: ${informe.evaluacion.costo.total}`);
});
