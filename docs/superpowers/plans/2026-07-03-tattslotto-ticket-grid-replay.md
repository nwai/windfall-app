# Tattslotto Ticket Grid Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an observe-only Tattslotto 9x5 ticket-grid replay panel that animates real WFMQYH draw history with spatial density, carry-over, adjacent trace, and running hot/cold overlays.

**Architecture:** Put all draw math in a pure helper module, render the replay through one focused React panel, and wire it under the existing DGA workflow. The panel reads `realFilteredHistory` only and never writes to generation, simulation, inclusion, or exclusion state.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, DOMParser/renderToStaticMarkup component tests, existing Windfall `CollapsibleSection`, `HigButton`, `HigField`, and `InfoHelp` controls.

---

## File Structure

- Create `src/lib/tattslottoTicketGrid.ts`
  - Pure data helpers for 9x5 cell mapping, replay frame construction, overlay calculations, and frame stepping.
- Create `src/lib/tattslottoTicketGrid.test.ts`
  - Unit tests for mapping, replay filtering/order, carry-over, adjacent trace, density, hot/cold, and frame stepping.
- Create `src/components/TattslottoTicketGridReplayPanel.tsx`
  - React panel, grid renderer, playback controls, overlay toggles, legend, and summaries.
- Create `tests/tattslottoTicketGridReplayPanel.test.tsx`
  - Component render tests and timer-safe playback behavior.
- Create `tests/tattslottoTicketGridAppWiring.test.ts`
  - Source-level guard tests proving the panel receives `realFilteredHistory` and does not receive app-state setters.
- Modify `src/App.tsx`
  - Import and render the new panel under the DGA workflow between Next Hot Blocks and Diamond Grid Analysis.
- Modify `public/user-manual.html`
  - Add a concise manual entry explaining the replay panel and overlays.
- Create `tests/tattslottoTicketGridManual.test.ts`
  - Manual/truthfulness guard for diagnostic language.

## Task 1: Pure Grid Mapping And Replay Frames

**Files:**
- Create: `src/lib/tattslottoTicketGrid.ts`
- Create: `src/lib/tattslottoTicketGrid.test.ts`

- [ ] **Step 1: Write failing tests for grid mapping and replay frames**

Add this initial test file:

```ts
import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import {
  buildTicketGridCells,
  buildTicketGridReplayFrames,
  getTicketGridPosition,
  stepTicketReplayFrame,
} from "./tattslottoTicketGrid";

const draw = (date: string, main: number[], supp: number[] = [44, 45], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});

describe("tattslotto ticket grid helpers", () => {
  it("maps numbers 1-45 to a Tattslotto 9x5 grid", () => {
    expect(getTicketGridPosition(1)).toEqual({ number: 1, row: 0, column: 0 });
    expect(getTicketGridPosition(9)).toEqual({ number: 9, row: 0, column: 8 });
    expect(getTicketGridPosition(10)).toEqual({ number: 10, row: 1, column: 0 });
    expect(getTicketGridPosition(45)).toEqual({ number: 45, row: 4, column: 8 });
    expect(getTicketGridPosition(0)).toBeNull();
    expect(getTicketGridPosition(46)).toBeNull();
  });

  it("builds exactly 45 cells in ticket order", () => {
    const cells = buildTicketGridCells();

    expect(cells).toHaveLength(45);
    expect(cells[0]).toEqual({ number: 1, row: 0, column: 0 });
    expect(cells[44]).toEqual({ number: 45, row: 4, column: 8 });
  });

  it("builds chronological real replay frames and excludes simulated draws", () => {
    const frames = buildTicketGridReplayFrames([
      draw("6/05/26", [5, 6, 7, 8, 9, 10]),
      draw("6/01/26", [1, 2, 3, 4, 5, 6]),
      draw("6/03/26", [3, 4, 5, 6, 7, 8], [9, 10], true),
    ]);

    expect(frames.map((frame) => frame.date)).toEqual(["6/01/26", "6/05/26"]);
    expect(frames[0]).toMatchObject({
      index: 0,
      frameNumber: 1,
      totalFrames: 2,
      main: [1, 2, 3, 4, 5, 6],
      supp: [44, 45],
    });
    expect(frames[1]).toMatchObject({
      index: 1,
      frameNumber: 2,
      totalFrames: 2,
      main: [5, 6, 7, 8, 9, 10],
    });
  });

  it("steps replay frame indices with clamping", () => {
    expect(stepTicketReplayFrame({ currentIndex: 0, frameCount: 4, direction: 1 })).toBe(1);
    expect(stepTicketReplayFrame({ currentIndex: 3, frameCount: 4, direction: 1 })).toBe(3);
    expect(stepTicketReplayFrame({ currentIndex: 3, frameCount: 4, direction: -1 })).toBe(2);
    expect(stepTicketReplayFrame({ currentIndex: 0, frameCount: 4, direction: -1 })).toBe(0);
    expect(stepTicketReplayFrame({ currentIndex: 0, frameCount: 0, direction: 1 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm test -- src/lib/tattslottoTicketGrid.test.ts
```

Expected: fail because `src/lib/tattslottoTicketGrid.ts` does not exist.

- [ ] **Step 3: Implement the pure mapping and frame helpers**

Create `src/lib/tattslottoTicketGrid.ts`:

```ts
import type { Draw } from "../types";
import { sortDrawsChronologically } from "./recentDraws";

export const TATTSLOTTO_GRID_COLUMNS = 9;
export const TATTSLOTTO_GRID_ROWS = 5;
export const TATTSLOTTO_MIN_NUMBER = 1;
export const TATTSLOTTO_MAX_NUMBER = 45;

export type TicketGridDrawScope = "mains" | "mainsSupps";

export interface TicketGridPosition {
  number: number;
  row: number;
  column: number;
}

export interface TicketGridReplayFrame {
  index: number;
  frameNumber: number;
  totalFrames: number;
  date: string;
  main: number[];
  supp: number[];
  draw: Draw;
}

export interface TicketReplayStepInput {
  currentIndex: number;
  frameCount: number;
  direction: -1 | 1;
}

const isTicketNumber = (value: unknown): value is number => (
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= TATTSLOTTO_MIN_NUMBER &&
  value <= TATTSLOTTO_MAX_NUMBER
);

const normalizeTicketNumbers = (numbers: readonly unknown[] | undefined): number[] => (
  Array.from(new Set((numbers ?? []).filter(isTicketNumber))).sort((left, right) => left - right)
);

export const getTicketGridPosition = (number: number): TicketGridPosition | null => {
  if (!isTicketNumber(number)) return null;
  const zeroIndex = number - TATTSLOTTO_MIN_NUMBER;
  return {
    number,
    row: Math.floor(zeroIndex / TATTSLOTTO_GRID_COLUMNS),
    column: zeroIndex % TATTSLOTTO_GRID_COLUMNS,
  };
};

export const buildTicketGridCells = (): TicketGridPosition[] => (
  Array.from({ length: TATTSLOTTO_MAX_NUMBER }, (_, index) => {
    const position = getTicketGridPosition(index + TATTSLOTTO_MIN_NUMBER);
    if (!position) {
      throw new Error(`Invalid Tattslotto ticket number ${index + TATTSLOTTO_MIN_NUMBER}`);
    }
    return position;
  })
);

export const buildTicketGridReplayFrames = (history: readonly Draw[]): TicketGridReplayFrame[] => {
  const realDraws = sortDrawsChronologically(history.filter((draw) => !draw.isSimulated));
  const totalFrames = realDraws.length;

  return realDraws.map((draw, index) => ({
    index,
    frameNumber: index + 1,
    totalFrames,
    date: draw.date,
    main: normalizeTicketNumbers(draw.main),
    supp: normalizeTicketNumbers(draw.supp),
    draw,
  }));
};

export const ticketNumbersForFrame = (
  frame: TicketGridReplayFrame | null | undefined,
  scope: TicketGridDrawScope,
): number[] => {
  if (!frame) return [];
  return scope === "mains"
    ? frame.main
    : normalizeTicketNumbers([...frame.main, ...frame.supp]);
};

export const stepTicketReplayFrame = ({
  currentIndex,
  frameCount,
  direction,
}: TicketReplayStepInput): number => {
  if (frameCount <= 0) return 0;
  return Math.max(0, Math.min(frameCount - 1, currentIndex + direction));
};
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```bash
npm test -- src/lib/tattslottoTicketGrid.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/tattslottoTicketGrid.ts src/lib/tattslottoTicketGrid.test.ts
git commit -m "Add Tattslotto ticket grid replay helpers"
```

## Task 2: Pure Overlay Calculations

**Files:**
- Modify: `src/lib/tattslottoTicketGrid.ts`
- Modify: `src/lib/tattslottoTicketGrid.test.ts`

- [ ] **Step 1: Add failing overlay tests**

Append these tests inside the existing `describe` block in `src/lib/tattslottoTicketGrid.test.ts`:

```ts
  it("computes carry-over markers from the previous real frame", () => {
    const frames = buildTicketGridReplayFrames([
      draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("6/03/26", [2, 4, 8, 9, 10, 11], [12, 13]),
    ]);

    expect(computeCarryOverMarkers(frames[1], frames[0], "mainsSupps")).toEqual([2, 4, 8]);
    expect(computeCarryOverMarkers(frames[1], frames[0], "mains")).toEqual([2, 4]);
    expect(computeCarryOverMarkers(frames[0], null, "mainsSupps")).toEqual([]);
  });

  it("computes adjacent ±1/±2 trace markers without wrapping at ticket boundaries", () => {
    const frames = buildTicketGridReplayFrames([
      draw("6/01/26", [1, 10, 20, 30, 40, 45], [22, 23]),
      draw("6/03/26", [2, 8, 18, 32, 43, 44], [24, 25]),
    ]);

    expect(computeAdjacentTraceMarkers(frames[1], frames[0], "mainsSupps")).toEqual([2, 8, 18, 24, 25, 32, 43, 44]);
    expect(computeAdjacentTraceMarkers(frames[1], frames[0], "mains")).toEqual([2, 8, 18, 32, 43, 44]);
    expect(computeAdjacentTraceMarkers(frames[0], null, "mainsSupps")).toEqual([]);
  });

  it("computes row and column density over the active replay window", () => {
    const frames = buildTicketGridReplayFrames([
      draw("6/01/26", [1, 2, 3, 10, 11, 12], [44, 45]),
      draw("6/03/26", [1, 9, 18, 27, 36, 45], [2, 3]),
    ]);
    const density = computeTicketGridDensity(frames, "mains");

    expect(density.rowCounts).toEqual([5, 4, 1, 1, 1]);
    expect(density.columnCounts[0]).toBe(3);
    expect(density.maxRowCount).toBe(5);
    expect(density.maxColumnCount).toBe(3);
    expect(density.normalizedRowIntensity[0]).toBe(1);
    expect(density.normalizedRowIntensity[1]).toBeCloseTo(0.8);
  });

  it("computes running hot/cold counts without looking beyond the current frame", () => {
    const frames = buildTicketGridReplayFrames([
      draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("6/03/26", [1, 2, 9, 10, 11, 12], [13, 14]),
      draw("6/05/26", [1, 15, 16, 17, 18, 19], [20, 21]),
    ]);

    const frame0 = computeRunningHotColdCounts(frames, 0, "mainsSupps");
    expect(frame0.hotCount).toBe(1);
    expect(frame0.hotNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(frame0.coldCount).toBe(0);
    expect(frame0.coldNumbers).toHaveLength(37);

    const frame1 = computeRunningHotColdCounts(frames, 1, "mainsSupps");
    expect(frame1.hotCount).toBe(2);
    expect(frame1.hotNumbers).toEqual([1, 2]);
    expect(frame1.countsByNumber[15]).toBe(0);
    expect(frame1.coldNumbers).toContain(15);

    const frame2 = computeRunningHotColdCounts(frames, 2, "mains");
    expect(frame2.hotCount).toBe(3);
    expect(frame2.hotNumbers).toEqual([1]);
  });
```

Update the helper import list at the top of the test file to include these exports:

```ts
  computeAdjacentTraceMarkers,
  computeCarryOverMarkers,
  computeRunningHotColdCounts,
  computeTicketGridDensity,
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```bash
npm test -- src/lib/tattslottoTicketGrid.test.ts
```

Expected: fail because overlay helpers are not exported.

- [ ] **Step 3: Implement overlay helpers**

Append this code to `src/lib/tattslottoTicketGrid.ts`:

```ts
export interface TicketGridDensity {
  rowCounts: number[];
  columnCounts: number[];
  maxRowCount: number;
  maxColumnCount: number;
  normalizedRowIntensity: number[];
  normalizedColumnIntensity: number[];
}

export interface RunningHotColdCounts {
  countsByNumber: Record<number, number>;
  hotCount: number;
  hotNumbers: number[];
  coldCount: number;
  coldNumbers: number[];
}

const uniqueSortedNumbers = (numbers: readonly number[]): number[] => (
  Array.from(new Set(numbers.filter(isTicketNumber))).sort((left, right) => left - right)
);

const numbersInScopeSet = (
  frame: TicketGridReplayFrame | null | undefined,
  scope: TicketGridDrawScope,
): Set<number> => new Set(ticketNumbersForFrame(frame, scope));

export const computeCarryOverMarkers = (
  currentFrame: TicketGridReplayFrame | null | undefined,
  previousFrame: TicketGridReplayFrame | null | undefined,
  scope: TicketGridDrawScope,
): number[] => {
  if (!currentFrame || !previousFrame) return [];
  const previous = numbersInScopeSet(previousFrame, scope);
  return uniqueSortedNumbers(ticketNumbersForFrame(currentFrame, scope).filter((number) => previous.has(number)));
};

const buildAdjacentNeighbourSet = (numbers: readonly number[]): Set<number> => {
  const neighbours = new Set<number>();
  numbers.forEach((number) => {
    [-2, -1, 1, 2].forEach((delta) => {
      const candidate = number + delta;
      if (isTicketNumber(candidate)) neighbours.add(candidate);
    });
  });
  return neighbours;
};

export const computeAdjacentTraceMarkers = (
  currentFrame: TicketGridReplayFrame | null | undefined,
  previousFrame: TicketGridReplayFrame | null | undefined,
  scope: TicketGridDrawScope,
): number[] => {
  if (!currentFrame || !previousFrame) return [];
  const neighbours = buildAdjacentNeighbourSet(ticketNumbersForFrame(previousFrame, scope));
  return uniqueSortedNumbers(ticketNumbersForFrame(currentFrame, scope).filter((number) => neighbours.has(number)));
};

export const computeTicketGridDensity = (
  frames: readonly TicketGridReplayFrame[],
  scope: TicketGridDrawScope,
): TicketGridDensity => {
  const rowCounts = Array.from({ length: TATTSLOTTO_GRID_ROWS }, () => 0);
  const columnCounts = Array.from({ length: TATTSLOTTO_GRID_COLUMNS }, () => 0);

  frames.forEach((frame) => {
    ticketNumbersForFrame(frame, scope).forEach((number) => {
      const position = getTicketGridPosition(number);
      if (!position) return;
      rowCounts[position.row] += 1;
      columnCounts[position.column] += 1;
    });
  });

  const maxRowCount = Math.max(0, ...rowCounts);
  const maxColumnCount = Math.max(0, ...columnCounts);
  const normalize = (value: number, max: number): number => (max > 0 ? value / max : 0);

  return {
    rowCounts,
    columnCounts,
    maxRowCount,
    maxColumnCount,
    normalizedRowIntensity: rowCounts.map((value) => normalize(value, maxRowCount)),
    normalizedColumnIntensity: columnCounts.map((value) => normalize(value, maxColumnCount)),
  };
};

export const computeRunningHotColdCounts = (
  frames: readonly TicketGridReplayFrame[],
  frameIndex: number,
  scope: TicketGridDrawScope,
): RunningHotColdCounts => {
  const safeIndex = Math.max(0, Math.min(frames.length - 1, Math.floor(frameIndex)));
  const countsByNumber: Record<number, number> = {};
  for (let number = TATTSLOTTO_MIN_NUMBER; number <= TATTSLOTTO_MAX_NUMBER; number += 1) {
    countsByNumber[number] = 0;
  }

  frames.slice(0, safeIndex + 1).forEach((frame) => {
    ticketNumbersForFrame(frame, scope).forEach((number) => {
      countsByNumber[number] += 1;
    });
  });

  const counts = Object.values(countsByNumber);
  const hotCount = counts.length ? Math.max(...counts) : 0;
  const coldCount = counts.length ? Math.min(...counts) : 0;
  const numbersForCount = (count: number): number[] => (
    Object.entries(countsByNumber)
      .filter(([, value]) => value === count)
      .map(([number]) => Number(number))
      .sort((left, right) => left - right)
  );

  return {
    countsByNumber,
    hotCount,
    hotNumbers: numbersForCount(hotCount),
    coldCount,
    coldNumbers: numbersForCount(coldCount),
  };
};
```

- [ ] **Step 4: Run focused tests and confirm they pass**

Run:

```bash
npm test -- src/lib/tattslottoTicketGrid.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/tattslottoTicketGrid.ts src/lib/tattslottoTicketGrid.test.ts
git commit -m "Add Tattslotto ticket grid overlay calculations"
```

## Task 3: Static Replay Panel And Grid Rendering

**Files:**
- Create: `src/components/TattslottoTicketGridReplayPanel.tsx`
- Create: `tests/tattslottoTicketGridReplayPanel.test.tsx`

- [ ] **Step 1: Write failing component tests for empty and static frame render**

Create `tests/tattslottoTicketGridReplayPanel.test.tsx`:

```tsx
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TattslottoTicketGridReplayPanel } from "../src/components/TattslottoTicketGridReplayPanel";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = [44, 45], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});

describe("TattslottoTicketGridReplayPanel", () => {
  it("renders a truthful empty state when no real draws are available", () => {
    const html = renderToStaticMarkup(<TattslottoTicketGridReplayPanel history={[]} />);

    expect(html).toContain("No real draws available in the active window");
    expect(html).toContain("observed historical draws");
  });

  it("renders the first chronological real draw on a 9x5 ticket grid", () => {
    const html = renderToStaticMarkup(
      <TattslottoTicketGridReplayPanel
        history={[
          draw("6/05/26", [5, 6, 7, 8, 9, 10]),
          draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
          draw("6/03/26", [11, 12, 13, 14, 15, 16], [17, 18], true),
        ]}
      />,
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const grid = document.querySelector('[data-testid="tattslotto-ticket-grid"]');

    expect(document.body.textContent).toContain("6/01/26");
    expect(document.body.textContent).toContain("Frame 1 / 2");
    expect(grid?.querySelectorAll("[data-ticket-number]").length).toBe(45);
    expect(grid?.querySelector('[data-ticket-number="1"]')?.getAttribute("data-draw-role")).toBe("main");
    expect(grid?.querySelector('[data-ticket-number="7"]')?.getAttribute("data-draw-role")).toBe("supp");
    expect(grid?.querySelector('[data-ticket-number="9"]')?.getAttribute("data-draw-role")).toBe("none");
  });
});
```

- [ ] **Step 2: Run the component test and confirm it fails**

Run:

```bash
npm test -- tests/tattslottoTicketGridReplayPanel.test.tsx
```

Expected: fail because the component does not exist.

- [ ] **Step 3: Implement a static replay panel**

Create `src/components/TattslottoTicketGridReplayPanel.tsx`:

```tsx
import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import { HigButton, InfoHelp } from "./shared/HigControls";
import {
  buildTicketGridCells,
  buildTicketGridReplayFrames,
  computeAdjacentTraceMarkers,
  computeCarryOverMarkers,
  computeRunningHotColdCounts,
  computeTicketGridDensity,
  stepTicketReplayFrame,
  ticketNumbersForFrame,
  type TicketGridDrawScope,
} from "../lib/tattslottoTicketGrid";

interface TattslottoTicketGridReplayPanelProps {
  history: Draw[];
}

type PlaybackDirection = -1 | 0 | 1;

const SPEED_OPTIONS = [
  { label: "0.25x", value: 2400 },
  { label: "0.5x", value: 1600 },
  { label: "1x", value: 900 },
  { label: "2x", value: 450 },
  { label: "4x", value: 220 },
];

const styles: Record<string, React.CSSProperties> = {
  shell: {
    border: "1px solid #d9e1ed",
    borderRadius: 14,
    background: "#fff",
    padding: 14,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  title: {
    margin: 0,
    color: "#1e3a8a",
    fontSize: 16,
    fontWeight: 800,
  },
  subtitle: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 1.45,
    marginTop: 4,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 1fr) minmax(240px, 0.42fr)",
    gap: 14,
    alignItems: "start",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(9, minmax(30px, 1fr))",
    gap: 6,
    maxWidth: 560,
  },
  cell: {
    aspectRatio: "1 / 1",
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 800,
    color: "#263241",
    background: "#fff",
    position: "relative",
    minWidth: 0,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    marginTop: 12,
  },
  side: {
    display: "grid",
    gap: 10,
    color: "#475569",
    fontSize: 12,
    lineHeight: 1.45,
  },
  note: {
    borderLeft: "4px solid #0f766e",
    background: "#f0fdfa",
    borderRadius: 10,
    padding: "8px 10px",
    color: "#115e59",
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    color: "#475569",
    fontSize: 12,
  },
  pill: {
    border: "1px solid #dbe3ee",
    borderRadius: 999,
    padding: "4px 8px",
    background: "#f8fafc",
    fontWeight: 700,
  },
};

const cellStyleForRole = (role: "main" | "supp" | "none"): React.CSSProperties => {
  if (role === "main") return { background: "#0f62fe", borderColor: "#0f62fe", color: "#fff" };
  if (role === "supp") return { background: "#7c3aed", borderColor: "#7c3aed", color: "#fff" };
  return {};
};

export const TattslottoTicketGridReplayPanel: React.FC<TattslottoTicketGridReplayPanelProps> = ({ history }) => {
  const frames = useMemo(() => buildTicketGridReplayFrames(history), [history]);
  const cells = useMemo(() => buildTicketGridCells(), []);
  const [frameIndex, setFrameIndex] = useState(0);
  const [scope, setScope] = useState<TicketGridDrawScope>("mainsSupps");
  const [playbackDirection, setPlaybackDirection] = useState<PlaybackDirection>(0);
  const [speedMs, setSpeedMs] = useState(900);
  const [spatialDensityEnabled, setSpatialDensityEnabled] = useState(true);
  const [carryOverEnabled, setCarryOverEnabled] = useState(true);
  const [adjacentTraceEnabled, setAdjacentTraceEnabled] = useState(false);
  const [hotColdEnabled, setHotColdEnabled] = useState(true);

  const activeIndex = Math.max(0, Math.min(frames.length - 1, frameIndex));
  const activeFrame = frames[activeIndex] ?? null;
  const previousFrame = activeIndex > 0 ? frames[activeIndex - 1] : null;
  const mainSet = new Set(activeFrame?.main ?? []);
  const suppSet = new Set(activeFrame?.supp ?? []);
  const carryOver = new Set(carryOverEnabled ? computeCarryOverMarkers(activeFrame, previousFrame, scope) : []);
  const adjacentTrace = new Set(adjacentTraceEnabled ? computeAdjacentTraceMarkers(activeFrame, previousFrame, scope) : []);
  const density = useMemo(() => computeTicketGridDensity(frames, scope), [frames, scope]);
  const hotCold = useMemo(
    () => computeRunningHotColdCounts(frames, activeIndex, scope),
    [activeIndex, frames, scope],
  );
  const hotSet = new Set(hotColdEnabled ? hotCold.hotNumbers : []);
  const coldSet = new Set(hotColdEnabled ? hotCold.coldNumbers : []);

  React.useEffect(() => {
    setFrameIndex(0);
    setPlaybackDirection(0);
  }, [frames.length]);

  React.useEffect(() => {
    if (playbackDirection === 0 || frames.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => stepTicketReplayFrame({
        currentIndex: current,
        frameCount: frames.length,
        direction: playbackDirection,
      }));
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [frames.length, playbackDirection, speedMs]);

  if (frames.length === 0) {
    return (
      <section style={styles.shell} aria-label="Tattslotto Ticket Grid Replay">
        <h3 style={styles.title}>Tattslotto Ticket Grid Replay</h3>
        <p style={styles.subtitle}>
          This panel replays observed historical draws on the Tattslotto ticket grid.
        </p>
        <div style={styles.note}>
          No real draws available in the active window. Adjust WFMQYH or reload draw history.
        </div>
      </section>
    );
  }

  const step = (direction: -1 | 1) => {
    setPlaybackDirection(0);
    setFrameIndex((current) => stepTicketReplayFrame({ currentIndex: current, frameCount: frames.length, direction }));
  };

  return (
    <section style={styles.shell} aria-label="Tattslotto Ticket Grid Replay">
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Tattslotto Ticket Grid Replay</h3>
          <div style={styles.subtitle}>
            Frame {activeFrame?.frameNumber ?? 0} / {frames.length} · {activeFrame?.date ?? "No draw"} · {scope === "mainsSupps" ? "mains + supps" : "mains only"}
          </div>
        </div>
        <InfoHelp label="Tattslotto replay explanation">
          This panel replays observed historical draws on the 9x5 Tattslotto ticket grid. Overlays are diagnostics from the active WFMQYH window, not calibrated predictions.
        </InfoHelp>
      </div>

      <div style={styles.layout}>
        <div>
          <div data-testid="tattslotto-ticket-grid" style={styles.grid}>
            {cells.map((cell) => {
              const role = mainSet.has(cell.number) ? "main" : suppSet.has(cell.number) ? "supp" : "none";
              const densityStrength = spatialDensityEnabled
                ? Math.max(density.normalizedRowIntensity[cell.row], density.normalizedColumnIntensity[cell.column])
                : 0;
              const hotColdLabel = hotSet.has(cell.number) ? "H" : coldSet.has(cell.number) ? "C" : "";
              return (
                <span
                  key={cell.number}
                  data-ticket-number={cell.number}
                  data-draw-role={role}
                  data-carry-over={carryOver.has(cell.number) ? "true" : "false"}
                  data-adjacent-trace={adjacentTrace.has(cell.number) ? "true" : "false"}
                  data-hot-cold={hotColdLabel || "none"}
                  style={{
                    ...styles.cell,
                    ...cellStyleForRole(role),
                    boxShadow: densityStrength > 0.75 ? "inset 0 -4px 0 rgba(217,70,239,0.35)" : undefined,
                    outline: carryOver.has(cell.number) ? "2px solid #f59e0b" : adjacentTrace.has(cell.number) ? "2px solid #0f766e" : undefined,
                  }}
                  title={`Number ${cell.number}${hotColdLabel ? ` · ${hotColdLabel === "H" ? "running hot" : "running cold"}` : ""}`}
                >
                  {cell.number}
                  {hotColdLabel && (
                    <span aria-hidden="true" style={{ position: "absolute", top: -7, right: -3, fontSize: 9, fontWeight: 900 }}>
                      {hotColdLabel}
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          <div style={styles.controls}>
            <HigButton size="compact" variant="secondary" aria-label="Step backward one draw" onClick={() => step(-1)}>◀</HigButton>
            <HigButton size="compact" variant="secondary" aria-label="Play backward" onClick={() => setPlaybackDirection(-1)}>⏪</HigButton>
            <HigButton size="compact" variant="primary" aria-label="Pause replay" onClick={() => setPlaybackDirection(0)}>⏸</HigButton>
            <HigButton size="compact" variant="secondary" aria-label="Play forward" onClick={() => setPlaybackDirection(1)}>⏩</HigButton>
            <HigButton size="compact" variant="secondary" aria-label="Step forward one draw" onClick={() => step(1)}>▶</HigButton>
            <HigButton size="compact" variant="quiet" aria-label="Reset replay" onClick={() => { setPlaybackDirection(0); setFrameIndex(0); }}>Reset</HigButton>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              Speed
              <select aria-label="Replay speed" value={speedMs} onChange={(event) => setSpeedMs(Number(event.target.value))}>
                {SPEED_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <aside style={styles.side}>
          <label><input type="checkbox" checked={spatialDensityEnabled} onChange={(event) => setSpatialDensityEnabled(event.target.checked)} /> Spatial density</label>
          <label><input type="checkbox" checked={carryOverEnabled} onChange={(event) => setCarryOverEnabled(event.target.checked)} /> Carry-over markers</label>
          <label><input type="checkbox" checked={adjacentTraceEnabled} onChange={(event) => setAdjacentTraceEnabled(event.target.checked)} /> Adjacent ±1/±2 trace</label>
          <label><input type="checkbox" checked={hotColdEnabled} onChange={(event) => setHotColdEnabled(event.target.checked)} /> Running hot/cold</label>
          <label>
            Count scope{" "}
            <select aria-label="Ticket grid count scope" value={scope} onChange={(event) => setScope(event.target.value as TicketGridDrawScope)}>
              <option value="mainsSupps">Mains + supps</option>
              <option value="mains">Mains only</option>
            </select>
          </label>
          <div style={styles.note}>
            Running hot count {hotCold.hotCount}: {hotCold.hotNumbers.slice(0, 8).join(", ")}
            {hotCold.hotNumbers.length > 8 ? ` +${hotCold.hotNumbers.length - 8} more` : ""}
            <br />
            Running cold count {hotCold.coldCount}: {hotCold.coldNumbers.length} number{hotCold.coldNumbers.length === 1 ? "" : "s"}
          </div>
        </aside>
      </div>

      <div style={styles.legend}>
        <span style={styles.pill}>Main: blue</span>
        <span style={styles.pill}>Supp: violet</span>
        <span style={styles.pill}>Carry-over: amber outline</span>
        <span style={styles.pill}>Adjacent trace: teal outline</span>
        <span style={styles.pill}>H/C: running hot/cold</span>
      </div>
    </section>
  );
};
```

- [ ] **Step 4: Run the component test and confirm it passes**

Run:

```bash
npm test -- tests/tattslottoTicketGridReplayPanel.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/components/TattslottoTicketGridReplayPanel.tsx tests/tattslottoTicketGridReplayPanel.test.tsx
git commit -m "Add Tattslotto ticket grid replay panel"
```

## Task 4: Playback Behavior And Overlay Toggle Tests

**Files:**
- Modify: `tests/tattslottoTicketGridReplayPanel.test.tsx`
- Modify: `src/components/TattslottoTicketGridReplayPanel.tsx`

- [ ] **Step 1: Add interaction tests**

Append these tests inside the existing `describe` block in `tests/tattslottoTicketGridReplayPanel.test.tsx`:

```tsx
  it("steps forward and backward without mutating external app state", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => {
      root.render(<TattslottoTicketGridReplayPanel history={[
        draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("6/03/26", [9, 10, 11, 12, 13, 14], [15, 16]),
      ]} />);
    });

    expect(host.textContent).toContain("Frame 1 / 2");

    const stepForward = host.querySelector('button[aria-label="Step forward one draw"]') as HTMLButtonElement;
    await act(async () => stepForward.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.textContent).toContain("Frame 2 / 2");

    const stepBackward = host.querySelector('button[aria-label="Step backward one draw"]') as HTMLButtonElement;
    await act(async () => stepBackward.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.textContent).toContain("Frame 1 / 2");

    await act(async () => root.unmount());
  });

  it("plays forward on a cleanup-safe interval", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => {
      root.render(<TattslottoTicketGridReplayPanel history={[
        draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("6/03/26", [9, 10, 11, 12, 13, 14], [15, 16]),
      ]} />);
    });

    const playForward = host.querySelector('button[aria-label="Play forward"]') as HTMLButtonElement;
    await act(async () => playForward.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(1000));

    expect(host.textContent).toContain("Frame 2 / 2");

    await act(async () => root.unmount());
    vi.useRealTimers();
  });

  it("toggles observe-only overlays from accessible controls", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => {
      root.render(<TattslottoTicketGridReplayPanel history={[
        draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("6/03/26", [1, 9, 10, 11, 12, 13], [14, 15]),
      ]} />);
    });

    const carryToggle = Array.from(host.querySelectorAll("label"))
      .find((label) => label.textContent?.includes("Carry-over markers"))
      ?.querySelector("input") as HTMLInputElement;

    expect(carryToggle.checked).toBe(true);
    await act(async () => carryToggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(carryToggle.checked).toBe(false);

    await act(async () => root.unmount());
  });
```

- [ ] **Step 2: Run tests and confirm pass**

Run:

```bash
npm test -- tests/tattslottoTicketGridReplayPanel.test.tsx
```

Expected: pass when the Task 3 implementation already contains the required accessible controls and timer behavior.

- [ ] **Step 3: Confirm playback implementation details**

Confirm `src/components/TattslottoTicketGridReplayPanel.tsx` contains these exact accessible playback controls:

```tsx
<HigButton size="compact" variant="secondary" aria-label="Step backward one draw" onClick={() => step(-1)}>◀</HigButton>
<HigButton size="compact" variant="secondary" aria-label="Play backward" onClick={() => setPlaybackDirection(-1)}>⏪</HigButton>
<HigButton size="compact" variant="primary" aria-label="Pause replay" onClick={() => setPlaybackDirection(0)}>⏸</HigButton>
<HigButton size="compact" variant="secondary" aria-label="Play forward" onClick={() => setPlaybackDirection(1)}>⏩</HigButton>
<HigButton size="compact" variant="secondary" aria-label="Step forward one draw" onClick={() => step(1)}>▶</HigButton>
```

Confirm the interval effect remains cleanup-safe:

```tsx
React.useEffect(() => {
  if (playbackDirection === 0 || frames.length <= 1) return undefined;
  const timer = window.setInterval(() => {
    setFrameIndex((current) => stepTicketReplayFrame({
      currentIndex: current,
      frameCount: frames.length,
      direction: playbackDirection,
    }));
  }, speedMs);
  return () => window.clearInterval(timer);
}, [frames.length, playbackDirection, speedMs]);
```

- [ ] **Step 4: Run focused tests and confirm pass**

Run:

```bash
npm test -- tests/tattslottoTicketGridReplayPanel.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/components/TattslottoTicketGridReplayPanel.tsx tests/tattslottoTicketGridReplayPanel.test.tsx
git commit -m "Add ticket grid replay playback tests"
```

## Task 5: App Wiring Under DGA

**Files:**
- Modify: `src/App.tsx`
- Create: `tests/tattslottoTicketGridAppWiring.test.ts`

- [ ] **Step 1: Write failing wiring tests**

Create `tests/tattslottoTicketGridAppWiring.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readAppSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("Tattslotto ticket grid replay app wiring", () => {
  it("renders the panel under the DGA workflow after Next Hot Blocks and before Diamond Grid Analysis", () => {
    const appSource = readAppSource();
    const nextHotBlocksIndex = appSource.indexOf('panelId="next-hot-blocks"');
    const ticketReplayIndex = appSource.indexOf('panelId="tattslotto-ticket-grid-replay"');
    const dgaIndex = appSource.indexOf('title="Diamond Grid Analysis"');

    expect(appSource).toContain('import { TattslottoTicketGridReplayPanel } from "./components/TattslottoTicketGridReplayPanel";');
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
```

- [ ] **Step 2: Run wiring test and confirm it fails**

Run:

```bash
npm test -- tests/tattslottoTicketGridAppWiring.test.ts
```

Expected: fail because the panel is not imported or rendered.

- [ ] **Step 3: Wire the panel in `src/App.tsx`**

Add this import near the other component imports:

```ts
import { TattslottoTicketGridReplayPanel } from "./components/TattslottoTicketGridReplayPanel";
```

Insert this block after the `next-hot-blocks` `CollapsibleSection` and before the Diamond Grid Analysis body-only section:

```tsx
      <CollapsibleSection
        panelId="tattslotto-ticket-grid-replay"
        title={<b>Tattslotto Ticket Grid Replay</b>}
        summaryHint="Observed 9x5 ticket-grid replay with pattern overlays"
        defaultOpen={false}
      >
        <div style={{ width: "100%", marginTop: 8, marginBottom: 10 }}>
          <TattslottoTicketGridReplayPanel history={realFilteredHistory} />
        </div>
      </CollapsibleSection>
```

- [ ] **Step 4: Run focused tests and confirm pass**

Run:

```bash
npm test -- tests/tattslottoTicketGridAppWiring.test.ts tests/tattslottoTicketGridReplayPanel.test.tsx src/lib/tattslottoTicketGrid.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/App.tsx tests/tattslottoTicketGridAppWiring.test.ts
git commit -m "Wire Tattslotto ticket grid replay panel"
```

## Task 6: Manual Entry And Truthfulness Language

**Files:**
- Modify: `public/user-manual.html`
- Create: `tests/tattslottoTicketGridManual.test.ts`

- [ ] **Step 1: Add failing manual/truthfulness test**

Create `tests/tattslottoTicketGridManual.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Tattslotto Ticket Grid Replay manual entry", () => {
  it("documents the replay panel as observed diagnostics, not prediction", () => {
    const manual = readFileSync(resolve(process.cwd(), "public/user-manual.html"), "utf8");

    expect(manual).toContain("Tattslotto Ticket Grid Replay");
    expect(manual).toContain("observed historical draws");
    expect(manual).toContain("running hot/cold");
    expect(manual).toContain("not calibrated predictions");
    expect(manual).not.toContain("ticket-grid prediction");
  });
});
```

- [ ] **Step 2: Run the manual test and confirm it fails**

Run:

```bash
npm test -- tests/tattslottoTicketGridManual.test.ts
```

Expected: fail because the manual entry is missing.

- [ ] **Step 3: Add manual entry**

Add a navigation link near the DGA/manual area:

```html
<a href="#tattslotto-ticket-grid-replay">Tattslotto Ticket Grid Replay</a>
```

Add this section near the DGA documentation:

```html
<h3 id="tattslotto-ticket-grid-replay">Tattslotto Ticket Grid Replay</h3>

<p><strong>Tattslotto Ticket Grid Replay</strong> replays observed historical draws from the active WFMQYH window on the 9-column by 5-row ticket grid used by Tattslotto customers.</p>

<p>The panel is diagnostic only. It can help you inspect spatial density, carry-over numbers, adjacent ±1/±2 traces, and running hot/cold status over time, but these overlays are not calibrated predictions.</p>

<table>
  <thead>
    <tr><th>Overlay</th><th>Meaning</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Spatial density</strong></td><td>Observed row/column concentration inside the active WFMQYH replay window.</td></tr>
    <tr><td><strong>Carry-over</strong></td><td>Numbers repeated from the previous replay frame.</td></tr>
    <tr><td><strong>Adjacent ±1/±2 trace</strong></td><td>Numbers in the active draw that sit one or two numbers away from the previous draw's numbers.</td></tr>
    <tr><td><strong>Running hot/cold</strong></td><td>Hot and cold numbers calculated only from draws already seen up to the current replay frame. This avoids lookahead.</td></tr>
  </tbody>
</table>
```

- [ ] **Step 4: Run manual test and confirm pass**

Run:

```bash
npm test -- tests/tattslottoTicketGridManual.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 6**

```bash
git add public/user-manual.html tests/tattslottoTicketGridManual.test.ts
git commit -m "Document Tattslotto ticket grid replay"
```

## Task 7: Verification And Browser QA

**Files:**
- No source files unless verification finds a defect.

- [ ] **Step 1: Run the full focused ticket-grid test suite**

Run:

```bash
npm test -- src/lib/tattslottoTicketGrid.test.ts tests/tattslottoTicketGridReplayPanel.test.tsx tests/tattslottoTicketGridAppWiring.test.ts tests/tattslottoTicketGridManual.test.ts
```

Expected: pass.

- [ ] **Step 2: Run related DGA and generated-candidate regression tests**

Run:

```bash
npm test -- tests/dgaHeatmapSimulationStrip.test.ts tests/generatedCandidateSimulationWiring.test.ts tests/userSelectedNumbersPanel.test.ts
```

Expected: pass.

- [ ] **Step 3: Run required repo checks**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both pass. Existing Vite chunk-size and mathjs annotation warnings may appear; do not treat them as failures unless new errors appear.

- [ ] **Step 4: Start local dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite reports a localhost URL, usually `http://127.0.0.1:5173/`.

- [ ] **Step 5: Browser QA with in-app browser**

Use the Browser plugin path. Validate this flow:

1. Open the local Vite URL.
2. Confirm page title is `Windfall App`.
3. Confirm app shell is not blank.
4. Confirm no Vite/framework error overlay.
5. Open DGA workflow.
6. Open `Tattslotto Ticket Grid Replay`.
7. Confirm 45 cells render.
8. Confirm frame label shows `Frame 1 / N`.
9. Click step forward and verify the frame label changes.
10. Click play, pause, and reset.
11. Toggle spatial density, carry-over, adjacent trace, and running hot/cold.
12. Check console errors and warnings.
13. Check one mobile-width viewport for wrapping and overlap.

- [ ] **Step 6: Fix defects found by QA**

If browser QA finds overlap or unreadable controls, edit only `src/components/TattslottoTicketGridReplayPanel.tsx`. Re-run:

```bash
npm test -- tests/tattslottoTicketGridReplayPanel.test.tsx
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit verification fixes when Step 6 changed files**

If Step 6 changed files:

```bash
git add src/components/TattslottoTicketGridReplayPanel.tsx tests/tattslottoTicketGridReplayPanel.test.tsx
git commit -m "Polish Tattslotto replay browser QA"
```

## Self-Review Checklist

- Spec coverage:
  - 9x5 grid mapping: Task 1.
  - Real WFMQYH history and no simulated rows: Tasks 1 and 5.
  - Playback controls: Tasks 3 and 4.
  - Spatial density: Tasks 2 and 3.
  - Carry-over: Tasks 2 and 3.
  - Adjacent trace: Tasks 2 and 3.
  - Running hot/cold no-lookahead: Tasks 2 and 3.
  - Generation-neutral wiring: Task 5.
  - User manual: Task 6.
  - Browser QA: Task 7.
- Unfinished-work scan:
  - The plan contains no unfinished draft markers.
  - Every implementation step includes concrete code or exact commands.
- Type consistency:
  - `TicketGridDrawScope`, `TicketGridReplayFrame`, and helper names are defined before use.
  - Component prop is `history: Draw[]`.
  - App wiring passes only `history={realFilteredHistory}`.
