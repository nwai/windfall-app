import React, { useMemo, useState } from 'react';
import type { Draw } from '../types';
import { runLeaveOneOutBacktest } from '../lib/backtest';

interface MostLikelyNotDrawnPanelProps {
  history: Draw[]; // filtered history (WFMQY)
  allHistory?: Draw[]; // optional full history for baseline comparison
  title?: string;
}

// Build per-draw mains-only not-drawn list (drawn = mains only)
function buildNotDrawnMains(history: Draw[]): { date: string; drawn: number[]; notDrawn: number[] }[] {
  return history.map(d => {
    const drawn = [...d.main];
    const notDrawn: number[] = [];
    for (let n = 1; n <= 45; n++) if (!drawn.includes(n)) notDrawn.push(n);
    return { date: d.date || 'unknown', drawn, notDrawn };
  });
}

export const MostLikelyNotDrawnPanel: React.FC<MostLikelyNotDrawnPanelProps> = ({ history, allHistory, title = 'Most Likely NOT Drawn (Mains Only)' }) => {
  const [activeTab, setActiveTab] = useState<'models'|'frequency'|'prediction'>('models');
  const [selectedModel, setSelectedModel] = useState<string>('historicalUndrawnFreq');
  const [sensitivity, setSensitivity] = useState<number>(0.5); // 0 (stable) .. 1 (very sensitive)
  const [baselineMode, setBaselineMode] = useState<'window'|'all'>('window');

  const analysis = useMemo(() => {
    // Expect history chronological oldest->newest
    const historyChrono = history.slice();
    const draws = buildNotDrawnMains(historyChrono);
    const totalDraws = draws.length;

    const notDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i+1, 0]));
    for (const d of draws) for (const n of d.notDrawn) notDrawnFreq[n]++;

    const recent = draws;
    const recentNotDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i+1, 0]));
    for (const d of recent) for (const n of d.notDrawn) recentNotDrawnFreq[n]++;

    const currentStreak: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i+1, 0]));
    for (const d of draws) {
      const drawnSet = new Set(d.drawn);
      for (let n = 1; n <= 45; n++) {
        if (!drawnSet.has(n)) currentStreak[n]++;
        else currentStreak[n] = 0;
      }
    }

    const overdueNumbers = Object.entries(notDrawnFreq).map(([num, freq]) => ({ num: Number(num), freq: Number(freq), currentStreak: currentStreak[Number(num)] || 0 })).sort((a,b)=>b.freq-a.freq||a.num-b.num);

    const coldNumbers = Object.entries(recentNotDrawnFreq).map(([num,freq])=>({ num: Number(num), freq: Number(freq) })).sort((a,b)=>b.freq-a.freq||a.num-b.num).slice(0,39);

    const recentDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i+1, 0]));
    for (const d of recent) for (const n of d.drawn) recentDrawnFreq[n]++;
    const hotNumbers = Object.entries(recentDrawnFreq).map(([num,freq])=>({ num: Number(num), freq: Number(freq) })).filter(x=>x.freq>0).sort((a,b)=>b.freq-a.freq||a.num-b.num);

    // Helper: sensitivity-adjusted lookback and k
    const makeLookback = (trainingLen: number, baseFactor = 0.15) => {
      const factor = Math.max(0.03, baseFactor * (1 - sensitivity * 0.8));
      return Math.max(1, Math.min(Math.ceil(trainingLen * factor), 60));
    };
    const makeK = (lookback: number) => Math.max(1, Math.round(lookback * Math.max(0.25, (1 - sensitivity * 0.7))));

    // Predictors (mains-only): return Set<number> of predicted-not-drawn (size cap 39)
    const predictors: Record<string, (training: { date: string; drawn: number[]; notDrawn: number[] }[]) => Set<number>> = {
      // Historical undrawn frequency: count undrawn numbers across training (recency-weighted), return top 39 not-drawn
      historicalUndrawnFreq: (training) => {
        const weights = Array(46).fill(0);
        const n = training.length;
        const k = Math.max(1, Math.round(Math.max(3, n / Math.max(1, 8 * (1 - sensitivity)))));
        for (let idx = 0; idx < training.length; idx++) {
          const d = training[idx];
          // recent draws count for more when sensitivity is higher
          const age = training.length - 1 - idx;
          const w = Math.exp(-age / k);
          for (const num of d.notDrawn) weights[num] += w;
        }
        const ordered = Array.from({ length: 45 }, (_, i) => i + 1).sort((a, b) => weights[b] - weights[a] || a - b);
        return new Set(ordered.slice(0, 39));
      },
      // Empirical predictor: rank by (recency-weighted) main-frequency and return top-K drawn numbers
      empiricalDrawnTopK: (training) => {
        const weights = Array(46).fill(0);
        const n = training.length;
        // recency weight: more recent draws count more when sensitivity is high
        for (let idx = 0; idx < training.length; idx++) {
          const d = training[idx];
          // age = how far from the end (0 = most recent)
          const age = training.length - 1 - idx;
          const k = Math.max(1, Math.round(Math.max(3, n / Math.max(1, 8 * (1 - sensitivity)))));
          const w = Math.exp(-age / k);
          for (const m of d.drawn) weights[m] += w;
        }
        // Create array of numbers sorted by descending weight (most likely to be drawn)
        const ordered = Array.from({ length: 45 }, (_, i) => i + 1).sort((a, b) => weights[b] - weights[a] || a - b);
        // number of mains expected: 6 (mains-only mode)
        const K = 6;
        return new Set(ordered.slice(0, K));
      },
      empiricalMainsOnly: (training) => {
        const weights = Array(46).fill(0);
        const total = training.length;
        const k = Math.max(1, Math.round(Math.max(3, total / Math.max(1, 8 * (1 - sensitivity)))));
        for (let idx = 0; idx < training.length; idx++) {
          const d = training[idx];
          const w = Math.exp(-(training.length - 1 - idx) / k);
          for (const n of d.notDrawn) weights[n] += w;
        }
        const ordered = Array.from({length:45},(_,i)=>i+1).sort((a,b)=>weights[b]-weights[a]||a-b);
        return new Set(ordered.slice(0,39));
      },

      hotRotation: (training) => {
        const dynLookback = makeLookback(training.length, 0.12);
        const recentDraws = training.slice(-dynLookback);
        const drawnFreq = Array(46).fill(0);
        const k = makeK(dynLookback);
        for (let idx=0; idx<recentDraws.length; idx++) {
          const w = Math.exp(-(recentDraws.length-1-idx)/k);
          for (const n of recentDraws[idx].drawn) drawnFreq[n] += w;
        }
        const pred = new Set<number>();
        const thr = Math.max(1, Math.ceil(dynLookback * Math.max(0.12, 0.22 * (1 - sensitivity * 0.6))));
        for (let n=1;n<=45;n++) if (drawnFreq[n] >= thr) pred.add(n);
        const notDrawnW = Array(46).fill(0);
        const k2 = Math.max(2, Math.round(training.length / Math.max(4, 6 * (1 - sensitivity))));
        for (let idx=0; idx<training.length; idx++) {
          const w = Math.exp(-(training.length-1-idx)/k2);
          for (const n of training[idx].notDrawn) notDrawnW[n] += w;
        }
        const ordered = Array.from({length:45},(_,i)=>i+1).sort((a,b)=>notDrawnW[b]-notDrawnW[a]||a-b);
        let i=0; while (pred.size < 39 && i<ordered.length) { pred.add(ordered[i++]); }
        return pred;
      },

      streakBased: (training) => {
        const lookback = makeLookback(training.length, 0.20);
        const recent = training.slice(-lookback);
        const streaks = Array(46).fill(0);
        for (const d of recent) {
          const drawnSet = new Set(d.drawn);
          for (let n=1;n<=45;n++) {
            if (!drawnSet.has(n)) streaks[n]++;
            else streaks[n]=0;
          }
        }
        const ordered = Array.from({length:45},(_,i)=>i+1).sort((a,b)=>streaks[b]-streaks[a]||a-b);
        return new Set(ordered.slice(0,39));
      }
    };

    // Backtest history selection based on baselineMode
    const backtestHistory = baselineMode === 'window' ? historyChrono : ((allHistory && allHistory.slice()) || historyChrono);

    const randomTrials = 200;
    const bootstrapIters = 300;
    const seed = 42;

    const backtestResults: Record<string, any> = {};

    for (const modelName of Object.keys(predictors)) {
      try {
        const predictorFn = (trainWindow: Draw[]) => {
          const mapped = trainWindow.map(d => ({ date: d.date || '', drawn: [...d.main], notDrawn: (()=>{ const a:number[]=[]; for (let i=1;i<=45;i++) if (![...d.main].includes(i)) a.push(i); return a; })() }));
          return predictors[modelName](mapped);
        };
        const res = runLeaveOneOutBacktest(backtestHistory, predictorFn, randomTrials, bootstrapIters, seed);
        const avgCorrect = 39 - res.meanExcluded;
        const avgAccuracy = res.drawsEvaluated ? (avgCorrect / 39) * 100 : 0;
        backtestResults[modelName] = { res, avgCorrect, avgAccuracy, totalTests: res.drawsEvaluated };
      } catch (e) {
        backtestResults[modelName] = { error: String(e) };
      }
    }

    const rankedModels = Object.entries(backtestResults).map(([name,data])=>({ name, ...data }))
      .sort((a:any,b:any)=> (b.res?.deltaMean ?? 0) - (a.res?.deltaMean ?? 0));

    const bestModel = rankedModels.length ? rankedModels[0].name : '';

    // Produce next prediction using best model on the WFMQY window (historyChrono)
    let nextPrediction: number[] = [];
    // use selectedModel (UI) if set; otherwise fall back to bestModel
    const modelToUse = selectedModel || bestModel;
    if (modelToUse) {
      try {
        // If we have at least one historical draw, use all except the latest to train the predictor
        const trainHistory = historyChrono.length > 1 ? historyChrono.slice(0, historyChrono.length - 1) : [];
        const mappedTrain = trainHistory.map(d => ({ date: d.date || '', drawn: [...d.main], notDrawn: (()=>{ const a:number[]=[]; for (let i=1;i<=45;i++) if (![...d.main].includes(i)) a.push(i); return a; })() }));
        // If training set is empty, fall back to using the window (but avoid using the target draw itself)
        const predictorInput = mappedTrain.length ? mappedTrain : (historyChrono.length ? [ ({ date: historyChrono[0].date || '', drawn: [...historyChrono[0].main], notDrawn: (()=>{ const a:number[]=[]; for (let i=1;i<=45;i++) if (![...historyChrono[0].main].includes(i)) a.push(i); return a; })() }) ] : []);
        const set = predictors[modelToUse](predictorInput as any) as Set<number>;
        nextPrediction = Array.from(set).filter(x => typeof x === 'number') as number[];
        nextPrediction.sort((a,b)=>a-b);
        if (nextPrediction.length > 39) nextPrediction = nextPrediction.slice(0,39);
      } catch (e) { nextPrediction = []; }
    }

    const predictedDrawn: number[] = [];
    for (let i=1;i<=45;i++) if (!nextPrediction.includes(i)) predictedDrawn.push(i);

    // include percentage for overdueNumbers for UI convenience
    const overdueWithPct = overdueNumbers.map(o => ({ ...o, percentage: totalDraws ? Number(((o.freq / totalDraws) * 100).toFixed(1)) : 0 }));

    return { draws, overdueNumbers: overdueWithPct, coldNumbers, hotNumbers, predictedNotDrawn: nextPrediction, predictedDrawn, notDrawnFreq, totalDraws, recentLen: recent.length, backtestResults, rankedModels, bestModel };

  }, [history, allHistory, sensitivity, baselineMode]);

  const frequencyData = useMemo(() =>
    analysis.overdueNumbers.map(item => ({
      number: item.num,
      frequency: item.freq,
      percentage: analysis.totalDraws ? Number(((item.freq / analysis.totalDraws) * 100).toFixed(1)) : 0,
    })),
    [analysis.overdueNumbers, analysis.totalDraws]
  );

  return (
    <div style={{ background: '#f8fafc', padding: 12, border: '1px solid #eee', borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span style={{ fontSize: 12, color: '#666' }}>Window: {analysis.totalDraws} draws • Recent (WFMQY): {analysis.recentLen}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 12 }}>
            Baseline:
            <select value={baselineMode} onChange={(e) => setBaselineMode(e.target.value as any)} style={{ marginLeft: 8 }}>
              <option value="window">Use WFMQY window</option>
              <option value="all">Use all history</option>
            </select>
          </label>
          <label style={{ fontSize: 12 }} title="Sensitivity: higher = more reactive to recent draws">
            Sensitivity:
            <input type="range" min={0} max={1} step={0.05} value={sensitivity} onChange={(e)=>setSensitivity(Number(e.target.value))} style={{ marginLeft: 8 }} />
            <span style={{ marginLeft: 6, fontSize: 12 }}>{(sensitivity*100).toFixed(0)}%</span>
          </label>
        </div>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setActiveTab('models')} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ddd', background: activeTab==='models'? '#2563eb': '#fff', color: activeTab==='models'? '#fff':'#333' }}>Models</button>
        <button type="button" onClick={() => setActiveTab('frequency')} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ddd', background: activeTab==='frequency'? '#2563eb': '#fff', color: activeTab==='frequency'? '#fff':'#333' }}>Frequency</button>
        <button type="button" onClick={() => setActiveTab('prediction')} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ddd', background: activeTab==='prediction'? '#2563eb': '#fff', color: activeTab==='prediction'? '#fff':'#333' }}>Predictions</button>
      </div>

      {activeTab === 'models' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Model Backtest Results</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {analysis.rankedModels.map(model => (
                <div key={model.name} style={{ background: '#f9fafb', borderRadius: 6, padding: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{model.name}</div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Avg. Accuracy: {model.avgAccuracy.toFixed(1)}%</div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Total Tests: {model.totalTests}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {model.res?.error ? (
                      <span style={{ color: 'red' }}>Error: {model.res.error}</span>
                    ) : (
                      <>
                        <div>Mean Excluded: {model.res.meanExcluded.toFixed(1)}</div>
                        <div>Delta Mean: {model.res.deltaMean.toFixed(1)}</div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, fontWeight: 600 }}>Model Sensitivity and Baseline</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Baseline Mode</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setBaselineMode('window')} style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ddd', background: baselineMode==='window'? '#2563eb': '#fff', color: baselineMode==='window'? '#fff':'#333' }}>WFMQY Window</button>
                  <button type="button" onClick={() => setBaselineMode('all')} style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ddd', background: baselineMode==='all'? '#2563eb': '#fff', color: baselineMode==='all'? '#fff':'#333' }}>All History</button>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Sensitivity</div>
                <input type="range" min={0} max={1} step={0.05} value={sensitivity} onChange={(e)=>setSensitivity(Number(e.target.value))} style={{ width: '100%' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: '#666' }}>0 (stable)</span>
                  <span style={{ fontSize: 12, color: '#666' }}>1 (sensitive)</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>Model</div>
                  <select value={selectedModel} onChange={(e)=>setSelectedModel(e.target.value)} style={{ width: '100%', padding: 6 }}>
                    {analysis.rankedModels && analysis.rankedModels.length > 0 ? (
                      analysis.rankedModels.map((m:any) => <option key={m.name} value={m.name}>{m.name}</option>)
                    ) : (
                      // fallback static options
                      <>
                        <option value="historicalUndrawnFreq">historicalUndrawnFreq</option>
                        <option value="empiricalDrawnTopK">empiricalDrawnTopK</option>
                        <option value="empiricalMainsOnly">empiricalMainsOnly</option>
                        <option value="hotRotation">hotRotation</option>
                        <option value="streakBased">streakBased</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'frequency' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Historical Non-Appearance Frequency</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 6 }}>
              {frequencyData.map(row => (
                <div key={row.number} style={{ background: '#f9fafb', borderRadius: 6, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontWeight: 700 }}>{row.number}</div>
                  <div style={{ fontSize: 12 }}>freq: {row.frequency}</div>
                  <div style={{ fontSize: 12, color: '#555' }}>{row.percentage}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'prediction' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Predicted next 39 not-drawn mains (mains-only)</div>
            <div style={{ background: '#fff7ed', border: '1px solid #fde68a', borderRadius: 6, padding: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Not drawn (39):</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                {analysis.predictedNotDrawn.map(n => (
                  <div key={n} style={{ background: '#fde68a', borderRadius: 6, padding: 8, textAlign: 'center', fontWeight: 700 }}>{n}</div>
                ))}
              </div>
            </div>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: 10, marginTop: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Predicted to be drawn (6 mains):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {analysis.predictedDrawn.map(n => (
                  <div key={n} style={{ background: '#a7f3d0', borderRadius: 6, padding: '6px 10px', textAlign: 'center', fontWeight: 700 }}>{n}</div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, padding: 10, marginTop: 10, fontSize: 12 }}>
            <b>Important:</b> Lottery draws are random; these are historical patterns only.
          </div>
        </div>
      )}
    </div>
  );
};

export default MostLikelyNotDrawnPanel;
