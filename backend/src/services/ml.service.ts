import {
  assignCluster,
  buildTfidfIndex,
  predictLinear,
  predictLogisticLabel,
  predictLogisticProba,
  queryTfidf,
  trainKMeans,
  trainLinearRegression,
  trainLogisticRegression,
  type KMeansModel,
  type LinearRegressionModel,
  type LogisticRegressionModel,
} from './algorithms.js';
import { ML_CURRICULUM, ML_PIPELINE } from './curriculum.js';
import {
  classificationMatrix,
  clusteringMatrix,
  loadProductMlDataset,
} from './dataset.js';
import { trainTestSplit } from './math.js';
import { binaryConfusion, mae, r2Score, rmse } from './metrics.js';

export type MlTask = 'regression' | 'classification' | 'clustering' | 'similarity';

export async function getMlLabStatus() {
  const dataset = await loadProductMlDataset();
  const lowStock = dataset.yLowStock.filter((v) => v === 1).length;
  return {
    enabled: true,
    mode: 'from-scratch-typescript' as const,
    sampleCount: dataset.rows.length,
    featureNames: dataset.featureNames,
    labelBalance: {
      lowStock,
      healthyStock: dataset.rows.length - lowStock,
    },
    pipeline: ML_PIPELINE,
    curriculum: ML_CURRICULUM,
    tasks: [
      {
        id: 'regression' as const,
        title: 'Linear regression',
        goal: 'Predict product price from non-price features',
      },
      {
        id: 'classification' as const,
        title: 'Logistic regression',
        goal: 'Predict low-stock risk (without using stock as a feature)',
      },
      {
        id: 'clustering' as const,
        title: 'K-means clustering',
        goal: 'Group similar products (unsupervised)',
      },
      {
        id: 'similarity' as const,
        title: 'TF-IDF retrieval',
        goal: 'Rank products by text similarity to a query',
      },
    ],
    featureExplain: dataset.explain,
    generatedAt: new Date().toISOString(),
  };
}

export async function getMlFeatures(limit = 12) {
  const dataset = await loadProductMlDataset();
  return {
    featureNames: dataset.featureNames,
    explain: dataset.explain,
    preview: dataset.rows.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      features: {
        stock: r.features.stock,
        nameLength: r.features.nameLength,
        descLength: r.features.descLength,
        categoryHash: Number(r.features.categoryHash.toFixed(4)),
      },
      labels: r.labels,
    })),
    total: dataset.rows.length,
  };
}

export async function runMlExperiment(input: {
  task: MlTask;
  testRatio?: number;
  epochs?: number;
  learningRate?: number;
  k?: number;
  query?: string;
  topK?: number;
}) {
  const dataset = await loadProductMlDataset();
  if (dataset.rows.length < 4) {
    return {
      ok: false as const,
      message: 'Need at least 4 products in the database to run the ML lab. Seed products first.',
      task: input.task,
    };
  }

  if (input.task === 'similarity') {
    const index = buildTfidfIndex(
      dataset.rows.map((r) => ({
        id: r.id,
        title: r.name,
        text: `${r.category} ${r.description}`,
      }))
    );
    const q = input.query?.trim() || 'wireless headphones electronics';
    const matches = queryTfidf(index, q, input.topK ?? 5);
    return {
      ok: true as const,
      task: 'similarity' as const,
      lesson: ML_CURRICULUM.find((c) => c.id === 'vectors'),
      query: q,
      vocabularySize: index.vocabulary.length,
      vocabularySample: index.vocabulary.slice(0, 20),
      matches,
      howItWorks: [
        'Tokenize query and product text into words.',
        'Compute term frequency (TF) inside each document.',
        'Weight by inverse document frequency (IDF) — rare words matter more.',
        'Represent each doc as a vector; rank by cosine similarity to the query vector.',
        'This is the classic idea behind search / RAG retrieval (modern systems use neural embeddings).',
      ],
    };
  }

  if (input.task === 'clustering') {
    const { featureNames, X } = clusteringMatrix(dataset);
    const k = Math.min(Math.max(input.k ?? 3, 2), Math.min(6, dataset.rows.length));
    const model = trainKMeans(X, featureNames, k);
    const assignments = dataset.rows.map((r, i) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      cluster: assignCluster(model, X[i] ?? []),
      price: r.price,
      stock: r.stock,
    }));
    const sizes = Array.from({ length: model.k }, (_, c) =>
      assignments.filter((a) => a.cluster === c).length
    );
    return {
      ok: true as const,
      task: 'clustering' as const,
      lesson: ML_CURRICULUM.find((c) => c.id === 'clustering'),
      model: summarizeKMeans(model),
      clusterSizes: sizes,
      assignments: assignments.slice(0, 40),
      howItWorks: [
        'Pick k initial centroids.',
        'Assign each product to the nearest centroid (Euclidean distance on scaled features).',
        'Move each centroid to the mean of its assigned points.',
        'Repeat until assignments stop changing (or max iterations).',
        `Inertia (sum of squared distances to centroids): ${model.inertia.toFixed(2)} — lower is tighter clusters.`,
      ],
    };
  }

  const testRatio = Math.min(Math.max(input.testRatio ?? 0.25, 0.15), 0.4);
  const epochs = Math.min(Math.max(input.epochs ?? 200, 50), 800);
  const learningRate = Math.min(Math.max(input.learningRate ?? 0.05, 0.001), 0.5);

  if (input.task === 'regression') {
    const pairs = dataset.X.map((x, i) => ({ x, y: dataset.yPrice[i] ?? 0, row: dataset.rows[i]! }));
    const { train, test } = trainTestSplit(pairs, testRatio);
    const model = trainLinearRegression(
      train.map((p) => p.x),
      train.map((p) => p.y),
      dataset.featureNames,
      { learningRate, epochs }
    );

    const yTrainTrue = train.map((p) => p.y);
    const yTrainPred = train.map((p) => predictLinear(model, p.x));
    const yTestTrue = test.map((p) => p.y);
    const yTestPred = test.map((p) => predictLinear(model, p.x));

    return {
      ok: true as const,
      task: 'regression' as const,
      lesson: ML_CURRICULUM.find((c) => c.id === 'regression'),
      model: summarizeLinear(model),
      split: { train: train.length, test: test.length, testRatio },
      metrics: {
        train: {
          mae: Number(mae(yTrainTrue, yTrainPred).toFixed(3)),
          rmse: Number(rmse(yTrainTrue, yTrainPred).toFixed(3)),
          r2: Number(r2Score(yTrainTrue, yTrainPred).toFixed(4)),
        },
        test: {
          mae: Number(mae(yTestTrue, yTestPred).toFixed(3)),
          rmse: Number(rmse(yTestTrue, yTestPred).toFixed(3)),
          r2: Number(r2Score(yTestTrue, yTestPred).toFixed(4)),
        },
      },
      predictions: test.slice(0, 10).map((p, i) => ({
        name: p.row.name,
        actual: p.y,
        predicted: Number((yTestPred[i] ?? 0).toFixed(2)),
        error: Number((Math.abs(p.y - (yTestPred[i] ?? 0))).toFixed(2)),
      })),
      howItWorks: [
        'Hypothesis: price ≈ w1*stock + w2*nameLength + w3*descLength + w4*categoryHash + bias.',
        'Loss: mean squared error between predicted and actual price.',
        'Update weights with gradient descent each epoch (loss curve should trend down).',
        'Compare train vs test metrics — a big gap suggests overfitting.',
      ],
    };
  }

  // classification
  const { featureNames, X, y } = classificationMatrix(dataset);
  const pairs = X.map((x, i) => ({ x, y: y[i] ?? 0, row: dataset.rows[i]! }));
  const { train, test } = trainTestSplit(pairs, testRatio);
  const model = trainLogisticRegression(
    train.map((p) => p.x),
    train.map((p) => p.y),
    featureNames,
    { learningRate: Math.max(learningRate, 0.08), epochs }
  );

  const trainPred = train.map((p) => predictLogisticLabel(model, p.x));
  const testPred = test.map((p) => predictLogisticLabel(model, p.x));
  const trainProba = train.map((p) => predictLogisticProba(model, p.x));
  const testProba = test.map((p) => predictLogisticProba(model, p.x));

  return {
    ok: true as const,
    task: 'classification' as const,
    lesson: ML_CURRICULUM.find((c) => c.id === 'classification'),
    model: summarizeLogistic(model),
    split: { train: train.length, test: test.length, testRatio },
    metrics: {
      train: binaryConfusion(
        train.map((p) => p.y),
        trainPred
      ),
      test: binaryConfusion(
        test.map((p) => p.y),
        testPred
      ),
    },
    predictions: test.slice(0, 10).map((p, i) => ({
      name: p.row.name,
      actual: p.y,
      predicted: testPred[i] ?? 0,
      probability: Number((testProba[i] ?? 0).toFixed(3)),
      stock: p.row.stock,
    })),
    note: 'Stock is NOT used as a feature — otherwise low-stock classification would be trivial. The model must learn proxy patterns (price/text/category).',
    howItWorks: [
      'Sigmoid squashes a linear score into a probability P(low_stock=1).',
      'Loss: binary cross-entropy — penalizes confident wrong probabilities.',
      'Threshold 0.5 turns probability into a class label.',
      'Inspect precision/recall when classes are imbalanced.',
      `Mean train probability: ${(trainProba.reduce((s, p) => s + p, 0) / Math.max(trainProba.length, 1)).toFixed(3)}`,
    ],
  };
}

function summarizeLinear(model: LinearRegressionModel) {
  return {
    kind: model.kind,
    bias: Number(model.bias.toFixed(4)),
    learningRate: model.learningRate,
    epochs: model.epochs,
    weights: model.featureNames.map((name, i) => ({
      feature: name,
      weight: Number((model.weights[i] ?? 0).toFixed(4)),
    })),
    lossCurve: model.lossCurve.map((v) => Number(v.toFixed(5))),
  };
}

function summarizeLogistic(model: LogisticRegressionModel) {
  return {
    kind: model.kind,
    bias: Number(model.bias.toFixed(4)),
    learningRate: model.learningRate,
    epochs: model.epochs,
    threshold: model.threshold,
    weights: model.featureNames.map((name, i) => ({
      feature: name,
      weight: Number((model.weights[i] ?? 0).toFixed(4)),
    })),
    lossCurve: model.lossCurve.map((v) => Number(v.toFixed(5))),
  };
}

function summarizeKMeans(model: KMeansModel) {
  return {
    kind: model.kind,
    k: model.k,
    iterations: model.iterations,
    inertia: Number(model.inertia.toFixed(3)),
    featureNames: model.featureNames,
    centroids: model.centroids.map((c, i) => ({
      cluster: i,
      values: c.map((v) => Number(v.toFixed(3))),
    })),
  };
}
