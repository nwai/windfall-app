import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { DroughtEvidenceGovernorControls } from "../src/components/DroughtEvidenceGovernorControls";
import { buildDroughtEvidenceGovernorProfile, normalizeDroughtEvidenceGovernorSettings, type DroughtEvidenceGovernorMode } from "../src/lib/droughtEvidenceGovernor";
import { buildEmpiricalDroughtQuotaAdvice, buildStrictDroughtQuotaAdvice } from "../src/lib/strictDroughtQuotaAdvice";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const [mode, setMode] = useState<DroughtEvidenceGovernorMode>("off");
  const [settings, setSettings] = useState(() => normalizeDroughtEvidenceGovernorSettings());
  const profile = buildDroughtEvidenceGovernorProfile({ mode, settings,
    strictAdvice: buildStrictDroughtQuotaAdvice([]), empiricalAdvice: buildEmpiricalDroughtQuotaAdvice([]),
    strictShortlist: { topK: 8, threshold: 6, numbers: [7, 21], rows: [], rankMultipliers: {} },
    empiricalShortlist: { topK: 8, numbers: [21], rows: [], rankMultipliers: {} },
    strictEligibleNumbers: [7, 21], empiricalEligibleNumbers: [21], carryOverNumbers: [7],
    monthlyBuckets: { undrawn: new Set([7, 21]), times1: new Set(), times2: new Set(), times3: new Set(), times4: new Set(), times5: new Set(), times6: new Set(), times7: new Set(), times8: new Set() },
    targetMonthLabel: "2026-09", targetMonthExpectedDrawCount: 13, targetDrawOrdinal: 7,
  });
  return React.createElement(DroughtEvidenceGovernorControls, { profile, onModeChange: setMode, onSettingsChange: setSettings });
}

describe("Drought Evidence Governor controls", () => {
  it("switches modes exclusively and updates applied weights, masks and carry-over state", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const switches = container.querySelectorAll<HTMLInputElement>('input[role="switch"]');
      const [auto, manual, carryOver] = Array.from(switches);
      expect(auto.checked).toBe(false);
      expect(manual.checked).toBe(false);
      expect(container.textContent).toContain("2026-09 13D D7");
      await act(async () => auto.click());
      expect(auto.checked).toBe(true);
      expect(container.textContent).toContain("Auto · no boost applied");
      await act(async () => manual.click());
      expect(auto.checked).toBe(false);
      expect(manual.checked).toBe(true);

      const select = container.querySelector<HTMLSelectElement>('[aria-label="Strict soft weight"]')!;
      await act(async () => { select.value = "1.20"; select.dispatchEvent(new Event("change", { bubbles: true })); });
      const row = () => Array.from(container.querySelectorAll("tbody tr")).find((item) => item.querySelector("th")?.textContent === "7")!;
      expect(row().textContent).toContain("1.20x");
      const override = row().querySelector<HTMLSelectElement>("select")!;
      await act(async () => { override.value = "1.17"; override.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(row().textContent).toContain("1.17x");
      await act(async () => carryOver.click());
      expect(row().querySelector("strong")?.textContent).toBe("1.00x");
      expect(override.disabled).toBe(true);
      expect(container.textContent).toContain("Count 1");
      await act(async () => carryOver.click());
      expect(row().querySelector("strong")?.textContent).toBe("1.17x");
      await act(async () => container.querySelector<HTMLInputElement>('[aria-label="Strict bucket 0x"]')!.click());
      expect(row().querySelector("strong")?.textContent).toBe("1.00x");
      await act(async () => manual.click());
      expect(auto.checked).toBe(false);
      expect(manual.checked).toBe(false);
      expect(container.querySelector('[role="status"]')?.textContent).toContain("Off");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
