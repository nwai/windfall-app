import type { Draw } from "../types";
import { runEvidencePortfolioReplay } from "../lib/evidencePortfolioReplay";

self.onmessage = async (event: MessageEvent<{ history: Draw[]; windowSize: number }>) => {
  try {
    const result = await runEvidencePortfolioReplay(event.data.history, event.data.windowSize,
      (done, total) => self.postMessage({ progress: { done, total } }));
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Replay failed; no model was adopted." }); }
};
