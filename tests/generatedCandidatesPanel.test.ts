import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  GeneratedCandidatesPanel,
  type GeneratedCandidatesPanelProps,
} from "../src/components/candidates/GeneratedCandidatesPanel";

function buildProps(overrides: Partial<GeneratedCandidatesPanelProps> = {}): GeneratedCandidatesPanelProps {
  return {
    onGenerate: vi.fn(),
    candidates: [],
    numCandidates: 25,
    setNumCandidates: vi.fn(),
    userSelectedNumbers: [3, 12],
    setUserSelectedNumbers: vi.fn(),
    onSelectCandidate: vi.fn(),
    selectedCandidateIdx: -1,
    mostRecentDraw: null,
    manualSimSelected: [],
    setManualSimSelected: vi.fn(),
    batchSize: 100,
    setBatchSize: vi.fn(),
    onRunBatch: vi.fn(),
    batchFreq: [],
    batchSessionRuns: 10,
    setBatchSessionRuns: vi.fn(),
    onRunBatchSession: vi.fn(),
    ...overrides,
  };
}

describe("GeneratedCandidatesPanel", () => {
  const monthlyBucketSets = (buckets: Partial<Record<
    "undrawn" | "times1" | "times2" | "times3" | "times4" | "times5" | "times6" | "times7" | "times8",
    number[]
  >>) => ({
    undrawn: new Set(buckets.undrawn ?? []),
    times1: new Set(buckets.times1 ?? []),
    times2: new Set(buckets.times2 ?? []),
    times3: new Set(buckets.times3 ?? []),
    times4: new Set(buckets.times4 ?? []),
    times5: new Set(buckets.times5 ?? []),
    times6: new Set(buckets.times6 ?? []),
    times7: new Set(buckets.times7 ?? []),
    times8: new Set(buckets.times8 ?? []),
  });

  it("renders the compact user selected numbers strip above the generator output", () => {
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps()),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const strip = document.querySelector('[data-testid="generated-user-selected-strip"]');

    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain("User selected numbers");
    expect(strip?.textContent).toContain("2 selected");
    expect(strip?.querySelectorAll('[aria-label^="Toggle user selected number"]').length).toBe(45);
    expect(strip?.querySelector('[aria-label="Toggle user selected number 3"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(strip?.querySelector('[aria-label="Toggle user selected number 4"]')?.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders diagnostic metric explanations as accessible help instead of hover-only header titles", () => {
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        candidates: [
          {
            main: [1, 2, 3, 4, 5, 6],
            supp: [7, 8],
            ogaScore: 0.42,
            ogaPercentile: 55,
          },
        ],
        monthlyAvgBuckets: {
          undrawn: 1,
          times1: 1,
          times2: 1,
          times3: 1,
          times4: 1,
          times5: 1,
          times6: 1,
          times7: 0,
          times8: 0,
        },
      })),
    );
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector('[aria-label="Conv metric explanation"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="IDM metric explanation"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Rdy metric explanation"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Win metric explanation"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Nrr metric explanation"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="NS metric explanation"]')).not.toBeNull();
    expect(html).toContain("not a calibrated next-draw probability");
    expect(html).not.toContain('title="Convergence:');
    expect(html).not.toContain('title="Ideal Draw Match:');
    expect(html).not.toContain('title="Readiness score:');
  });

  it("uses the shared Monthly Draws Summary ideal state for the IDM target and score", () => {
    const buckets = monthlyBucketSets({
      undrawn: [1, 2],
      times1: [3, 4, 5, 6, 7],
      times2: [8],
    });
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        candidates: [
          {
            main: [1, 2, 3, 4, 5, 6],
            supp: [7, 8],
            ogaScore: 0.42,
            ogaPercentile: 55,
          },
        ],
        monthlyBuckets: buckets,
        monthlyIdealDrawState: {
          bucketSets: buckets,
          targetDistribution: [4, 8, 12, 10, 6, 3, 1, 1, 0],
          idealDrawBucketCounts: [2, 5, 1, 0, 0, 0, 0, 0, 0],
          effectiveMonthLabel: "2026-06",
          effectiveMonthIsSynthetic: false,
        },
      } as any)),
    );

    expect(html).toContain("Ideal draw composition (IDM target):");
    expect(html).toContain("0x=2");
    expect(html).toContain("1x=5");
    expect(html).toContain("2x=1");
    expect(html).toContain("Top 100.0%");
  });

  it("renders Stage IDM target and score when stage ideal state is available", () => {
    const buckets = monthlyBucketSets({
      undrawn: [1, 2],
      times1: [3, 4, 5, 6, 7],
      times2: [8],
    });
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        candidates: [
          {
            main: [1, 2, 3, 4, 5, 6],
            supp: [7, 8],
            ogaScore: 0.42,
            ogaPercentile: 55,
          },
        ],
        monthlyBuckets: buckets,
        stageIdealDrawState: {
          bucketSets: buckets,
          currentDistribution: [2, 5, 1, 0, 0, 0, 0, 0, 0],
          targetDistribution: [4, 8, 12, 10, 6, 3, 1, 1, 0],
          idealDrawBucketCounts: [2, 5, 1, 0, 0, 0, 0, 0, 0],
          workingMonthLabel: "2026-06",
          expectedDrawCount: 13,
          targetStageDrawCount: 6,
          completedDrawCount: 5,
          comparableMonthCount: 4,
          expectedDrawCountSource: "auto",
          warnings: [],
        },
      } as any)),
    );

    expect(html).toContain("Stage IDM target:");
    expect(html).toContain("draw 6 of a 13-draw month");
    expect(html).toContain("Stage IDM");
    expect(html).toContain("Top 100.0%");
  });
});
