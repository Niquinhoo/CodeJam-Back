// Uso: npm run resolver -- <carpeta_dataset> [--iteraciones N] [--semilla S] [--salida carpeta]
// Lee mundo/pedidos/vehiculos (.json o .csv), resuelve y escribe plan.json, plan.csv e
// informe.json (este último se puede abrir en el front para ver las etapas).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ErrorDatos } from "../src/solver/etapa1-lectura/leerDataset.ts";
import { resolverDesdeArchivos } from "../src/solver/resolver.ts";

const args = process.argv.slice(2);
const carpeta = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const opcion = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!carpeta) {
  console.error("Uso: npm run resolver -- <carpeta_dataset> [--iteraciones N] [--semilla S] [--salida carpeta]");
  process.exit(1);
}

const archivos = {};
for (const nombre of readdirSync(carpeta)) {
  if (/^(mundo|pedidos|vehiculos)\.(json|csv)$/i.test(nombre)) archivos[nombre] = readFileSync(join(carpeta, nombre), "utf8");
}

let informe;
try {
  informe = resolverDesdeArchivos(archivos, {
    iteraciones: Number(opcion("iteraciones") ?? 400_000),
    semilla: opcion("semilla") === undefined ? undefined : Number(opcion("semilla")),
  });
} catch (error) {
  if (error instanceof ErrorDatos) {
    console.error(`Error en los datos: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

const salida = opcion("salida") ?? carpeta;
mkdirSync(salida, { recursive: true });
writeFileSync(join(salida, "plan.json"), JSON.stringify({ rutas: informe.plan.rutas }, null, 2) + "\n");
writeFileSync(join(salida, "plan.csv"), informe.planCsv);
writeFileSync(join(salida, "informe.json"), JSON.stringify(informe));

console.log("\nCosto por cantidad de vehículos");
console.table(informe.porK.map((r) => ({
  k: r.k,
  "ruta inicial": r.construccion,
  "búsqueda local": r.busquedaLocal,
  recocido: r.recocido,
  final: r.final,
  usados: r.vehiculosUsados,
  elegido: r.elegido ? "◄" : "",
})));

const { costo, metricas } = informe.evaluacion;
console.log(`COSTO TOTAL: ${costo.total}`);
console.log(`  distancia  ${metricas.distanciaTotal} cuadras = ${costo.distancia}`);
console.log(`  vehículos  ${metricas.vehiculosUsados} usados   = ${costo.vehiculos}`);
console.log(`  tiempo     ${metricas.makespan} min       = ${costo.tiempo}`);
console.log(`  fallas     ${metricas.fallidos}            = ${costo.fallas}`);
console.log(`\nPlan escrito en ${join(salida, "plan.json")} y plan.csv (${Math.round(informe.ms)} ms)`);
