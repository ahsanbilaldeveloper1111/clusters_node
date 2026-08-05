/**
 * Feature engineering: turn raw commerce rows into numeric X / y for ML.
 * This is often 80% of real ML work.
 */

import { query } from '../../database/pool.js';

export interface ProductMlRow {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  /** Engineered features */
  features: {
    price: number;
    stock: number;
    nameLength: number;
    descLength: number;
    categoryHash: number;
  };
  /** Labels for supervised demos */
  labels: {
    /** Regression target: price */
    price: number;
    /** Classification: 1 if stock < 10 */
    isLowStock: number;
  };
}

export interface MlDataset {
  featureNames: string[];
  rows: ProductMlRow[];
  X: number[][];
  yPrice: number[];
  yLowStock: number[];
  explain: string[];
}

function categoryToNumber(category: string): number {
  let h = 0;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

export async function loadProductMlDataset(): Promise<MlDataset> {
  const { rows } = await query<{
    id: string;
    name: string;
    category: string | null;
    price: string;
    stock: number;
    description: string | null;
  }>(`
    SELECT id::text, name, category, price::text, stock, description
    FROM products
    ORDER BY created_at DESC
    LIMIT 200
  `);

  const mapped: ProductMlRow[] = rows.map((r) => {
    const price = Number(r.price);
    const stock = Number(r.stock);
    const category = r.category ?? 'Uncategorized';
    const description = r.description ?? '';
    const features = {
      price,
      stock,
      nameLength: r.name.length,
      descLength: description.length,
      categoryHash: categoryToNumber(category),
    };
    return {
      id: r.id,
      name: r.name,
      category,
      price,
      stock,
      description,
      features,
      labels: {
        price,
        isLowStock: stock < 10 ? 1 : 0,
      },
    };
  });

  // For price regression we avoid leaking the target as a feature.
  const regressionFeatureNames = ['stock', 'nameLength', 'descLength', 'categoryHash'];
  const X = mapped.map((r) => [
    r.features.stock,
    r.features.nameLength,
    r.features.descLength,
    r.features.categoryHash,
  ]);

  return {
    featureNames: regressionFeatureNames,
    rows: mapped,
    X,
    yPrice: mapped.map((r) => r.labels.price),
    yLowStock: mapped.map((r) => r.labels.isLowStock),
    explain: [
      'Each product becomes a numeric feature vector (feature engineering).',
      'Regression target y = product price; features exclude price to avoid leakage.',
      'Classification target y = 1 if stock < 10 (low-stock risk).',
      'categoryHash is a simple deterministic encoding of category text → number.',
      'Real ML often uses one-hot encoding or embeddings instead of a hash.',
    ],
  };
}

export function classificationMatrix(dataset: MlDataset): {
  featureNames: string[];
  X: number[][];
  y: number[];
} {
  // NOTE: including stock as a feature makes low-stock classification trivial —
  // for teaching we use price + text lengths + category only (proxy patterns).
  const featureNames = ['price', 'nameLength', 'descLength', 'categoryHash'];
  const X = dataset.rows.map((r) => [
    r.features.price,
    r.features.nameLength,
    r.features.descLength,
    r.features.categoryHash,
  ]);
  return { featureNames, X, y: dataset.yLowStock };
}

export function clusteringMatrix(dataset: MlDataset): {
  featureNames: string[];
  X: number[][];
} {
  const featureNames = ['price', 'stock', 'nameLength', 'descLength'];
  const X = dataset.rows.map((r) => [
    r.features.price,
    r.features.stock,
    r.features.nameLength,
    r.features.descLength,
  ]);
  return { featureNames, X };
}
