/**
 * Curriculum content — what each lab step teaches.
 */

export const ML_CURRICULUM = [
  {
    id: 'data',
    title: '1. Data',
    summary: 'ML starts with examples. We load products from PostgreSQL.',
    concepts: ['dataset', 'rows = samples', 'columns = raw fields'],
    detail:
      'Supervised learning needs inputs (X) and labels (y). Unsupervised learning only needs X. Your products table is the raw dataset.',
  },
  {
    id: 'features',
    title: '2. Features',
    summary: 'Turn messy fields into numbers the model can use.',
    concepts: ['feature engineering', 'scaling / standardization', 'leakage'],
    detail:
      'Models only see numbers. We engineer features like nameLength and categoryHash. We also standardize columns (z-score) so large-range features do not dominate gradient updates.',
  },
  {
    id: 'train_test',
    title: '3. Train / test split',
    summary: 'Hold out data to check generalization.',
    concepts: ['overfitting', 'generalization', 'holdout set'],
    detail:
      'If you test on the same data you trained on, scores look fake-good. We shuffle and keep ~25% as a test set the model never trains on.',
  },
  {
    id: 'regression',
    title: '4. Linear regression',
    summary: 'Predict a continuous value (price) with ŷ = w·x + b.',
    concepts: ['weights', 'bias', 'MSE loss', 'gradient descent'],
    detail:
      'We minimize mean squared error by walking downhill on the loss surface (gradient descent). Weights tell you how each feature pushes the prediction up or down.',
  },
  {
    id: 'classification',
    title: '5. Logistic regression',
    summary: 'Predict a class probability with a sigmoid.',
    concepts: ['sigmoid', 'cross-entropy', 'threshold', 'precision/recall'],
    detail:
      'Output is a probability between 0 and 1. We threshold (default 0.5) to get a label. Accuracy alone can lie on imbalanced data — check precision, recall, F1.',
  },
  {
    id: 'clustering',
    title: '6. K-means (unsupervised)',
    summary: 'Group similar products without labels.',
    concepts: ['centroids', 'inertia', 'unsupervised learning'],
    detail:
      'K-means assigns each point to the nearest centroid, then moves centroids to the mean of their cluster, repeating until stable.',
  },
  {
    id: 'vectors',
    title: '7. TF-IDF + cosine similarity',
    summary: 'Text → vectors → nearest neighbors (mini RAG retrieval).',
    concepts: ['bag of words', 'TF-IDF', 'cosine similarity', 'retrieval'],
    detail:
      'Modern AI assistants often retrieve relevant docs by embedding similarity. TF-IDF is a classic, explainable cousin: rare informative words get higher weight; cosine ranks closest documents.',
  },
  {
    id: 'llm_vs_ml',
    title: '8. Classic ML vs LLMs',
    summary: 'Same project: tabular ML lab + LLM business assistant.',
    concepts: ['supervised/unsupervised', 'LLM prompting', 'grounding / RAG'],
    detail:
      'Classic ML: train weights on your table. LLMs: huge pretrained models that generate text; you ground them with snapshots/prompts (and optionally retrieved vectors). Both need good data and evaluation.',
  },
] as const;

export const ML_PIPELINE = [
  'Load labeled/unlabeled examples from PostgreSQL',
  'Engineer numeric features (and avoid target leakage)',
  'Split into train and test sets',
  'Train a from-scratch model (gradient descent / k-means / TF-IDF)',
  'Evaluate with MAE/RMSE/R² or accuracy/precision/recall',
  'Inspect weights, loss curve, clusters, or similar docs',
];
