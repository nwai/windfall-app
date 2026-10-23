import { buildEvidencePortfolio, type BuildEvidencePortfolioOptions } from "../lib/evidencePortfolio";

self.onmessage = (event: MessageEvent<BuildEvidencePortfolioOptions>) => {
  try {
    self.postMessage({ snapshot: buildEvidencePortfolio(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Portfolio construction failed." });
  }
};
