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
  const heat: HeatCell[] = [];
  const rollingScores: number[][] = blocks.map(() => []);
  for (let t = 0; t < cappedHistory.length; t++) {
    const from = Math.max(0, t - windowSize + 1);
    const window = cappedHistory.slice(from, t + 1);
    blocks.forEach((b, bi) => {
      let hits = 0;
      window.forEach((d) => {
        hits += countHitsInBlock(d, b);
      });
      const val = normalize ? hits / window.length : hits;
      rollingScores[bi].push(val);
      heat.push({ blockIdx: bi, drawIdx: t, value: val });
    });
  }
  return { heat, rollingScores, drawsUsed: cappedHistory.length };
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
  
  

  const { blocks, heat, rollingScores, drawsUsed, hotBlocks } = useMemo(() => {
    const blocks = buildBlocks(blockSize);
    const { heat, rollingScores, drawsUsed } = computeRolling(
      history,
      blocks,
      Math.max(1, windowSize),
      normalize,
      maxDraws
    );
    // score each block with hybrid EMA of its rolling values
    const scores = rollingScores.map((s) =>
      hybridOn ? smoothHybrid(s, alpha) : (s[s.length - 1] || 0)
    );
    const ranked = scores
      .map((s, i) => ({ block: blocks[i], score: s }))
      .sort((a, b) => b.score - a.score);
    const hotBlocks = ranked.slice(0, 2);
    return { blocks, heat, rollingScores, drawsUsed, hotBlocks };
  }, [history, blockSize, windowSize, normalize, maxDraws, hybridOn, alpha]);

  // simple color scale: light to dark
  const colorFor = (v: number, maxV: number) => {
    if (maxV <= 0) return '#f5f5f5';
    const t = Math.min(1, v / maxV);
    const c = 255 - Math.round(180 * t);
    return `rgb(${c}, ${240 - Math.round(100 * t)}, ${255 - Math.round(200 * t)})`;
  };
  const maxVal = heat.reduce((m, c) => Math.max(m, c.value), 0);
  
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
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div><b>Next Hot Blocks</b></div>
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
        <span style={{ fontSize: 12, color: '#666' }}>
          Draws used: {drawsUsed} (latest on the right)
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {blocks.map}
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
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
      
      
      
      <div style={{ marginTop: 10, overflowX: 'auto' }}>
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
                const cell = heat.find((h) => h.blockIdx === bi && h.drawIdx === ci);
                const val = cell ? cell.value : 0;
                const ex = blockExclusionState[bi];
                return (
                  <div
                    key={ci}
                    style={{
                      width: 16,
                      height: 16,
                      background: colorFor(val, maxVal),
                      border: '1px solid #f5f5f5',
                      boxShadow: ex.all
                        ? 'inset 0 0 0 1px #ef4444'    // solid red outline if fully excluded
                        : ex.any
                        ? 'inset 0 0 0 1px #fca5a5'    // light outline if partially excluded
                        : undefined,
                      opacity: ex.all ? 1 : 1,      // fade if fully excluded (optional)
                    }}
                    title={`Draw ${history.length - drawsUsed + ci + 1} • ${b.label}: ${val.toFixed(2)}`}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

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
