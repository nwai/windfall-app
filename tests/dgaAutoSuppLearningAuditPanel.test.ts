import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import DgaAutoSuppLearningAuditPanel from "../src/components/DgaAutoSuppLearningAuditPanel";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scheduledDates = (count: number): string[] => {
  const dates: string[] = [];
  const cursor = new Date(2025, 0, 1);
  while (dates.length < count) {
    if ([1, 3, 5].includes(cursor.getDay())) {
      dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const buildHistory = (count: number): Draw[] => scheduledDates(count).map((date, index) => {
  const numbers = Array.from({ length: 8 }, (_, offset) => ((index * 7 + offset * 5) % 45) + 1);
  const suppIndexes = new Set([index % 8, (index + 3) % 8]);
  return {
    date,
    main: numbers.filter((_, numberIndex) => !suppIndexes.has(numberIndex)),
    supp: numbers.filter((_, numberIndex) => suppIndexes.has(numberIndex)),
  };
});

describe("DGA Auto Supp Learning & Self-Audit panel", () => {
  it("sits after the DGA grid and before the constellation diagnostic", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const gridIndex = source.indexOf("<DGAVisualizer");
    const auditIndex = source.indexOf("<DgaAutoSuppLearningAuditPanel");
    const constellationIndex = source.indexOf("<DGAConstellationDiagnosticPanel");

    expect(gridIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeGreaterThan(gridIndex);
    expect(constellationIndex).toBeGreaterThan(auditIndex);
  });

  it("discloses the known-eight boundary and keeps the audit observe-only", async () => {
    const history = buildHistory(70);
    const latest = history[history.length - 1];
    const selectedNumbers = [...latest.main, ...latest.supp];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(React.createElement(DgaAutoSuppLearningAuditPanel, {
        history,
        activeHistoryCount: 13,
        selectedNumbers,
      })));

      expect(container.textContent).toContain("Auto Supp Learning & Self-Audit");
      expect(container.textContent).toContain("DGA-ASLA-1");
      expect(container.textContent).not.toContain("tests supplementary-role assignment only");

      await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());

      expect(container.textContent).toContain("tests supplementary-role assignment only");
      expect(container.textContent).toContain("does not test whether the app could have found those eight numbers beforehand");
      expect(container.textContent).toContain("does not change DGA Auto supps or candidate generation");
      expect(container.textContent).toContain("Current Auto supps");
      expect(container.textContent).toContain("Shrunk role-rate");
      expect(container.textContent).toContain("Shrunk pair blend");
      expect(container.textContent).toContain("Random pair expectation");
      expect(container.textContent).toContain("0.50");
      expect(container.textContent).toContain("3.6%");
      expect(container.textContent).toContain("Live method vs random");
      expect(container.textContent).toContain("Prediction Journal workflow audit");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("documents that the audit never silently replaces the live method", () => {
    const panelSource = readFileSync(resolve(process.cwd(), "src/components/DgaAutoSuppLearningAuditPanel.tsx"), "utf8");
    const manualSource = readFileSync(resolve(process.cwd(), "public/user-manual.html"), "utf8");

    expect(panelSource).toContain("it does not replace the live Auto supp method");
    expect(manualSource).toContain('id="dga-auto-supp-audit"');
    expect(manualSource).toContain("never replaces the live Auto supp method");
    expect(manualSource).toContain("These are exact combinatorial references, not simulated values.");
  });
});
