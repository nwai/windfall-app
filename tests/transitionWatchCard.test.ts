import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { TransitionWatchCard } from "../src/components/candidates/TransitionWatchCard";
import type {
  MonthlyBucketTransitionGovernorProfile,
  MonthlyBucketTransitionGovernorRuleSummary,
} from "../src/lib/monthlyBucketTransitionGovernor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rule: MonthlyBucketTransitionGovernorRuleSummary = {
  rule: "three-to-four",
  active: true,
  label: "Delayed first 4x transition",
  sourceBucket: 3,
  sourceKey: "times3",
  sourceLabel: "3x",
  targetBucket: 4,
  targetLabel: "4x",
  currentNumbers: [17, 20, 28, 31, 43],
  multiplier: 1.08,
  strength: "light",
  evidenceGatePassed: true,
  evidence: {
    trials: 5,
    sourceExposure: 28,
    hits: 6,
    atLeastOneHits: 4,
    atLeastOneRate: 0.8,
    expectedRandomAtLeastOneRate: 0.686,
    atLeastOneLift: 0.8 / 0.686,
    perNumberRate: 6 / 28,
    expectedRandomPerNumberRate: 8 / 45,
    perNumberLift: (6 / 28) / (8 / 45),
  },
  firstReach: {
    targetBucket: 4,
    targetLabel: "4x",
    monthsEligible: 18,
    monthsReached: 18,
    reachedByDraw: 17,
    reachedByDrawRate: 17 / 18,
  },
  reason: "Observed stage evidence.",
};

const profile = (
  mode: MonthlyBucketTransitionGovernorProfile["mode"],
  activeRules: MonthlyBucketTransitionGovernorRuleSummary[],
): MonthlyBucketTransitionGovernorProfile => ({
  userEnabled: mode !== "off",
  active: activeRules.length > 0,
  mode,
  internalStrength: activeRules.length ? "light" : "off",
  numberMultipliers: Object.fromEntries(Array.from({ length: 45 }, (_, index) => [index + 1, 1])),
  boostedNumbers: activeRules.length ? [...rule.currentNumbers] : [],
  numberDetails: [],
  activeRules,
  checkedRules: activeRules,
  summaryLabel: mode === "off" ? "Off" : "Auto · applied light · 5 boosted",
  traceLabel: "Test transition profile.",
  scopeLabel: "18 completed 13D baseline months",
  contextLabel: "2026-09 13D D8",
});

describe("Transition Watch card", () => {
  it("uses a separate Auto evidence profile while preserving the user's influence profile", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(appSource).toContain("const monthlyBucketTransitionWatchProfile = useMemo");
    expect(appSource).toContain('mode: "auto"');
    expect(appSource).toContain("monthlyTransitionWatchProfile={monthlyBucketTransitionWatchProfile}");
    expect(appSource).toContain("monthlyTransitionInfluenceProfile={monthlyBucketTransitionGovernorProfile}");
    expect(appSource).toContain("onReviewMonthlyTransitionEvidence={navigateToMonthlyTransitionEvidence}");
  });

  it("separates qualifying evidence from an Off generation influence", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onReview = vi.fn();

    try {
      await act(async () => root.render(React.createElement(TransitionWatchCard, {
        evidenceProfile: profile("auto", [rule]),
        influenceProfile: profile("off", []),
        targetDrawOrdinal: 8,
        onReviewEvidence: onReview,
      })));

      expect(container.textContent).toContain("Transition Watch");
      expect(container.textContent).toContain("D8 · 3x → 4x");
      expect(container.textContent).toContain("17");
      expect(container.textContent).toContain("43");
      expect(container.textContent).toContain("4/5");
      expect(container.textContent).toContain("80.0%");
      expect(container.textContent).toContain("68.6%");
      expect(container.textContent).toContain("Thin sample");
      expect(container.textContent).toContain("Off · advisory only");

      await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());
      expect(onReview).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("discloses an applied Auto weight and an RwR45 bypass", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const watch = profile("auto", [rule]);

    try {
      await act(async () => root.render(React.createElement(TransitionWatchCard, {
        evidenceProfile: watch,
        influenceProfile: watch,
        targetDrawOrdinal: 8,
      })));
      expect(container.textContent).toContain("Auto Light ×1.08");

      await act(async () => root.render(React.createElement(TransitionWatchCard, {
        evidenceProfile: watch,
        influenceProfile: watch,
        targetDrawOrdinal: 8,
        bypassedByRandomCoverage: true,
      })));
      expect(container.textContent).toContain("Bypassed by RwR45 random coverage");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("stays hidden when no stage rule clears the Auto evidence gate", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(React.createElement(TransitionWatchCard, {
        evidenceProfile: profile("auto", []),
        influenceProfile: profile("off", []),
        targetDrawOrdinal: 8,
      })));
      expect(container.querySelector("[aria-label='Monthly bucket transition watch']")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
