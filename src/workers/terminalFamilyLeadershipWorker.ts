import type { Draw } from "../types";
import { analyzeTerminalFamilyLeadership } from "../lib/terminalFamilyLeadership";

self.onmessage = (event: MessageEvent<{ history: Draw[] }>) => {
  try {
    self.postMessage({ result: analyzeTerminalFamilyLeadership(event.data.history) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "The real-history audit failed. No result was substituted." });
  }
};
