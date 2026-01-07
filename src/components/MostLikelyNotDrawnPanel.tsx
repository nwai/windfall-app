import React, { useMemo, useState, useEffect } from 'react';
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

export const MostLikelyNotDrawnPanel: React.FC<MostLikelyNotDrawnPanelProps> = ({
  history,
  allHistory,
  title = 'Most Likely NOT Drawn (Mains Only)',
}) => {
  const [activeTab, setActiveTab] = useState<'models' | 'frequency' | 'prediction'>('models');
  const [selectedModel, setSelectedModel] = useState<string>(''); // "" = auto
  const [userSelectedModel, setUserSelectedModel] = useState<boolean>(false);
  const [sensitivity, setSensitivity] = useState<number>(0.5); // 0..1
  const [baselineMode, setBaselineMode] = useState<'window' | 'all'>('window');
 
  const [minLookback, setMinLookback] = useState<number>(7);

  // Per-predictor lookbacks (user-adjustable)
  const [lbEmpirical, setLbEmpirical] = useState<number>(12);         // for empiricalDrawnTopK
  const [lbHot, setLbHot] = useState<number>(18);                     // for hotRotation
  const [lbStreak, setLbStreak] = useState<number>(24);               // for streakBased
  const [lbCompRecentDraw, setLbCompRecentDraw] = useState<number>(10); // composite recent draws
  const [lbCompNotDraw, setLbCompNotDraw] = useState<number>(30);       // composite recent not-drawn

  const analysis = useMemo(() => {
    const historyChrono = history.slice();
    const draws = buildNotDrawnMains(historyChrono);
    const totalDraws = draws.length;

    const notDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i + 1, 0]));
    for (const d of draws) for (const n of d.notDrawn) notDrawnFreq[n]++;

    const recent = draws;
    const recentNotDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i + 1, 0]));
    for (const d of recent) for (const n of d.notDrawn) recentNotDrawnFreq[n]++;

    const currentStreak: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i + 1, 0]));
    for (const d of draws) {
      const drawnSet = new Set(d.drawn);
      for (let n = 1; n <= 45; n++) {
        if (!drawnSet.has(n)) currentStreak[n]++;
        else currentStreak[n] = 0;
      }
    }

    const overdueNumbers = Object.entries(notDrawnFreq)
      .map(([num, freq]) => ({
        num: Number(num),
        freq: Number(freq),
        currentStreak: currentStreak[Number(num)] || 0,
      }))
      .sort((a, b) => b.freq - a.freq || a.num - b.num);

    const coldNumbers = Object.entries(recentNotDrawnFreq)
      .map(([num, freq]) => ({ num: Number(num), freq: Number(freq) }))
      .sort((a, b) => b.freq - a.freq || a.num - b.num)
      .slice(0, 45);

    const recentDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i + 1, 0]));
    for (const d of recent) for (const n of d.drawn) recentDrawnFreq[n]++;
    const hotNumbers = Object.entries(recentDrawnFreq)
      .map(([num, freq]) => ({ num: Number(num), freq: Number(freq) }))
      .filter((x) => x.freq > 0)
      .sort((a, b) => b.freq - a.freq || a.num - b.num);

    // Helper: sensitivity-adjusted decay
    const makeK = (base: number) =>
      Math.max(2, Math.round(base * (1.4 - sensitivity * 1.1)));

    // Predictors must return NOT-DRAWN sets (size up to ~45)
    const predictors: Record<string, (training: { date: string; drawn: number[]; notDrawn: number[] }[]) => Set<number>> = {
      historicalUndrawnFreq: (training) => {
        const weights = Array(46).fill(0);
        const k = makeK(Math.max(3, Math.round(training.length / Math.max(1, 6 * (1 - sensitivity)))));
        for (let idx = 0; idx < training.length; idx++) {
          const d = training[idx];
          const age = training.length - 1 - idx;
          const w = Math.exp(-age / k);
          for (const num of d.notDrawn) weights[num] += w;
        }
        const ordered = Array.from({ length: 45 }, (_, i) => i + 1).sort((a, b) => weights[b] - weights[a] || a - b);
        return new Set(ordered.slice(0, 45));
      },

      // Uses lbEmpirical for recency windowing; still returns NOT-drawn complement
      empiricalDrawnTopK: (training) => {
        const weights = Array(46).fill(0);
        const window = Math.max(minLookback, training.length);
        const slice = training.slice(-window);
        const k = makeK(Math.max(3, Math.round(window / Math.max(1, 8 * (1 - sensitivity)))));
        for (let idx = 0; idx < slice.length; idx++) {
          const d = slice[idx];
          const age = slice.length - 1 - idx;
          const w = Math.exp(-age / k);
          for (const m of d.drawn) weights[m] += w;
        }
        const drawnOrdered = Array.from({ length: 45 }, (_, i) => i + 1).sort((a, b) => weights[b] - weights[a] || a - b);
        const topDrawn = new Set(drawnOrdered.slice(0, 6)); // expected mains = 6
        const notDrawnList: number[] = [];
        for (let i = 1; i <= 45; i++) if (!topDrawn.has(i)) notDrawnList.push(i);
        return new Set(notDrawnList.slice(0, 45));
      },

      empiricalMainsOnly: (training) => {
        const weights = Array(46).fill(0);
        const window = Math.max(minLookback, Math.min(training.length, training.length));
        const k = makeK(Math.max(3, Math.round(window / Math.max(1, 8 * (1 - sensitivity)))));
        const slice = training.slice(-window);
        for (let idx = 0; idx < slice.length; idx++) {
          const d = slice[idx];
          const w = Math.exp(-(slice.length - 1 - idx) / k);
          for (const n of d.notDrawn) weights[n] += w;
        }
        const ordered = Array.from({ length: 45 }, (_, i) => i + 1)
          .sort((a, b) => weights[b] - weights[a] || a - b);
        return new Set(ordered.slice(0, 45));
      },

      // Uses lbHot as its lookback
      hotRotation: (training) => {
        const dynLookback = Math.max(minLookback, Math.min(lbHot, training.length));
        const recentDraws = training.slice(-dynLookback);
        const notDrawnW = Array(46).fill(0);
        const k2 = makeK(Math.max(2, Math.round(dynLookback / Math.max(1, 4 * (1 - sensitivity)))));
        for (let idx = 0; idx < recentDraws.length; idx++) {
          const w = Math.exp(-(recentDraws.length - 1 - idx) / k2);
          for (const n of recentDraws[idx].notDrawn) notDrawnW[n] += w;
        }
        const ordered = Array.from({ length: 45 }, (_, i) => i + 1).sort((a, b) => notDrawnW[b] - notDrawnW[a] || a - b);
        return new Set(ordered.slice(0, 45));
      },

      // Uses lbStreak as lookback
      streakBased: (training) => {
        const lookback = Math.max(minLookback, Math.min(lbStreak, training.length));
        const recent = training.slice(-lookback);
        const streaks = Array(46).fill(0);
        for (const d of recent) {
          const drawnSet = new Set(d.drawn);
          for (let n = 1; n <= 45; n++) {
            if (!drawnSet.has(n)) streaks[n]++;
            else streaks[n] = 0;
          }
        }
        const ordered = Array.from({ length: 45 }, (_, i) => i + 1).sort((a, b) => streaks[b] - streaks[a] || a - b);
        return new Set(ordered.slice(0, 45));
      },

      // New composite predictor with adjustable lookbacks
      weightedComposite: (training) => {
          const rd   = Math.max(minLookback, Math.min(lbCompRecentDraw, training.length));
          const rnot = Math.max(minLookback, Math.min(lbCompNotDraw,  training.length));
          const recentDraws    = training.slice(-rd);
          const recentNotDraws = training.slice(-rnot);

        const scores = Array(46).fill(0);

        // Recent drawn frequency (penalize)
        const drawnFreq = Array(46).fill(0);
        recentDraws.forEach(d => d.drawn.forEach(n => drawnFreq[n]++));
        drawnFreq.forEach((f, n) => { scores[n] += f * 3; });

        // Recent not-drawn frequency (reward)
        const notDrawnFreq = Array(46).fill(0);
        recentNotDraws.forEach(d => d.notDrawn.forEach(n => notDrawnFreq[n]++));
        notDrawnFreq.forEach((f, n) => { scores[n] += f * 2; });

        // All-time not-drawn (mild reward)
        const allTimeNotDrawn = Array(46).fill(0);
        training.forEach(d => d.notDrawn.forEach(n => allTimeNotDrawn[n]++));
        allTimeNotDrawn.forEach((f, n) => { scores[n] += f * 0.5; });

        const ordered = Array.from({ length: 45 }, (_, i) => i + 1).sort((a, b) => scores[b] - scores[a] || a - b);
        return new Set(ordered.slice(0, 45));
      },
    };

    const backtestHistory = baselineMode === 'window' ? historyChrono : (allHistory?.slice() || historyChrono);

    const randomTrials = 200;
    const bootstrapIters = 300;
    const seed = 42;

    const backtestResults: Record<string, any> = {};

    for (const modelName of Object.keys(predictors)) {
      try {
        const predictorFn = (trainWindow: Draw[]) => {
          const mapped = trainWindow.map((d) => ({
            date: d.date || '',
            drawn: [...d.main],
            notDrawn: (() => {
              const a: number[] = [];
              for (let i = 1; i <= 45; i++) if (!d.main.includes(i)) a.push(i);
              return a;
            })(),
          }));
          return predictors[modelName](mapped);
        };
        const res = runLeaveOneOutBacktest(backtestHistory, predictorFn, randomTrials, bootstrapIters, seed);
        const avgCorrect = 45 - res.meanExcluded;
        const avgAccuracy = res.drawsEvaluated ? (avgCorrect / 45) * 100 : 0;
        backtestResults[modelName] = { res, avgCorrect, avgAccuracy, totalTests: res.drawsEvaluated };
      } catch (e) {
        backtestResults[modelName] = { error: String(e) };
      }
    }

    const rankedModels = Object.entries(backtestResults)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a: any, b: any) => (b.res?.deltaMean ?? 0) - (a.res?.deltaMean ?? 0));

    const bestModel = rankedModels.length ? rankedModels[0].name : '';

    let nextPrediction: number[] = [];
    const modelToUse = selectedModel || bestModel;
    if (modelToUse) {
      try {
          // In the forward-prediction block
          const trainHistory = historyChrono.length > 1
            ? historyChrono.slice(0, historyChrono.length - 1)
            : historyChrono;

          const mappedTrain = trainHistory.map((d) => ({
            date: d.date || '',
            drawn: [...d.main],
            notDrawn: (() => {
              const a: number[] = [];
              for (let i = 1; i <= 45; i++) if (!d.main.includes(i)) a.push(i);
              return a;
            })(),
          }));
          // predictorInput becomes mappedTrain (or the single-draw fallback as you have)
        const predictorInput = mappedTrain.length
          ? mappedTrain
          : historyChrono.length
          ? [
              {
                date: historyChrono[0].date || '',
                drawn: [...historyChrono[0].main],
                notDrawn: (() => {
                  const a: number[] = [];
                  for (let i = 1; i <= 45; i++) if (!historyChrono[0].main.includes(i)) a.push(i);
                  return a;
                })(),
              },
            ]
          : [];
        const set = predictors[modelToUse](predictorInput as any) as Set<number>;
        nextPrediction = Array.from(set).filter((x) => typeof x === 'number') as number[];
        nextPrediction.sort((a, b) => a - b);
        if (nextPrediction.length > 45) nextPrediction = nextPrediction.slice(0, 45);
      } catch (e) {
        nextPrediction = [];
      }
    }

    const predictedDrawn: number[] = [];
    for (let i = 1; i <= 45; i++) if (!nextPrediction.includes(i)) predictedDrawn.push(i);

    const overdueWithPct = overdueNumbers.map((o) => ({
      ...o,
      percentage: totalDraws ? Number(((o.freq / totalDraws) * 100).toFixed(1)) : 0,
    }));

    return {
      draws,
      overdueNumbers: overdueWithPct,
      coldNumbers,
      hotNumbers,
      predictedNotDrawn: nextPrediction,
      predictedDrawn,
      notDrawnFreq,
      totalDraws,
      recentLen: recent.length,
      backtestResults,
      rankedModels,
      bestModel,
    };
  }, [
    history,
    allHistory,
    sensitivity,
    baselineMode,
    selectedModel,
    lbEmpirical,
    lbHot,
    lbStreak,
    lbCompRecentDraw,
    lbCompNotDraw,
    minLookback,
  ]);

  // Auto-follow best model unless user explicitly chose one
  useEffect(() => {
    if (!userSelectedModel && analysis.bestModel && selectedModel !== analysis.bestModel) {
      setSelectedModel(analysis.bestModel);
    }
  }, [analysis.bestModel, userSelectedModel, selectedModel]);
  
  useEffect(() => {
    if (!userSelectedModel) setSelectedModel('');
  }, [minLookback, baselineMode, sensitivity, lbEmpirical, lbHot, lbStreak, lbCompRecentDraw, lbCompNotDraw]);

  const frequencyData = useMemo(
    () =>
      analysis.overdueNumbers.map((item) => ({
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
        <span style={{ fontSize: 12, color: '#666' }}>
          Window: {analysis.totalDraws} draws • Recent (WFMQY): {analysis.recentLen}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ fontSize: 12 }}>
            Draw history (min lookback):
            <input
              type="number"
              min={6}
              max={120}
              value={minLookback}
              onChange={(e) => setMinLookback(Number(e.target.value))}
              style={{ marginLeft: 8, width: 70 }}
              title="Minimum draws to consider in model lookbacks"
            />
          </label>
          <label style={{ fontSize: 12 }}>
            Baseline:
            <select value={baselineMode} onChange={(e) => setBaselineMode(e.target.value as any)} style={{ marginLeft: 8 }}>
              <option value="window">Use WFMQY window</option>
              <option value="all">Use all history</option>
            </select>
          </label>
          <label style={{ fontSize: 12 }} title="Sensitivity: higher = more reactive to recent draws">
            Sensitivity:
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              style={{ marginLeft: 8 }}
            />
            <span style={{ marginLeft: 6, fontSize: 12 }}>{(sensitivity * 100).toFixed(0)}%</span>
          </label>
        </div>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('models')}
          style={{
            padding: '6px 10px',
            borderRadius: 4,
            border: '1px solid #ddd',
            background: activeTab === 'models' ? '#2563eb' : '#fff',
            color: activeTab === 'models' ? '#fff' : '#333',
          }}
        >
          Models
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('frequency')}
          style={{
            padding: '6px 10px',
            borderRadius: 4,
            border: '1px solid #ddd',
            background: activeTab === 'frequency' ? '#2563eb' : '#fff',
            color: activeTab === 'frequency' ? '#fff' : '#333',
          }}
        >
          Frequency
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('prediction')}
          style={{
            padding: '6px 10px',
            borderRadius: 4,
            border: '1px solid #ddd',
            background: activeTab === 'prediction' ? '#2563eb' : '#fff',
            color: activeTab === 'prediction' ? '#fff' : '#333',
          }}
        >
          Predictions
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, marginLeft: 8 }}>
          <input
            type="checkbox"
            checked={!userSelectedModel}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedModel(''); // auto
                setUserSelectedModel(false);
              } else {
                setUserSelectedModel(true);
              }
            }}
          />
          Auto-follow best model
        </label>
      </div>

      {activeTab === 'models' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Model Backtest Results</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {analysis.rankedModels.map((model) => (
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

            <div style={{ marginTop: 12, fontWeight: 600 }}>Model Selection</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Model</div>
                <select
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value);
                    setUserSelectedModel(e.target.value !== '');
                  }}
                  style={{ width: '100%', padding: 6 }}
                >
                  <option value="">Auto (best-ranked)</option>
                  {analysis.rankedModels && analysis.rankedModels.length > 0
                    ? analysis.rankedModels.map((m: any) => (
                        <option key={m.name} value={m.name}>
                          {m.name}
                        </option>
                      ))
                    : ['historicalUndrawnFreq', 'empiricalDrawnTopK', 'empiricalMainsOnly', 'hotRotation', 'streakBased', 'weightedComposite'].map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                </select>
              </div>

              {/* Lookback sliders per predictor */}
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Empirical drawn lookback</div>
                <input
                  type="range"
                  min={3}
                  max={45}
                  step={1}
                  value={lbEmpirical}
                  onChange={(e) => setLbEmpirical(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 12, color: '#666' }}>{lbEmpirical} draws</div>
              </div>

              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Hot rotation lookback</div>
                <input
                  type="range"
                  min={6}
                  max={60}
                  step={1}
                  value={lbHot}
                  onChange={(e) => setLbHot(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 12, color: '#666' }}>{lbHot} draws</div>
              </div>

              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Streak-based lookback</div>
                <input
                  type="range"
                  min={6}
                  max={90}
                  step={1}
                  value={lbStreak}
                  onChange={(e) => setLbStreak(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 12, color: '#666' }}>{lbStreak} draws</div>
              </div>

              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Composite recent-drawn lookback</div>
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={1}
                  value={lbCompRecentDraw}
                  onChange={(e) => setLbCompRecentDraw(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 12, color: '#666' }}>{lbCompRecentDraw} draws</div>
              </div>

              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Composite recent not-drawn lookback</div>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={1}
                  value={lbCompNotDraw}
                  onChange={(e) => setLbCompNotDraw(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 12, color: '#666' }}>{lbCompNotDraw} draws</div>
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
              {frequencyData.map((row) => (
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
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Predicted next 45 not-drawn mains (mains-only)</div>
            <div style={{ background: '#fff7ed', border: '1px solid #fde68a', borderRadius: 6, padding: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Not drawn (45):</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                {analysis.predictedNotDrawn.map((n) => (
                  <div key={n} style={{ background: '#fde68a', borderRadius: 6, padding: 8, textAlign: 'center', fontWeight: 700 }}>
                    {n}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: 10, marginTop: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Predicted to be drawn (6 mains):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {analysis.predictedDrawn.map((n) => (
                  <div key={n} style={{ background: '#a7f3d0', borderRadius: 6, padding: '6px 10px', textAlign: 'center', fontWeight: 700 }}>
                    {n}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div
            style={{
              background: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: 6,
              padding: 10,
              marginTop: 10,
              fontSize: 12,
            }}
          >
            <b>Important:</b> Lottery draws are random; these are historical patterns only.
          </div>
        </div>
      )}
    </div>
  );
};

export default MostLikelyNotDrawnPanel;
