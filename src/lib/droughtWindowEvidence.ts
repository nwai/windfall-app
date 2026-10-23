import type { Draw } from "../types";
import { computeDroughtHazard, type DroughtHazardNumberRow } from "./droughtHazard";
import { sortDrawsChronologically } from "./recentDraws";

export const DROUGHT_WINDOW_EVIDENCE_VERSION = "DWE-1";

export type DroughtWindowScale = "short" | "medium" | "long";
export type DroughtWindowSample = "none" | "thin" | "limited" | "broader";

export interface DroughtWindowDefinition {
  id: "W" | "F" | "M" | "Q" | "Y" | "H";
  label: string;
  requestedDraws: number | "all";
  scale: DroughtWindowScale;
}

export interface DroughtWindowMembership {
  sourceId: DroughtWindowDefinition["id"];
  sourceLabel: string;
  scale: DroughtWindowScale;
  rank: number;
  droughtLength: number;
  rate: number;
  trials: number;
  hits: number;
  sample: DroughtWindowSample;
}

export interface DroughtWindowSource {
  definition: DroughtWindowDefinition;
  effectiveDraws: number;
  thinWindow: boolean;
  rows: Array<DroughtHazardNumberRow & { rank: number; sample: DroughtWindowSample }>;
}

export interface DroughtWindowNumberEvidence {
  number: number;
  memberships: DroughtWindowMembership[];
  sourceCount: number;
  scaleCount: number;
  scales: DroughtWindowScale[];
}

export interface DroughtWindowEvidenceResult {
  version: typeof DROUGHT_WINDOW_EVIDENCE_VERSION;
  historyDraws: number;
  topK: number;
  unionSize: number;
  sources: DroughtWindowSource[];
  numbers: DroughtWindowNumberEvidence[];
}

export const DROUGHT_WINDOW_DEFINITIONS: readonly DroughtWindowDefinition[] = [
  { id: "W", label: "W · latest 3", requestedDraws: 3, scale: "short" },
  { id: "F", label: "F · latest 6", requestedDraws: 6, scale: "short" },
  { id: "M", label: "M · latest 13", requestedDraws: 13, scale: "medium" },
  { id: "Q", label: "Q · latest 36", requestedDraws: 36, scale: "medium" },
  { id: "Y", label: "Y · latest 156", requestedDraws: 156, scale: "long" },
  { id: "H", label: "H · all real history", requestedDraws: "all", scale: "long" },
] as const;

const sampleLabel = (trials: number): DroughtWindowSample => {
  if (trials <= 0) return "none";
  if (trials < 20) return "thin";
  if (trials < 60) return "limited";
  return "broader";
};

const rankedRows = (history: Draw[], topK: number): DroughtWindowSource["rows"] => (
  history.length < 2
    ? []
    : computeDroughtHazard(history).byNumber
    .slice()
    .sort((left, right) => right.p - left.p || right.k - left.k || left.number - right.number)
    .slice(0, topK)
    .map((row, index) => ({ ...row, rank: index + 1, sample: sampleLabel(row.trials) }))
);

export const analyzeDroughtWindowEvidence = (
  history: readonly Draw[],
  topK = 8,
): DroughtWindowEvidenceResult => {
  const validTopK = Math.max(1, Math.min(45, Math.round(topK)));
  const realHistory = sortDrawsChronologically(
    history.filter((draw) => !draw.isSimulated).map((draw) => ({ ...draw })),
  );
  const sources = DROUGHT_WINDOW_DEFINITIONS.map((definition): DroughtWindowSource => {
    const requested = definition.requestedDraws === "all"
      ? realHistory.length
      : definition.requestedDraws;
    const sourceHistory = realHistory.slice(-requested);
    return {
      definition,
      effectiveDraws: sourceHistory.length,
      thinWindow: definition.scale === "short",
      rows: rankedRows(sourceHistory, validTopK),
    };
  });

  const membershipsByNumber = new Map<number, DroughtWindowMembership[]>();
  sources.forEach((source) => {
    source.rows.forEach((row) => {
      const membership: DroughtWindowMembership = {
        sourceId: source.definition.id,
        sourceLabel: source.definition.label,
        scale: source.definition.scale,
        rank: row.rank,
        droughtLength: row.k,
        rate: row.p,
        trials: row.trials,
        hits: row.hitsNext,
        sample: row.sample,
      };
      membershipsByNumber.set(row.number, [
        ...(membershipsByNumber.get(row.number) ?? []),
        membership,
      ]);
    });
  });

  const numbers = [...membershipsByNumber.entries()]
    .map(([number, memberships]): DroughtWindowNumberEvidence => {
      const scales = [...new Set(memberships.map((membership) => membership.scale))];
      return {
        number,
        memberships,
        sourceCount: memberships.length,
        scaleCount: scales.length,
        scales,
      };
    })
    .sort((left, right) => (
      right.scaleCount - left.scaleCount
      || right.sourceCount - left.sourceCount
      || left.number - right.number
    ));

  return {
    version: DROUGHT_WINDOW_EVIDENCE_VERSION,
    historyDraws: realHistory.length,
    topK: validTopK,
    unionSize: numbers.length,
    sources,
    numbers,
  };
};
