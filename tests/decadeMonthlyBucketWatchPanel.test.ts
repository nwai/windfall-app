import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import DecadeMonthlyBucketWatchPanel from "../src/components/DecadeMonthlyBucketWatchPanel";
import { getPanelOwnership, panelCanProvideIndependentPortfolioEvidence } from "../src/lib/evidenceFamilyRegistry";

const history = [{ date: "2024-06-03", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] }];

describe("DecadeMonthlyBucketWatchPanel", () => {
  it("discloses scope, no fallback, no generation influence and all 45 cells", () => {
    const html = renderToStaticMarkup(React.createElement(DecadeMonthlyBucketWatchPanel, { history, today: "2024-06-04" }));
    expect(html).toContain("Observe-only · No generation influence");
    expect(html).toContain("independent of WFMQYH");
    expect(html).toContain("No eligible real targets");
    expect(html).toContain("No fallback evidence");
    expect(html.match(/class="decade-bucket-watch__cell"/g)).toHaveLength(45);
    expect(html).toContain("not an extra independent consensus vote");
  });

  it("changes only local scope and permits inspecting thin or empty cells", async () => {
    const global = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const old = global.IS_REACT_ACT_ENVIRONMENT;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(DecadeMonthlyBucketWatchPanel, { history, today: "2024-06-04" })));
      const selector = container.querySelector<HTMLSelectElement>("#decade-bucket-watch-ordinal")!;
      await act(async () => { selector.value = "all"; selector.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(container.textContent).toContain("1 real target draws");
      const cell = container.querySelector<HTMLButtonElement>('button[aria-label^="Inspect 40-45, Undrawn"]')!;
      await act(async () => cell.click());
      expect(cell.getAttribute("aria-pressed")).toBe("true");
      expect(container.querySelector('[aria-label="Selected decade bucket evidence"]')?.textContent).toContain("0 / 6");
      await act(async () => cell.click());
      expect(container.querySelector('[aria-label="Selected decade bucket evidence"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      global.IS_REACT_ACT_ENVIRONMENT = old;
    }
  });

  it("is documented after the monthly lab and cannot contribute an independent portfolio vote", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const manual = readFileSync(resolve(process.cwd(), "public/user-manual.html"), "utf8");
    expect(app.indexOf('panelId="monthly-bucket-transition-lab"')).toBeLessThan(app.indexOf('panelId="decade-monthly-bucket-watch"'));
    expect(app).toContain("<DecadeMonthlyBucketWatchPanel history={realHistory}");
    expect(getPanelOwnership("decade-monthly-bucket-watch")).toMatchObject({ primaryFamily: "monthly-stage", role: "consumer", allowedUse: "observe-only" });
    expect(panelCanProvideIndependentPortfolioEvidence("decade-monthly-bucket-watch")).toBe(false);
    expect(manual).toContain('id="decade-monthly-bucket-watch"');
  });
});
