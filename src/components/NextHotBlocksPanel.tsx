import React, { useMemo, useState } from 'react';
import type { Draw } from '../types';

type Block = { start: number; end: number; label: string };
type HeatCell = { blockIdx: number; drawIdx: number; value: number };

interface NextHotBlocksPanelProps {
  history: Draw[];              // windowed history (WFMQYH)
  excludedNumbers: number[];
  setExcludedNumbers: React.Dispatch<React.SetStateAction<number[]>>;
  maxDraws?: number;            // optional cap for rendering (default 160)
}

function buildBlocks(blockSize: number): Block[] {
  const blocks: Block[] = [];
  for (let start = 1; start <= 45; start += blockSize) {
    const end = Math.min(45, start + blockSize - 1);
    blocks.push({ start, end, label: `${start}-${end}` });
  }
  return blocks;
}

function countHitsInBlock(draw: Draw, block: Block): number {
  const nums = [...draw.main, ...(draw.supp || [])];
  return nums.filter((n) => n >= block.start && n <= block.end).length;
}

function computeRolling(
  history: Draw[],
  blocks: Block[],
  windowSize: number,
  normalize: boolean,
  maxDraws: number
) {
  const cappedHistory = history.slice(-maxDraws);
  const drawsUsed = cappedHistory.length;
  const heatMatrix: number[][] = blocks.map(() => Array(drawsUsed).fill(0));
  const hitsMatrix: number[][] = blocks.map(() => Array(drawsUsed).fill(0));

  for (let t = 0; t < drawsUsed; t++) {
    const from = Math.max(0, t - windowSize + 1);
    const window = cappedHistory.slice(from, t + 1);
    blocks.forEach((b, bi) => {
      let hits = 0;
      window.forEach((d) => {
        hits += countHitsInBlock(d, b);
      });
      hitsMatrix[bi][t] = hits;
      heatMatrix[bi][t] = normalize && window.length ? hits / window.length : hits;
    });
  }

  const perBlockMax = heatMatrix.map((row) => row.reduce((m, v) => Math.max(m, v), 0));
  const globalMax = perBlockMax.reduce((m, v) => Math.max(m, v), 0);

  return { heatMatrix, hitsMatrix, perBlockMax, globalMax, drawsUsed };
}

function smoothHybrid(series: number[], alpha: number): number {
  let ema = 0;
  if (!series.length) return 0;
  series.forEach((v, i) => {
    if (i === 0) ema = v;
    else ema = alpha * v + (1 - alpha) * ema;
  });
  // simple hybrid bump toward the latest value
  const latest = series[series.length - 1];
  return 0.7 * ema + 0.3 * latest;
}

export const NextHotBlocksPanel: React.FC<NextHotBlocksPanelProps> = ({
  history,
  excludedNumbers,
  setExcludedNumbers,
  maxDraws = 160,
}) => {
  const [blockSize, setBlockSize] = useState<number>(5);
  const [windowSize, setWindowSize] = useState<number>(7);
  const [normalize, setNormalize] = useState<boolean>(true);
  const [hybridOn, setHybridOn] = useState<boolean>(true);
  const [alpha, setAlpha] = useState<number>(0.15); // for EMA
  const [perBlockNormalize, setPerBlockNormalize] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'heatmap' | 'drift'>('heatmap');
  const [topKCount, setTopKCount] = useState<number>(2);
  const [lookbackCap, setLookbackCap] = useState<number>(30);

  const effectiveWindow = Math.max(1, Math.min(windowSize, lookbackCap));

  const { blocks, heatMatrix, hitsMatrix, drawsUsed, hotBlocks, perBlockMax, globalMax, percentileMatrix, stability } = useMemo(() => {
    const blocks = buildBlocks(blockSize);
    const { heatMatrix, hitsMatrix, perBlockMax, globalMax, drawsUsed } = computeRolling(
      history,
      blocks,
      effectiveWindow,
      normalize,
      maxDraws
    );
    const scores = heatMatrix.map((row, i) =>
      hybridOn ? smoothHybrid(row, alpha) : (row[row.length - 1] || 0)
    );
    const ranked = scores
      .map((s, i) => ({ block: blocks[i], score: s }))
      .sort((a, b) => b.score - a.score);
    const hotBlocks = ranked.slice(0, 2);

    // drift view: percentile per draw across blocks
    const percentileMatrix = blocks.map(() => Array(drawsUsed).fill(0));
    const topHits = Array(blocks.length).fill(0);
    for (let ci = 0; ci < drawsUsed; ci++) {
      const col = blocks.map((_, bi) => heatMatrix[bi][ci] || 0);
      const sorted = [...col].sort((a, b) => b - a);
      const denom = Math.max(1, blocks.length - 1);
      const topK = Math.max(1, Math.min(topKCount, blocks.length));
      const topKThreshold = sorted[topK - 1] ?? 0;
      blocks.forEach((_, bi) => {
        const v = col[bi];
        const rank = sorted.findIndex((x) => x === v);
        const pct = rank >= 0 ? 1 - rank / denom : 0;
        percentileMatrix[bi][ci] = pct;
        if (v >= topKThreshold) topHits[bi] += 1;
      });
    }
    const stability = topHits.map((h) => drawsUsed ? h / drawsUsed : 0);

    return { blocks, heatMatrix, hitsMatrix, drawsUsed, hotBlocks, perBlockMax, globalMax, percentileMatrix, stability };
  }, [history, blockSize, windowSize, normalize, maxDraws, hybridOn, alpha, topKCount, effectiveWindow]);

  // simple color scale: light to dark
  const colorFor = (v: number, maxV: number) => {
    if (maxV <= 0) return '#f5f5f5';
    const t = Math.min(1, v / maxV);
    const c = 255 - Math.round(180 * t);
    return `rgb(${c}, ${240 - Math.round(100 * t)}, ${255 - Math.round(200 * t)})`;
  };
  const effectiveMax = perBlockNormalize ? undefined : globalMax;

  const blockExclusionState = blocks.map((b) => {
    const nums = Array.from({ length: b.end - b.start + 1 }, (_, i) => b.start + i);
    const excludedCount = nums.filter((n) => excludedNumbers.includes(n)).length;
    return {
      all: excludedCount === nums.length,
      any: excludedCount > 0,
    };
  });
  
  const toggleBlock = (block: Block) => {
      const nums: number[] = [];
      for (let n = block.start; n <= block.end; n++) nums.push(n);
    const allExcluded = nums.every((n) => excludedNumbers.includes(n));
    setExcludedNumbers((prev) => {
      const set = new Set(prev);
      if (allExcluded) {
        nums.forEach((n) => set.delete(n));
      } else {
        nums.forEach((n) => set.add(n));
      }
      return Array.from(set).sort((a, b) => a - b);
    });
  };
  const nhbBlockNumbers = useMemo(() => {
    const all: number[] = [];
    blocks.forEach((b) => {
      for (let n = b.start; n <= b.end; n++) all.push(n);
    });
    return all;
  }, [blocks]);

  const clearNHBExclusions = () => {
    setExcludedNumbers((prev) => prev.filter((n) => !nhbBlockNumbers.includes(n)));
  };
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, width: '100%', maxWidth: '100%' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div><b>Next Hot Blocks</b></div>
        <label style={{ fontSize: 12 }}>
          View:
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value as 'heatmap' | 'drift')} style={{ marginLeft: 6 }}>
            <option value="heatmap">Heatmap</option>
            <option value="drift">Drift view</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          Top-k for drift:
          <input
            type="number"
            min={1}
            max={blocks.length}
            value={topKCount}
            onChange={(e) => setTopKCount(Math.max(1, Math.min(blocks.length, Number(e.target.value))))}
            style={{ width: 60, marginLeft: 6 }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          Block size:
          <select
            value={blockSize}
            onChange={(e) => setBlockSize(Number(e.target.value))}
            style={{ marginLeft: 6 }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          Window (draws):
          <input
            type="number"
            min={1}
            max={200}
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value))}
            style={{ width: 70, marginLeft: 6 }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          Normalize per draw:
          <input
            type="checkbox"
            checked={normalize}
            onChange={(e) => setNormalize(e.target.checked)}
            style={{ marginLeft: 6 }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          Per-block scale:
          <input
            type="checkbox"
            checked={perBlockNormalize}
            onChange={(e) => setPerBlockNormalize(e.target.checked)}
            style={{ marginLeft: 6 }}
            title="When on, each block is colored using its own max; otherwise a global max is used"
          />
        </label>
        <label style={{ fontSize: 12 }}>
          Hybrid EMA on:
          <input
            type="checkbox"
            checked={hybridOn}
            onChange={(e) => setHybridOn(e.target.checked)}
            style={{ marginLeft: 6 }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          EMA alpha:
          <input
            type="range"
            min={0.05}
            max={0.95}
            step={0.05}
            value={alpha}
            onChange={(e) => setAlpha(Number(e.target.value))}
            style={{ marginLeft: 6 }}
          />
          <span style={{ marginLeft: 6 }}>{alpha.toFixed(2)}</span>
        </label>
        <label style={{ fontSize: 12 }}>
          Lookback cap:
          <input
            type="range"
            min={3}
            max={60}
            step={1}
            value={lookbackCap}
            onChange={(e) => setLookbackCap(Number(e.target.value))}
            style={{ marginLeft: 6 }}
            title="Limits the effective window for recency so predictions react faster"
          />
          <span style={{ marginLeft: 6 }}>{effectiveWindow} draws</span>
        </label>
        <span style={{ fontSize: 12, color: '#666' }}>
          Draws used: {drawsUsed} (latest on the right)
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, alignItems: 'center', fontSize: 11 }}>
        <span style={{ color: '#666' }}>Legend:</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 14, background: colorFor(0, effectiveMax ?? globalMax) }} />
          <span>low</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 14, background: colorFor((effectiveMax ?? globalMax) / 2, effectiveMax ?? globalMax) }} />
          <span>mid</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 14, background: colorFor(effectiveMax ?? globalMax, effectiveMax ?? globalMax) }} />
          <span>high{perBlockNormalize ? ' (per block)' : ''}</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        <button
          type="button"
          onClick={clearNHBExclusions}
          disabled={!excludedNumbers.some((n) => nhbBlockNumbers.includes(n))}
          style={{ padding: "4px 8px", fontSize: 12 }}
          title="Clear exclusions set via NHB blocks"
        >
          Clear NHB block exclusions
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#444' }}>Block exclusions:</span>
        {blocks.map((b) => {
          const nums = Array.from({ length: b.end - b.start + 1 }, (_, i) => b.start + i);
          const allExcluded = nums.every((n) => excludedNumbers.includes(n));
          return (
            <label key={b.label} style={{ fontSize: 12, border: '1px solid #eee', padding: '4px 6px', borderRadius: 4 }}>
              <input
                type="checkbox"
                checked={allExcluded}
                onChange={() => toggleBlock(b)}
                style={{ marginRight: 6 }}
              />
              Exclude {b.label}
            </label>
          );
        })}
      </div>
      {viewMode === 'heatmap' ? (
        <div style={{ marginTop: 10, overflowX: 'auto' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Grid: block rows × draws (newest on the right)</div>
          <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${drawsUsed}, 16px)` }}>
            {/* header row */}
            <div style={{ fontSize: 11, color: '#666', padding: 4 }}>Block</div>
            {Array.from({ length: drawsUsed }, (_, i) => (
              <div key={i} style={{ fontSize: 10, color: '#aaa', textAlign: 'center' }}>
                {history.length - drawsUsed + i + 1}
              </div>
            ))}
            {/* rows */}
            {blocks.map((b, bi) => (
              <React.Fragment key={b.label}>
                <div style={{ fontSize: 12, padding: 4, borderRight: '1px solid #eee' }}>{b.label}</div>
                {Array.from({ length: drawsUsed }, (_, ci) => {
                  const val = heatMatrix[bi][ci] ?? 0;
                  const hits = hitsMatrix[bi][ci] ?? 0;
                  const ex = blockExclusionState[bi];
                  const maxForCell = perBlockNormalize ? perBlockMax[bi] : globalMax;
                  return (
                    <div
                      key={ci}
                      style={{
                        width: 16,
                        height: 16,
                        background: colorFor(val, maxForCell),
                        border: '1px solid #f5f5f5',
                        boxShadow: ex.all
                          ? 'inset 0 0 0 1px #ef4444'
                          : ex.any
                          ? 'inset 0 0 0 1px #fca5a5'
                          : undefined,
                      }}
                      title={`Draw ${history.length - drawsUsed + ci + 1} • ${b.label}: hits ${hits}, value ${val.toFixed(2)}${perBlockNormalize ? ' (per-block scale)' : ''}${ex.all ? ' [excluded]' : ex.any ? ' [partial]' : ''}`}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10, overflowX: 'auto' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
            Drift view: block lanes × draws (newest on the right). Color = percentile per draw; dot = top-k for that draw.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${drawsUsed}, 10px) 80px 40px`, gap: 2, alignItems: 'center', minWidth: '760px' }}>
             {blocks.map((b, bi) => (
               <React.Fragment key={b.label}>
                 <div style={{ fontSize: 12 }}>{b.label}</div>
                 {Array.from({ length: drawsUsed }, (_, ci) => {
                   const pct = percentileMatrix[bi][ci] || 0;
                   const isTop = pct >= 1 - (topKCount - 1) / Math.max(1, blocks.length - 1);
                   const base = Math.round(255 - 180 * pct);
                   const bg = `rgb(${base}, ${240 - Math.round(100 * pct)}, ${255 - Math.round(200 * pct)})`;
                   return (
                     <div key={ci} style={{ position: 'relative', width: 10, height: 10, background: bg, border: '1px solid #f5f5f5' }} title={`Draw ${history.length - drawsUsed + ci + 1} • pct ${(pct * 100).toFixed(0)}${isTop ? ' [top-k]' : ''}`}>
                       {isTop && <div style={{ position: 'absolute', inset: 1, borderRadius: '50%', background: '#ef4444' }} />}
                     </div>
                   );
                 })}
                 <div style={{ fontSize: 11, color: '#444', textAlign: 'right' }}>{(stability[bi] * 100).toFixed(0)}% top-k</div>
                 <div style={{ fontSize: 11, color: '#666', textAlign: 'right' }}>#{bi + 1}</div>
               </React.Fragment>
             ))}
           </div>
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 12 }}>
        <b>Top blocks (now):</b>{' '}
        {hotBlocks.map((h, idx) => (
          <span key={h.block.label} style={{ marginRight: 10 }}>
            #{idx + 1} {h.block.label} (score {h.score.toFixed(2)})
          </span>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: '#666' }}>
        Heuristic only. Lottery draws are random; use for descriptive insight, not prediction.
      </div>
    </div>
  );
};

export default NextHotBlocksPanel;
