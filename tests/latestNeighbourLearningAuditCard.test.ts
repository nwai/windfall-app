import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import LatestNeighbourLearningAuditCard from "../src/components/LatestNeighbourLearningAuditCard";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const history = (count: number): Draw[] => {
  const rows: Draw[] = [];
  const cursor = new Date(2025, 0, 1);
  let index = 0;
  while (rows.length < count) {
    if ([1, 3, 5].includes(cursor.getDay())) {
      const start = (index * 7) % 45;
      const numbers = Array.from({ length: 8 }, (_, offset) => ((start + offset * 5) % 45) + 1);
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

describe("LatestNeighbourLearningAuditCard", () => {
  it("keeps the learning audit collapsed, observe-only, and explicit about fair-size random references", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(React.createElement(LatestNeighbourLearningAuditCard, {
        history: history(90),
        historyScopeLabel: "Baseline history test slice",
        liveMode: "pm1pm2",
        liveEnabled: true,
      })));

      expect(container.textContent).toContain("Latest Draw ±1/±2 Learning & Self-Audit");
      expect(container.textContent).toContain("LDN-SA-1");
      expect(container.textContent).not.toContain("audits the rule Windfall actually uses");

      await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());

      expect(container.textContent).toContain("audits the rule Windfall actually uses");
      expect(container.textContent).toContain("does not switch the live mode, change generation");
      expect(container.textContent).toContain("Baseline history test slice");
      expect(container.textContent).toContain("Walk-forward mode comparison");
      expect(container.textContent).toContain("Equal-size random");
      expect(container.textContent).toContain("Current history-only target read");
      expect(container.textContent).toContain("Conservative evidence gates");
      expect(container.textContent).toContain("Versioned walk-forward ledger");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
