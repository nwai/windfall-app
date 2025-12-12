import React, { useMemo, useState } from 'react';
import type { Draw } from '../types';

interface MostLikelyNotDrawnPanelProps {
  history: Draw[];
  title?: string;
}

// Utility: build per-draw not-drawn list for numbers 1..45
function buildNotDrawn(history: Draw[]): { date: string; drawn: number[]; notDrawn: number[] }[] {
  return history.map(d => {
    const drawn = [...d.main, ...d.supp];
    const notDrawn: number[] = [];
    for (let n = 1; n <= 45; n++) if (!drawn.includes(n)) notDrawn.push(n);
    return { date: d.date || 'unknown', drawn, notDrawn };
  });
}

export const MostLikelyNotDrawnPanel: React.FC<MostLikelyNotDrawnPanelProps> = ({ history, title = 'Most Likely NOT Drawn' }) => {
  const [activeTab, setActiveTab] = useState<'patterns'|'frequency'|'prediction'>('patterns');

  const analysis = useMemo(() => {
    const draws = buildNotDrawn(history);
    const totalDraws = draws.length;

    const notDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i+1, 0]));
    for (const d of draws) for (const n of d.notDrawn) notDrawnFreq[n]++;

    // Recent window equals WFMQY (filtered history length)
    const recent = draws;
    const recentNotDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i+1, 0]));
    for (const d of recent) for (const n of d.notDrawn) recentNotDrawnFreq[n]++;

    // Consecutive not-drawn streaks
    const currentStreak: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i+1, 0]));
    for (const d of draws) {
      for (let n = 1; n <= 45; n++) {
        if (d.notDrawn.includes(n)) currentStreak[n]++;
        else currentStreak[n] = 0;
      }
    }

    const overdueNumbers = Object.entries(notDrawnFreq)
      .map(([num, freq]) => ({
        num: Number(num),
        freq: Number(freq),
        percentage: totalDraws > 0 ? Number(((Number(freq) / totalDraws) * 100).toFixed(1)) : 0,
        currentStreak: currentStreak[Number(num)] || 0,
      }))
      .sort((a, b) => b.freq - a.freq || a.num - b.num);

    const coldNumbers = Object.entries(recentNotDrawnFreq)
      .map(([num, freq]) => ({ num: Number(num), freq: Number(freq) }))
      .sort((a, b) => b.freq - a.freq || a.num - b.num)
      .slice(0, 37);

    // Recent drawn frequency (for rest heuristic)
    const recentDrawnFreq: Record<number, number> = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i+1, 0]));
    for (const d of recent) for (const n of d.drawn) recentDrawnFreq[n]++;
    const hotNumbers = Object.entries(recentDrawnFreq)
      .map(([num, freq]) => ({ num: Number(num), freq: Number(freq) }))
      .filter(x => x.freq > 0)
      .sort((a, b) => b.freq - a.freq || a.num - b.num);

    // Predict 37 non-drawn numbers next draw (strict cap with priority ordering)
    const orderedCandidates: number[] = [];
    const pushUnique = (n: number) => { if (!orderedCandidates.includes(n)) orderedCandidates.push(n); };
    // Priority 1: very hot numbers likely to rest
    for (const h of hotNumbers) if (h.freq >= Math.max(3, Math.ceil(recent.length / 5))) pushUnique(h.num);
    // Priority 2: longest current absence streaks
    const longStreaks = Object.entries(currentStreak)
      .map(([num, streak]) => ({ num: Number(num), streak: Number(streak) }))
      .sort((a, b) => b.streak - a.streak || a.num - b.num)
      .slice(0, 10);
    for (const s of longStreaks) pushUnique(s.num);
    // Priority 3: historically overdue (top 25)
    for (const o of overdueNumbers.slice(0, 25)) pushUnique(o.num);
    // Fill remaining until 37
    let fi = 25;
    while (orderedCandidates.length < 37 && fi < overdueNumbers.length) { pushUnique(overdueNumbers[fi++].num); }

    const predictedNotDrawn = orderedCandidates.slice(0, 37).sort((a, b) => a - b);
    const predictedDrawn: number[] = [];
    for (let n = 1; n <= 45; n++) if (!predictedNotDrawn.includes(n)) predictedDrawn.push(n);

    return { draws, overdueNumbers, coldNumbers, hotNumbers, predictedNotDrawn, predictedDrawn, notDrawnFreq, totalDraws, recentLen: recent.length };
  }, [history]);

  const frequencyData = useMemo(() => analysis.overdueNumbers.map(item => ({ number: item.num, frequency: item.freq, percentage: item.percentage })), [analysis.overdueNumbers]);

  return (
    <div style={{ background: '#f8fafc', padding: 12, border: '1px solid #eee', borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span style={{ fontSize: 12, color: '#666' }}>Window: {analysis.totalDraws} draws • Recent (WFMQY): {analysis.recentLen}</span>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setActiveTab('patterns')} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ddd', background: activeTab==='patterns'? '#2563eb': '#fff', color: activeTab==='patterns'? '#fff':'#333' }}>Patterns</button>
        <button type="button" onClick={() => setActiveTab('frequency')} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ddd', background: activeTab==='frequency'? '#2563eb': '#fff', color: activeTab==='frequency'? '#fff':'#333' }}>Frequency</button>
        <button type="button" onClick={() => setActiveTab('prediction')} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ddd', background: activeTab==='prediction'? '#2563eb': '#fff', color: activeTab==='prediction'? '#fff':'#333' }}>Predictions</button>
      </div>

      {activeTab === 'patterns' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Pattern Observations</div>
            <ul style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>
              <li>Each draw has exactly 37 numbers not drawn (45 total - 8 drawn).</li>
              <li>Most frequently not drawn (historical): top 15 shown below with % of draws where they were absent.</li>
            </ul>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 8 }}>
              {analysis.overdueNumbers.slice(0, 15).map(item => (
                <div key={item.num} style={{ background: '#f1f5f9', borderRadius: 6, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontWeight: 700 }}>{item.num}</div>
                  <div style={{ fontSize: 12, color: '#555' }}>{item.percentage}%</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontWeight: 600 }}>Cold numbers (not drawn in recent window):</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {analysis.coldNumbers.map(item => (
                <span key={item.num} style={{ background: '#e0f2fe', borderRadius: 12, padding: '3px 8px', fontSize: 12 }}>{item.num} ({item.freq}/{analysis.recentLen})</span>
              ))}
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
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Predicted next 37 non-drawn numbers</div>
            <div style={{ background: '#fff7ed', border: '1px solid #fde68a', borderRadius: 6, padding: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Not drawn:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                {analysis.predictedNotDrawn.map(n => (
                  <div key={n} style={{ background: '#fde68a', borderRadius: 6, padding: 8, textAlign: 'center', fontWeight: 700 }}>{n}</div>
                ))}
              </div>
            </div>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: 10, marginTop: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Predicted to be drawn (8 numbers):</div>
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
