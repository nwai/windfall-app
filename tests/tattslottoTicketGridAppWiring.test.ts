import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readAppSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("Tattslotto ticket grid replay app wiring", () => {
  it("renders the panel under the DGA workflow after Next Hot Blocks and before Diamond Grid Analysis", () => {
    const appSource = readAppSource();
    const nextHotBlocksIndex = appSource.indexOf('panelId="next-hot-blocks"');
    const ticketReplayIndex = appSource.indexOf('panelId="tattslotto-ticket-grid-replay"');
    const dgaIndex = appSource.indexOf("{/* [ORDER-ANCHOR] 25 Diamond Grid Analysis (DGA) */}");

    expect(appSource.includes('import { TattslottoTicketGridReplayPanel } from "./components/TattslottoTicketGridReplayPanel";')).toBe(true);
    expect(nextHotBlocksIndex).toBeGreaterThanOrEqual(0);
    expect(ticketReplayIndex).toBeGreaterThan(nextHotBlocksIndex);
    expect(dgaIndex).toBeGreaterThan(ticketReplayIndex);
  });

  it("passes realFilteredHistory only and does not wire generation or selection setters", () => {
    const appSource = readAppSource();
    const panelStart = appSource.indexOf("<TattslottoTicketGridReplayPanel");
    const panelEnd = appSource.indexOf("/>", panelStart);
    const panelBlock = appSource.slice(panelStart, panelEnd);

    expect(panelStart).toBeGreaterThanOrEqual(0);
    expect(panelBlock).toContain("history={realFilteredHistory}");
    expect(panelBlock).not.toContain("setUserSelectedNumbers");
    expect(panelBlock).not.toContain("setManualSimSelected");
    expect(panelBlock).not.toContain("setSimulatedDraw");
    expect(panelBlock).not.toContain("setExcludedNumbers");
    expect(panelBlock).not.toContain("setCandidates");
  });
});
