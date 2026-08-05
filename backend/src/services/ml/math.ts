/**
 * Tiny linear-algebra helpers for the ML learning lab.
 * Deliberately simple (no numpy) so you can read every step.
 */

export function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0);
}

export function ones(n: number): number[] {
  return Array.from({ length: n }, () => 1);
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

export function add(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

export function scale(a: number[], k: number): number[] {
  return a.map((v) => v * k);
}

export function l2Norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

/** Cosine similarity in [-1, 1] — core idea behind embedding search / RAG retrieval. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const na = l2Norm(a);
  const nb = l2Norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

/** Z-score normalize each column so features are on similar scales. */
export function standardizeColumns(matrix: number[][]): {
  scaled: number[][];
  means: number[];
  stds: number[];
} {
  if (!matrix.length) return { scaled: [], means: [], stds: [] };
  const cols = matrix[0]?.length ?? 0;
  const means = zeros(cols);
  const stds = zeros(cols);

  for (let j = 0; j < cols; j++) {
    const col = matrix.map((row) => row[j] ?? 0);
    means[j] = mean(col);
    stds[j] = std(col) || 1;
  }

  const scaled = matrix.map((row) =>
    row.map((v, j) => ((v - (means[j] ?? 0)) / (stds[j] ?? 1)))
  );
  return { scaled, means, stds };
}

export function applyStandardize(
  row: number[],
  means: number[],
  stds: number[]
): number[] {
  return row.map((v, j) => ((v - (means[j] ?? 0)) / (stds[j] || 1)));
}

/** Fisher–Yates shuffle (in place). */
export function shuffleInPlace<T>(arr: T[], seed = 42): T[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function trainTestSplit<T>(
  rows: T[],
  testRatio = 0.25,
  seed = 42
): { train: T[]; test: T[] } {
  const copy = shuffleInPlace([...rows], seed);
  const cut = Math.max(1, Math.floor(copy.length * (1 - testRatio)));
  return { train: copy.slice(0, cut), test: copy.slice(cut) };
}
