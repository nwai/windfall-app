import { parsePastedCandidateNumbers, type PastedCandidateRow } from "./pasteWeightedCandidates";

const MIN_CORE_SIZE = 6;
const DEFAULT_ALTERNATE_COUNT = 12;
const VALID_PORTFOLIO_ROW_SIZES = new Set([6, 8]);

export type PortfolioCompressionRole = "core" | "alternate" | "watch";

export interface PortfolioCompressionNumber {
  number: number;
  rank: number;
  gameCount: number;
  rowShare: number;
  appearances: number[];
  role: PortfolioCompressionRole;
}

export interface PortfolioCompressionResult {
  rows: PastedCandidateRow[];
  acceptedRows: number;
  totalRows: number;
  totalCountedNumbers: number;
  uniqueNumbers: number;
  rowIssueCount: number;
  duplicateGameCount: number;
  duplicateGames: Array<{
    signature: string;
    lineNumbers: number[];
  }>;
  rankedNumbers: PortfolioCompressionNumber[];
  coreNumbers: number[];
  coreRankedNumbers: PortfolioCompressionNumber[];
  alternates: PortfolioCompressionNumber[];
  warnings: string[];
}

const normalizeCoreSize = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return MIN_CORE_SIZE;
  return Math.max(MIN_CORE_SIZE, Math.floor(value ?? MIN_CORE_SIZE));
};

const normalizeAlternateCount = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return DEFAULT_ALTERNATE_COUNT;
  return Math.max(0, Math.floor(value ?? DEFAULT_ALTERNATE_COUNT));
};

export function compressPortfolioCandidates(
  input: string,
  options: {
    coreSize?: number;
    alternateCount?: number;
  } = {},
): PortfolioCompressionResult {
  const parsed = parsePastedCandidateNumbers(input);
  const rows = parsed.rows.filter((row) => row.numbers.length > 0);
  const acceptedRows = rows.length;
  const coreSize = normalizeCoreSize(options.coreSize);
  const alternateCount = normalizeAlternateCount(options.alternateCount);
  const appearanceMap = new Map<number, number[]>();
  const warnings: string[] = [];
  const rowIssueCount = rows.filter((row) => (
    !VALID_PORTFOLIO_ROW_SIZES.has(row.numbers.length)
    || row.duplicateNumbers.length > 0
    || row.outOfRangeNumbers.length > 0
  )).length;
  const duplicateGameMap = new Map<string, number[]>();

  for (const row of rows) {
    const signature = [...row.numbers].sort((left, right) => left - right).join(",");
    const lineNumbers = duplicateGameMap.get(signature) ?? [];
    lineNumbers.push(row.lineNumber);
    duplicateGameMap.set(signature, lineNumbers);

    for (const number of row.numbers) {
      const appearances = appearanceMap.get(number) ?? [];
      appearances.push(row.lineNumber);
      appearanceMap.set(number, appearances);
    }
  }

  const uniqueNumbers = appearanceMap.size;
  const hasCore = uniqueNumbers >= coreSize;

  if (uniqueNumbers > 0 && !hasCore) {
    warnings.push("Paste at least six distinct valid numbers before compressing to a six-number core.");
  }
  if (rowIssueCount > 0) {
    warnings.push(`${rowIssueCount} row${rowIssueCount === 1 ? "" : "s"} do not look like a 6-number or 8-number game; they were counted but should be reviewed.`);
  }

  const duplicateGames = Array.from(duplicateGameMap.entries())
    .filter(([, lineNumbers]) => lineNumbers.length > 1)
    .map(([signature, lineNumbers]) => ({ signature, lineNumbers }));
  const duplicateGameCount = duplicateGames.reduce(
    (total, group) => total + Math.max(0, group.lineNumbers.length - 1),
    0,
  );

  const rankedNumbers = Array.from(appearanceMap.entries())
    .map(([number, appearances]) => ({
      number,
      gameCount: appearances.length,
      rowShare: acceptedRows > 0 ? appearances.length / acceptedRows : 0,
      appearances,
    }))
    .sort((left, right) => (
      right.gameCount - left.gameCount
      || left.number - right.number
    ))
    .map((row, index): PortfolioCompressionNumber => {
      const rank = index + 1;
      const role: PortfolioCompressionRole = !hasCore
        ? "watch"
        : index < coreSize
          ? "core"
          : index < coreSize + alternateCount
            ? "alternate"
            : "watch";
      return {
        ...row,
        rank,
        role,
      };
    });

  const coreRankedNumbers = hasCore ? rankedNumbers.slice(0, coreSize) : [];
  const alternates = hasCore ? rankedNumbers.slice(coreSize, coreSize + alternateCount) : [];
  const coreNumbers = coreRankedNumbers
    .map((row) => row.number)
    .sort((left, right) => left - right);

  return {
    rows,
    acceptedRows,
    totalRows: parsed.totalRows,
    totalCountedNumbers: rows.reduce((total, row) => total + row.numbers.length, 0),
    uniqueNumbers,
    rowIssueCount,
    duplicateGameCount,
    duplicateGames,
    rankedNumbers,
    coreNumbers,
    coreRankedNumbers,
    alternates,
    warnings,
  };
}
