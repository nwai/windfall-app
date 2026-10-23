import { buildWindfallPredictor, type BuildWindfallPredictorOptions } from "../lib/windfallPredictor";

self.onmessage = (event: MessageEvent<BuildWindfallPredictorOptions>) => {
  try { self.postMessage({ snapshot: buildWindfallPredictor(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Unable to build experimental suggestions." }); }
};
