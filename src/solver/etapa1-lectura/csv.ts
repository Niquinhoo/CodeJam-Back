// Lector CSV mínimo: encabezado en la primera fila, separador "," (o ";"), comillas dobles.
export type Fila = Record<string, string>;

function partirLinea(linea: string, sep: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (entreComillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        actual += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === sep) {
      celdas.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  celdas.push(actual);
  return celdas.map((x) => x.trim());
}

export function leerCsv(texto: string): Fila[] {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/);
  const primera = lineas[0] ?? "";
  const sep = primera.includes(";") && !primera.includes(",") ? ";" : ",";
  const encabezado = partirLinea(primera, sep);
  const filas: Fila[] = [];
  for (const linea of lineas.slice(1)) {
    const celdas = partirLinea(linea, sep);
    if (celdas.every((c) => c === "")) continue;
    const fila: Fila = {};
    encabezado.forEach((clave, i) => {
      fila[clave] = celdas[i] ?? "";
    });
    filas.push(fila);
  }
  return filas;
}
