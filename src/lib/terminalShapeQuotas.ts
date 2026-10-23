import type { Draw } from "../types";
import { isScheduledDrawDate, parseDrawDateParts } from "./planningDrawContext";
import { isParseableDrawDate } from "./strictDrawValidation";
import { buildOddEvenRatioQuotas, candidateOddEvenRatio, type OddEvenRatioOption } from "./oddEvenRatios";

export interface TerminalShapeOption { shape: string; count: number; percent: number }
export interface TerminalShapeQuotaOptions {
  enabled: boolean;
  selectedShapes: string[];
  shapeOptions: TerminalShapeOption[];
  finalRequested?: number;
  sourceError?: string | null;
  allocationBasis?: "history" | "equal";
}
type Candidate = { main: number[]; supp?: number[] };

const partitions = (remaining: number, maximum: number, prefix: number[] = []): string[] => {
  if (remaining === 0) return [prefix.join("+")];
  return Array.from({ length: Math.min(remaining, maximum) }, (_, i) => i + 1)
    .reverse().flatMap((part) => partitions(remaining - part, part, [...prefix, part]));
};
export const TERMINAL_REPETITION_SHAPES = partitions(8, 5);
const shapeSet = new Set(TERMINAL_REPETITION_SHAPES);

export function terminalRepetitionShape(numbers: number[]): string | null {
  if (numbers.length !== 8 || new Set(numbers).size !== 8
    || numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 45)) return null;
  const counts = Array<number>(10).fill(0);
  numbers.forEach((n) => counts[n % 10]++);
  return counts.filter(Boolean).sort((a, b) => b - a).join("+");
}

export function buildTerminalShapeOptions(draws: Draw[]): TerminalShapeOption[] {
  const counts: Record<string, number> = {};
  let eligible = 0;
  for (const draw of draws) {
    if (draw.isSimulated || draw.main.length !== 6 || draw.supp.length !== 2) continue;
    const date = isParseableDrawDate(draw.date) ? parseDrawDateParts(draw.date) : null;
    if (!date || !isScheduledDrawDate(date)) continue;
    const shape = terminalRepetitionShape([...draw.main, ...draw.supp]);
    if (!shape) continue;
    eligible++;
    counts[shape] = (counts[shape] ?? 0) + 1;
  }
  return TERMINAL_REPETITION_SHAPES.map((shape) => ({
    shape, count: counts[shape] ?? 0, percent: eligible ? (counts[shape] ?? 0) / eligible * 100 : 0,
  }));
}

export function terminalShapeSelectionError(options: TerminalShapeQuotaOptions): string | null {
  if (options.allocationBasis !== undefined && options.allocationBasis !== "history" && options.allocationBasis !== "equal") return "Unknown terminal shape allocation basis";
  if (options.sourceError) return options.sourceError;
  const selected = [...new Set(options.selectedShapes)];
  if (!selected.length) return "Terminal shape quotas are ON but no shapes are selected";
  const unavailable = selected.filter((shape) => !shapeSet.has(shape)
    || (options.allocationBasis !== "equal" && !options.shapeOptions.some((item) => item.shape === shape && Number.isInteger(item.count) && item.count > 0)));
  return unavailable.length ? `Selected terminal shapes have no real WFMQYH observations: ${unavailable.join(", ")}` : null;
}

export function buildTerminalShapeQuotas(requested: number, options: TerminalShapeQuotaOptions): Record<string, number> {
  if (!options.enabled || terminalShapeSelectionError(options)) return {};
  return buildOddEvenRatioQuotas(requested, options.selectedShapes,
    options.allocationBasis === "equal" ? options.selectedShapes.map(shape => ({ ratio: shape, count: 1 }))
      : options.shapeOptions.map((item) => ({ ratio: item.shape, count: item.count })));
}

export function terminalShapeShares(options: TerminalShapeQuotaOptions): Record<string, number> {
  if (terminalShapeSelectionError(options)) return {};
  const selected = [...new Set(options.selectedShapes)];
  const counts = Object.fromEntries(options.allocationBasis === "equal" ? selected.map(shape => [shape, 1])
    : options.shapeOptions.map((item) => [item.shape, item.count]));
  const total = selected.reduce((sum, shape) => sum + counts[shape], 0);
  return Object.fromEntries(selected.map((shape) => [shape, counts[shape] / total * 100]));
}

interface Edge { to: number; reverse: number; remaining: number; initial: number }

// A bounded bipartite residual network lets a later cell repair an earlier allocation.
class QuotaNetwork {
  private graph: Edge[][];
  private source = 0;
  private sink: number;
  readonly cells = new Map<string, Edge>();
  size = 0;
  constructor(readonly ratios: Record<string, number>, readonly shapes: Record<string, number>) {
    const rows = Object.keys(ratios), columns = Object.keys(shapes);
    this.sink = rows.length + columns.length + 1;
    this.graph = Array.from({ length: this.sink + 1 }, () => []);
    rows.forEach((ratio, i) => this.edge(0, i + 1, ratios[ratio]));
    columns.forEach((shape, j) => this.edge(rows.length + j + 1, this.sink, shapes[shape]));
    rows.forEach((ratio, i) => columns.forEach((shape, j) => {
      this.cells.set(`${ratio}|${shape}`, this.edge(i + 1, rows.length + j + 1, 0));
    }));
  }
  private edge(from: number, to: number, capacity: number): Edge {
    const forward = { to, reverse: this.graph[to].length, remaining: capacity, initial: capacity };
    const reverse = { to: from, reverse: this.graph[from].length, remaining: 0, initial: 0 };
    this.graph[from].push(forward); this.graph[to].push(reverse);
    return forward;
  }
  increase(key: string, count: number): boolean {
    const edge = this.cells.get(key);
    if (!edge) return false;
    edge.remaining += count; edge.initial += count;
    return true;
  }
  fill(): void {
    for (;;) {
      const parent = Array<{ node: number; index: number } | null>(this.graph.length).fill(null);
      const queue = [this.source]; parent[this.source] = { node: -1, index: -1 };
      for (let cursor = 0; cursor < queue.length && !parent[this.sink]; cursor++) {
        const node = queue[cursor];
        this.graph[node].forEach((edge, index) => {
          if (edge.remaining > 0 && !parent[edge.to]) { parent[edge.to] = { node, index }; queue.push(edge.to); }
        });
      }
      if (!parent[this.sink]) return;
      let amount = Infinity;
      for (let node = this.sink; node !== this.source;) {
        const step = parent[node]!; amount = Math.min(amount, this.graph[step.node][step.index].remaining); node = step.node;
      }
      for (let node = this.sink; node !== this.source;) {
        const step = parent[node]!, edge = this.graph[step.node][step.index];
        edge.remaining -= amount; this.graph[node][edge.reverse].remaining += amount; node = step.node;
      }
      this.size += amount;
    }
  }
}

export class CompositionQuotaCollector<T extends Candidate> {
  private network: QuotaNetwork;
  private buckets = new Map<string, { candidate: T; index: number }[]>();
  private index = 0;
  constructor(readonly requested: number, readonly ratioQuotas: Record<string, number>, readonly shapeQuotas: Record<string, number>) {
    this.network = new QuotaNetwork(Object.keys(ratioQuotas).length ? ratioQuotas : { "*": requested }, shapeQuotas);
  }
  get size(): number { return this.network.size }
  add(candidate: T): boolean {
    const shape = terminalRepetitionShape([...candidate.main, ...(candidate.supp ?? [])]);
    const ratio = Object.keys(this.ratioQuotas).length ? candidateOddEvenRatio(candidate) : "*";
    if (!shape) return false;
    const key = `${ratio}|${shape}`, bucket = this.buckets.get(key) ?? [];
    const cap = Math.min(this.network.ratios[ratio] ?? 0, this.shapeQuotas[shape] ?? 0);
    if (bucket.length >= cap) return false;
    bucket.push({ candidate, index: this.index++ }); this.buckets.set(key, bucket);
    const before = this.size;
    this.network.increase(key, 1); this.network.fill();
    return this.size > before;
  }
  values(): T[] {
    return [...this.buckets].flatMap(([key, bucket]) => {
      const edge = this.network.cells.get(key)!;
      return bucket.slice(0, edge.initial - edge.remaining);
    }).sort((a, b) => a.index - b.index).map((item) => item.candidate);
  }
}

export function applyCompositionQuotas<T extends Candidate>(candidates: T[], requested: number,
  ratios: string[], ratioOptions: OddEvenRatioOption[], options: TerminalShapeQuotaOptions) {
  const ratioQuotas = buildOddEvenRatioQuotas(requested, ratios, ratioOptions);
  const shapeQuotas = buildTerminalShapeQuotas(requested, options);
  const collector = new CompositionQuotaCollector<T>(requested, ratioQuotas, shapeQuotas);
  candidates.forEach((candidate) => { if (collector.size < requested) collector.add(candidate); });
  const kept = collector.values();
  const ratioCounts: Record<string, number> = {}, shapeCounts: Record<string, number> = {};
  kept.forEach((candidate) => {
    const ratio = candidateOddEvenRatio(candidate), shape = terminalRepetitionShape([...candidate.main, ...(candidate.supp ?? [])])!;
    ratioCounts[ratio] = (ratioCounts[ratio] ?? 0) + 1; shapeCounts[shape] = (shapeCounts[shape] ?? 0) + 1;
  });
  const shortfalls = (targets: Record<string, number>, counts: Record<string, number>) => Object.fromEntries(
    Object.entries(targets).filter(([key, count]) => count > (counts[key] ?? 0)).map(([key, count]) => [key, count - (counts[key] ?? 0)]));
  const ratioMissing = shortfalls(ratioQuotas, ratioCounts), shapeMissing = shortfalls(shapeQuotas, shapeCounts);
  const describe = (counts: Record<string, number>) => Object.entries(counts).map(([key, count]) => `${key}: ${count}`).join(", ");
  const error = terminalShapeSelectionError(options);
  const warning = error ?? (kept.length < requested
    ? `Composition quotas kept ${kept.length}/${requested}. Missing${Object.keys(ratioMissing).length ? ` odd/even [${describe(ratioMissing)}]` : ""} terminal shapes [${describe(shapeMissing)}]. Constraints were not relaxed.` : undefined);
  return { candidates: kept, ratioQuotas, shapeQuotas, ratioCounts, shapeCounts, warning };
}

export function compositionFeasibleCount(requested: number, ratioQuotas: Record<string, number>, shapeQuotas: Record<string, number>,
  available: number[], forced: number[], digitBounds: { min: number; max: number }[], repeatedCountAllowed?: (count: number) => boolean,
  vectorAllowed?: (counts: number[]) => boolean, columnKeys?: (counts: number[]) => string[]): number {
  const network = new QuotaNetwork(Object.keys(ratioQuotas).length ? ratioQuotas : { "*": requested }, shapeQuotas);
  const caps = Array<number>(10).fill(0), floors = Array<number>(10).fill(0);
  [...new Set(available)].forEach((n) => caps[n % 10]++);
  [...new Set(forced)].forEach((n) => floors[n % 10]++);
  const vector = Array<number>(10).fill(0), cells = new Set<string>();
  const hasRatioQuotas = Object.keys(ratioQuotas).length > 0;
  const visit = (digit: number, remaining: number) => {
    if (digit === 10) {
      if (remaining !== 0 || (repeatedCountAllowed && !repeatedCountAllowed(vector.filter((n) => n >= 2).length))) return;
      if (vectorAllowed && !vectorAllowed(vector)) return;
      const shape = vector.filter(Boolean).sort((a, b) => b - a).join("+");
      const odd = vector.reduce((sum, count, d) => sum + (d % 2 ? count : 0), 0);
      for (const column of columnKeys ? columnKeys(vector) : ["*" in shapeQuotas ? "*" : shape]) {
        const key = `${hasRatioQuotas ? `${odd}:${8 - odd}` : "*"}|${column}`;
        if (network.cells.has(key)) cells.add(key);
      }
      return;
    }
    const minimum = Math.max(floors[digit], digitBounds[digit].min);
    const maximum = Math.min(caps[digit], digitBounds[digit].max, remaining);
    for (let count = minimum; count <= maximum; count++) { vector[digit] = count; visit(digit + 1, remaining - count); }
  };
  visit(0, 8);
  cells.forEach((key) => network.increase(key, requested)); network.fill();
  return network.size;
}
