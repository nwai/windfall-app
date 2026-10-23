import { describe, expect, it, vi } from "vitest";
import { buildOgaDecileGate, ogaDecileAcceptance, ogaDecileIndex, ogaDecileRangeLabel,
  ogaForecastBiasSummary, type OgaForecastBiasOptions } from "./ogaDecileAcceptance";

const options: OgaForecastBiasOptions = { enabled: true, evidenceDrawCount: 40, preferredBand: "mid",
  deciles: { thresholds: [0, 1, 2, 3, 4, 5, 6, 7, 8], probs: [] }, preferredDeciles: [{ index: 5, weight: 2 }, { index: 7, weight: 1 }] };

describe("authoritative OGA score bands", () => {
  it("rejects unselected and zero-weight deciles even when rng returns zero", () => {
    const gate = buildOgaDecileGate({ ...options, preferredDeciles: [{ index: 5, weight: 1 }, { index: 7, weight: 0 }] });
    const rng = vi.fn(() => 0);
    expect(ogaDecileAcceptance(2.5, gate, rng).accepted).toBe(false);
    expect(ogaDecileAcceptance(6.5, gate, rng).accepted).toBe(false);
    expect(rng).not.toHaveBeenCalled();
  });

  it("preserves weighted acceptance and does not rescue a failed selected-band check", () => {
    const gate = buildOgaDecileGate(options);
    expect(ogaDecileAcceptance(4.5, gate, () => 0.5)).toEqual({ index: 5, probability: 2 / 3, accepted: true });
    expect(ogaDecileAcceptance(4.5, gate, () => 0.8).accepted).toBe(false);
    expect(ogaDecileAcceptance(6.5, gate, () => 0.5).accepted).toBe(false);
    expect(ogaForecastBiasSummary(options)).toContain("no broad-band fallback");
  });

  it("assigns exact cutoff ties to the lower interval and describes matching endpoints", () => {
    const thresholds = options.deciles!.thresholds;
    expect([0, 1, 4, 8, 9].map((score) => ogaDecileIndex(score, thresholds))).toEqual([0, 1, 4, 8, 9]);
    expect(ogaDecileRangeLabel(0, thresholds)).toBe("<= 0");
    expect(ogaDecileRangeLabel(5, thresholds)).toBe("> 4 to <= 5");
    expect(ogaDecileRangeLabel(9, thresholds)).toBe("> 8");
  });

  it.each([
    { preferredDeciles: [{ index: 5, weight: 0 }] },
    { preferredDeciles: [{ index: 5, weight: -1 }] },
    { preferredDeciles: [{ index: 10, weight: 1 }] },
    { preferredDeciles: [{ index: 5, weight: Infinity }] },
    { preferredDeciles: [{ index: 5, weight: 1 }, { index: 5, weight: 2 }] },
    { deciles: { thresholds: [0, 1], probs: [] } },
    { deciles: { thresholds: [0, 1, 2, 3, NaN, 5, 6, 7, 8], probs: [] } },
    { deciles: { thresholds: [0, 1, 2, 3, 4, 3, 6, 7, 8], probs: [] } },
    { evidenceDrawCount: 0 },
  ])("fails closed on invalid active selections: %j", (override) => {
    expect(buildOgaDecileGate({ ...options, ...override }).error).toBeTruthy();
    expect(buildOgaDecileGate({ ...options, ...override, enabled: false }).error).toBeNull();
  });

  it("reports empty intervals instead of inventing boundaries or allowing an impossible selection", () => {
    const tied = { ...options, deciles: { thresholds: Array(9).fill(4), probs: [] }, preferredDeciles: [{ index: 5, weight: 1 }] };
    expect(buildOgaDecileGate(tied).error).toContain("empty intervals");
    expect(ogaDecileRangeLabel(5, tied.deciles.thresholds)).toContain("Empty interval");
    expect(ogaDecileRangeLabel(5, [])).toBe("Cutoffs unavailable");
  });

  it("normalizes enormous finite weights without overflow", () => {
    const gate = buildOgaDecileGate({ ...options, preferredDeciles: [{ index: 5, weight: 1e308 }, { index: 7, weight: 1e308 }] });
    expect(gate.error).toBeNull();
    expect(gate.acceptanceByIndex[5]).toBe(0.5);
    expect(gate.acceptanceByIndex[7]).toBe(0.5);
  });

  it("leaves broad bands available only with no detailed selections and discloses retained Off state", () => {
    expect(buildOgaDecileGate({ ...options, preferredDeciles: [] }).selected).toBe(false);
    expect(ogaForecastBiasSummary({ ...options, preferredDeciles: [] })).toContain("Broad OGA band: mid");
    expect(ogaForecastBiasSummary({ ...options, enabled: false })).toContain("Off; saved bands: D5 x2");
  });
});
