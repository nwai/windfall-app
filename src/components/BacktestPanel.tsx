import React, { useState } from 'react';
import type { Draw } from '../types';
import { runWalkForwardBacktest } from '../lib/backtest';
import { trainLogistic, predictFromWeights } from '../lib/ml/logistic';

interface BacktestPanelProps {
  history: Draw[];
}

export const BacktestPanel: React.FC<BacktestPanelProps> = ({ history }) => {
  const [windowSize, setWindowSize] = useState<number>(Math.max(36, Math.min(200, Math.floor(history.length / 2))));
  const [randomTrials, setRandomTrials] = useState<number>(200);
  const [bootstrapIters, setBootstrapIters] = useState<number>(500);
  const [result, setResult] = useState<any>(null);
  const [mode, setMode] = useState<'heuristic'|'calibrated'>('heuristic');

  // Persist simple backtest settings so panel restores after reload
  const STORAGE_KEY = 'mlnd:backtest:settings:v1';

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw || '{}') as any;
      if (parsed?.windowSize) setWindowSize(Number(parsed.windowSize));
      if (parsed?.randomTrials) setRandomTrials(Number(parsed.randomTrials));
      if (parsed?.bootstrapIters) setBootstrapIters(Number(parsed.bootstrapIters));
      if (parsed?.mode) setMode(parsed.mode);
    } catch (e) {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ windowSize, randomTrials, bootstrapIters, mode }));
    } catch (e) {}
  }, [windowSize, randomTrials, bootstrapIters, mode]);

  // heuristic predictor: produce top 37 not-drawn using same logic as MLND heuristic
  const heuristicPredictor = (histWindow: Draw[]) => {
    // build notDrawn per draw
    const draws = histWindow.map(d => ({ drawn: [...d.main, ...d.supp] }));
    const notDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i+1, 0]));
    for (const d of draws) {
      for (let n = 1; n <= 45; n++) if (!d.drawn.includes(n)) notDrawnFreq[n]++;
    }
    // recent = whole window
    const recent = draws;
    const recentDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i+1, 0]));
    for (const d of recent) for (const n of d.drawn) recentDrawnFreq[n]++;
    const hotNumbers = Object.entries(recentDrawnFreq).map(([num, freq]) => ({ num: Number(num), freq: Number(freq) })).filter(x => x.freq > 0).sort((a,b)=>b.freq-a.freq||a.num-b.num);

    // current streaks
    const currentStreak: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i+1, 0]));
    for (const d of draws) {
      for (let n = 1; n <= 45; n++) {
        if (!d.drawn.includes(n)) currentStreak[n]++; else currentStreak[n] = 0;
      }
    }

    const overdueNumbers = Object.entries(notDrawnFreq).map(([num, freq])=>({ num: Number(num), freq: Number(freq) })).sort((a,b)=>b.freq-a.freq||a.num-b.num);

    const ordered: number[] = [];
    const pushUnique = (n:number)=>{ if(!ordered.includes(n)) ordered.push(n); };
    for (const h of hotNumbers) if (h.freq >= Math.max(3, Math.ceil(recent.length/5))) pushUnique(h.num);
    const longStreaks = Object.entries(currentStreak).map(([num, streak])=>({ num: Number(num), streak: Number(streak)})).sort((a,b)=>b.streak-a.streak||a.num-b.num).slice(0,10);
    for (const s of longStreaks) pushUnique(s.num);
    for (const o of overdueNumbers.slice(0,25)) pushUnique(o.num);
    let fi = 25;
    while (ordered.length < 37 && fi < overdueNumbers.length) pushUnique(overdueNumbers[fi++].num);
    return new Set<number>(ordered.slice(0,37));
  };

  const calibratedPredictorFactory = (histWindow: Draw[]) => {
    // train on histWindow (as training data) to predict next draw; then predict probabilities and pick top 37 q=1-p
    try {
      const TRAIN = Math.max(20, Math.floor(histWindow.length * 0.6));
      const FEATURE = Math.max(20, Math.floor(histWindow.length * 0.4));
      const weights = trainLogistic(histWindow, TRAIN, FEATURE, { iters: 400, lr: 0.05 });
      const p = predictFromWeights(histWindow, weights, FEATURE);
      const scored = Object.entries(p).map(([num, prob])=>({ num: Number(num), q: 1 - prob }));
      scored.sort((a,b)=>b.q-a.q||a.num-b.num);
      return new Set<number>(scored.slice(0,37).map(s=>s.num));
    } catch (e) {
      console.error('calibratedPredictor failed', e);
      return heuristicPredictor(histWindow);
    }
  };

  const run = () => {
    if (history.length <= windowSize) {
      setResult({ error: 'Not enough draws for selected window' });
      return;
    }
    const predictor = (histWindow: Draw[]) => {
      if (mode === 'heuristic') return heuristicPredictor(histWindow);
      return calibratedPredictorFactory(histWindow);
    };
    const res = runWalkForwardBacktest(history, windowSize, predictor, randomTrials, bootstrapIters, 123);
    setResult(res);
  };

  return (
    <div style={{ marginTop: 12, background: '#fff', border: '1px solid #eee', padding: 10, borderRadius: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <b>Backtest MLND</b>
        <label style={{ marginLeft: 12 }}>Window (W):
          <input type="number" value={windowSize} min={36} max={Math.max(36, history.length-1)} onChange={(e)=>setWindowSize(Math.max(36, Math.min(history.length-1, Number(e.target.value)||36)))} style={{ marginLeft: 6, width: 80 }} />
        </label>
        <label>Mode:
          <select value={mode} onChange={e=>setMode(e.target.value as any)} style={{ marginLeft: 6 }}>
            <option value="heuristic">Heuristic MLND</option>
            <option value="calibrated">Calibrated (train logistic)</option>
          </select>
        </label>
        <label>Random trials:
          <input type="number" value={randomTrials} min={10} max={2000} onChange={e=>setRandomTrials(Number(e.target.value)||200)} style={{ width: 80, marginLeft: 6 }} />
        </label>
        <label>Bootstrap iters:
          <input type="number" value={bootstrapIters} min={50} max={2000} onChange={e=>setBootstrapIters(Number(e.target.value)||500)} style={{ width: 80, marginLeft: 6 }} />
        </label>
        <button onClick={run} style={{ marginLeft: 12, padding: '6px 10px' }}>Run</button>
      </div>

      {result && (
        <div style={{ marginTop: 10 }}>
          {result.error && <div style={{ color: 'red' }}>{result.error}</div>}
          {!result.error && (
            <div>
              <div>Draws evaluated: {result.drawsEvaluated}</div>
              <div>Mean excluded (method): {result.meanExcluded.toFixed(3)}</div>
              <div>Mean excluded (random): {result.meanExcludedRandom.toFixed(3)}</div>
              <div>Delta (random - method): {result.deltaMean.toFixed(3)}</div>
              <div>Delta 95% CI: [{result.bootstrapCI?.[0].toFixed(3)},{result.bootstrapCI?.[1].toFixed(3)}]</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BacktestPanel;
