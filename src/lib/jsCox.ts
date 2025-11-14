/**
 * jsCox.ts
 * 
 * JavaScript-based Cox Proportional Hazards approximation using ridge regression.
 * This is a fallback when Pyodide/Python lifelines is not available.
 */

export interface JsCoxResult {
  coefficients: number[];
  hazardRatios: number[];
  partialHazards: number[];  // For "now" predictions
  colNames: string[];
}

export interface JsCoxOptions {
  penalizer?: number;  // Ridge penalty (L2 regularization)
  maxIterations?: number;
  tolerance?: number;
}

/**
 * Fit a Cox Proportional Hazards model using JS ridge regression approximation
 * 
 * @param durations - Time to event or censoring for each observation
 * @param events - Event indicator (1 = event, 0 = censored)
 * @param X - Covariate matrix [n_samples x n_features]
 * @param nowX - Covariate matrix for "now" predictions [n_predictions x n_features]
 * @param colNames - Names of the covariates
 * @param options - Fitting options
 */
export function fitJsCox(
  durations: number[],
  events: number[],
  X: number[][],
  nowX: number[][],
  colNames: string[],
  options: JsCoxOptions = {}
): JsCoxResult {
  const { penalizer = 0.01, maxIterations = 100, tolerance = 1e-6 } = options;

  const n = durations.length;
  const p = X[0]?.length || 0;

  if (n === 0 || p === 0) {
    return {
      coefficients: [],
      hazardRatios: [],
      partialHazards: [],
      colNames: [],
    };
  }

  // Sort by duration (descending) for risk set calculation
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((i, j) => durations[j] - durations[i]);

  const sortedDurations = indices.map(i => durations[i]);
  const sortedEvents = indices.map(i => events[i]);
  const sortedX = indices.map(i => X[i]);

  // Initialize coefficients to zero
  let beta = new Array(p).fill(0);

  // Newton-Raphson iterations for partial likelihood optimization
  for (let iter = 0; iter < maxIterations; iter++) {
    const gradient = new Array(p).fill(0);
    const hessian = Array.from({ length: p }, () => new Array(p).fill(0));

    // Calculate gradient and Hessian
    for (let i = 0; i < n; i++) {
      if (sortedEvents[i] === 0) continue;  // Skip censored observations

      const xi = sortedX[i];
      const riskSet: number[][] = [];
      
      // Find all observations in risk set (duration >= current duration)
      for (let j = 0; j < n; j++) {
        if (sortedDurations[j] >= sortedDurations[i]) {
          riskSet.push(sortedX[j]);
        }
      }

      // Calculate weighted sums for risk set
      let sumExp = 0;
      const sumExpX = new Array(p).fill(0);
      const sumExpXX = Array.from({ length: p }, () => new Array(p).fill(0));

      for (const xj of riskSet) {
        const expBetaX = Math.exp(dotProduct(beta, xj));
        sumExp += expBetaX;

        for (let k = 0; k < p; k++) {
          sumExpX[k] += expBetaX * xj[k];
          for (let l = 0; l < p; l++) {
            sumExpXX[k][l] += expBetaX * xj[k] * xj[l];
          }
        }
      }

      // Update gradient
      for (let k = 0; k < p; k++) {
        gradient[k] += xi[k] - sumExpX[k] / sumExp;
      }

      // Update Hessian
      for (let k = 0; k < p; k++) {
        for (let l = 0; l < p; l++) {
          const term1 = sumExpXX[k][l] / sumExp;
          const term2 = (sumExpX[k] * sumExpX[l]) / (sumExp * sumExp);
          hessian[k][l] -= (term1 - term2);
        }
      }
    }

    // Add ridge penalty to gradient and Hessian
    for (let k = 0; k < p; k++) {
      gradient[k] -= penalizer * beta[k];
      hessian[k][k] -= penalizer;
    }

    // Solve for update: H * delta = gradient
    const delta = solveLinearSystem(hessian, gradient);
    
    if (!delta) {
      break;  // Singular matrix, stop iterations
    }

    // Update beta
    let maxChange = 0;
    for (let k = 0; k < p; k++) {
      beta[k] += delta[k];
      maxChange = Math.max(maxChange, Math.abs(delta[k]));
    }

    // Check convergence
    if (maxChange < tolerance) {
      break;
    }
  }

  // Calculate hazard ratios
  const hazardRatios = beta.map(b => Math.exp(b));

  // Calculate partial hazards for "now" predictions
  const partialHazards = nowX.map(xi => {
    const linearPredictor = dotProduct(beta, xi);
    return Math.exp(linearPredictor);
  });

  return {
    coefficients: beta,
    hazardRatios,
    partialHazards,
    colNames,
  };
}

/**
 * Dot product of two vectors
 */
function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Solve linear system Ax = b using Gaussian elimination with partial pivoting
 * Returns null if matrix is singular
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  
  // Create augmented matrix [A | b]
  const aug = A.map((row, i) => [...row, b[i]]);

  // Forward elimination with partial pivoting
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
        maxRow = k;
      }
    }

    // Swap rows
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    // Check for singular matrix
    if (Math.abs(aug[i][i]) < 1e-10) {
      return null;
    }

    // Eliminate below
    for (let k = i + 1; k < n; k++) {
      const factor = aug[k][i] / aug[i][i];
      for (let j = i; j <= n; j++) {
        aug[k][j] -= factor * aug[i][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }

  return x;
}
