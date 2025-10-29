## Temperature Transition Predictions (TTP)

TTP computes P(V | Temp) for each number from a transition matrix built on the last N draws and predicts with either:
- Threshold mode: predict “hit” when P ≥ threshold
- Top‑K mode: select the K highest probabilities

Backtest metrics:
- acc (accuracy): (TP+TN)/45 per window
- prec (precision): TP/(TP+FP)
- rec (recall): TP/(TP+FN)
- F1: 2·(prec·rec)/(prec+rec)

Backtest cards show either index ranges or actual draw dates (toggle in panel). The “Show last N windows” control adjusts how many of the most recent backtest windows are displayed.

Tip: For lotteries with ~8 actual hits per draw (6 main + 2 supp), Top‑K with K=8 is a natural fit. Tune the historical window to stabilize P(V|Temp); or use the Auto Window sweep utility (beta) to suggest a window based on recent backtest meanF1.