import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MonthlyTransitionInfluenceSummary } from "../src/components/MonthlyTransitionInfluenceSummary";
import { MonthlyBucketTransitionGovernorControls } from "../src/components/MonthlyBucketTransitionGovernorControls";
import {
  buildMonthlyBucketTransitionGovernorProfile,
  monthlyBucketTransitionGovernorDisplaySummary,
  type MonthlyBucketTransitionGovernorMode,
} from "../src/lib/monthlyBucketTransitionGovernor";
import { createEmptyMonthlyBucketSets } from "../src/lib/monthlyDrawSummary";

const buckets = createEmptyMonthlyBucketSets();
buckets.times3 = new Set([17, 22]);
const profileFor = (mode: MonthlyBucketTransitionGovernorMode, ordinal = 8) => (
  buildMonthlyBucketTransitionGovernorProfile({ mode, history: [], monthlyBuckets: buckets,
    targetMonthLabel: "2026-09", targetMonthExpectedDrawCount: 13, targetDrawOrdinal: ordinal })
);

describe("Monthly transition shared setting", () => {
  it.each(["light", "normal", "strong"] as const)("shows selected %s and exact shared weights", (mode) => {
    const profile = profileFor(mode);
    const markup = renderToStaticMarkup(React.createElement(MonthlyTransitionInfluenceSummary, { profile }));
    expect(markup).toContain(`Manual ${mode}`);
    expect(markup).toContain(`${mode} · 2 numbers weighted`);
    expect(markup).toContain("2026-09 13D D8");
    expect(markup).toContain(`(3x) ×${profile.numberMultipliers[17].toFixed(2)}`);
    expect(markup).toContain("Acceptance Needs and IDM targets are unchanged");
  });

  it("hides Off and missing profiles without inventing an applied setting", () => {
    expect(renderToStaticMarkup(React.createElement(MonthlyTransitionInfluenceSummary, { profile: profileFor("off") }))).toBe("");
    expect(renderToStaticMarkup(React.createElement(MonthlyTransitionInfluenceSummary))).toBe("");
  });

  it("distinguishes Auto gate failure and manual stage ineligibility from a boost", () => {
    for (const profile of [profileFor("auto"), profileFor("strong", 6)]) {
      const markup = renderToStaticMarkup(React.createElement(MonthlyTransitionInfluenceSummary, { profile }));
      expect(markup).toContain("No boost applied");
      expect(markup).toContain('data-applying="false"');
      expect(markup).not.toContain("Monthly transition sampling multipliers");
    }
  });

  it("reports RwR45 bypass without changing the selected mode or profile", () => {
    const profile = profileFor("strong");
    const before = JSON.stringify(profile);
    const markup = renderToStaticMarkup(React.createElement(MonthlyTransitionInfluenceSummary, {
      profile, bypassedByRandomCoverage: true,
    }));
    expect(markup).toContain("Manual strong");
    expect(markup).toContain("Bypassed by RwR45/PNUaRW45");
    expect(markup).not.toContain("2 numbers weighted");
    expect(markup).not.toContain("(3x) ×1.40");
    expect(JSON.stringify(profile)).toBe(before);
    expect(monthlyBucketTransitionGovernorDisplaySummary(profile, true))
      .toBe("Manual strong · bypassed by RwR45/PNUaRW45");
    expect(monthlyBucketTransitionGovernorDisplaySummary(profile, false)).toBe(profile.summaryLabel);
    expect(monthlyBucketTransitionGovernorDisplaySummary(profileFor("off"), true)).toBe("Off");
  });

  it("labels monthly diagnostic / Paste-Weighted views as reference only", () => {
    const markup = renderToStaticMarkup(React.createElement(MonthlyTransitionInfluenceSummary, {
      profile: profileFor("normal"), referenceOnly: true,
    }));
    expect(markup).toContain("Not applied to this panel&#x27;s calculations.");
    expect(markup).toContain("Main generator:");
  });

  it("updates readouts from the owning control and leaves source bucket members unchanged", async () => {
    const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = globals.IS_REACT_ACT_ENVIRONMENT;
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);
    function Harness() {
      const [mode, setMode] = useState<MonthlyBucketTransitionGovernorMode>("off");
      const profile = profileFor(mode);
      return React.createElement(React.Fragment, null,
        React.createElement(MonthlyBucketTransitionGovernorControls, { profile, onModeChange: setMode }),
        React.createElement(MonthlyTransitionInfluenceSummary, { profile }),
        React.createElement(MonthlyTransitionInfluenceSummary, { profile, referenceOnly: true }),
      );
    }
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const select = container.querySelector("select")!;
      for (const mode of ["normal", "strong", "auto", "off"]) {
        await act(async () => { select.value = mode; select.dispatchEvent(new Event("change", { bubbles: true })); });
        const readouts = container.querySelectorAll(".monthly-transition-mirror__state");
        expect(readouts).toHaveLength(mode === "off" ? 0 : 2);
        if (readouts.length) {
          expect(readouts[0].textContent).toBe(readouts[1].textContent);
          expect(readouts[0].getAttribute("data-mode")).toBe(mode);
        }
      }
      expect([...buckets.times3]).toEqual([17, 22]);
    } finally {
      await act(async () => root.unmount());
      globals.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });

  it("wires one profile to consumers and locates the single owner between the requested controls", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const singleDigit = app.indexOf(">Single-digit / two-digit share</div>");
    const governor = app.indexOf("id={MONTHLY_TRANSITION_GOVERNOR_TARGET_ID}");
    const monthlyConstruction = app.indexOf(">Monthly bucket construction</div>");
    expect(governor).toBeGreaterThan(singleDigit);
    expect(governor).toBeLessThan(monthlyConstruction);
    expect(app.match(/id=\{MONTHLY_TRANSITION_GOVERNOR_TARGET_ID\}/g)).toHaveLength(1);
    expect(app.match(/monthlyTransitionInfluenceProfile=\{monthlyBucketTransitionGovernorProfile\}/g)).toHaveLength(4);
    expect(app).toContain('navigateToGenerationSetupSummaryTarget("monthlyTransition")');
    expect(app).toContain("snapshot.monthlyBucketTransitionGovernorActive = monthlyBucketTransitionGovernorProfile.active && !rwr45Enabled");
    expect(app).toContain("snapshot.monthlyBucketTransitionGovernorSummaryLabel = monthlyTransitionDisplaySummary");
  });
});
