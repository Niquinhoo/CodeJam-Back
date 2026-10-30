import assert from "node:assert/strict";
import { checkDatabase } from "../src/models/healthModel.ts";
import { crearAzar } from "../src/solver/nucleo/azar.ts";
import { aPlan, costoSolucion, crearInstancia, distanciaRuta } from "../src/solver/nucleo/instancia.ts";
import { simularPlan } from "../src/solver/nucleo/simulador.ts";
import { ErrorDatos, leerDataset } from "../src/solver/etapa1-lectura/leerDataset.ts";
import { ordenOptimo } from "../src/solver/etapa6-pulido/pulidoExacto.ts";
import { dosOpt, vecinoMasCercano } from "../src/solver/etapa3-ruta-inicial/rutaInicial.ts";
import { resolver } from "../src/solver/resolver.ts";

let query;
const db = {
  prepare(sql) {
    query = sql;
    return { first: async () => ({ ok: 1 }) };
  },
};

assert.equal(await checkDatabase(db), true);
assert.equal(query, "SELECT 1 AS ok");
assert.equal(await checkDatabase({ prepare: () => ({ first: async () => null }) }), false);
await assert.rejects(() => checkDatabase({
  prepare: () => ({ first: async () => { throw new Error("database unavailable"); } }),
}));
console.log("health model self-check passed");

// Dataset de ejemplo del simulador oficial (datos/ejemplo).
const ejemplo = {
  "mundo.json": JSON.stringify({ deposito_x: 0, deposito_y: 0, hora_salida: "08:00", costo_por_falla: null }),
  "pedidos.csv": "id,x,y,peso\n1,3,4,8\n2,6,2,12\n3,10,10,20\n4,15,3,5\n5,2,15,18\n6,12,17,7\n7,18,18,25\n8,7,9,10\n9,16,11,14\n10,4,7,6\n",
  "vehiculos.json": JSON.stringify([{ id: "V1" }, { id: "V2" }, { id: "V3", color: "ignorado" }]),
};
const { dataset } = leerDataset(ejemplo);
assert.equal(dataset.pedidos.length, 10);
assert.equal(dataset.mundo.costos.porFalla, 200, "null toma el valor por defecto");
assert.throws(() => leerDataset({ ...ejemplo, "pedidos.csv": "id,x,y,peso\n1,25,0,3\n" }), ErrorDatos);

// plan_ejemplo.json: el simulador oficial da 198 cuadras, makespan 239 y costo 1013.
const evaluacion = simularPlan(dataset, {
  rutas: [
    { vehiculo: "V1", paradas: [2, 1, 10, "DEPOSITO", 8, 3] },
    { vehiculo: "V2", paradas: [6, 5] },
    { vehiculo: "V3", paradas: [4, 9, 7] },
  ],
});
assert.equal(evaluacion.metricas.distanciaTotal, 198);
assert.equal(evaluacion.metricas.makespan, 239);
assert.equal(evaluacion.costo.total, 1013);
assert.equal(simularPlan(dataset, { rutas: [{ vehiculo: "V9", paradas: [1] }] }).valido, false);
assert.equal(simularPlan(dataset, { rutas: [{ vehiculo: "V1", paradas: [1, 1] }] }).valido, false);
assert.equal(simularPlan(dataset, { rutas: [{ vehiculo: "V1", paradas: [1] }] }).costo.fallas, 9 * 200);

// El costo rápido interno tiene que coincidir con el simulador en soluciones al azar.
const grande = datasetAzar(40, 5, { x: 9, y: 13 }, 7);
const inst = crearInstancia(grande);
const azar = crearAzar(1);
for (let prueba = 0; prueba < 200; prueba++) {
  const sol = { rutas: [[], [], [], [], []], sinAsignar: [] };
  for (let nodo = 1; nodo <= inst.n; nodo++) {
    const destino = Math.floor(azar() * 6);
    (destino === 5 ? sol.sinAsignar : sol.rutas[destino]).push(nodo);
  }
  assert.equal(costoSolucion(inst, sol), simularPlan(grande, aPlan(inst, sol)).costo.total);
}

// Held-Karp nunca es peor que vecino más cercano + 2-opt.
for (let prueba = 0; prueba < 20; prueba++) {
  const nodos = Array.from({ length: 9 }, (_, i) => 1 + ((i * 4 + prueba) % inst.n));
  const unicos = [...new Set(nodos)];
  const heuristica = vecinoMasCercano(inst, unicos);
  dosOpt(inst, heuristica);
  assert.ok(distanciaRuta(inst, ordenOptimo(inst, unicos)) <= distanciaRuta(inst, heuristica));
}

// El resolver entrega un plan válido, sin repetidos, y mejor que el ejemplo del enunciado.
const informe = resolver(grande, { iteraciones: 20_000 });
assert.equal(informe.evaluacion.valido, true);
assert.equal(informe.etapas.length, 6);
const costos = informe.etapas.slice(2).map((e) => e.instantanea.costo.total);
costos.slice(1).forEach((c, i) => assert.ok(c <= costos[i], "cada etapa no empeora la anterior"));
assert.equal(resolver(dataset, { iteraciones: 5_000 }).evaluacion.valido, true);
console.log(`solver self-check passed (40 pedidos: ${informe.evaluacion.costo.total})`);

function datasetAzar(n, vehiculos, deposito, semilla) {
  const r = crearAzar(semilla);
  const texto = {
    "mundo.json": JSON.stringify({ deposito_x: deposito.x, deposito_y: deposito.y }),
    "pedidos.json": JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: i + 1, x: Math.floor(r() * 20), y: Math.floor(r() * 20), peso: 1 + Math.floor(r() * 20) }))),
    "vehiculos.json": JSON.stringify(Array.from({ length: vehiculos }, (_, i) => ({ id: `V${i + 1}` }))),
  };
  return leerDataset(texto).dataset;
}
