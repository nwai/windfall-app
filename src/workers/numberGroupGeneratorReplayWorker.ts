import type { Draw } from "../types";
import { runNumberGroupGeneratorReplay, type NumberGroupReplayOptions } from "../lib/numberGroupGeneratorReplay";

self.onmessage = async (event: MessageEvent<{ history: Draw[]; options: NumberGroupReplayOptions }>) => {
  try {
    const result = await runNumberGroupGeneratorReplay(event.data.history, event.data.options,
      (done, total) => self.postMessage({ progress: { done, total } }));
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Replay failed. No live settings were changed." });
  }
};
