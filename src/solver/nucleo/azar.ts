// Generador de números aleatorios con semilla (mulberry32): la misma semilla da siempre el
// mismo plan, así cada resultado se puede reproducir y comparar.
export type Azar = () => number;

export function crearAzar(semilla: number): Azar {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function enteroAzar(azar: Azar, max: number): number {
  return Math.floor(azar() * max);
}
