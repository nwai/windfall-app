import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { PredictionCaptureCard } from "../src/components/candidates/PredictionCaptureCard";
import {
  appendPredictionCaptureRun,
  createPredictionCaptureSession,
} from "../src/lib/predictionCapture";
import type { AppPresetSnapshot } from "../src/lib/presets";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const session = appendPredictionCaptureRun(createPredictionCaptureSession("2026-09-20T01:00:00.000Z"), {
  action: "generated",
  candidates: [{ main: [6, 7, 14, 17, 30, 31], supp: [28, 42] }],
  setupSnapshot: { windowMode: "Custom", customDrawCount: 13 } as AppPresetSnapshot,
  now: "2026-09-20T01:01:00.000Z",
  windowLabel: "Custom (13)",
  windowDrawCount: 13,
}).session;

describe("PredictionCaptureCard", () => {
  it("requires explicit game selection and prepares a six-number played batch", async () => {
    const onSaveAsPrediction = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(React.createElement(PredictionCaptureCard, {
          session,
          storageState: "ready",
          onStart: vi.fn(),
          onEnd: vi.fn(),
          onClear: vi.fn(),
          onReplaceSession: vi.fn(),
          onSaveAsPrediction,
        }));
      });

      const disclosure = container.querySelector('button[aria-label="Show Prediction Capture details"]');
      await act(async () => disclosure?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

      expect(container.textContent).toContain("6, 7, 14, 17, 30, 31");
      const saveButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Save as Prediction") as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);

      const gameCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
      await act(async () => gameCheckbox.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(saveButton.disabled).toBe(false);

      await act(async () => saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(onSaveAsPrediction).toHaveBeenCalledTimes(1);
      const batch = onSaveAsPrediction.mock.calls[0][0];
      expect(batch.games).toHaveLength(1);
      expect(batch.games[0].numbers).toEqual([6, 7, 14, 17, 30, 31]);
      expect(batch.games[0].provenance.status).toBe("matched");
      expect(batch.analyticalForecasts).toHaveLength(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
