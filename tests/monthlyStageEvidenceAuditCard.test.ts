import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import MonthlyStageEvidenceAuditCard from "../src/components/MonthlyStageEvidenceAuditCard";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const history = (count: number): Draw[] => {
  const rows: Draw[] = [];
  const cursor = new Date(2024, 5, 3);
  let index = 0;
  while (rows.length < count) {
    if ([1, 3, 5].includes(cursor.getDay())) {
      const numbers = Array.from({ length: 8 }, (_, offset) => ((index * 5 + offset * 7) % 45) + 1);
      rows.push({
        date: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
        main: numbers.slice(0, 6),
        supp: numbers.slice(6),
      });
      index += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
};

describe("MonthlyStageEvidenceAuditCard", () => {
  it("is collapsed by default and discloses its no-lookahead, observe-only boundary", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(React.createElement(MonthlyStageEvidenceAuditCard, {
        history: history(100),
      })));

      expect(container.textContent).toContain("Monthly Stage Evidence Learning & Self-Audit");
      expect(container.textContent).toContain("MSELA-1");
      expect(container.textContent).not.toContain("learns only from earlier real draws");

      await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());

      expect(container.textContent).toContain("learns only from earlier real draws");
      expect(container.textContent).toContain("does not rewrite code or alter Stage IDM");
      expect(container.textContent).toContain("Current shared stage evidence");
      expect(container.textContent).toContain("Bucket-only control");
      expect(container.textContent).toContain("Evidence by draw ordinal");
      expect(container.textContent).toContain("Learned-rate calibration");
      expect(container.textContent).toContain("Strict walk-forward ledger");
      expect(container.textContent).toContain("No recipe is applied automatically");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
