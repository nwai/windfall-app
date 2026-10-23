import React, { act, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { MonthlyBucketTransitionGovernorControls } from "../src/components/MonthlyBucketTransitionGovernorControls";
import { buildMonthlyBucketTransitionGovernorProfile, type MonthlyBucketTransitionGovernorMode } from "../src/lib/monthlyBucketTransitionGovernor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const [mode, setMode] = useState<MonthlyBucketTransitionGovernorMode>("off");
  const profile = buildMonthlyBucketTransitionGovernorProfile({ mode, history: [],
    monthlyBuckets: { undrawn: new Set(), times1: new Set(), times2: new Set(), times3: new Set([17, 22]), times4: new Set(), times5: new Set(), times6: new Set(), times7: new Set(), times8: new Set() },
    targetMonthLabel: "2026-09", targetMonthExpectedDrawCount: 13, targetDrawOrdinal: 8,
  });
  return React.createElement(MonthlyBucketTransitionGovernorControls, { profile, onModeChange: setMode });
}

describe("Monthly Bucket Transition Governor controls", () => {
  it("shows neutral applied weights when RwR45 bypasses a retained manual choice", () => {
    const profile = buildMonthlyBucketTransitionGovernorProfile({ mode: "strong", history: [],
      monthlyBuckets: { undrawn: new Set(), times1: new Set(), times2: new Set(), times3: new Set([17, 22]), times4: new Set(), times5: new Set(), times6: new Set(), times7: new Set(), times8: new Set() },
      targetMonthLabel: "2026-09", targetMonthExpectedDrawCount: 13, targetDrawOrdinal: 8,
    });
    const markup = renderToStaticMarkup(React.createElement(MonthlyBucketTransitionGovernorControls, {
      profile, onModeChange: () => {}, bypassedByRandomCoverage: true,
    }));
    expect(markup).toContain("Manual strong · bypassed by RwR45/PNUaRW45");
    expect(markup).toContain("<strong>1.00x</strong>");
    expect(markup).not.toContain("Transition multiplier ledger:");
  });

  it("shows each requested mode, applied weight, and manual evidence override", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const select = container.querySelector<HTMLSelectElement>("select")!;
      expect(select.value).toBe("off");
      expect(container.textContent).toContain("2026-09 13D D8");
      const choose = async (mode: string) => act(async () => { select.value = mode; select.dispatchEvent(new Event("change", { bubbles: true })); });
      await choose("auto");
      expect(container.textContent).toContain("Auto · observe-only");
      expect(container.textContent).toContain("Not passed");
      for (const [mode, weight] of [["light", "1.10"], ["normal", "1.25"], ["strong", "1.40"]]) {
        await choose(mode);
        expect(container.querySelector('[role="status"]')?.textContent).toContain(`Manual ${mode} · applied ${mode}`);
        expect(container.querySelector("tbody")?.textContent).toContain(`${weight}x`);
        expect(container.textContent).toContain(`17 (3x) ×${weight}`);
        expect(container.textContent).toContain("Bypassed by user");
      }
      await choose("off");
      expect(container.querySelector("table")).toBeNull();
      expect(container.textContent).toContain("No monthly-transition weighting applied.");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
