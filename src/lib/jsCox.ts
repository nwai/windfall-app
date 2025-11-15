export interface JsCoxOptions {
  penalizer?: number; // ridge penalty lambda
  maxIter?: number;
  tol?: number;
}

export interface JsCoxResult {
  coefficients: Record<string, number>;
  riskScores: number[]; // exp(beta·x) for each row at "now"
  converged: boolean;
  iterations: number;
}

function dot(row: number[], v: number[]) {
  let s = 0;
  for (let i = 0; i < row.length; i++) s += row[i] * v[i];
  return s;
}

export function fitJsCox(
  durations: number[],
  events: number[],
  Xraw: number[][],    // rows align with durations/events
  nowXraw: number[][], // 45 rows of current covariates
  colNamesRaw: string[],
  opts: JsCoxOptions = {}
): JsCoxResult {
  const lambda = opts.penalizer ?? 0.01; // smaller default to avoid over-flattening
  const maxIter = opts.maxIter ?? 200;
  const tol = opts.tol ?? 1e-6;

  const n = durations.length;
  if (n === 0) {
    return { coefficients: {}, riskScores: nowXraw.map(() => 1), converged: false, iterations: 0 };
  }

  // Drop zero-variance columns and standardize (z-score) for stability
  const p0 = colNamesRaw.length;
  const keepIdx: number[] = [];
  const means: number[] = new Array(p0).fill(0);
  const stds: number[] = new Array(p0).fill(0);

  // compute means/stds over Xraw
  for (let j = 0; j < p0; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Xraw[i][j] || 0;
    const mu = sum / Math.max(1, n);
    means[j] = mu;
    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const v = (Xraw[i][j] || 0) - mu;
      varSum += v * v;
    }
    const sd = Math.sqrt(varSum / Math.max(1, n));
    stds[j] = sd;
    if (sd > 1e-12) keepIdx.push(j);
  }

  const colNames = keepIdx.map((j) => colNamesRaw[j]);
  const p = colNames.length;
  if (p === 0) {
    return { coefficients: {}, riskScores: nowXraw.map(() => 1), converged: false, iterations: 0 };
  }

  const X: number[][] = Xraw.map((row) =>
    keepIdx.map((j) => ((row[j] || 0) - means[j]) / (stds[j] || 1))
  );
  const nowX: number[][] = nowXraw.map((row) =>
    keepIdx.map((j) => ((row[j] || 0) - means[j]) / (stds[j] || 1))
  );

  // Sort by time ascending
  const idx = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => durations[a] - durations[b]
  );
  const d = idx.map((i) => durations[i]);
  const e = idx.map((i) => events[i]);
  const Xs = idx.map((i) => X[i]);

  // Initialize beta = 0
  let beta = new Array(p).fill(0);

  // Precompute risk set indices (for Breslow, we can use cumulative from end)
  for (let iter = 0; iter < maxIter; iter++) {
    const expXb = Xs.map((row) => Math.exp(dot(row, beta)));

    // Risk set cumulative sums from end
    const cumExp = new Array(n).fill(0);
    const cumXExp = Array.from({ length: p }, () => new Array(n).fill(0));
    const cumXXExpDiag = Array.from({ length: p }, () => new Array(n).fill(0)); // diag approx: E[X_j^2]

    let runningExp = 0;
    const runningXExp = new Array(p).fill(0);
    const runningXXExpDiag = new Array(p).fill(0);

    for (let k = n - 1; k >= 0; k--) {
      const w = expXb[k];
      runningExp += w;
      for (let j = 0; j < p; j++) {
        const xjk = Xs[k][j];
        runningXExp[j] += xjk * w;
        runningXXExpDiag[j] += xjk * xjk * w;
        cumXExp[j][k] = runningXExp[j];
        cumXXExpDiag[j][k] = runningXXExpDiag[j];
      }
      cumExp[k] = runningExp;
    }

    // Gradient and diagonal Hessian (ridge added)
    const grad = new Array(p).fill(0);
    const hDiag = new Array(p).fill(lambda); // ridge diagonal

    for (let k = 0; k < n; k++) {
      if (e[k] === 1) {
        for (let j = 0; j < p; j++) {
          const meanXj = cumXExp[j][k] / Math.max(1e-12, cumExp[k]);
          const meanXj2 = cumXXExpDiag[j][k] / Math.max(1e-12, cumExp[k]);
          // gradient contribution
          grad[j] += Xs[k][j] - meanXj;
          // add ridge gradient
          grad[j] -= lambda * beta[j];
          // Hessian approx: Var_j ≈ E[X_j^2] - (E[X_j])^2
          const varj = Math.max(1e-12, meanXj2 - meanXj * meanXj);
          hDiag[j] += varj + lambda;
        }
      } else {
        // only ridge
        for (let j = 0; j < p; j++) grad[j] -= lambda * beta[j];
      }
    }

    // Newton step (diagonal)
    let maxDelta = 0;
    for (let j = 0; j < p; j++) {
      const delta = grad[j] / Math.max(1e-9, hDiag[j]);
      beta[j] += delta;
      maxDelta = Math.max(maxDelta, Math.abs(delta));
    }

    if (maxDelta < tol) {
      const coeffs: Record<string, number> = {};
      colNames.forEach((c, i) => (coeffs[c] = beta[i]));
      const riskScores = nowX.map((row) => Math.exp(dot(row, beta)));
      return { coefficients: coeffs, riskScores, converged: true, iterations: iter + 1 };
    }
  }

  const coeffs: Record<string, number> = {};
  colNames.forEach((c, i) => (coeffs[c] = beta[i]));
  const riskScores = nowX.map((row) => Math.exp(dot(row, beta)));
  return { coefficients: coeffs, riskScores, converged: false, iterations: maxIter };
}