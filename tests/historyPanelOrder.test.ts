import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAVORITE_PANEL_REGISTRY } from "../src/lib/panelFavorites";
import { PANEL_OWNERSHIP_MANIFEST, getPanelOwnership } from "../src/lib/evidenceFamilyRegistry";

const app = readFileSync("src/App.tsx", "utf8");
const ids = ["draw-history-manager", "windowed-draw-filtering", "number-trends"];
describe("history workflow panel order and mirrored selections", () => {
  it("places trends immediately after WFMQYH and retires the standalone next-draw diagnostic", () => {
    const history = app.slice(app.indexOf('id="workflow-history"'), app.indexOf('id="workflow-signals"'));
    expect([...history.matchAll(/panelId="([^"]+)"/g)].map((match) => match[1])).toEqual(ids);
    ids.forEach((id) => expect(history).toContain(`key="${id}"`));
    expect(FAVORITE_PANEL_REGISTRY.filter((panel) => panel.workflow === "History").map((panel) => panel.id)).toEqual(ids);
    expect(PANEL_OWNERSHIP_MANIFEST.filter((panel) => panel.currentHome === "history").map((panel) => panel.panelId))
      .toEqual(["guided-setup", ...ids, "number-trends-movement-replay"]);
  });
  it("retains the active real-history scope, shared drought inclusions and hard exclusions", () => {
    expect(app).toContain("const numberTrends = useMemo(() => computeNumberTrends(realFilteredHistory), [realFilteredHistory]);");
    const forced = app.slice(app.indexOf("const generationForcedNumbers = useMemo"), app.indexOf("const sortedGenerationForcedNumbers"));
    expect(forced).toContain("...droughtBreakSelectedNumbers");
    expect(app).toContain("() => generationForcedNumbers.filter((number) => !trendSelectedNumbers.includes(number))");
    const panel = app.slice(app.indexOf('<NumberTrendsTable'), app.indexOf('/>', app.indexOf('<NumberTrendsTable')));
    expect(panel).toContain("externalSelectedNumbers={numberTrendExternalSelectedNumbers}");
    expect(panel).toContain("excludedNumbers={selectionUnavailableNumbers}");
    expect(panel).toContain("if (selectionUnavailableSet.has(n)) return;");
    expect(app).not.toContain("NextDrawProbabilitiesPanel");
    expect(getPanelOwnership("number-trends")?.allowedUse).toBe("user-directed");
  });
  it("keeps the manual panel-order map in agreement with the app", () => {
    const manual = readFileSync("public/user-manual.html", "utf8");
    const map = manual.slice(manual.indexOf('<h3 id="app-panel-order">'), manual.indexOf('<tr><td>Signals</td>', manual.indexOf('<h3 id="app-panel-order">')));
    const titles = [...map.matchAll(/<tr><td>History &amp; Window<\/td><td>[^<]+<\/td><td>([^<]+)<\/td>/g)].map((match) => match[1]);
    expect(titles).toEqual(["Draw History Manager", "Windowed Draw Filtering (WFMQYH)", "Number Trends Table"]);
    expect(manual).toContain("including Drought-break selections");
  });
});
