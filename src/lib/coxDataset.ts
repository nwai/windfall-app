/**
 * coxDataset.ts
 * 
 * Builds a dataset suitable for Cox Proportional Hazards modeling
 * from lottery draw history.
 */

import type { Draw } from "../types";

export interface CoxDatasetRow {
  number: number;
  duration: number;  // Time until event (or censoring)
  event: number;     // 1 = event occurred (number appeared), 0 = censored
  // Covariates
  freq_total_norm: number;
  time_since_last_norm: number;
  freq_fortnight_norm: number;
  freq_month_norm: number;
  freq_quarter_norm: number;
  tenure_norm: number;
  zone?: number;  // Optional zone grouping for stratification
}

export interface CoxDataset {
  rows: CoxDatasetRow[];
  maxDuration: number;
  maxFreqTotal: number;
  maxTimeSinceLast: number;
  maxTenure: number;
}

export interface BuildCoxDatasetOptions {
  includeZone?: boolean;
  excludeNumbers?: number[];
}

/**
 * Build a Cox dataset from lottery history
 * Each row represents a number's "survival" up to the current point
 */
export function buildCoxDataset(
  history: Draw[],
  options: BuildCoxDatasetOptions = {}
): CoxDataset {
  const { includeZone = false, excludeNumbers = [] } = options;
  
  if (history.length === 0) {
    return { rows: [], maxDuration: 0, maxFreqTotal: 0, maxTimeSinceLast: 0, maxTenure: 0 };
  }

  const currentIdx = history.length - 1;
  const rows: CoxDatasetRow[] = [];
  
  // Track max values for normalization
  let maxDuration = 0;
  let maxFreqTotal = 0;
  let maxTimeSinceLast = 0;
  let maxTenure = 0;

  for (let num = 1; num <= 45; num++) {
    if (excludeNumbers.includes(num)) continue;

    let freqTotal = 0;
    let firstSeen = -1;
    let lastSeen = -1;

    // Count appearances up to current index
    for (let i = 0; i <= currentIdx; i++) {
      const draw = history[i];
      const present = draw.main.includes(num) || draw.supp.includes(num);
      if (present) {
        freqTotal++;
        if (firstSeen === -1) firstSeen = i;
        lastSeen = i;
      }
    }

    // Calculate duration and event
    // Duration = draws since last appearance (or from start if never appeared)
    // Event = 1 if number appeared at least once, 0 if never appeared (censored)
    const timeSinceLast = lastSeen === -1 ? (currentIdx + 1) : (currentIdx - lastSeen);
    const duration = timeSinceLast;
    const event = lastSeen !== -1 ? 1 : 0;

    // Calculate tenure
    const tenure = firstSeen === -1 ? 0 : (currentIdx - firstSeen + 1);

    // Frequency in windows
    const countInWindow = (endIdx: number, win: number) => {
      let c = 0;
      for (let t = Math.max(0, endIdx - win + 1); t <= endIdx; t++) {
        const d = history[t];
        if (d.main.includes(num) || d.supp.includes(num)) c++;
      }
      return c;
    };

    const freqFortnight = countInWindow(currentIdx, 6);
    const freqMonth = countInWindow(currentIdx, 12);
    const freqQuarter = countInWindow(currentIdx, 36);

    // Calculate zone (1-45 divided into 9 zones of 5 numbers each)
    const zone = includeZone ? Math.floor((num - 1) / 5) + 1 : undefined;

    // Update max values
    maxDuration = Math.max(maxDuration, duration);
    maxFreqTotal = Math.max(maxFreqTotal, freqTotal);
    maxTimeSinceLast = Math.max(maxTimeSinceLast, timeSinceLast);
    maxTenure = Math.max(maxTenure, tenure);

    rows.push({
      number: num,
      duration,
      event,
      freq_total_norm: freqTotal,  // Will normalize later
      time_since_last_norm: timeSinceLast,  // Will normalize later
      freq_fortnight_norm: freqFortnight,
      freq_month_norm: freqMonth,
      freq_quarter_norm: freqQuarter,
      tenure_norm: tenure,  // Will normalize later
      zone,
    });
  }

  // Normalize all rows
  const normalizeValue = (value: number, max: number) => {
    return max > 0 ? value / max : 0;
  };

  rows.forEach(row => {
    row.freq_total_norm = normalizeValue(row.freq_total_norm, maxFreqTotal);
    row.time_since_last_norm = normalizeValue(row.time_since_last_norm, maxTimeSinceLast);
    row.tenure_norm = normalizeValue(row.tenure_norm, maxTenure);
    // Window frequencies are already small counts, normalize by window size
    row.freq_fortnight_norm = normalizeValue(row.freq_fortnight_norm, 6);
    row.freq_month_norm = normalizeValue(row.freq_month_norm, 12);
    row.freq_quarter_norm = normalizeValue(row.freq_quarter_norm, 36);
  });

  return { rows, maxDuration, maxFreqTotal, maxTimeSinceLast, maxTenure };
}

/**
 * Build "now" dataset for scoring current candidates
 * Returns the same structure as buildCoxDataset but for prediction
 */
export function buildNowDataset(
  history: Draw[],
  numbers: number[],
  options: BuildCoxDatasetOptions = {}
): CoxDatasetRow[] {
  const { includeZone = false } = options;
  
  if (history.length === 0) {
    return [];
  }

  const currentIdx = history.length - 1;
  const nowRows: CoxDatasetRow[] = [];

  // First pass: calculate max values for normalization
  let maxFreqTotal = 0;
  let maxTimeSinceLast = 0;
  let maxTenure = 0;

  const tempData: Array<{
    num: number;
    freqTotal: number;
    timeSinceLast: number;
    tenure: number;
    freqFortnight: number;
    freqMonth: number;
    freqQuarter: number;
  }> = [];

  for (const num of numbers) {
    let freqTotal = 0;
    let firstSeen = -1;
    let lastSeen = -1;

    for (let i = 0; i <= currentIdx; i++) {
      const draw = history[i];
      const present = draw.main.includes(num) || draw.supp.includes(num);
      if (present) {
        freqTotal++;
        if (firstSeen === -1) firstSeen = i;
        lastSeen = i;
      }
    }

    const timeSinceLast = lastSeen === -1 ? (currentIdx + 1) : (currentIdx - lastSeen);
    const tenure = firstSeen === -1 ? 0 : (currentIdx - firstSeen + 1);

    const countInWindow = (endIdx: number, win: number) => {
      let c = 0;
      for (let t = Math.max(0, endIdx - win + 1); t <= endIdx; t++) {
        const d = history[t];
        if (d.main.includes(num) || d.supp.includes(num)) c++;
      }
      return c;
    };

    const freqFortnight = countInWindow(currentIdx, 6);
    const freqMonth = countInWindow(currentIdx, 12);
    const freqQuarter = countInWindow(currentIdx, 36);

    maxFreqTotal = Math.max(maxFreqTotal, freqTotal);
    maxTimeSinceLast = Math.max(maxTimeSinceLast, timeSinceLast);
    maxTenure = Math.max(maxTenure, tenure);

    tempData.push({
      num,
      freqTotal,
      timeSinceLast,
      tenure,
      freqFortnight,
      freqMonth,
      freqQuarter,
    });
  }

  // Second pass: normalize and create rows
  const normalizeValue = (value: number, max: number) => {
    return max > 0 ? value / max : 0;
  };

  tempData.forEach(data => {
    const zone = includeZone ? Math.floor((data.num - 1) / 5) + 1 : undefined;
    
    nowRows.push({
      number: data.num,
      duration: 0,  // Not used for prediction
      event: 0,     // Not used for prediction
      freq_total_norm: normalizeValue(data.freqTotal, maxFreqTotal),
      time_since_last_norm: normalizeValue(data.timeSinceLast, maxTimeSinceLast),
      freq_fortnight_norm: normalizeValue(data.freqFortnight, 6),
      freq_month_norm: normalizeValue(data.freqMonth, 12),
      freq_quarter_norm: normalizeValue(data.freqQuarter, 36),
      tenure_norm: normalizeValue(data.tenure, maxTenure),
      zone,
    });
  });

  return nowRows;
}
