/**
 * Evaluation metrics — how we measure if a model is any good.
 */

import { mean } from './math.js';

export function mae(yTrue: number[], yPred: number[]): number {
  if (!yTrue.length) return 0;
  return mean(yTrue.map((y, i) => Math.abs(y - (yPred[i] ?? 0))));
}

export function rmse(yTrue: number[], yPred: number[]): number {
  if (!yTrue.length) return 0;
  return Math.sqrt(mean(yTrue.map((y, i) => (y - (yPred[i] ?? 0)) ** 2)));
}

export function r2Score(yTrue: number[], yPred: number[]): number {
  if (!yTrue.length) return 0;
  const m = mean(yTrue);
  const ssTot = yTrue.reduce((s, y) => s + (y - m) ** 2, 0);
  const ssRes = yTrue.reduce((s, y, i) => s + (y - (yPred[i] ?? 0)) ** 2, 0);
  if (ssTot === 0) return 0;
  return 1 - ssRes / ssTot;
}

export interface ConfusionBinary {
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
}

export function binaryConfusion(yTrue: number[], yPred: number[]): ConfusionBinary {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const t = yTrue[i] ?? 0;
    const p = yPred[i] ?? 0;
    if (t === 1 && p === 1) tp++;
    else if (t === 0 && p === 0) tn++;
    else if (t === 0 && p === 1) fp++;
    else fn++;
  }
  const accuracy = yTrue.length ? (tp + tn) / yTrue.length : 0;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, tn, fp, fn, accuracy, precision, recall, f1 };
}
