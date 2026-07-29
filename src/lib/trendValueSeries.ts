export interface TrendValueDraw {
  main: readonly number[];
  supp?: readonly number[];
}

export interface BuildTrendValueSeriesOptions {
  alpha?: number;
  hybridWeight?: number;
  maxNumber?: number;
}

const isValidNumber = (value: number, maxNumber: number): boolean =>
  Number.isInteger(value) && value >= 1 && value <= maxNumber;

/**
 * Builds the per-number hybrid trend/temperature series used by Trend Ratio
 * Diagnostics and the DGA temperature legend. The recency denominator is based
 * on the draw index currently being written, so prefix values are identical
 * whether or not future draws are appended later.
 */
export function buildTrendValueSeries(
  draws: readonly TrendValueDraw[],
  options: BuildTrendValueSeriesOptions = {},
): number[][] {
  const alpha = Number.isFinite(options.alpha) ? Math.min(1, Math.max(0, options.alpha ?? 0.25)) : 0.25;
  const hybridWeight = Number.isFinite(options.hybridWeight)
    ? Math.min(1, Math.max(0, options.hybridWeight ?? 0.6))
    : 0.6;
  const maxNumber = Number.isInteger(options.maxNumber) && (options.maxNumber ?? 0) > 0
    ? options.maxNumber ?? 45
    : 45;

  const series: number[][] = Array.from({ length: maxNumber }, () => []);
  const ema = Array(maxNumber).fill(0);
  const lastAge = Array(maxNumber).fill(Infinity);

  for (let t = 0; t < draws.length; t += 1) {
    const draw = draws[t];
    const present = new Set<number>();
    for (const value of [...draw.main, ...(draw.supp ?? [])]) {
      if (isValidNumber(value, maxNumber)) present.add(value);
    }

    for (let n = 1; n <= maxNumber; n += 1) {
      const i = n - 1;
      const hit = present.has(n) ? 1 : 0;
      ema[i] = alpha * hit + (1 - alpha) * ema[i];
      lastAge[i] = hit ? 0 : Math.min(lastAge[i] + 1, 9999);

      const recencyDenominator = Math.max(1, t);
      const recency = t > 0
        ? 1 - Math.min(1, lastAge[i] / recencyDenominator)
        : 0;
      let hybrid = hybridWeight * ema[i] + (1 - hybridWeight) * recency;
      if (hit) hybrid = 1;
      series[i].push(hybrid);
    }
  }

  return series;
}
