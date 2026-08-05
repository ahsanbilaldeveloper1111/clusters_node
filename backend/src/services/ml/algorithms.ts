/**
 * From-scratch ML algorithms for learning.
 * Each function is intentionally readable — this is the "how it works" layer.
 */

import { applyStandardize, cosineSimilarity, dot, scale, standardizeColumns, zeros } from './math.js';

export interface LinearRegressionModel {
  kind: 'linear_regression';
  weights: number[];
  bias: number;
  featureNames: string[];
  means: number[];
  stds: number[];
  learningRate: number;
  epochs: number;
  lossCurve: number[];
}

export interface LogisticRegressionModel {
  kind: 'logistic_regression';
  weights: number[];
  bias: number;
  featureNames: string[];
  means: number[];
  stds: number[];
  learningRate: number;
  epochs: number;
  threshold: number;
  lossCurve: number[];
}

export interface KMeansModel {
  kind: 'kmeans';
  k: number;
  centroids: number[][];
  featureNames: string[];
  means: number[];
  stds: number[];
  iterations: number;
  inertia: number;
}

function sigmoid(z: number): number {
  if (z >= 20) return 1;
  if (z <= -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Linear regression via gradient descent.
 * Model: ŷ = w·x + b
 * Loss: mean squared error
 */
export function trainLinearRegression(
  X: number[][],
  y: number[],
  featureNames: string[],
  opts?: { learningRate?: number; epochs?: number }
): LinearRegressionModel {
  const learningRate = opts?.learningRate ?? 0.05;
  const epochs = opts?.epochs ?? 200;
  const { scaled, means, stds } = standardizeColumns(X);
  const n = scaled.length;
  const d = featureNames.length;
  let weights = zeros(d);
  let bias = 0;
  const lossCurve: number[] = [];

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradsW = zeros(d);
    let gradB = 0;
    let loss = 0;

    for (let i = 0; i < n; i++) {
      const x = scaled[i] ?? zeros(d);
      const pred = dot(weights, x) + bias;
      const err = pred - (y[i] ?? 0);
      loss += err * err;
      for (let j = 0; j < d; j++) gradsW[j]! += err * (x[j] ?? 0);
      gradB += err;
    }

    loss /= Math.max(n, 1);
    lossCurve.push(loss);

    weights = weights.map((w, j) => w - learningRate * ((gradsW[j] ?? 0) / Math.max(n, 1)));
    bias -= learningRate * (gradB / Math.max(n, 1));
  }

  return {
    kind: 'linear_regression',
    weights,
    bias,
    featureNames,
    means,
    stds,
    learningRate,
    epochs,
    lossCurve: lossCurve.filter((_, i) => i % Math.max(1, Math.floor(epochs / 20)) === 0 || i === lossCurve.length - 1),
  };
}

export function predictLinear(model: LinearRegressionModel, row: number[]): number {
  const x = applyStandardize(row, model.means, model.stds);
  return dot(model.weights, x) + model.bias;
}

/**
 * Logistic regression via gradient descent.
 * Model: P(y=1|x) = σ(w·x + b)
 * Loss: binary cross-entropy
 */
export function trainLogisticRegression(
  X: number[][],
  y: number[],
  featureNames: string[],
  opts?: { learningRate?: number; epochs?: number; threshold?: number }
): LogisticRegressionModel {
  const learningRate = opts?.learningRate ?? 0.1;
  const epochs = opts?.epochs ?? 250;
  const threshold = opts?.threshold ?? 0.5;
  const { scaled, means, stds } = standardizeColumns(X);
  const n = scaled.length;
  const d = featureNames.length;
  let weights = zeros(d);
  let bias = 0;
  const lossCurve: number[] = [];

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradsW = zeros(d);
    let gradB = 0;
    let loss = 0;

    for (let i = 0; i < n; i++) {
      const x = scaled[i] ?? zeros(d);
      const z = dot(weights, x) + bias;
      const p = sigmoid(z);
      const yi = y[i] ?? 0;
      const eps = 1e-9;
      loss += -(yi * Math.log(p + eps) + (1 - yi) * Math.log(1 - p + eps));
      const err = p - yi;
      for (let j = 0; j < d; j++) gradsW[j]! += err * (x[j] ?? 0);
      gradB += err;
    }

    loss /= Math.max(n, 1);
    lossCurve.push(loss);
    weights = weights.map((w, j) => w - learningRate * ((gradsW[j] ?? 0) / Math.max(n, 1)));
    bias -= learningRate * (gradB / Math.max(n, 1));
  }

  return {
    kind: 'logistic_regression',
    weights,
    bias,
    featureNames,
    means,
    stds,
    learningRate,
    epochs,
    threshold,
    lossCurve: lossCurve.filter((_, i) => i % Math.max(1, Math.floor(epochs / 20)) === 0 || i === lossCurve.length - 1),
  };
}

export function predictLogisticProba(model: LogisticRegressionModel, row: number[]): number {
  const x = applyStandardize(row, model.means, model.stds);
  return sigmoid(dot(model.weights, x) + model.bias);
}

export function predictLogisticLabel(model: LogisticRegressionModel, row: number[]): number {
  return predictLogisticProba(model, row) >= model.threshold ? 1 : 0;
}

/**
 * K-means clustering — group similar rows without labels (unsupervised).
 */
export function trainKMeans(
  X: number[][],
  featureNames: string[],
  k = 3,
  maxIter = 30
): KMeansModel {
  const { scaled, means, stds } = standardizeColumns(X);
  const n = scaled.length;
  const d = featureNames.length;
  const kk = Math.max(1, Math.min(k, n || 1));

  // Init: pick first kk distinct rows (deterministic for teaching demos)
  const centroids: number[][] = [];
  for (let i = 0; i < kk; i++) {
    centroids.push([...(scaled[i % Math.max(n, 1)] ?? zeros(d))]);
  }

  let assignments = zeros(n);
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;
    let moved = false;

    for (let i = 0; i < n; i++) {
      const x = scaled[i] ?? zeros(d);
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < kk; c++) {
        const diff = x.map((v, j) => v - (centroids[c]?.[j] ?? 0));
        const dist = dot(diff, diff);
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        moved = true;
      }
    }

    const sums = Array.from({ length: kk }, () => zeros(d));
    const counts = zeros(kk);
    for (let i = 0; i < n; i++) {
      const c = assignments[i] ?? 0;
      counts[c]! += 1;
      const x = scaled[i] ?? zeros(d);
      for (let j = 0; j < d; j++) sums[c]![j]! += x[j] ?? 0;
    }
    for (let c = 0; c < kk; c++) {
      if ((counts[c] ?? 0) === 0) continue;
      centroids[c] = scale(sums[c]!, 1 / (counts[c] ?? 1));
    }

    if (!moved && iter > 0) break;
  }

  let inertia = 0;
  for (let i = 0; i < n; i++) {
    const c = assignments[i] ?? 0;
    const x = scaled[i] ?? zeros(d);
    const diff = x.map((v, j) => v - (centroids[c]?.[j] ?? 0));
    inertia += dot(diff, diff);
  }

  return {
    kind: 'kmeans',
    k: kk,
    centroids,
    featureNames,
    means,
    stds,
    iterations,
    inertia,
  };
}

export function assignCluster(model: KMeansModel, row: number[]): number {
  const x = applyStandardize(row, model.means, model.stds);
  let best = 0;
  let bestDist = Infinity;
  for (let c = 0; c < model.centroids.length; c++) {
    const diff = x.map((v, j) => v - (model.centroids[c]?.[j] ?? 0));
    const dist = dot(diff, diff);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

/** --- Tiny TF-IDF (bag of words) — teaches "text → vectors" used in search/RAG --- */

export interface TfidfIndex {
  kind: 'tfidf';
  vocabulary: string[];
  idf: number[];
  docs: { id: string; title: string; vector: number[] }[];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function buildTfidfIndex(
  docs: { id: string; title: string; text: string }[]
): TfidfIndex {
  const tokenized = docs.map((d) => tokenize(`${d.title} ${d.text}`));
  const df = new Map<string, number>();
  for (const tokens of tokenized) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const vocabulary = [...df.keys()].sort();
  const N = Math.max(docs.length, 1);
  const idf = vocabulary.map((term) => Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1);

  const indexed = docs.map((d, i) => {
    const tokens = tokenized[i] ?? [];
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vector = vocabulary.map((term, j) => {
      const termFreq = (tf.get(term) ?? 0) / Math.max(tokens.length, 1);
      return termFreq * (idf[j] ?? 0);
    });
    return { id: d.id, title: d.title, vector };
  });

  return { kind: 'tfidf', vocabulary, idf, docs: indexed };
}

export function queryTfidf(
  index: TfidfIndex,
  query: string,
  topK = 5
): { id: string; title: string; score: number }[] {
  const tokens = tokenize(query);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const qVec = index.vocabulary.map((term, j) => {
    const termFreq = (tf.get(term) ?? 0) / Math.max(tokens.length, 1);
    return termFreq * (index.idf[j] ?? 0);
  });

  return index.docs
    .map((d) => ({
      id: d.id,
      title: d.title,
      score: cosineSimilarity(qVec, d.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
