# Learn AI & ML in This Project (Detailed Guide)

This file explains **Artificial Intelligence (AI)** and **Machine Learning (ML)** using **this codebase**, not abstract theory only.

**Start here if you want a step-by-step walkthrough:**  
→ [STEP-BY-STEP WALKTHROUGH (do this first)](#step-by-step-walkthrough-do-this-first)

Read this first, then open the linked files and run the UI labs:

| Where to practice | URL / API |
|-------------------|-----------|
| ML Learning Lab (classic ML) | Frontend `/ml` · `GET/POST /api/ml/*` |
| AI Business Assistant (LLM) | Frontend `/ai` · `GET/POST /api/ai/*` |

**Default login:** `admin@enterprise.local` / `Password123!` (admin or manager can use AI + ML).

---

## Table of contents

0. [STEP-BY-STEP WALKTHROUGH (do this first)](#step-by-step-walkthrough-do-this-first)
1. [Big picture: AI vs ML vs LLM](#1-big-picture-ai-vs-ml-vs-llm)
2. [How learning works in this app](#2-how-learning-works-in-this-app)
3. [Part A — Machine Learning Lab (from scratch)](#3-part-a--machine-learning-lab-from-scratch)
4. [Part B — AI Assistant (LLM + grounding)](#4-part-b--ai-assistant-llm--grounding)
5. [Part C — Enterprise industry AI](#5-part-c--enterprise-industry-ai)
6. [Glossary (simple definitions)](#6-glossary-simple-definitions)
7. [Suggested study path (1–2 hours)](#7-suggested-study-path-1–2-hours)
8. [File map (what to open next)](#8-file-map-what-to-open-next)

---

## STEP-BY-STEP WALKTHROUGH (do this first)

Follow these steps **in order**. Each step says **what you do**, **what happens inside the app**, and **which file** implements it.

---

### Path 1 — Machine Learning Lab (learn how models train)

#### Step 1 — Log in

1. Start the app (backend + frontend + database).
2. Open the login page.
3. Sign in as:
   - Email: `admin@enterprise.local`
   - Password: `Password123!`
4. Only **admin** / **manager** see **ML Lab** (permission `'ml'`).

**Why:** ML routes are protected by JWT + role checks.

---

#### Step 2 — Open ML Lab

1. In the sidebar, click **ML Lab** (route `/ml`).
2. The page calls:
   - `GET /api/ml/status`
   - `GET /api/ml/features?limit=8`
3. You should see:
   - Sample count (how many products)
   - Feature names
   - A small feature table
   - Curriculum buttons (Data, Features, Train/test, …)

**Files:**

- UI: `frontend/src/pages/MlLabPage.tsx`
- API: `backend/src/routes/ml.routes.ts`
- Logic: `backend/src/services/ml.service.ts` → `getMlLabStatus()`, `getMlFeatures()`

**If sample count is 0 or experiment fails:** seed products first (need at least 4 products).

---

#### Step 3 — Understand the raw data

1. Mentally picture the `products` table in PostgreSQL:
   - `name`, `category`, `price`, `stock`, `description`
2. Each product row = **one training example**.
3. Code loads up to 200 products with SQL.

**File:** `backend/src/services/ml/dataset.ts` → `loadProductMlDataset()`

```
products table
     │
     ▼
loadProductMlDataset()
     │
     ▼
rows[]  (each product with engineered features + labels)
```

---

#### Step 4 — Feature engineering (turn text into numbers)

Models cannot read “Wireless Headphones”. They need numbers.

For each product the code builds features like:

| Feature | Example meaning |
|---------|-----------------|
| `stock` | how many units left |
| `nameLength` | length of product name |
| `descLength` | length of description |
| `categoryHash` | category text turned into a 0..1 number |

**Labels (answers we want to predict):**

| Label | Meaning |
|-------|---------|
| `y = price` | for regression |
| `y = isLowStock` (1 if stock &lt; 10) | for classification |

**Leakage rule (important):**

- When predicting **price**, we **remove price from features** (otherwise the model cheats).
- When predicting **low stock**, we **remove stock from features** (otherwise the task is trivial).

**File:** `backend/src/services/ml/dataset.ts`

On the UI, look at the **Feature engineering preview** table. That is `X` and `y` before training.

---

#### Step 5 — Pick the first experiment: Linear regression

1. On `/ml`, select **Linear regression**.
2. Keep defaults (epochs ≈ 200, learning rate ≈ 0.05) for the first run.
3. Click **Train & evaluate**.

This sends:

```http
POST /api/ml/experiment
{ "task": "regression", "epochs": 200, "learningRate": 0.05, "testRatio": 0.25 }
```

---

#### Step 6 — What happens after you click Train (regression, detailed)

Inside `runMlExperiment()` (`ml.service.ts`), this exact sequence runs:

**6.1 Load dataset**

- Call `loadProductMlDataset()`.
- Build matrix `X` (features) and vector `yPrice` (true prices).

**6.2 Pair rows**

- Each sample becomes `{ x, y, row }`.

**6.3 Train/test split**

- Shuffle with a fixed seed.
- ~75% → **train** (used to learn weights).
- ~25% → **test** (used only for scoring).

**File:** `backend/src/services/ml/math.ts` → `trainTestSplit()`

**Why split?** If you test on the same data you trained on, scores look fake-good.

**6.4 Standardize features**

- For each feature column: `scaled = (value - mean) / std`
- Keeps large-range features from dominating training.

**File:** `math.ts` → `standardizeColumns()`

**6.5 Train linear regression with gradient descent**

Model:

```
predicted_price ŷ = (w · x) + b
```

For each epoch:

1. Predict `ŷ` for every train row.
2. Error = `ŷ - true_price`.
3. Loss = average of `error²` (MSE).
4. Update each weight a little:  
   `w = w - learningRate * average_gradient`
5. Update bias the same way.

Repeat `epochs` times. Loss should generally go **down**.

**File:** `backend/src/services/ml/algorithms.ts` → `trainLinearRegression()`

**6.6 Predict on train + test**

- `predictLinear(model, x)` for each row.

**6.7 Compute metrics**

| Metric | Meaning |
|--------|---------|
| MAE | average absolute \$ error |
| RMSE | penalizes large mistakes more |
| R² | 1.0 ≈ perfect fit, 0 ≈ weak |

**File:** `backend/src/services/ml/metrics.ts`

**6.8 Return JSON to UI**

UI shows:

- Lesson text (“what just happened”)
- Learned **weights** per feature
- **Loss curve** bars
- Train vs test metrics
- Sample predictions (actual vs predicted)

---

#### Step 7 — Read the regression result like a student

Ask yourself:

1. Did the **loss curve** trend downward? (training is working)
2. Is **test MAE** close to **train MAE**? (good generalization)
3. Which **weight** is largest in magnitude? (that feature pushes price most after scaling)
4. Are some predictions way off? (model is simple; data may be noisy)

Then open `algorithms.ts` and find the loop that updates `weights` and `bias`. Match the code to Step 6.5.

---

#### Step 8 — Run classification (step by step)

1. Select **Logistic regression**.
2. Click **Train & evaluate**.

What changes vs regression:

| Piece | Regression | Classification |
|-------|------------|----------------|
| Target `y` | price (number) | 0/1 low-stock |
| Output | continuous `ŷ` | probability via **sigmoid** |
| Loss | MSE | binary cross-entropy |
| Final label | n/a | `prob >= 0.5 → 1 else 0` |
| Metrics | MAE/RMSE/R² | accuracy, precision, recall, F1, confusion matrix |

Detailed loop:

1. Load features **without stock** (teaching choice).
2. Split train/test.
3. Train logistic weights with gradient descent.
4. Convert score → probability with sigmoid:  
   `σ(z) = 1 / (1 + e^(-z))`
5. Threshold at 0.5 → class label.
6. Build confusion matrix on test set.

**File:** `trainLogisticRegression()` in `algorithms.ts`

**Note on the UI:** “Stock is NOT used as a feature” — otherwise the model would just memorize `stock < 10`.

---

#### Step 9 — Run clustering (step by step)

1. Select **K-means clustering**.
2. Set `k` (e.g. 3).
3. Click **Train & evaluate**.

Loop:

1. Put products into numeric vectors (price, stock, nameLength, descLength).
2. Standardize.
3. Pick `k` starting centroids.
4. Assign each product to nearest centroid.
5. Move each centroid to the mean of its members.
6. Repeat until stable (or max iterations).
7. Report **inertia** (sum of squared distances; lower = tighter).

No labels (`y`) are used → **unsupervised learning**.

**File:** `trainKMeans()` in `algorithms.ts`

---

#### Step 10 — Run TF-IDF similarity (step by step)

1. Select **TF-IDF retrieval**.
2. Enter a query, e.g. `wireless headphones electronics`.
3. Click **Train & evaluate**.

Loop:

1. Split product text into words (**tokenize**).
2. Build vocabulary of all words.
3. For each product, build a vector:
   - TF = how common the word is *in this product*
   - IDF = how rare the word is *across all products*
   - value = TF × IDF
4. Build the same kind of vector for your query.
5. Rank products by **cosine similarity** to the query vector.
6. Return top matches + scores.

This is the classic idea behind search / **RAG retrieval** (modern systems use neural embeddings; idea is the same: text → vector → nearest neighbors).

**Files:** `buildTfidfIndex()`, `queryTfidf()`, `cosineSimilarity()`

---

### Path 2 — AI Business Assistant (learn how LLM apps are wired)

#### Step 11 — Open AI Assistant

1. Sidebar → **AI Assistant** (`/ai`).
2. Page loads `GET /api/ai/status?context=general`.
3. Look at cards:
   - **Provider** → `demo` or `openai`
   - **Live SQL grounding** → orders, revenue, AOV, low stock

**Important:** Status does **not** call the LLM. It only builds a snapshot + shows config.

**Files:**

- UI: `frontend/src/pages/AiAssistantPage.tsx`
- Service: `getAiStatus()` in `ai.service.ts`
- Snapshot: `buildBusinessSnapshot()` in `snapshot.ts`

---

#### Step 12 — Understand the BusinessSnapshot

Before any answer, the backend queries PostgreSQL and builds JSON like:

- `totalOrders`, `totalRevenue`, `averageOrderValue`
- `ordersByStatus`
- `topCategories`
- `lowStockCount`, sample low-stock products
- recent orders / top products (depends on context)

That JSON is the **ground truth** the assistant is allowed to use.

**File:** `backend/src/services/ai/snapshot.ts`

```
PostgreSQL (orders, products)
        │
        ▼
buildBusinessSnapshot(context)
        │
        ▼
BusinessSnapshot JSON  ──►  prompt or demo rules
```

---

#### Step 13 — Ask a chat question (UI steps)

1. Open the **Chat** tab.
2. Choose context: `general` / `orders` / `products`.
3. Type: `What is our total revenue and order count?`
4. Click **Ask AI**.

UI sends:

```http
POST /api/ai/insights
{
  "question": "What is our total revenue and order count?",
  "context": "general",
  "history": [ ... previous turns ... ]
}
```

---

#### Step 14 — What happens after Ask AI (detailed backend steps)

Inside `generateInsight()` (`ai.service.ts`):

**14.1 Validate question**

- Length between 3 and 2000 characters.

**14.2 Feature flag**

- If `FEATURE_AI_INSIGHTS` is off → error.

**14.3 Normalize history**

- Keep only `user` / `assistant`.
- Truncate each message.
- Keep last 10 turns.

**14.4 Build snapshot**

- `buildBusinessSnapshot(context)`.

**14.5 Resolve provider**

```
if OPENAI_API_KEY exists → OpenAiProvider
else → DemoAiProvider
```

**File:** `resolveAiProvider()` in `openai-provider.ts`

**14.6A Demo path (no API key)**

- `buildDemoAnswer(question, snapshot)`
- Keyword rules (stock / revenue / generic) + numbers from snapshot.
- Returns `mode: "demo"`.

**14.6B OpenAI path (key present)**

1. Wrap call in **circuit breaker**.
2. Build messages:
   - **system**: “enterprise analyst; use only provided JSON; don’t invent numbers”
   - **user**: full snapshot JSON
   - prior history
   - current question
3. `POST` to `{OPENAI_BASE_URL}/chat/completions`
4. Read `choices[0].message.content`
5. If breaker is open (too many failures) → fall back to demo answer

**14.7 Attach sources + optional domain event**

- Sources like `orders`, `products`, …
- May emit `AiInsightGenerated`

**14.8 UI shows answer**

- Bubble in chat
- Mode badge (`demo` / `openai`)
- Model name

---

#### Step 15 — Try Summarize and Recommend

**Summarize**

1. Tab → **Summarize**
2. Click **Summarize orders** (or products/catalog)
3. Backend: snapshot → provider.summarize → text bullets

**Recommend**

1. Tab → **Recommend**
2. Focus e.g. `low stock`
3. Backend asks for product list + reasons (OpenAI returns JSON array; demo builds from low-stock/top products)

---

#### Step 16 — Enterprise briefing (step by step)

1. Tab → **Enterprise**
2. Pick industry: Retail / Supply Chain / Finance / Operations
3. Choose **Executive briefing**
4. Optional focus: `inventory risk`
5. Click **Generate briefing**

Backend:

1. `assertIndustry(...)`
2. `buildBusinessSnapshot('general')`
3. Playbook from `industries.ts` (persona, KPI labels, owners)
4. Provider builds:
   - headline
   - summary
   - KPIs
   - risks (severity)
   - actions (owner + timeframe)
5. Demo path uses deterministic rules in `enterprise.ts` (low stock, concentration, backlog, …)
6. OpenAI path asks for structured JSON; falls back to demo if needed / circuit open

**Files:**

- `backend/src/services/ai/industries.ts`
- `backend/src/services/ai/enterprise.ts`
- `enterpriseBriefing()` in `ai.service.ts`

---

### Path 3 — Connect ML and AI in your head

#### Step 17 — Same database, two different methods

| Step | ML Lab `/ml` | AI Assistant `/ai` |
|------|--------------|--------------------|
| 1 | Load product rows | Load order/product aggregates |
| 2 | Engineer numeric features | Build BusinessSnapshot JSON |
| 3 | Train weights locally | Send prompt to LLM or demo rules |
| 4 | Evaluate with MAE / accuracy | Return natural-language answer |
| 5 | You inspect weights & loss | You inspect mode, sources, briefing |

**Remember:**

- ML = **learn numbers (weights)** from examples  
- AI assistant = **generate text** from grounded facts (snapshot)  
- Both start from **real PostgreSQL data**

#### Step 18 — Checklist (can you explain these out loud?)

1. What is a feature vs a label?  
2. Why train/test split?  
3. What does gradient descent update?  
4. What does sigmoid do in logistic regression?  
5. What is grounding in the AI assistant?  
6. When does demo mode run instead of OpenAI?  
7. What is a circuit-breaker fallback?

If you can answer those, you understand this project’s AI/ML design.

---

## 1. Big picture: AI vs ML vs LLM

### Artificial Intelligence (AI)

**AI** = software that does tasks that usually need human-like judgment (answering questions, recommending actions, spotting risks).

In this project, “AI” mostly means the **Business Assistant** under `/ai`: it answers business questions using live database data.

### Machine Learning (ML)

**ML** = a subset of AI where the program **learns patterns from examples** (numbers in a table), instead of only hard-coded `if/else` rules.

Example:

- Rule-based: `if stock < 10 then "low stock"`
- ML-based: look at many products’ features, **learn weights**, then predict low-stock risk

In this project, classic ML lives under `/ml` and is implemented **from scratch in TypeScript** so you can read every formula.

### Large Language Model (LLM)

An **LLM** (like GPT) is a huge neural network trained on text. You send a **prompt** (instructions + data + question); it returns text.

This project does **not** train an LLM. It optionally **calls OpenAI** (or uses a demo fallback) and feeds it a **BusinessSnapshot** from PostgreSQL so answers stay grounded in real numbers.

```
┌─────────────────────────────────────────────────────────────┐
│                        THIS APP                             │
│                                                             │
│   /ml  Classic ML          /ai  Generative AI (LLM)         │
│   ───────────────          ──────────────────────           │
│   Learn weights from       Prompt + live SQL snapshot       │
│   product table            → text answer / briefing         │
│   (you can see math)       (model is external or demo)      │
└─────────────────────────────────────────────────────────────┘
```

**One sentence to remember:**

> ML Lab **trains small models on your table**. AI Assistant **asks a language model to reason over a snapshot of your table**.

---

## 2. How learning works in this app

You learn in three layers:

1. **This document** — concepts in plain English  
2. **Source code** — the real formulas (especially `backend/src/services/ml/`)  
3. **UI labs** — click Train / Ask and see metrics, weights, loss curves, answers  

Recommended order:

1. Read sections 3 → 4 of this file  
2. Open `/ml`, run **Linear regression**, watch the loss curve
3. Open `/ai`, ask “What is our total revenue?”  
4. Re-read the matching code files listed in [§8](#8-file-map-what-to-open-next)

---

## 3. Part A — Machine Learning Lab (from scratch)

### 3.1 The ML pipeline (always the same idea)

Almost every ML project follows this loop:

```
1. DATA          load examples from the database
2. FEATURES      turn rows into numbers (X)
3. LABELS        choose what to predict (y)   ← supervised only
4. SPLIT         train set + test set
5. TRAIN         adjust weights to reduce error
6. EVALUATE      score on test data you did not train on
7. PREDICT       use the model on new rows
```

Implemented in:

| Step | File |
|------|------|
| Curriculum text | `backend/src/services/ml/curriculum.ts` |
| Load products + features | `backend/src/services/ml/dataset.ts` |
| Math helpers | `backend/src/services/ml/math.ts` |
| Algorithms | `backend/src/services/ml/algorithms.ts` |
| Metrics | `backend/src/services/ml/metrics.ts` |
| Orchestration | `backend/src/services/ml.service.ts` |
| HTTP API | `backend/src/routes/ml.routes.ts` |
| UI | `frontend/src/pages/MlLabPage.tsx` |

API:

- `GET /api/ml/status` — curriculum + sample counts  
- `GET /api/ml/features` — preview engineered features  
- `POST /api/ml/experiment` — body `{ "task": "regression" | "classification" | "clustering" | "similarity", ... }`

---

### 3.2 Data: what is a “dataset”?

A **dataset** is a collection of **examples** (rows).

Here, each **product** is one example:

- Raw fields: `name`, `category`, `price`, `stock`, `description`
- Loaded by SQL in `dataset.ts` → `loadProductMlDataset()`

**Important words:**

| Word | Meaning here |
|------|----------------|
| Sample / example | One product row |
| Feature | One number used as input (e.g. `nameLength`) |
| Feature vector `X` | All input numbers for one product |
| Label `y` | The answer we want to predict |
| Supervised learning | We have `X` and `y` |
| Unsupervised learning | We only have `X` (clustering) |

---

### 3.3 Feature engineering (critical idea)

Models only understand **numbers**, not English product names.

So we **engineer features**:

| Feature | How we build it | Why |
|---------|-----------------|-----|
| `stock` | from DB | inventory signal |
| `nameLength` | `name.length` | simple text signal |
| `descLength` | description length | richer listings may differ |
| `categoryHash` | hash category → 0..1 | turn text category into a number |
| `price` | from DB | used as **label** for regression, or as a feature for classification |

**Target leakage (must understand):**

If you predict `price` but also put `price` in the features, the model “cheats” and looks perfect.

So for **price regression**, features **exclude price**.

For **low-stock classification**, we **do not** use `stock` as a feature (otherwise the task is trivial: `stock < 10`). The model must learn weaker **proxy** patterns from price/text/category — good for learning, not always accurate in real life.

Code: `backend/src/services/ml/dataset.ts`

---

### 3.4 Standardization (scaling)

Features have different scales (`stock` might be 3, `descLength` might be 400).

Gradient descent works better when columns are scaled. We use **z-score**:

```
scaled = (value - mean) / std
```

Code: `standardizeColumns()` in `math.ts`

---

### 3.5 Train / test split

If you train and test on the **same** rows, scores look fake-good (**overfitting** risk).

We:

1. Shuffle rows (deterministic seed for demos)  
2. Keep ~75% for **train**  
3. Keep ~25% for **test** (never used to update weights)

Code: `trainTestSplit()` in `math.ts`

**Generalization** = does the model still work on unseen test data?

---

### 3.6 Task 1 — Linear regression (predict a number)

**Goal:** Predict product **price** (continuous number).

**Model formula:**

```
ŷ = w1*x1 + w2*x2 + w3*x3 + w4*x4 + b
```

- `w` = **weights** (learned)  
- `b` = **bias** (learned intercept)  
- `ŷ` = predicted price  

**Loss (error to minimize):** Mean Squared Error (MSE)

```
loss = average( (ŷ - y_true)² )
```

**Training method:** **Gradient descent**

1. Make a prediction  
2. Measure error  
3. Nudge each weight a little downhill on the loss surface  
4. Repeat for many **epochs** (full passes over training data)

**Hyperparameters you can change in the UI:**

- `learningRate` — step size (too big = unstable; too small = slow)  
- `epochs` — how many training passes  

**Metrics shown:**

| Metric | Meaning |
|--------|---------|
| MAE | Mean Absolute Error — average \$ mistake |
| RMSE | Root Mean Squared Error — penalizes big mistakes more |
| R² | How much variance is explained (1.0 = perfect, 0 = like predicting the mean) |

Compare **train vs test**. If train is great and test is bad → overfitting.

Code: `trainLinearRegression()` in `algorithms.ts`

---

### 3.7 Task 2 — Logistic regression (predict a class)

**Goal:** Predict **low-stock risk** as class `1` or `0`.

**Why not linear regression?**  
We need a **probability** between 0 and 1, then a class label.

**Sigmoid function:**

```
σ(z) = 1 / (1 + e^(-z))
P(y=1|x) = σ(w·x + b)
```

**Loss:** Binary cross-entropy (punishes confident wrong answers).

**Threshold:** default `0.5`

```
if probability >= 0.5 → predict 1 else 0
```

**Classification metrics:**

| Metric | Meaning |
|--------|---------|
| Accuracy | % correct |
| Precision | Of predicted positives, how many were real? |
| Recall | Of real positives, how many did we catch? |
| F1 | Balance of precision & recall |
| Confusion matrix | TP / TN / FP / FN counts |

On imbalanced data (few low-stock items), **accuracy alone can lie**. Always look at precision/recall.

Code: `trainLogisticRegression()` + `binaryConfusion()` in `metrics.ts`

---

### 3.8 Task 3 — K-means (unsupervised clustering)

**Goal:** Group similar products **without labels**.

Algorithm:

1. Choose `k` centroids (cluster centers)  
2. Assign each product to the nearest centroid  
3. Move each centroid to the mean of its points  
4. Repeat until assignments stop changing  

**Inertia** = sum of squared distances to centroids (lower = tighter clusters).

This is **unsupervised learning**: no `y`, only structure in `X`.

Code: `trainKMeans()` in `algorithms.ts`

---

### 3.9 Task 4 — TF-IDF + cosine similarity (text → vectors)

This teaches the idea behind **search** and **RAG retrieval** (what many AI apps use before calling an LLM).

Steps:

1. **Tokenize** text into words  
2. **TF** (term frequency) — how often a word appears in a document  
3. **IDF** (inverse document frequency) — rare words across the catalog get higher weight  
4. Each product becomes a **vector**  
5. Query becomes a vector too  
6. **Cosine similarity** ranks closest documents  

```
cosine(a, b) = (a·b) / (|a| |b|)
```

Modern systems often replace TF-IDF with **neural embeddings**, but the **retrieve-by-similarity** idea is the same.

Code: `buildTfidfIndex()`, `queryTfidf()`, `cosineSimilarity()`

---

### 3.10 What “from scratch” means here

We did **not** use scikit-learn / TensorFlow for the lab.

That is intentional for learning:

- You can open `algorithms.ts` and see gradient updates  
- No magic `.fit()` black box  
- Same ideas power big libraries — they are just optimized and richer  

Tradeoff: these toy models are for **education**, not production accuracy on huge datasets.

---

## 4. Part B — AI Assistant (LLM + grounding)

### 4.1 What problem it solves

Managers ask questions like:

- “What is our revenue?”  
- “Which categories sell best?”  
- “Do we have inventory risk?”  

Instead of writing SQL every time, the assistant:

1. Builds a **BusinessSnapshot** from PostgreSQL  
2. Sends that JSON + your question to a provider  
3. Returns an answer (plus sources / mode)

### 4.2 End-to-end flow

```
Browser (/ai)
  → JWT auth + role admin|manager
  → POST /api/ai/insights (or summarize / recommend / enterprise/*)
  → ai.service.ts
       → feature flag FEATURE_AI_INSIGHTS
       → buildBusinessSnapshot()     ← live SQL
       → resolveAiProvider()         ← OpenAI if key, else demo
       → circuit breaker (optional)  ← fallback to demo if OpenAI fails
  → JSON answer
```

Key files:

| File | Role |
|------|------|
| `frontend/src/pages/AiAssistantPage.tsx` | UI |
| `backend/src/routes/ai.routes.ts` | HTTP routes |
| `backend/src/services/ai.service.ts` | Orchestration |
| `backend/src/services/ai/snapshot.ts` | SQL grounding |
| `backend/src/services/ai/openai-provider.ts` | OpenAI + factory |
| `backend/src/services/ai/ai-provider.ts` | Provider interface + demo text |
| `backend/src/services/ai/types.ts` | Request/response types |

### 4.3 Grounding (why the snapshot exists)

**Grounding** = force the model to use **your real data**, not invent numbers.

`buildBusinessSnapshot()` collects:

- Total orders & revenue  
- Average order value  
- Orders by status  
- Top categories  
- Low-stock count + sample products  
- Recent orders (depending on context)

That JSON is pasted into the prompt as “Business data”. The system prompt says: **do not invent numbers**.

This is a simple form of **RAG-like grounding** (retrieve facts → put in context → generate).

### 4.4 Provider strategy (OpenAI vs demo)

```
if OPENAI_API_KEY is set
  use OpenAiProvider  → HTTP Chat Completions API
else
  use DemoAiProvider  → rule-based answers from the same snapshot
```

Factory: `resolveAiProvider()` in `openai-provider.ts`

**Demo mode** lets you learn the architecture without paying for an API key.

### 4.5 Circuit breaker

If OpenAI fails repeatedly, `aiCircuit` opens and the service **falls back to demo** instead of breaking the page.

See `withCircuitFallback()` in `ai.service.ts`.

### 4.6 Chat history

The UI keeps messages in React state and resends the last turns as `history`.

Server:

- Keeps only `user` / `assistant`  
- Truncates content  
- Max 10 turns  

There is **no chat table** in Postgres — conversations are not permanently stored.

### 4.7 Classic features on `/ai`

| Feature | Endpoint | Idea |
|---------|----------|------|
| Status | `GET /api/ai/status` | Snapshot + mode (no LLM call) |
| Chat | `POST /api/ai/insights` | Multi-turn Q&A |
| Summarize | `POST /api/ai/summarize` | Executive bullets |
| Recommend | `POST /api/ai/recommend` | Product suggestions + reasons |

### 4.8 LLM vs ML Lab (same data, different method)

| | ML Lab `/ml` | AI Assistant `/ai` |
|--|--------------|--------------------|
| Learns weights? | Yes (on each experiment) | No (uses pretrained LLM or demo rules) |
| Output | Numbers, metrics, clusters | Natural language |
| You can see math? | Yes | Mostly prompts + JSON parse |
| Needs API key? | No | Optional |
| Best for learning | How models train | How production AI features are wired |

---

## 5. Part C — Enterprise industry AI

On the **Enterprise** tab of `/ai`, the same snapshot is interpreted through an **industry playbook**.

Industries (`backend/src/services/ai/industries.ts`):

| Industry | Persona focus |
|----------|----------------|
| `retail` | Merchandising, stockouts, category mix |
| `supply_chain` | Replenishment, backlog, safety stock |
| `finance` | AOV, concentration, cancellation leakage |
| `operations` | Pipeline health, owners, SLAs |

Capabilities:

| Capability | Endpoint | Output |
|------------|----------|--------|
| Briefing | `POST /api/ai/enterprise/briefing` | Headline, KPIs, risks, actions |
| Risks | `POST /api/ai/enterprise/risks` | Severity-ranked risk register |
| Actions | `POST /api/ai/enterprise/actions` | Prioritized owners + timeframes |

Deterministic risk engine (works in demo mode too):

- File: `backend/src/services/ai/enterprise.ts`  
- Examples: low stock, revenue concentration, cancellations, fulfillment backlog, soft AOV  

With OpenAI, prompts ask for structured JSON; if parsing fails, demo logic fills in.

---

## 6. Glossary (simple definitions)

| Term | Simple definition |
|------|-------------------|
| Algorithm | Step-by-step method (e.g. gradient descent) |
| Model | The learned thing (weights + bias, or centroids, or TF-IDF index) |
| Training | Updating model parameters using data |
| Inference / prediction | Using a trained model on new inputs |
| Epoch | One full pass through the training set |
| Learning rate | How big each weight update step is |
| Overfitting | Memorizes train data; fails on new data |
| Underfitting | Model too simple; poor even on train data |
| Feature | Input number |
| Label | Correct answer for supervised learning |
| Loss | Score of “how wrong” (lower is better while training) |
| Metric | Score of quality after training (MAE, accuracy, …) |
| Embedding / vector | List of numbers representing text or an object |
| Prompt | Text instructions + data sent to an LLM |
| Grounding | Giving the LLM real facts so it doesn’t hallucinate |
| Hallucination | LLM invents plausible but false facts |
| RAG | Retrieve relevant docs/facts, then generate an answer |
| Circuit breaker | Stop calling a failing dependency; use fallback |
| RBAC | Role-based access control (admin/manager only for AI/ML) |

---

## 7. Suggested study path (1–2 hours)

### Session 1 — Classic ML (45–60 min)

1. Open this file’s Part A  
2. Go to `/ml`  
3. Read curriculum steps 1–3 in the UI  
4. Run **Linear regression**  
   - Note train vs test MAE  
   - Watch loss curve trend down  
   - Read weights table  
5. Open `algorithms.ts` → `trainLinearRegression` and match code to what you saw  
6. Run **Logistic regression** and inspect confusion metrics  
7. Run **K-means**, then **TF-IDF** with query `wireless headphones`

### Session 2 — Generative AI wiring (30–45 min)

1. Read Part B above  
2. Open `/ai` → check **Provider** card (demo vs openai)  
3. Ask: “What is our total revenue and order count?”  
4. Open `snapshot.ts` and see where those numbers come from  
5. Open `ai.service.ts` → `generateInsight`  
6. Try Enterprise → Retail → **Generate briefing**  
7. Open `enterprise.ts` and find how low-stock becomes a risk item  

### Session 3 — Connect the ideas (15 min)

Answer these in your own words:

1. What is the difference between a **weight** and a **prompt**?  
2. Why do we hide `price` from regression features?  
3. Why can LLM answers still be wrong even with a snapshot?  
4. When would you use `/ml` vs `/ai` in a real company?

---

## 8. File map (what to open next)

### Must-read for ML beginners

```
backend/src/services/ml/curriculum.ts     ← short lesson text
backend/src/services/ml/math.ts           ← vectors, cosine, split, scale
backend/src/services/ml/metrics.ts        ← MAE, RMSE, R², confusion
backend/src/services/ml/dataset.ts        ← SQL → features/labels
backend/src/services/ml/algorithms.ts     ← the actual learning algorithms
backend/src/services/ml.service.ts        ← runs experiments end-to-end
```

### Must-read for AI / LLM feature beginners

```
backend/src/services/ai/types.ts          ← request/response shapes
backend/src/services/ai/snapshot.ts       ← live SQL grounding
backend/src/services/ai/ai-provider.ts    ← interface + demo answers
backend/src/services/ai/openai-provider.ts← OpenAI calls + prompts
backend/src/services/ai/industries.ts     ← enterprise playbooks
backend/src/services/ai/enterprise.ts     ← risk/action engines
backend/src/services/ai.service.ts        ← orchestration + circuit fallback
```

### UI

```
frontend/src/pages/MlLabPage.tsx
frontend/src/pages/AiAssistantPage.tsx
```

### Env knobs

```
OPENAI_API_KEY      # empty → demo AI mode
OPENAI_MODEL        # default gpt-4o-mini
OPENAI_BASE_URL     # OpenAI-compatible API root
FEATURE_AI_INSIGHTS # soft-disable AI routes
FEATURE_CIRCUIT_BREAKER
```

---

## Final takeaway

1. **ML Lab** teaches *how models learn numbers from tables* (weights, loss, metrics).  
2. **AI Assistant** teaches *how production apps use LLMs safely* (auth, snapshot grounding, providers, fallbacks).  
3. **Enterprise AI** teaches *how the same data is framed for different business roles*.  

If you only remember one path:

> **Data → Features → Train/Prompt → Evaluate → Use**

That loop is the heart of both classic ML and applied AI.
