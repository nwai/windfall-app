import { Draw, Knobs, CandidateSet } from "./types";

export function traceFormat(
  history: Draw[],
  knobs: Knobs,
  candidates: CandidateSet[]
): string {
  return [
    "[TRACE START]",
    `History size: ${history.length} draws`,
    `Knobs: ${Object.entries(knobs)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}`,
    ...candidates.map(
      (c, idx) =>
        `Candidate ${String.fromCharCode(65 + idx)}: {${c.main.join(
          ","
        )}} | Supp: {${c.supp.join(",")}} | Score: ${c.score}` +
        (c.trace && c.trace.length > 0
          ? " | Trace: " + c.trace.join("; ")
          : "") +
        (c.octagonalScore !== undefined
          ? ` | OGA: ${
              c.octagonalScore
            } | SpokeProfile: [${c.octagonalProfile?.join(",")}]`
          : "")
    ),
    "[TRACE END]",
  ].join("\n");
}