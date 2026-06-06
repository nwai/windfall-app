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
});
