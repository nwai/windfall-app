## Temperature Transition Diagnostics (TTP)

TTP computes an empirical hit rate for each number from a transition matrix built on the last N real draws and selects rows with either:
- Threshold mode: select a row when the empirical hit rate is at or above the threshold
- Top-K mode: select the K highest empirical hit-rate rows

Backtest metrics:
- acc (accuracy): (TP+TN)/45 per window
- prec (precision): TP/(TP+FP)
- rec (recall): TP/(TP+FN)
- F1: 2·(prec·rec)/(prec+rec)

Backtest cards show either index ranges or actual draw dates (toggle in panel). The “Show last N windows” control adjusts how many of the most recent backtest windows are displayed.

Tip: For lotteries with about 8 actual hits per draw (6 main + 2 supp), Top-K with K=8 is a natural diagnostic fit. Tune the historical window to stabilize the empirical hit-rate estimate; or use the Auto Window sweep utility (beta) to suggest a window based on recent backtest meanF1. This is descriptive evidence, not a calibrated next-draw probability.
