import type { Draw } from "../types";
import {
  buildEvidencePortfolioCandidatesForReplay, EVIDENCE_PORTFOLIO_MODEL, EVIDENCE_PORTFOLIO_POOL_SIZE,
  portfolioHistoryFingerprint, portfolioIsoDate, preparePortfolioHistory,
} from "./evidencePortfolio";
import {
  buildSupplementaryPairComparison, supplementaryPairForPolicy, SUPPLEMENTARY_PAIR_POLICIES,
  type SupplementaryPairPolicy,
} from "./supplementaryPairComparison";
import { computeWeekdayWindfallPrizeDivision, type WeekdayWindfallPrizeDivision } from "./prizeDivisions";

export const SUPPLEMENTARY_POLICY_REPLAY_VERSION = "SPRA-1";
export const SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL = {
  minPriorDraws: 60,
  developmentShare: 0.7,
  minConfirmationDraws: 60,
  minConfirmationMonths: 6,
  intervalMultiplier: 2.58,
  primaryMetric: "Mean supplementary-role hits per draw (portfolio: mean of its four frozen rows)",
} as const;

export type ReplayPhase = "development" | "confirmation";
type Policies<T> = Record<SupplementaryPairPolicy, T>;
export interface SupplementaryReplayOptions { windowSize: number; seed: number }
export interface SupplementaryReplayOutcome {
  main: number[];
  supp: [number, number];
  uniqueHits: number;
  mainHits: number;
  suppHits: number;
  division: WeekdayWindfallPrizeDivision;
  numericalTie: boolean;
  noEvidenceFallback: boolean;
}
export interface RandomAssignmentReference {
  meanSuppHits: number;
  exactSuppRate: number;
  meanMainHits: number;
  prizeRate: number;
}
export interface SupplementaryReplayRecord {
  targetDate: string;
  cutoffDate: string;
  phase: ReplayPhase;
  priorDraws: number;
  windowDraws: number;
  actualMain: number[];
  actualSupp: number[];
  role: Policies<SupplementaryReplayOutcome>;
  roleRandom: RandomAssignmentReference;
  portfolio: Policies<SupplementaryReplayOutcome[]> | null;
  portfolioRandom: RandomAssignmentReference | null;
  portfolioSkippedReason: string | null;
}
export interface SupplementaryReplaySummary extends RandomAssignmentReference {
  draws: number;
  rows: number;
  zeroHits: number;
  oneHit: number;
  twoHits: number;
  ties: number;
  fallbacks: number;
  extraDuplicateMainRows: number;
}
export interface SupplementaryReplayGate {
  candidate: SupplementaryPairPolicy;
  status: "insufficient" | "no-validated-improvement" | "prospective-check-candidate";
  reasons: string[];
  roleDifferenceInterval: [number, number] | null;
  roleRandomInterval: [number, number] | null;
  portfolioDifferenceInterval: [number, number] | null;
  portfolioRandomInterval: [number, number] | null;
}
export interface SupplementaryPolicyReplayResult {
  version: typeof SUPPLEMENTARY_POLICY_REPLAY_VERSION;
  protocol: typeof SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL;
  sourceFingerprint: string;
  validDraws: number;
  excludedRows: number;
  options: SupplementaryReplayOptions;
  firstTarget: string | null;
  lastTarget: string | null;
  confirmationStarts: string | null;
  portfolioModel: typeof EVIDENCE_PORTFOLIO_MODEL;
  proposalPoolSize: number;
  records: SupplementaryReplayRecord[];
  gate: SupplementaryReplayGate;
}

const mean = (values: readonly number[]): number => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const mapPolicies = <T>(build: (policy: SupplementaryPairPolicy) => T): Policies<T> => ({
  auto: build("auto"), blend: build("blend"), "co-draws": build("co-draws"),
});

const scoreAssignment = (numbers: readonly number[], pair: readonly number[], target: Draw): SupplementaryReplayOutcome => {
  const main = numbers.filter(number => !pair.includes(number));
  const mainSet = new Set(target.main);
  const suppSet = new Set(target.supp);
  return {
    main, supp: [...pair] as [number, number],
    uniqueHits: numbers.filter(number => mainSet.has(number) || suppSet.has(number)).length,
    mainHits: main.filter(number => mainSet.has(number)).length,
    suppHits: pair.filter(number => suppSet.has(number)).length,
    division: computeWeekdayWindfallPrizeDivision(main, [], mainSet, suppSet),
    numericalTie: false, noEvidenceFallback: false,
  };
};

// Exact enumeration of the 28 assignments is a random reference, not synthetic draw data.
export const exactRandomAssignmentReference = (numbers: readonly number[], target: Draw): RandomAssignmentReference => {
  if (numbers.length !== 8 || new Set(numbers).size !== 8) throw new Error("Random role reference requires eight unique numbers.");
  const outcomes: SupplementaryReplayOutcome[] = [];
  for (let left = 0; left < numbers.length; left += 1) {
    for (let right = left + 1; right < numbers.length; right += 1) outcomes.push(scoreAssignment(numbers, [numbers[left], numbers[right]], target));
  }
  return {
    meanSuppHits: mean(outcomes.map(row => row.suppHits)), exactSuppRate: mean(outcomes.map(row => Number(row.suppHits === 2))),
    meanMainHits: mean(outcomes.map(row => row.mainHits)), prizeRate: mean(outcomes.map(row => Number(row.division !== "—"))),
  };
};

const assignmentsBeforeTarget = (numbers: readonly number[], active: Draw[], prior: Draw[]) => {
  const comparison = buildSupplementaryPairComparison(numbers, active, prior);
  if (!comparison) throw new Error("Replay assignments require eight valid unique numbers.");
  return mapPolicies(policy => supplementaryPairForPolicy(comparison, policy));
};

export const summarizeSupplementaryReplay = (
  records: readonly SupplementaryReplayRecord[], stage: "role" | "portfolio", policy: SupplementaryPairPolicy,
): SupplementaryReplaySummary => {
  const eligible = records.filter(row => stage === "role" || row.portfolio);
  const outcomes = eligible.flatMap(row => stage === "role" ? [row.role[policy]] : row.portfolio![policy]);
  const distinctPrizeRows = eligible.flatMap(row => {
    const rows = stage === "role" ? [row.role[policy]] : row.portfolio![policy];
    return [...new Map(rows.map(outcome => [outcome.main.join(","), outcome])).values()];
  });
  return {
    draws: eligible.length, rows: outcomes.length,
    meanSuppHits: mean(outcomes.map(row => row.suppHits)), exactSuppRate: mean(outcomes.map(row => Number(row.suppHits === 2))),
    meanMainHits: mean(outcomes.map(row => row.mainHits)), prizeRate: mean(distinctPrizeRows.map(row => Number(row.division !== "—"))),
    zeroHits: outcomes.filter(row => row.suppHits === 0).length,
    oneHit: outcomes.filter(row => row.suppHits === 1).length,
    twoHits: outcomes.filter(row => row.suppHits === 2).length,
    ties: outcomes.filter(row => row.numericalTie).length,
    fallbacks: outcomes.filter(row => row.noEvidenceFallback).length,
    extraDuplicateMainRows: outcomes.length - distinctPrizeRows.length,
  };
};

export const summarizeRandomReplay = (records: readonly SupplementaryReplayRecord[], stage: "role" | "portfolio"): RandomAssignmentReference => {
  const rows = records.flatMap(row => stage === "role" ? [row.roleRandom] : row.portfolioRandom ? [row.portfolioRandom] : []);
  return {
    meanSuppHits: mean(rows.map(row => row.meanSuppHits)), exactSuppRate: mean(rows.map(row => row.exactSuppRate)),
    meanMainHits: mean(rows.map(row => row.meanMainHits)), prizeRate: mean(rows.map(row => row.prizeRate)),
  };
};

const monthDifferenceInterval = (rows: Array<{ date: string; difference: number }>): [number, number] | null => {
  const months = new Map<string, number[]>();
  rows.forEach(row => { const month = row.date.slice(0, 7); months.set(month, [...(months.get(month) ?? []), row.difference]); });
  const values = [...months.values()].map(mean);
  if (values.length < SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL.minConfirmationMonths) return null;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  const margin = SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL.intervalMultiplier * Math.sqrt(variance / values.length);
  return [average - margin, average + margin];
};

export const evaluateSupplementaryReplayGate = (records: readonly SupplementaryReplayRecord[]): SupplementaryReplayGate => {
  const development = records.filter(row => row.phase === "development" && row.portfolio);
  const ordered = SUPPLEMENTARY_PAIR_POLICIES.slice().sort((left, right) => {
    const a = summarizeSupplementaryReplay(development, "portfolio", left);
    const b = summarizeSupplementaryReplay(development, "portfolio", right);
    return b.meanSuppHits - a.meanSuppHits || b.exactSuppRate - a.exactSuppRate
      || SUPPLEMENTARY_PAIR_POLICIES.indexOf(left) - SUPPLEMENTARY_PAIR_POLICIES.indexOf(right);
  });
  const candidate = ordered[0];
  const confirmation = records.filter(row => row.phase === "confirmation");
  const portfolio = confirmation.filter(row => row.portfolio);
  const months = new Set(portfolio.map(row => row.targetDate.slice(0, 7))).size;
  const roleDifferenceInterval = monthDifferenceInterval(confirmation.map(row => ({
    date: row.targetDate, difference: row.role[candidate].suppHits - row.role.auto.suppHits,
  })));
  const portfolioDifferenceInterval = monthDifferenceInterval(portfolio.map(row => ({
    date: row.targetDate, difference: mean(row.portfolio![candidate].map(outcome => outcome.suppHits)) - mean(row.portfolio!.auto.map(outcome => outcome.suppHits)),
  })));
  const portfolioRandomInterval = monthDifferenceInterval(portfolio.map(row => ({
    date: row.targetDate, difference: mean(row.portfolio![candidate].map(outcome => outcome.suppHits)) - row.portfolioRandom!.meanSuppHits,
  })));
  const roleRandomInterval = monthDifferenceInterval(confirmation.map(row => ({
    date: row.targetDate, difference: row.role[candidate].suppHits - row.roleRandom.meanSuppHits,
  })));
  const base = { candidate, roleDifferenceInterval, roleRandomInterval, portfolioDifferenceInterval, portfolioRandomInterval };
  if (portfolio.length < SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL.minConfirmationDraws || months < SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL.minConfirmationMonths || !development.length) return {
    ...base, status: "insufficient", reasons: [`Needs development portfolios and at least 60 later confirmation targets across six months; available ${portfolio.length} targets across ${months} months.`],
  };
  if (candidate === "auto") return { ...base, status: "no-validated-improvement", reasons: ["Development retained Current Auto supps. Confirmation is not used to choose a different winner."] };
  const current = summarizeSupplementaryReplay(portfolio, "portfolio", "auto");
  const challenger = summarizeSupplementaryReplay(portfolio, "portfolio", candidate);
  const roleCurrent = summarizeSupplementaryReplay(confirmation, "role", "auto");
  const roleChallenger = summarizeSupplementaryReplay(confirmation, "role", candidate);
  const reasons: string[] = [];
  if (!roleDifferenceInterval || roleDifferenceInterval[0] <= 0) reasons.push("Known-eight confirmation does not clear the positive supplementary-hit difference screen over Current Auto supps.");
  if (!roleRandomInterval || roleRandomInterval[0] <= 0) reasons.push("Known-eight confirmation does not clear the positive supplementary-hit difference screen over exact random assignment.");
  if (!portfolioDifferenceInterval || portfolioDifferenceInterval[0] <= 0) reasons.push("EP-1 confirmation does not clear the positive supplementary-hit difference screen over Current Auto supps.");
  if (!portfolioRandomInterval || portfolioRandomInterval[0] <= 0) reasons.push("EP-1 confirmation does not clear the positive supplementary-hit difference screen over exact random assignment.");
  if (roleChallenger.exactSuppRate < roleCurrent.exactSuppRate || roleChallenger.exactSuppRate < 1 / 28 || challenger.exactSuppRate < current.exactSuppRate) reasons.push("Exact supplementary-pair performance was not preserved.");
  if (challenger.meanMainHits < current.meanMainHits || challenger.prizeRate < current.prizeRate) reasons.push("Six-main matches or the descriptive six-main prize rate declined.");
  if (challenger.extraDuplicateMainRows > current.extraDuplicateMainRows) reasons.push("Reassignment introduced additional duplicate six-main rows.");
  return { ...base, status: reasons.length ? "no-validated-improvement" : "prospective-check-candidate", reasons: reasons.length ? reasons : ["Clears the fixed retrospective checks. A prospective shadow test is still required; EP-1 remains unchanged."] };
};

export async function runSupplementaryPolicyReplay(
  history: readonly Draw[], options: SupplementaryReplayOptions,
  onProgress?: (completed: number, total: number) => void,
): Promise<SupplementaryPolicyReplayResult> {
  const prepared = preparePortfolioHistory(history);
  const draws = prepared.draws;
  if (!Number.isInteger(options.windowSize) || options.windowSize < 1 || options.windowSize > Math.max(1, draws.length)) throw new Error("Replay window must be a whole number from 1 to the qualifying history count.");
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 4294967295) throw new Error("Replay seed must be a whole number from 0 to 4294967295.");
  const total = Math.max(0, draws.length - SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL.minPriorDraws);
  const split = Math.floor(total * SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL.developmentShare);
  const records: SupplementaryReplayRecord[] = [];
  for (let offset = 0; offset < total; offset += 1) {
    const index = offset + SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL.minPriorDraws;
    const prior = draws.slice(0, index);
    const active = prior.slice(-options.windowSize);
    const targetDate = portfolioIsoDate(draws[index].date);
    const cutoffDate = portfolioIsoDate(prior[prior.length - 1].date);
    const numbers = [...draws[index].main, ...draws[index].supp].sort((a, b) => a - b);
    const rolePairs = assignmentsBeforeTarget(numbers, active, prior);
    let portfolioPairs: Array<{ numbers: number[]; pairs: ReturnType<typeof assignmentsBeforeTarget> }> | null = null;
    let portfolioSkippedReason: string | null = null;
    try {
      const candidates = buildEvidencePortfolioCandidatesForReplay({ history: prior, activeHistory: active, targetDate, seed: options.seed });
      portfolioPairs = candidates.map(row => {
        const selected = [...row.main, ...row.supp].sort((a, b) => a - b);
        return { numbers: selected, pairs: assignmentsBeforeTarget(selected, active, prior) };
      });
    } catch (error) {
      portfolioSkippedReason = error instanceof Error ? error.message : "Production EP-1 construction failed; no replacement rows were invented.";
    }
    // Only scoring below sees the target's supplementary roles. EP proposals never receive the target result.
    const target = draws[index];
    const role = mapPolicies(policy => ({ ...scoreAssignment(numbers, rolePairs[policy].pair, target),
      numericalTie: rolePairs[policy].numericalTie, noEvidenceFallback: rolePairs[policy].noEvidenceFallback }));
    const portfolio = portfolioPairs ? mapPolicies(policy => portfolioPairs!.map(row => ({
      ...scoreAssignment(row.numbers, row.pairs[policy].pair, target),
      numericalTie: row.pairs[policy].numericalTie, noEvidenceFallback: row.pairs[policy].noEvidenceFallback,
    }))) : null;
    const randomRows = portfolioPairs?.map(row => exactRandomAssignmentReference(row.numbers, target)) ?? [];
    records.push({
      targetDate, cutoffDate, phase: offset < split ? "development" : "confirmation", priorDraws: prior.length, windowDraws: active.length,
      actualMain: [...target.main], actualSupp: [...target.supp], role, roleRandom: exactRandomAssignmentReference(numbers, target), portfolio,
      portfolioRandom: randomRows.length ? {
        meanSuppHits: mean(randomRows.map(row => row.meanSuppHits)), exactSuppRate: mean(randomRows.map(row => row.exactSuppRate)),
        meanMainHits: mean(randomRows.map(row => row.meanMainHits)), prizeRate: mean(randomRows.map(row => row.prizeRate)),
      } : null, portfolioSkippedReason,
    });
    onProgress?.(offset + 1, total);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return {
    version: SUPPLEMENTARY_POLICY_REPLAY_VERSION, protocol: SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL,
    sourceFingerprint: portfolioHistoryFingerprint(draws), validDraws: draws.length, excludedRows: history.length - draws.length,
    options: { ...options }, firstTarget: records[0]?.targetDate ?? null, lastTarget: records[records.length - 1]?.targetDate ?? null,
    confirmationStarts: records.find(row => row.phase === "confirmation")?.targetDate ?? null,
    portfolioModel: EVIDENCE_PORTFOLIO_MODEL, proposalPoolSize: EVIDENCE_PORTFOLIO_POOL_SIZE,
    records, gate: evaluateSupplementaryReplayGate(records),
  };
}
