import type { Draw } from "../types";

export type TerminalStructureHistoryScope = "all-baseline" | "wfmqyh";
export type TerminalSequenceMotifLength = 2 | 3 | 4 | 5;

export interface TerminalStructureRate {
  trials: number;
  hits: number;
  observedRate: number | null;
  expectedHits: number;
  expectedRate: number | null;
  liftPercentagePoints: number | null;
  confidenceInterval: { low: number; high: number } | null;
}

export interface TerminalFamilyEvidenceRow extends TerminalStructureRate {
  digit: number;
  familyNumbers: number[];
  strictHits: number;
  strictObservedRate: number | null;
  strictExpectedRate: number;
}

export type TerminalFamilyCurrentStatus =
  | "continuing-reseeded"
  | "continuing"
  | "confirmed"
  | "seed-awaiting"
  | "present-once"
  | "ended"
  | "absent";

export interface TerminalFamilyCurrentRow {
  digit: number;
  familyNumbers: number[];
  previousNumbers: number[];
  currentNumbers: number[];
  previousHits: number;
  currentHits: number;
  status: TerminalFamilyCurrentStatus;
  runSpan: number;
}

export interface TerminalFamilyRunSummary {
  drawCount: number;
  testableDrawCount: number;
  drawsWithRepeatedFamily: number;
  seedDrawCount: number;
  seedDrawsWithContinuation: number;
  eventRate: TerminalStructureRate;
  strictRate: TerminalStructureRate;
  rows: TerminalFamilyEvidenceRow[];
  currentRows: TerminalFamilyCurrentRow[];
}

export type TerminalMotifCurrentStatus = "carried" | "new" | "ended" | "absent";

export interface TerminalSequenceMotifRow extends TerminalStructureRate {
  startDigit: number;
  digits: number[];
  previousPresent: boolean;
  currentPresent: boolean;
  currentStatus: TerminalMotifCurrentStatus;
}

export interface TerminalSequenceMotifSummary {
  length: TerminalSequenceMotifLength;
  drawsWithAnyMotif: number;
  transitionDrawCount: number;
  transitionsWithAnyMotif: number;
  transitionsWithExactCarry: number;
  aggregateRate: TerminalStructureRate;
  rows: TerminalSequenceMotifRow[];
}

export type TerminalSequenceMovementKind =
  | "exact"
  | "shift-backward"
  | "shift-forward"
  | "expand"
  | "contract";

export interface TerminalSequenceMovementRow extends TerminalStructureRate {
  kind: TerminalSequenceMovementKind;
  label: string;
  definition: string;
  available: boolean;
}

export interface TerminalSequenceCurrentMovementRow {
  sourceDigits: number[];
  matchedKinds: TerminalSequenceMovementKind[];
  matchedTargets: string[];
}

export interface TerminalSequenceMovementSummary {
  length: TerminalSequenceMotifLength;
  rows: TerminalSequenceMovementRow[];
  currentRows: TerminalSequenceCurrentMovementRow[];
}

export interface TerminalStructureTransitionAnalysis {
  includeSupp: boolean;
  drawSize: number;
  historyScope: TerminalStructureHistoryScope;
  scopeLabel: string;
  evidenceMonthCount: number;
  evidenceDrawCount: number;
  latestDate: string | null;
  currentMonthKey: string | null;
  currentDrawOrdinal: number | null;
  previousDrawOrdinal: number | null;
  familyRuns: TerminalFamilyRunSummary;
  motifs: TerminalSequenceMotifSummary;
  movements: TerminalSequenceMovementSummary;
  warnings: string[];
}

export interface AnalyzeTerminalStructureTransitionsOptions {
  includeSupp?: boolean;
  historyScope?: TerminalStructureHistoryScope;
  motifLength?: TerminalSequenceMotifLength;
  contextDraws?: readonly Draw[];
  maxNumber?: number;
}

interface PreparedDraw {
  date: string;
  dateKey: string;
  monthKey: string;
  timestamp: number;
  numbers: number[];
  digitCounts: number[];
}

interface PreparedMonth {
  monthKey: string;
  draws: PreparedDraw[];
  expectedDateKeys: string[];
  complete: boolean;
  prefixComplete: boolean;
}

interface PreparedHistory {
  months: PreparedMonth[];
  simulatedRowsIgnored: number;
  invalidRowsIgnored: number;
}

interface TransitionPair {
  monthKey: string;
  source: PreparedDraw;
  target: PreparedDraw;
}

interface MovementAccumulator {
  trials: number;
  hits: number;
  expectedHits: number;
}

const MIN_NUMBER = 1;
const DEFAULT_MAX_NUMBER = 45;
const DRAW_WEEKDAYS = new Set([1, 3, 5]);
const clampInteger = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, Math.floor(Number.isFinite(value) ? value : minimum)))
);

const terminalDigit = (number: number): number => ((number % 10) + 10) % 10;

const parseDrawDate = (rawDate: string): Omit<PreparedDraw, "date" | "numbers" | "digitCounts"> | null => {
  const iso = rawDate.match(/^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/);
  const slash = rawDate.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (slash) {
    month = Number(slash[1]);
    day = Number(slash[2]);
    year = Number(slash[3]);
    if (year < 100) year += 2000;
  } else {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
    || !DRAW_WEEKDAYS.has(date.getDay())
  ) {
    return null;
  }

  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return {
    timestamp: date.getTime(),
    dateKey: `${year}-${monthText}-${dayText}`,
    monthKey: `${year}-${monthText}`,
  };
};

const expectedDateKeysForMonth = (monthKey: string): string[] => {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const keys: string[] = [];

  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1) break;
    if (!DRAW_WEEKDAYS.has(date.getDay())) continue;
    keys.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return keys;
};

const normalizeNumbers = (
  draw: Draw,
  includeSupp: boolean,
  maxNumber: number,
): number[] | null => {
  const expectedCount = includeSupp ? 8 : 6;
  const source = includeSupp ? [...draw.main, ...draw.supp] : [...draw.main];
  if (source.length !== expectedCount) return null;
  if (source.some((number) => !Number.isInteger(number) || number < MIN_NUMBER || number > maxNumber)) return null;
  const unique = [...new Set(source)];
  return unique.length === expectedCount ? unique : null;
};

const digitCountsFor = (numbers: readonly number[]): number[] => {
  const counts = Array(10).fill(0) as number[];
  numbers.forEach((number) => {
    counts[terminalDigit(number)] += 1;
  });
  return counts;
};

const prepareHistory = (
  draws: readonly Draw[],
  includeSupp: boolean,
  maxNumber: number,
): PreparedHistory => {
  const grouped = new Map<string, Map<string, PreparedDraw>>();
  let simulatedRowsIgnored = 0;
  let invalidRowsIgnored = 0;

  draws.forEach((draw) => {
    if (draw.isSimulated) {
      simulatedRowsIgnored += 1;
      return;
    }
    const parsedDate = parseDrawDate(draw.date);
    const numbers = normalizeNumbers(draw, includeSupp, maxNumber);
    if (!parsedDate || !numbers) {
      invalidRowsIgnored += 1;
      return;
    }
    const month = grouped.get(parsedDate.monthKey) ?? new Map<string, PreparedDraw>();
    if (month.has(parsedDate.dateKey)) {
      invalidRowsIgnored += 1;
      return;
    }
    month.set(parsedDate.dateKey, {
      date: draw.date,
      ...parsedDate,
      numbers,
      digitCounts: digitCountsFor(numbers),
    });
    grouped.set(parsedDate.monthKey, month);
  });

  const months = [...grouped.entries()]
    .map(([monthKey, monthMap]) => {
      const expectedDateKeys = expectedDateKeysForMonth(monthKey);
      const monthDraws = [...monthMap.values()]
        .sort((left, right) => left.timestamp - right.timestamp || left.dateKey.localeCompare(right.dateKey));
      const actualDateKeys = monthDraws.map((draw) => draw.dateKey);
      const prefixComplete = actualDateKeys.every((dateKey, index) => dateKey === expectedDateKeys[index]);
      const complete = expectedDateKeys.length > 0
        && actualDateKeys.length === expectedDateKeys.length
        && prefixComplete;
      return { monthKey, draws: monthDraws, expectedDateKeys, complete, prefixComplete };
    })
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));

  return { months, simulatedRowsIgnored, invalidRowsIgnored };
};

const combination = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  const reducedK = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= reducedK; index += 1) {
    result *= (n - reducedK + index) / index;
  }
  return result;
};

const familyNumbersForDigit = (digit: number, maxNumber: number): number[] => {
  const numbers: number[] = [];
  for (let number = MIN_NUMBER; number <= maxNumber; number += 1) {
    if (terminalDigit(number) === digit) numbers.push(number);
  }
  return numbers;
};

const probabilityAtLeast = (
  population: number,
  familySize: number,
  drawSize: number,
  minimumHits: number,
): number => {
  const denominator = combination(population, drawSize);
  if (denominator <= 0) return 0;
  let probability = 0;
  for (let hits = minimumHits; hits <= Math.min(familySize, drawSize); hits += 1) {
    probability += (
      combination(familySize, hits)
      * combination(population - familySize, drawSize - hits)
    ) / denominator;
  }
  return probability;
};

const uniqueDigits = (motifs: readonly number[][]): number[] => (
  [...new Set(motifs.flat())].sort((left, right) => left - right)
);

const probabilityAllDigitsPresent = (
  digits: readonly number[],
  drawSize: number,
  maxNumber: number,
): number => {
  const selected = [...new Set(digits)];
  const denominator = combination(maxNumber, drawSize);
  if (!selected.length || denominator <= 0 || selected.length > drawSize) return 0;
  let probability = 0;
  const subsets = 1 << selected.length;

  for (let mask = 0; mask < subsets; mask += 1) {
    let removed = 0;
    let bits = 0;
    selected.forEach((digit, index) => {
      if ((mask & (1 << index)) === 0) return;
      removed += familyNumbersForDigit(digit, maxNumber).length;
      bits += 1;
    });
    const term = combination(maxNumber - removed, drawSize) / denominator;
    probability += bits % 2 === 0 ? term : -term;
  }
  return Math.min(1, Math.max(0, probability));
};

const probabilityAnyMotifPresent = (
  motifs: readonly number[][],
  drawSize: number,
  maxNumber: number,
): number => {
  const uniqueMotifs = motifs.filter((motif, index) => (
    motifs.findIndex((candidate) => candidate.join(",") === motif.join(",")) === index
  ));
  if (!uniqueMotifs.length) return 0;
  if (uniqueMotifs.length === 1) return probabilityAllDigitsPresent(uniqueMotifs[0], drawSize, maxNumber);
  if (uniqueMotifs.length === 2) {
    return Math.min(1, Math.max(0,
      probabilityAllDigitsPresent(uniqueMotifs[0], drawSize, maxNumber)
      + probabilityAllDigitsPresent(uniqueMotifs[1], drawSize, maxNumber)
      - probabilityAllDigitsPresent(uniqueDigits(uniqueMotifs), drawSize, maxNumber),
    ));
  }
  return 0;
};

const motifFor = (startDigit: number, length: number): number[] => (
  Array.from({ length }, (_, offset) => (startDigit + offset + 10) % 10)
);

const motifPresent = (draw: PreparedDraw, motif: readonly number[]): boolean => (
  motif.every((digit) => draw.digitCounts[digit] > 0)
);

const wilsonInterval = (hits: number, trials: number): { low: number; high: number } | null => {
  if (trials <= 0) return null;
  const z = 1.96;
  const observed = hits / trials;
  const denominator = 1 + ((z * z) / trials);
  const center = (observed + ((z * z) / (2 * trials))) / denominator;
  const half = (
    z * Math.sqrt(((observed * (1 - observed)) / trials) + ((z * z) / (4 * trials * trials)))
  ) / denominator;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
};

const buildRate = (
  trials: number,
  hits: number,
  expectedHits: number,
): TerminalStructureRate => {
  const observedRate = trials > 0 ? hits / trials : null;
  const expectedRate = trials > 0 ? expectedHits / trials : null;
  return {
    trials,
    hits,
    observedRate,
    expectedHits,
    expectedRate,
    liftPercentagePoints: observedRate !== null && expectedRate !== null
      ? (observedRate - expectedRate) * 100
      : null,
    confidenceInterval: wilsonInterval(hits, trials),
  };
};

const consecutivePairsForMonth = (month: PreparedMonth): TransitionPair[] => {
  const expectedIndex = new Map(month.expectedDateKeys.map((dateKey, index) => [dateKey, index]));
  const pairs: TransitionPair[] = [];
  for (let index = 0; index < month.draws.length - 1; index += 1) {
    const source = month.draws[index];
    const target = month.draws[index + 1];
    const sourceIndex = expectedIndex.get(source.dateKey);
    const targetIndex = expectedIndex.get(target.dateKey);
    if (sourceIndex === undefined || targetIndex !== sourceIndex + 1) continue;
    pairs.push({ monthKey: month.monthKey, source, target });
  }
  return pairs;
};

const latestContextMonth = (history: PreparedHistory): PreparedMonth | null => (
  history.months.length ? history.months[history.months.length - 1] : null
);

const activeConfirmedSeedIndex = (counts: readonly number[][], digit: number, endIndex: number): number | null => {
  if (endIndex < 0 || counts[endIndex]?.[digit] <= 0) return null;
  let streakStart = endIndex;
  while (streakStart > 0 && counts[streakStart - 1][digit] > 0) streakStart -= 1;
  for (let index = streakStart; index < endIndex; index += 1) {
    if (counts[index][digit] >= 2 && counts[index + 1][digit] > 0) return index;
  }
  return null;
};

const buildCurrentFamilyRows = (
  currentMonth: PreparedMonth | null,
  maxNumber: number,
): TerminalFamilyCurrentRow[] => {
  const counts = currentMonth?.draws.map((draw) => draw.digitCounts) ?? [];
  const currentIndex = counts.length - 1;
  const previousIndex = currentIndex - 1;
  const currentDraw = currentMonth?.draws[currentIndex] ?? null;
  const previousDraw = currentMonth?.draws[previousIndex] ?? null;

  return Array.from({ length: 10 }, (_, digit) => {
    const currentHits = currentDraw?.digitCounts[digit] ?? 0;
    const previousHits = previousDraw?.digitCounts[digit] ?? 0;
    const confirmedSeedIndex = activeConfirmedSeedIndex(counts, digit, currentIndex);
    const previousConfirmedSeedIndex = activeConfirmedSeedIndex(counts, digit, previousIndex);
    let status: TerminalFamilyCurrentStatus = "absent";
    let runSpan = 0;

    if (currentHits > 0 && confirmedSeedIndex !== null) {
      runSpan = currentIndex - confirmedSeedIndex + 1;
      if (currentHits >= 2) status = "continuing-reseeded";
      else status = runSpan === 2 ? "confirmed" : "continuing";
    } else if (currentHits >= 2) {
      status = "seed-awaiting";
      runSpan = 1;
    } else if (currentHits === 1) {
      status = "present-once";
      runSpan = 1;
    } else if (previousConfirmedSeedIndex !== null) {
      status = "ended";
    }

    return {
      digit,
      familyNumbers: familyNumbersForDigit(digit, maxNumber),
      previousNumbers: previousDraw?.numbers.filter((number) => terminalDigit(number) === digit) ?? [],
      currentNumbers: currentDraw?.numbers.filter((number) => terminalDigit(number) === digit) ?? [],
      previousHits,
      currentHits,
      status,
      runSpan,
    };
  });
};

const buildFamilySummary = (
  evidenceMonths: readonly PreparedMonth[],
  pairs: readonly TransitionPair[],
  currentMonth: PreparedMonth | null,
  drawSize: number,
  maxNumber: number,
): TerminalFamilyRunSummary => {
  const familyAccumulators = Array.from({ length: 10 }, (_, digit) => ({
    digit,
    trials: 0,
    hits: 0,
    strictHits: 0,
    expectedHits: 0,
    strictExpectedHits: 0,
  }));
  let seedDrawCount = 0;
  let seedDrawsWithContinuation = 0;
  let eventTrials = 0;
  let eventHits = 0;
  let eventExpectedHits = 0;
  let strictHits = 0;
  let strictExpectedHits = 0;

  pairs.forEach(({ source, target }) => {
    const seededDigits = source.digitCounts
      .map((count, digit) => ({ count, digit }))
      .filter(({ count }) => count >= 2)
      .map(({ digit }) => digit);
    if (seededDigits.length) seedDrawCount += 1;
    let continued = false;

    seededDigits.forEach((digit) => {
      const familySize = familyNumbersForDigit(digit, maxNumber).length;
      const expected = probabilityAtLeast(maxNumber, familySize, drawSize, 1);
      const strictExpected = probabilityAtLeast(maxNumber, familySize, drawSize, 2);
      const hit = target.digitCounts[digit] > 0;
      const strictHit = target.digitCounts[digit] >= 2;
      const accumulator = familyAccumulators[digit];
      accumulator.trials += 1;
      accumulator.hits += Number(hit);
      accumulator.strictHits += Number(strictHit);
      accumulator.expectedHits += expected;
      accumulator.strictExpectedHits += strictExpected;
      eventTrials += 1;
      eventHits += Number(hit);
      eventExpectedHits += expected;
      strictHits += Number(strictHit);
      strictExpectedHits += strictExpected;
      continued ||= hit;
    });
    if (continued) seedDrawsWithContinuation += 1;
  });

  const rows = familyAccumulators.map((row) => {
    const rate = buildRate(row.trials, row.hits, row.expectedHits);
    return {
      digit: row.digit,
      familyNumbers: familyNumbersForDigit(row.digit, maxNumber),
      ...rate,
      strictHits: row.strictHits,
      strictObservedRate: row.trials > 0 ? row.strictHits / row.trials : null,
      strictExpectedRate: row.trials > 0 ? row.strictExpectedHits / row.trials : 0,
    };
  });

  const evidenceDraws = evidenceMonths.flatMap((month) => month.draws);
  return {
    drawCount: evidenceDraws.length,
    testableDrawCount: pairs.length,
    drawsWithRepeatedFamily: evidenceDraws.filter((draw) => draw.digitCounts.some((count) => count >= 2)).length,
    seedDrawCount,
    seedDrawsWithContinuation,
    eventRate: buildRate(eventTrials, eventHits, eventExpectedHits),
    strictRate: buildRate(eventTrials, strictHits, strictExpectedHits),
    rows,
    currentRows: buildCurrentFamilyRows(currentMonth, maxNumber),
  };
};

const motifStatus = (previousPresent: boolean, currentPresent: boolean): TerminalMotifCurrentStatus => {
  if (previousPresent && currentPresent) return "carried";
  if (!previousPresent && currentPresent) return "new";
  if (previousPresent) return "ended";
  return "absent";
};

const buildMotifSummary = (
  evidenceMonths: readonly PreparedMonth[],
  pairs: readonly TransitionPair[],
  currentPair: TransitionPair | null,
  length: TerminalSequenceMotifLength,
  drawSize: number,
  maxNumber: number,
): TerminalSequenceMotifSummary => {
  const motifs = Array.from({ length: 10 }, (_, startDigit) => ({
    startDigit,
    digits: motifFor(startDigit, length),
    trials: 0,
    hits: 0,
    expectedHits: 0,
  }));
  let transitionsWithAnyMotif = 0;
  let transitionsWithExactCarry = 0;

  pairs.forEach(({ source, target }) => {
    let anySource = false;
    let anyCarry = false;
    motifs.forEach((row) => {
      if (!motifPresent(source, row.digits)) return;
      anySource = true;
      const hit = motifPresent(target, row.digits);
      row.trials += 1;
      row.hits += Number(hit);
      row.expectedHits += probabilityAllDigitsPresent(row.digits, drawSize, maxNumber);
      anyCarry ||= hit;
    });
    if (anySource) transitionsWithAnyMotif += 1;
    if (anyCarry) transitionsWithExactCarry += 1;
  });

  const aggregate = motifs.reduce(
    (totals, row) => ({
      trials: totals.trials + row.trials,
      hits: totals.hits + row.hits,
      expectedHits: totals.expectedHits + row.expectedHits,
    }),
    { trials: 0, hits: 0, expectedHits: 0 },
  );
  const rows = motifs.map((row) => {
    const previousPresent = currentPair ? motifPresent(currentPair.source, row.digits) : false;
    const currentPresent = currentPair ? motifPresent(currentPair.target, row.digits) : false;
    return {
      startDigit: row.startDigit,
      digits: row.digits,
      ...buildRate(row.trials, row.hits, row.expectedHits),
      previousPresent,
      currentPresent,
      currentStatus: motifStatus(previousPresent, currentPresent),
    };
  });

  return {
    length,
    drawsWithAnyMotif: evidenceMonths.flatMap((month) => month.draws)
      .filter((draw) => motifs.some((motif) => motifPresent(draw, motif.digits))).length,
    transitionDrawCount: pairs.length,
    transitionsWithAnyMotif,
    transitionsWithExactCarry,
    aggregateRate: buildRate(aggregate.trials, aggregate.hits, aggregate.expectedHits),
    rows,
  };
};

const movementTargets = (
  startDigit: number,
  length: TerminalSequenceMotifLength,
  kind: TerminalSequenceMovementKind,
): number[][] => {
  switch (kind) {
    case "exact":
      return [motifFor(startDigit, length)];
    case "shift-backward":
      return [motifFor(startDigit - 1, length)];
    case "shift-forward":
      return [motifFor(startDigit + 1, length)];
    case "expand":
      return [motifFor(startDigit - 1, length + 1), motifFor(startDigit, length + 1)];
    case "contract":
      return length > 2
        ? [motifFor(startDigit, length - 1), motifFor(startDigit + 1, length - 1)]
        : [];
    default:
      return [];
  }
};

const MOVEMENT_DETAILS: Record<TerminalSequenceMovementKind, { label: string; definition: string }> = {
  exact: {
    label: "Exact carry",
    definition: "The same complete sequence motif appears in the immediately following draw.",
  },
  "shift-backward": {
    label: "Shift -1",
    definition: "Every digit moves one circular step backward, such as 0-1-2 to 9-0-1.",
  },
  "shift-forward": {
    label: "Shift +1",
    definition: "Every digit moves one circular step forward, such as 6-7-8 to 7-8-9.",
  },
  expand: {
    label: "Expand one edge",
    definition: "The next draw contains the source motif plus one adjacent terminal digit.",
  },
  contract: {
    label: "Contract one edge",
    definition: "The next draw retains either contiguous inner sub-motif after one edge is removed.",
  },
};

const buildMovementSummary = (
  pairs: readonly TransitionPair[],
  currentPair: TransitionPair | null,
  length: TerminalSequenceMotifLength,
  drawSize: number,
  maxNumber: number,
): TerminalSequenceMovementSummary => {
  const kinds: TerminalSequenceMovementKind[] = [
    "exact",
    "shift-backward",
    "shift-forward",
    "expand",
    "contract",
  ];
  const accumulators = new Map<TerminalSequenceMovementKind, MovementAccumulator>(
    kinds.map((kind) => [kind, { trials: 0, hits: 0, expectedHits: 0 }]),
  );
  const motifs = Array.from({ length: 10 }, (_, startDigit) => ({
    startDigit,
    digits: motifFor(startDigit, length),
  }));

  pairs.forEach(({ source, target }) => {
    motifs.forEach((motif) => {
      if (!motifPresent(source, motif.digits)) return;
      kinds.forEach((kind) => {
        const targets = movementTargets(motif.startDigit, length, kind);
        if (!targets.length) return;
        const accumulator = accumulators.get(kind);
        if (!accumulator) return;
        accumulator.trials += 1;
        accumulator.hits += Number(targets.some((targetMotif) => motifPresent(target, targetMotif)));
        accumulator.expectedHits += probabilityAnyMotifPresent(targets, drawSize, maxNumber);
      });
    });
  });

  const rows = kinds.map((kind) => {
    const accumulator = accumulators.get(kind) ?? { trials: 0, hits: 0, expectedHits: 0 };
    const details = MOVEMENT_DETAILS[kind];
    const available = kind !== "contract" || length > 2;
    return {
      kind,
      label: details.label,
      definition: details.definition,
      available,
      ...buildRate(accumulator.trials, accumulator.hits, accumulator.expectedHits),
    };
  });

  const currentRows = currentPair
    ? motifs
      .filter((motif) => motifPresent(currentPair.source, motif.digits))
      .map((motif) => {
        const matchedKinds: TerminalSequenceMovementKind[] = [];
        const matchedTargets = new Set<string>();
        kinds.forEach((kind) => {
          const targets = movementTargets(motif.startDigit, length, kind);
          targets.forEach((targetMotif) => {
            if (!motifPresent(currentPair.target, targetMotif)) return;
            matchedKinds.push(kind);
            matchedTargets.add(targetMotif.join("-"));
          });
        });
        return {
          sourceDigits: motif.digits,
          matchedKinds: [...new Set(matchedKinds)],
          matchedTargets: [...matchedTargets],
        };
      })
    : [];

  return { length, rows, currentRows };
};

export const analyzeTerminalStructureTransitions = (
  evidenceDraws: readonly Draw[],
  options: AnalyzeTerminalStructureTransitionsOptions = {},
): TerminalStructureTransitionAnalysis => {
  const includeSupp = options.includeSupp ?? true;
  const drawSize = includeSupp ? 8 : 6;
  const historyScope = options.historyScope ?? "all-baseline";
  const motifLength = clampInteger(options.motifLength ?? 3, 2, 5) as TerminalSequenceMotifLength;
  const maxNumber = clampInteger(options.maxNumber ?? DEFAULT_MAX_NUMBER, 10, DEFAULT_MAX_NUMBER);
  const evidenceHistory = prepareHistory(evidenceDraws, includeSupp, maxNumber);
  const contextDraws = options.contextDraws ?? evidenceDraws;
  const sharesPreparedHistory = contextDraws === evidenceDraws;
  const contextHistory = sharesPreparedHistory
    ? evidenceHistory
    : prepareHistory(contextDraws, includeSupp, maxNumber);
  const evidenceMonths = historyScope === "all-baseline"
    ? evidenceHistory.months.filter((month) => month.complete)
    : evidenceHistory.months;
  const pairs = evidenceMonths.flatMap(consecutivePairsForMonth);
  const currentMonth = latestContextMonth(contextHistory);
  const currentPairs = currentMonth ? consecutivePairsForMonth(currentMonth) : [];
  const currentPair = currentPairs.length && currentMonth?.prefixComplete
    ? currentPairs[currentPairs.length - 1]
    : null;
  const evidenceDrawCount = evidenceMonths.reduce((sum, month) => sum + month.draws.length, 0);
  const warnings: string[] = [];

  const simulatedRowsIgnored = evidenceHistory.simulatedRowsIgnored
    + (sharesPreparedHistory ? 0 : contextHistory.simulatedRowsIgnored);
  const invalidRowsIgnored = evidenceHistory.invalidRowsIgnored
    + (sharesPreparedHistory ? 0 : contextHistory.invalidRowsIgnored);
  if (simulatedRowsIgnored > 0) {
    warnings.push(`Ignored ${simulatedRowsIgnored} simulated row reference${simulatedRowsIgnored === 1 ? "" : "s"}; this lab uses real draws only.`);
  }
  if (invalidRowsIgnored > 0) {
    warnings.push(`Ignored ${invalidRowsIgnored} invalid, duplicate-date, incomplete, or off-schedule row reference${invalidRowsIgnored === 1 ? "" : "s"}.`);
  }
  if (historyScope === "all-baseline" && evidenceMonths.length === 0) {
    warnings.push("No complete real calendar month is available for baseline transition evidence.");
  }
  if (historyScope === "wfmqyh" && pairs.length === 0) {
    warnings.push("The active WFMQYH window contains no consecutive same-month draw pair to evaluate.");
  }
  if (currentMonth && !currentMonth.prefixComplete) {
    warnings.push(`Current month ${currentMonth.monthKey} is not an unbroken scheduled prefix, so live transition state is withheld.`);
  }
  warnings.push("Family and motif events can share the same draw transition, so rows are not independent; approximate intervals are descriptive and are not corrected for inspecting several families, motifs, or movement types.");

  const latestDraw = currentMonth?.draws[currentMonth.draws.length - 1] ?? null;
  const currentDrawOrdinal = currentMonth && latestDraw
    ? currentMonth.expectedDateKeys.indexOf(latestDraw.dateKey) + 1
    : null;
  const previousDrawOrdinal = currentPair
    ? currentMonth?.expectedDateKeys.indexOf(currentPair.source.dateKey) ?? -1
    : -1;

  return {
    includeSupp,
    drawSize,
    historyScope,
    scopeLabel: historyScope === "all-baseline"
      ? `${evidenceMonths.length} completed real calendar month${evidenceMonths.length === 1 ? "" : "s"}; incomplete months excluded`
      : `${evidenceDrawCount} real active-WFMQYH draw${evidenceDrawCount === 1 ? "" : "s"}; consecutive scheduled pairs only`,
    evidenceMonthCount: evidenceMonths.length,
    evidenceDrawCount,
    latestDate: latestDraw?.date ?? null,
    currentMonthKey: currentMonth?.monthKey ?? null,
    currentDrawOrdinal: currentDrawOrdinal && currentDrawOrdinal > 0 ? currentDrawOrdinal : null,
    previousDrawOrdinal: previousDrawOrdinal >= 0 ? previousDrawOrdinal + 1 : null,
    familyRuns: buildFamilySummary(evidenceMonths, pairs, currentMonth?.prefixComplete ? currentMonth : null, drawSize, maxNumber),
    motifs: buildMotifSummary(evidenceMonths, pairs, currentPair, motifLength, drawSize, maxNumber),
    movements: buildMovementSummary(pairs, currentPair, motifLength, drawSize, maxNumber),
    warnings,
  };
};
