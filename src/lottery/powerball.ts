export interface PowerballEntry {
  id: string;
  main: number[];
  powerball: number;
}

export interface PowerballEntryProfile {
  sum: number;
  odd: number;
  even: number;
  low: number;
  high: number;
  bandCounts: Array<{ label: string; count: number }>;
}

export interface PowerballBatchSummary {
  entryCount: number;
  distinctMainNumbers: number;
  distinctPowerballs: number;
  mainCoveragePercent: number;
  powerballCoveragePercent: number;
  averageMainSum: number;
  oddEvenLabel: string;
}

interface RandomSource {
  nextInt: (maxExclusive: number) => number;
}

export const AUSTRALIAN_POWERBALL_CONFIG = {
  name: "Australian Powerball",
  mainCount: 7,
  mainMin: 1,
  mainMax: 35,
  powerballMin: 1,
  powerballMax: 20,
  maxGeneratedEntries: 24,
  defaultGeneratedEntries: 8,
  sourceUrls: {
    theLott: "https://www.thelott.com/powerball/how-to-play",
    lottolyzer: "https://en.lottolyzer.com/home/australia/powerball/summary-view",
  },
} as const;

const UINT32_RANGE = 0x100000000;

const defaultRandomSource: RandomSource = {
  nextInt: (maxExclusive: number) => secureRandomInt(maxExclusive),
};

export function clampPowerballEntryCount(value: number): number {
  if (!Number.isFinite(value)) return AUSTRALIAN_POWERBALL_CONFIG.defaultGeneratedEntries;
  return Math.max(1, Math.min(AUSTRALIAN_POWERBALL_CONFIG.maxGeneratedEntries, Math.round(value)));
}

export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(`maxExclusive must be a positive integer. Received ${maxExclusive}`);
  }

  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    const value = new Uint32Array(1);

    do {
      cryptoApi.getRandomValues(value);
    } while (value[0] >= limit);

    return value[0] % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

export function rangeInclusive(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

export function sampleUniqueNumbers(
  count: number,
  min: number,
  max: number,
  randomSource: RandomSource = defaultRandomSource,
): number[] {
  const pool = rangeInclusive(min, max);
  if (count > pool.length) {
    throw new Error(`Cannot draw ${count} unique numbers from a ${pool.length}-number pool.`);
  }

  const selected: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const swapIndex = index + randomSource.nextInt(pool.length - index);
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    selected.push(pool[index]);
  }

  return selected.sort((left, right) => left - right);
}

export function generatePowerballEntry(index = 0, randomSource: RandomSource = defaultRandomSource): PowerballEntry {
  return {
    id: `pb-${Date.now()}-${index}`,
    main: sampleUniqueNumbers(
      AUSTRALIAN_POWERBALL_CONFIG.mainCount,
      AUSTRALIAN_POWERBALL_CONFIG.mainMin,
      AUSTRALIAN_POWERBALL_CONFIG.mainMax,
      randomSource,
    ),
    powerball: AUSTRALIAN_POWERBALL_CONFIG.powerballMin
      + randomSource.nextInt(AUSTRALIAN_POWERBALL_CONFIG.powerballMax),
  };
}

export function generatePowerballEntries(
  count: number,
  randomSource: RandomSource = defaultRandomSource,
): PowerballEntry[] {
  return Array.from({ length: clampPowerballEntryCount(count) }, (_, index) => (
    generatePowerballEntry(index, randomSource)
  ));
}

export function buildPowerballEntryProfile(entry: PowerballEntry): PowerballEntryProfile {
  const odd = entry.main.filter((number) => number % 2 === 1).length;
  const even = entry.main.length - odd;
  const sum = entry.main.reduce((total, number) => total + number, 0);

  return {
    sum,
    odd,
    even,
    low: entry.main.filter((number) => number <= 17).length,
    high: entry.main.filter((number) => number >= 18).length,
    bandCounts: [
      { label: "1-10", count: entry.main.filter((number) => number >= 1 && number <= 10).length },
      { label: "11-20", count: entry.main.filter((number) => number >= 11 && number <= 20).length },
      { label: "21-30", count: entry.main.filter((number) => number >= 21 && number <= 30).length },
      { label: "31-35", count: entry.main.filter((number) => number >= 31 && number <= 35).length },
    ],
  };
}

export function summarizePowerballEntries(entries: readonly PowerballEntry[]): PowerballBatchSummary {
  const mainNumbers = entries.flatMap((entry) => entry.main);
  const profiles = entries.map(buildPowerballEntryProfile);
  const oddTotal = profiles.reduce((total, profile) => total + profile.odd, 0);
  const evenTotal = profiles.reduce((total, profile) => total + profile.even, 0);
  const mainPoolSize = AUSTRALIAN_POWERBALL_CONFIG.mainMax - AUSTRALIAN_POWERBALL_CONFIG.mainMin + 1;
  const powerballPoolSize = AUSTRALIAN_POWERBALL_CONFIG.powerballMax - AUSTRALIAN_POWERBALL_CONFIG.powerballMin + 1;

  return {
    entryCount: entries.length,
    distinctMainNumbers: new Set(mainNumbers).size,
    distinctPowerballs: new Set(entries.map((entry) => entry.powerball)).size,
    mainCoveragePercent: entries.length ? Math.round((new Set(mainNumbers).size / mainPoolSize) * 100) : 0,
    powerballCoveragePercent: entries.length
      ? Math.round((new Set(entries.map((entry) => entry.powerball)).size / powerballPoolSize) * 100)
      : 0,
    averageMainSum: entries.length
      ? Math.round(profiles.reduce((total, profile) => total + profile.sum, 0) / entries.length)
      : 0,
    oddEvenLabel: `${oddTotal}:${evenTotal}`,
  };
}

export function formatPowerballEntriesCsv(entries: readonly PowerballEntry[]): string {
  const header = ["Entry", "Main 1", "Main 2", "Main 3", "Main 4", "Main 5", "Main 6", "Main 7", "Powerball"];
  const rows = entries.map((entry, index) => [
    String(index + 1),
    ...entry.main.map(String),
    String(entry.powerball),
  ]);

  return [header, ...rows]
    .map((row) => row.join(","))
    .join("\n");
}
