# Temperature Transition Predictions (TTP)

TTP estimates P(V | Temp) for each number from a transition matrix built over a historical window and predicts next-draw hits using:

- Threshold mode: mark numbers with P ≥ threshold
- Top‑K mode: select the K highest probabilities

Backtest metrics per window:
- acc (accuracy): (TP + TN) / 45
- prec (precision): TP / (TP + FP)
- rec (recall): TP / (TP + FN)
- F1: 2·(prec·rec)/(prec+rec)

UI tips:
- Toggle “Indices” vs “Dates” to switch labels on backtest cards.
- “Show last N windows” controls how many backtest windows you see.
- “Auto window (beta)” sweeps candidate window sizes (e.g., 3,5,7,9,12,15,20,25,30,40,50) and sets the best by mean F1 for the current mode (Top‑K or Threshold).

Choosing a window:
- Fixed window: pick N so P(V|Temp) is stable but responsive.
- Auto window (beta): use the button; it maximizes recent mean F1.
- Soft window idea (future): exponential decay (half‑life) instead of a hard cut.
- Minimum evidence: ensure each temperature has enough samples in-window for reliable estimates.

For Weekday Windfall (≈8 hits per draw), Top‑K with K=8 is a natural fit. Tune the historical window (or use Auto) to stabilize P(V|Temp) without overfitting.