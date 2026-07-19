import React, { useState, useCallback, useMemo } from 'react';
import type { Draw } from '../types';
import type { BacktestResult, PredictorFn } from '../lib/backtest';
import { runWalkForwardBacktest } from '../lib/backtest';
import { trainLogistic, predictFromWeights } from '../lib/ml/logistic';
import { autoTuneBacktest, AutoTuneResult } from '../lib/autoTuneBacktest';
import { downloadBacktestCSV } from '../lib/exportBacktestCSV';
import { WalkForwardChart } from './WalkForwardChart';

interface BacktestPanelProps {
  history: Draw[];
  historyScopeLabel?: string;
}

export const BacktestPanel: React.FC<BacktestPanelProps> = ({ history, historyScopeLabel }) => {
  const [windowSize, setWindowSize] = useState<number>(Math.max(36, Math.min(200, Math.floor(history.length / 2))));
  const [randomTrials, setRandomTrials] = useState<number>(200);
  const [bootstrapIters, setBootstrapIters] = useState<number>(500);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [mode, setMode] = useState<'heuristic' | 'calibrated'>('heuristic');
  const [showChart, setShowChart] = useState<boolean>(true);
  const [rollingWindow, setRollingWindow] = useState<number>(10);

  // Auto-tune state
  const [isAutoTuning, setIsAutoTuning] = useState<boolean>(false);
  const [autoTuneProgress, setAutoTuneProgress] = useState<string>('');
  const [autoTuneResults, setAutoTuneResults] = useState<AutoTuneResult[] | null>(null);

  // Persist simple backtest settings so panel restores after reload
  const STORAGE_KEY = 'mlnd:backtest:settings:v1';

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw || '{}') as Record<string, unknown>;
      if (parsed?.windowSize) setWindowSize(Number(parsed.windowSize));
      if (parsed?.randomTrials) setRandomTrials(Number(parsed.randomTrials));
      if (parsed?.bootstrapIters) setBootstrapIters(Number(parsed.bootstrapIters));
      if (parsed?.mode) setMode(parsed.mode as 'heuristic' | 'calibrated');
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ windowSize, randomTrials, bootstrapIters, mode }));
    } catch { /* ignore */ }
  }, [windowSize, randomTrials, bootstrapIters, mode]);

  // --- Predictor factories ---

  /** Heuristic predictor: produce top 37 not-drawn using frequency/streak heuristics */
  const heuristicPredictor = useCallback((histWindow: Draw[]): Set<number> => {
    const draws = histWindow.map(d => ({ drawn: [...d.main, ...d.supp] }));
    const notDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i + 1, 0]));
    for (const d of draws) {
      for (let n = 1; n <= 45; n++) if (!d.drawn.includes(n)) notDrawnFreq[n]++;
    }
    const recent = draws;
    const recentDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i + 1, 0]));
    for (const d of recent) for (const n of d.drawn) recentDrawnFreq[n]++;
    const hotNumbers = Object.entries(recentDrawnFreq)
      .map(([num, freq]) => ({ num: Number(num), freq: Number(freq) }))
      .filter(x => x.freq > 0)
      .sort((a, b) => b.freq - a.freq || a.num - b.num);

    const currentStreak: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i + 1, 0]));
    for (const d of draws) {
      for (let n = 1; n <= 45; n++) {
        if (!d.drawn.includes(n)) currentStreak[n]++; else currentStreak[n] = 0;
      }
    }

    const overdueNumbers = Object.entries(notDrawnFreq)
      .map(([num, freq]) => ({ num: Number(num), freq: Number(freq) }))
      .sort((a, b) => b.freq - a.freq || a.num - b.num);

    const ordered: number[] = [];
    const pushUnique = (n: number): void => { if (!ordered.includes(n)) ordered.push(n); };
    for (const h of hotNumbers) if (h.freq >= Math.max(3, Math.ceil(recent.length / 5))) pushUnique(h.num);
    const longStreaks = Object.entries(currentStreak)
      .map(([num, streak]) => ({ num: Number(num), streak: Number(streak) }))
      .sort((a, b) => b.streak - a.streak || a.num - b.num)
      .slice(0, 10);
    for (const s of longStreaks) pushUnique(s.num);
    for (const o of overdueNumbers.slice(0, 25)) pushUnique(o.num);
    let fi = 25;
    while (ordered.length < 37 && fi < overdueNumbers.length) pushUnique(overdueNumbers[fi++].num);
    return new Set<number>(ordered.slice(0, 37));
  }, []);

  /** Calibrated predictor: logistic regression, falls back to heuristic on failure */
  const calibratedPredictor = useCallback((histWindow: Draw[]): Set<number> => {
    try {
      const TRAIN = Math.max(20, Math.floor(histWindow.length * 0.6));
      const FEATURE = Math.max(20, Math.floor(histWindow.length * 0.4));
      const weights = trainLogistic(histWindow, TRAIN, FEATURE, { iters: 400, lr: 0.05 });
      const p = predictFromWeights(histWindow, weights, FEATURE);
      const scored = Object.entries(p)
        .map(([num, prob]) => ({ num: Number(num), q: 1 - prob }))
        .sort((a, b) => b.q - a.q || a.num - b.num);
      return new Set<number>(scored.slice(0, 37).map(s => s.num));
    } catch (e) {
      console.error('calibratedPredictor failed', e);
      return heuristicPredictor(histWindow);
    }
  }, [heuristicPredictor]);

  /** Factory that returns the right predictor for a given mode */
  const predictorFactory = useCallback((m: 'heuristic' | 'calibrated'): PredictorFn => {
    return m === 'heuristic' ? heuristicPredictor : calibratedPredictor;
  }, [heuristicPredictor, calibratedPredictor]);

  // --- Actions ---

  const run = useCallback(() => {
    if (history.length <= windowSize) {
      setResult(null);
      return;
    }
    const predictor = predictorFactory(mode);
    const res = runWalkForwardBacktest(history, windowSize, predictor, randomTrials, bootstrapIters, 123);
    setResult(res);
    setAutoTuneResults(null);
  }, [history, windowSize, mode, randomTrials, bootstrapIters, predictorFactory]);

  const handleAutoTune = useCallback(() => {
    if (history.length < 40) return;
    setIsAutoTuning(true);
    setAutoTuneProgress('Starting sweep…');
    setAutoTuneResults(null);

    // Use setTimeout to yield to the browser so the UI updates before the heavy work starts
    setTimeout(() => {
      const output = autoTuneBacktest(history, predictorFactory, {
        randomTrials: Math.min(randomTrials, 50), // use fewer trials for speed during sweep
        bootstrapIters: Math.min(bootstrapIters, 100),
        onProgress: (completed, total) => {
          setAutoTuneProgress(`Evaluating ${completed} / ${total}…`);
        },
      });
      setAutoTuneResults(output.results.slice(0, 10)); // top 10
      setIsAutoTuning(false);
      setAutoTuneProgress('');

      // Apply best config
      if (output.best) {
        setWindowSize(output.best.windowSize);
        setMode(output.best.mode);
        setResult(output.best.result);
      }
    }, 0);
  }, [history, predictorFactory, randomTrials, bootstrapIters]);

  const handleExportCSV = useCallback(() => {
    if (!result) return;
    downloadBacktestCSV(result, {
      filename: `backtest_${mode}_w${windowSize}`,
      mode,
      windowSize,
    });
  }, [result, mode, windowSize]);

  // --- Derived ---

  const deltaSign = useMemo(() => {
    if (!result) return '';
    if (result.deltaMean > 0.01) return '✅';
    if (result.deltaMean < -0.01) return '⚠️';
    return '➖';
  }, [result]);

  const ciSignificant = useMemo(() => {
    if (!result?.bootstrapCI) return false;
    return result.bootstrapCI[0] > 0;
  }, [result]);

  // --- Render ---

  return (
    <div style={{ marginTop: 12, background: '#fff', border: '1px solid #eee', padding: 10, borderRadius: 6 }}>
      {/* Controls row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>Backtest MLND</b>
        {historyScopeLabel && (
          <span style={{ fontSize: 12, color: '#64748b' }}>Scope: {historyScopeLabel}</span>
        )}
        <label style={{ marginLeft: 12 }}>Window (W):
          <input type="number" value={windowSize} min={36} max={Math.max(36, history.length - 1)}
            onChange={(e) => setWindowSize(Math.max(36, Math.min(history.length - 1, Number(e.target.value) || 36)))}
            style={{ marginLeft: 6, width: 80 }} />
        </label>
        <label>Mode:
          <select value={mode} onChange={e => setMode(e.target.value as 'heuristic' | 'calibrated')} style={{ marginLeft: 6 }}>
            <option value="heuristic">Heuristic MLND</option>
            <option value="calibrated">Calibrated (train logistic)</option>
          </select>
        </label>
        <label>Random trials:
          <input type="number" value={randomTrials} min={10} max={2000}
            onChange={e => setRandomTrials(Number(e.target.value) || 200)}
            style={{ width: 80, marginLeft: 6 }} />
        </label>
        <label>Bootstrap iters:
          <input type="number" value={bootstrapIters} min={50} max={2000}
            onChange={e => setBootstrapIters(Number(e.target.value) || 500)}
            style={{ width: 80, marginLeft: 6 }} />
        </label>
        <button onClick={run} style={{ marginLeft: 12, padding: '6px 10px' }}>Run</button>
        <button onClick={handleAutoTune} disabled={isAutoTuning || history.length < 40}
          style={{ padding: '6px 10px' }}
          title="Sweep window sizes and modes to find the best configuration">
          {isAutoTuning ? '⏳ Tuning…' : '🔧 Auto-Tune'}
        </button>
        {result && (
          <button onClick={handleExportCSV} style={{ padding: '6px 10px' }} title="Export results to CSV">
            📥 Export CSV
          </button>
        )}
      </div>

      {/* Auto-tune progress */}
      {isAutoTuning && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>{autoTuneProgress}</div>
      )}

      {/* Results summary */}
      {result && (
        <div style={{ marginTop: 10 }}>
          {result.warnings && result.warnings.length > 0 && (
            <div
              style={{
                marginBottom: 8,
                padding: '8px 10px',
                border: '1px solid #e2b84f',
                background: '#fff9e8',
                color: '#6b4a00',
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              <b>Analytical warning:</b> {result.warnings.join(' ')}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', fontSize: 13, maxWidth: 420 }}>
            <span style={{ color: '#888' }}>Draws evaluated:</span>
            <span>{result.drawsEvaluated}</span>

            <span style={{ color: '#888' }}>Mean excluded (method):</span>
            <span>{result.meanExcluded.toFixed(3)}</span>

            <span style={{ color: '#888' }}>Mean excluded (random):</span>
            <span>{result.meanExcludedRandom.toFixed(3)}</span>

            <span style={{ color: '#888' }}>Delta (rand − method):</span>
            <span style={{ fontWeight: 600 }}>
              {deltaSign} {result.deltaMean.toFixed(3)}
              {ciSignificant && <span style={{ color: '#4caf50', marginLeft: 6, fontSize: 11 }}>statistically significant</span>}
            </span>

            <span style={{ color: '#888' }}>95% CI:</span>
            <span>[{result.bootstrapCI?.[0].toFixed(3)}, {result.bootstrapCI?.[1].toFixed(3)}]</span>
          </div>

          {/* Chart toggle + rolling window */}
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={showChart} onChange={e => setShowChart(e.target.checked)} />
              {' '}Show walk-forward chart
            </label>
            {showChart && (
              <label style={{ fontSize: 12 }}>
                Rolling window:
                <input type="number" value={rollingWindow} min={2} max={Math.max(2, result.deltaPerDraw.length)}
                  onChange={e => setRollingWindow(Math.max(2, Number(e.target.value) || 10))}
                  style={{ width: 50, marginLeft: 4 }} />
              </label>
            )}
          </div>

          {/* Walk-forward chart */}
          {showChart && result.deltaPerDraw.length > 0 && (
            <WalkForwardChart deltaPerDraw={result.deltaPerDraw} rollingWindow={rollingWindow} />
          )}
        </div>
      )}

      {/* Auto-tune leaderboard */}
      {autoTuneResults && autoTuneResults.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 13 }}>🏆 Auto-Tune Top Configurations</b>
          <table style={{ fontSize: 11, borderCollapse: 'collapse', marginTop: 4, width: '100%', maxWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '3px 8px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '3px 8px' }}>Mode</th>
                <th style={{ textAlign: 'right', padding: '3px 8px' }}>Window</th>
                <th style={{ textAlign: 'right', padding: '3px 8px' }}>Delta Mean</th>
                <th style={{ textAlign: 'right', padding: '3px 8px' }}>Draws</th>
                <th style={{ textAlign: 'center', padding: '3px 8px' }}>95% CI</th>
                <th style={{ textAlign: 'center', padding: '3px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {autoTuneResults.map((r, i) => (
                <tr key={`${r.mode}-${r.windowSize}`}
                  style={{ borderBottom: '1px solid #f0f0f0', background: i === 0 ? '#f8fff8' : undefined }}>
                  <td style={{ padding: '3px 8px' }}>{i + 1}</td>
                  <td style={{ padding: '3px 8px' }}>{r.mode}</td>
                  <td style={{ textAlign: 'right', padding: '3px 8px' }}>{r.windowSize}</td>
                  <td style={{ textAlign: 'right', padding: '3px 8px', fontWeight: i === 0 ? 600 : 400 }}>
                    {r.result.deltaMean.toFixed(3)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 8px' }}>{r.result.drawsEvaluated}</td>
                  <td style={{ textAlign: 'center', padding: '3px 8px', fontSize: 10 }}>
                    [{r.result.bootstrapCI?.[0].toFixed(3)}, {r.result.bootstrapCI?.[1].toFixed(3)}]
                  </td>
                  <td style={{ padding: '3px 8px' }}>
                    <button
                      style={{ fontSize: 10, padding: '1px 6px' }}
                      onClick={() => {
                        setWindowSize(r.windowSize);
                        setMode(r.mode);
                        setResult(r.result);
                      }}
                    >
                      Apply
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BacktestPanel;
