// Uso: npm run evaluar-datasets -- <carpeta> [--iteraciones N] [--semilla S]
// Recorre datasets completos, resuelve cada uno y muestra costo, fallas y tiempo.
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, join } from "node:path";
import { resolverDesdeArchivos } from "../src/solver/resolver.ts";
import { ErrorDatos } from "../src/solver/etapa1-lectura/leerDataset.ts";

const args = process.argv.slice(2);
const carpeta = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const opcion = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!carpeta) {
  console.error("Uso: npm run evaluar-datasets -- <carpeta> [--iteraciones N] [--semilla S]");
  process.exit(1);
}

const raiz = resolve(carpeta);
const opciones = {};
for (const nombre of ["iteraciones", "semilla"]) {
  const valor = opcion(nombre);
  if (valor !== undefined) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) {
      console.error(`--${nombre} debe ser un número`);
      process.exit(1);
    }
    opciones[nombre] = numero;
  }
}

function buscarDatasets(directorio) {
  const encontrados = [];
  function recorrer(actual) {
    const entradas = readdirSync(actual, { withFileTypes: true });
    const archivos = new Set(entradas.filter((e) => e.isFile()).map((e) => e.name.toLowerCase()));
    if (["mundo", "pedidos", "vehiculos"].every((nombre) => ["json", "csv"].some((ext) => archivos.has(`${nombre}.${ext}`)))) {
      encontrados.push(actual);
    }
    for (const entrada of entradas) if (entrada.isDirectory()) recorrer(join(actual, entrada.name));
  }
  recorrer(directorio);
  return encontrados.sort();
}

const datasets = buscarDatasets(raiz);
if (datasets.length === 0) {
  console.error(`No encontré datasets completos en ${raiz}`);
  process.exit(1);
}

const resultados = [];
let errores = 0;
for (const directorio of datasets) {
  const archivos = {};
  for (const nombre of readdirSync(directorio)) {
    if (/^(mundo|pedidos|vehiculos)\.(json|csv)$/i.test(nombre)) {
      archivos[nombre] = readFileSync(join(directorio, nombre), "utf8");
    }
  }

  try {
    const informe = resolverDesdeArchivos(archivos, opciones);
    const resultado = {
      nombre: relative(raiz, directorio) || ".",
      pedidos: informe.dataset.pedidos.length,
      vehiculos: informe.dataset.vehiculos.length,
      costo: informe.evaluacion.costo.total,
      fallidos: informe.evaluacion.metricas.fallidos,
      ms: Math.round(informe.ms),
    };
    resultados.push(resultado);
    console.log(`${resultado.nombre.padEnd(42)} ${String(resultado.pedidos).padStart(3)} pedidos  ${String(resultado.vehiculos).padStart(2)} vehículos  costo ${String(resultado.costo).padStart(8)}  fallidos ${resultado.fallidos}  ${resultado.ms} ms`);
  } catch (error) {
    errores++;
    const mensaje = error instanceof ErrorDatos ? error.message : error instanceof Error ? error.message : String(error);
    console.error(`${relative(raiz, directorio)}: ${mensaje}`);
  }
}

if (resultados.length > 0) {
  const costoPromedio = resultados.reduce((total, r) => total + r.costo, 0) / resultados.length;
  const tiempoPromedio = resultados.reduce((total, r) => total + r.ms, 0) / resultados.length;
  console.log(`\n${resultados.length} datasets; costo promedio ${costoPromedio.toFixed(2)}; tiempo promedio ${tiempoPromedio.toFixed(1)} ms; errores ${errores}`);
}

if (errores > 0) process.exitCode = 1;
