import type { Draw } from "../types";
import { runSupplementaryPolicyReplay, type SupplementaryReplayOptions } from "../lib/supplementaryPolicyReplay";

self.onmessage = async (event: MessageEvent<{ history: Draw[]; options: SupplementaryReplayOptions }>) => {
  try {
    const result = await runSupplementaryPolicyReplay(event.data.history, event.data.options, (completed, total) => {
      self.postMessage({ progress: { completed, total } });
    });
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Replay failed. No result was fabricated." });
  }
};
