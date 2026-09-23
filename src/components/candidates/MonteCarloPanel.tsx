// Add focus controls (type-in focus + optional Pin)
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Draw } from '../../types';
import { monteCarloWeights, simulateMonteCarlo, MONTE_CARLO_MODEL_VERSION } from '../../lib/monteCarloModel';
import { seededRandom } from '../../lib/settingsTransparency';
import { InfoHelp } from '../shared/HigControls';

type LayoutMode = 'grid' | 'table';
type SortMode = 'multi' | 'biased' | 'base' | 'sim' | 'number';

interface NumberProb {
  number: number;
  baseProb: number;
  biasedProb: number;
  simulatedProb?: number;
}

export interface MonteCarloPanelProps {
  history: Draw[];
  enableSDE1: boolean;
  excludedNumbers: number[];
  trendWeights?: Record<number, number> | null;
  defaultWindow?: number;
  historyScopeLabel?: string;
  drawSize?: number;
  showSimulation?: boolean;
  forcedNumbers?: number[];

  externalFocusNumber?: number | null;
  onFocusChange?: (n: number | null) => void;
}

export const MonteCarloPanel: React.FC<MonteCarloPanelProps> = ({
  history,
  excludedNumbers,
  trendWeights,
  defaultWindow = 30,
  historyScopeLabel,
  drawSize = 8,
  showSimulation = true,
  forcedNumbers = [],
  externalFocusNumber = null,
  onFocusChange,
}) => {
  const [layout, setLayout] = useState<LayoutMode>('grid');
  const [columns, setColumns] = useState<number>(4);
  const [simulationRuns, setSimulationRuns] = useState<number>(20000);
  const [simulation, setSimulation] = useState<{ counts: Map<number, number>; runs: number; key: string; seed: number } | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const runId = useRef(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [useTrendBias, setUseTrendBias] = useState<boolean>(false);
  const [sortMode, setSortMode] = useState<SortMode>('multi');
  const [focusNumber, setFocusNumber] = useState<number | null>(null);
  const [pinFocus, setPinFocus] = useState<boolean>(false);


  const recent = useMemo(
    () => {
      const real = history.filter(draw => !draw.isSimulated);
      const count = Number.isFinite(defaultWindow) ? Math.max(0, Math.floor(defaultWindow)) : 0;
      return count > 0 ? real.slice(-count) : [];
    },
    [history, defaultWindow]
  );

  const combinedExcluded = useMemo(() => {
    const merged = new Set<number>([...excludedNumbers]);
    return Array.from(merged).sort((a, b) => a - b);
  }, [excludedNumbers]);

  const adjustedProbs = useMemo(() => monteCarloWeights(recent, combinedExcluded), [recent, combinedExcluded]);

  const biasedProbs = useMemo(() => {
    if (!useTrendBias || !trendWeights) return adjustedProbs;
    return monteCarloWeights(recent, combinedExcluded, trendWeights);
  }, [adjustedProbs, recent, combinedExcluded, trendWeights, useTrendBias]);

  const simulationKey = JSON.stringify({ history: recent, probabilities: biasedProbs, drawSize });
  const simResults = simulation?.key === simulationKey ? simulation.counts : null;
  const eligibleCount = biasedProbs.filter(p => p > 0).length;
  const validRuns = Number.isInteger(simulationRuns) && simulationRuns >= 1000 && simulationRuns <= 2000000;
  useEffect(() => { runId.current++; setIsRunning(false); }, [simulationKey]);
  useEffect(() => () => { runId.current++; }, []);

  const probabilityRows: NumberProb[] = useMemo(
    () =>
      Array.from({ length: 45 }, (_, i) => {
        const number = i + 1;
        return {
          number,
          baseProb: adjustedProbs[i],
          biasedProb: biasedProbs[i],
          simulatedProb: simResults && simulation ? (simResults.get(number) || 0) / simulation.runs : undefined,
        };
      }),
    [adjustedProbs, biasedProbs, simResults, simulation]
  );

  const sortedRows = useMemo(() => {
    const arr = probabilityRows.slice();
    const cmpMulti = (a: NumberProb, b: NumberProb) =>
      b.biasedProb - a.biasedProb ||
      b.baseProb - a.baseProb ||
      (b.simulatedProb ?? 0) - (a.simulatedProb ?? 0) ||
      a.number - b.number;

    if (sortMode === 'multi') arr.sort(cmpMulti);
    else if (sortMode === 'biased') arr.sort((a, b) => b.biasedProb - a.biasedProb || a.number - b.number);
    else if (sortMode === 'base') arr.sort((a, b) => b.baseProb - a.baseProb || a.number - b.number);
    else if (sortMode === 'sim') arr.sort((a, b) => (b.simulatedProb ?? 0) - (a.simulatedProb ?? 0) || a.number - b.number);
    else if (sortMode === 'number') arr.sort((a, b) => a.number - b.number);
    return arr;
  }, [probabilityRows, sortMode]);

  const runSimulation = useCallback(async () => {
    if (!validRuns || eligibleCount < drawSize) return;
    const id = ++runId.current;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const rng = seededRandom(seed);
    const requestedRuns = simulationRuns;
    setIsRunning(true);
    setSimulationError(null);
    try {
      const cumulative = new Map<number, number>();
      for (let completed = 0; completed < requestedRuns; completed += 1000) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (runId.current !== id) return;
        const counts = simulateMonteCarlo(biasedProbs, Math.min(1000, requestedRuns - completed), drawSize, rng);
        for (const [n, count] of counts) cumulative.set(n, (cumulative.get(n) ?? 0) + count);
      }
      if (runId.current === id) setSimulation({ counts: cumulative, runs: requestedRuns, key: simulationKey, seed });
    } catch (error) {
      if (runId.current === id) setSimulationError(error instanceof Error ? error.message : 'Simulation failed.');
    } finally {
      if (runId.current === id) setIsRunning(false);
    }
  }, [biasedProbs, simulationRuns, drawSize, validRuns, eligibleCount, simulationKey]);

  const gridColumns = useMemo(() => {
    const perCol = Math.ceil(45 / columns);
    const chunks: NumberProb[][] = [];
    for (let c = 0; c < columns; c++) {
      chunks.push(sortedRows.slice(c * perCol, (c + 1) * perCol));
    }
    return chunks;
  }, [sortedRows, columns]);

  const setFocusFromInput = (v: string) => {
    const n = Math.max(1, Math.min(45, Number(v) || 0));
    if (n >= 1 && n <= 45) setFocusNumber(n);
  };

  const pickNumber = (n: number) => {
    setFocusNumber(n);
    onFocusChange?.(n);
  };

 React.useEffect(() => {
    if (!pinFocus) setFocusNumber(externalFocusNumber ?? null);
  }, [externalFocusNumber, pinFocus]);

  return (
    <section style={{ border: '2px solid #4b72ff', borderRadius: 8, padding: 18, background: '#f4f7ff' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: 13 }}>
          Sort by:
          <select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)} style={{ marginLeft: 6 }}>
            <option value="multi">Trend → Base → Sim</option>
            <option value="biased">Biased</option>
            <option value="base">Base</option>
            <option value="sim">Sim</option>
            <option value="number">Number</option>
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          Layout:
          <select value={layout} onChange={e => setLayout(e.target.value as LayoutMode)} style={{ marginLeft: 6 }}>
            <option value="grid">Grid</option>
            <option value="table">Table</option>
          </select>
        </label>

        {layout === 'grid' && (
          <label style={{ fontSize: 13 }}>
            Columns:
            <input type="number" min={2} max={9} value={columns} onChange={e => setColumns(Math.max(2, Math.min(9, Math.floor(Number(e.target.value) || 2))))} style={{ width: 55, marginLeft: 6 }} />
          </label>
        )}

        <label style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={!!trendWeights && useTrendBias}
            onChange={e => setUseTrendBias(e.target.checked)}
            disabled={!trendWeights}
            style={{ marginRight: 4 }}
          />
          Trend Bias
        </label>
        <InfoHelp label="Monte Carlo model settings">Model {MONTE_CARLO_MODEL_VERSION}. Each eligible number receives count + 0.5 smoothing. Trend bias is optional: exp(3 times the difference between latest 6-draw and 13-draw rates), using actual available draws. Base and Biased are normalized sampling weights, not draw probabilities. Sim is inclusion frequency in simulated eight-number sets. Forced numbers shown here are generator context only; they are not forced in this independent simulation.</InfoHelp>

        {/* Focus controls */}
        <label style={{ fontSize: 13 }}>
          Focus #
          <input
            type="number"
            min={1}
            max={45}
            value={focusNumber ?? ""}
            onChange={(e) => setFocusFromInput(e.target.value)}
            placeholder="—"
            style={{ width: 60, marginLeft: 6 }}
            title="Type a number 1..45 to focus/highlight"
          />
        </label>

        <label style={{ fontSize: 13 }}>
          <input
  type="checkbox"
  checked={pinFocus}
  onChange={(e) => {
    const checked = e.target.checked;
    setPinFocus(checked);
    if (!checked) {
      setFocusNumber(null);
      onFocusChange?.(null);
    }
  }}
  style={{ marginRight: 4 }}
/>
          Pin focus
        </label>

        {showSimulation && (
          <>
            <label style={{ fontSize: 13 }}>
              Runs:
              <input
                type="number"
                min={1000}
                step={1000}
                max={2000000}
                value={simulationRuns}
                onChange={e => setSimulationRuns(Number(e.target.value))}
                style={{ width: 90, marginLeft: 6 }}
              />
            </label>
            <button
              onClick={runSimulation}
              disabled={!recent.length || isRunning || !validRuns || eligibleCount < drawSize}
              style={{ background: '#3367d6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: isRunning ? 'default' : 'pointer', fontWeight: 600 }}
            >
              {isRunning ? 'Simulating…' : 'Run'}
            </button>
          </>
        )}

        {/* Context */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12 }}>
            <b>Excluded:</b> {combinedExcluded.length ? combinedExcluded.join(', ') : <span style={{ color: '#888' }}>none</span>}
          </span>
          <span style={{ fontSize: 12 }}>
            <b>Generator forced (context only):</b> {forcedNumbers.length ? forcedNumbers.join(', ') : <span style={{ color: '#888' }}>none</span>}
          </span>
          <span style={{ fontSize: 12 }}>
            <b>Scope:</b> independent Monte Carlo weighting
          </span>
          <span style={{ fontSize: 12 }}>
            <b>Focus:</b> {focusNumber ?? <span style={{ color: '#888' }}>none</span>}
          </span>
        </div>
      </header>

      <div style={{ fontSize: 12, marginBottom: 6, color: '#555' }}>
        Sampling weights from {recent.length} draws; count + 0.5 smoothing. Scope: {historyScopeLabel ?? 'provided history'}. Trend {useTrendBias ? 'On' : 'Off'}.
      </div>
      {simulationError && <p role="alert">{simulationError}</p>}
      {eligibleCount < drawSize && <p role="alert">Need {drawSize} eligible numbers; only {eligibleCount} available. Review exclusions.</p>}
      {!validRuns && <p role="alert">Runs must be a whole number from 1,000 to 2,000,000.</p>}
      {simulation && <p role="status">{simResults ? `Completed ${simulation.runs.toLocaleString()} simulations; seed ${simulation.seed}.` : 'Previous simulation is out of date. Run again for this setup.'}</p>}

      {layout === 'table' ? (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#e3e9fa' }}>
              <th style={th}>#</th>
              <th style={th}>Base %</th>
              <th style={th}>Biased %</th>
              {showSimulation && <th style={th}>Sim %</th>}
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => {
              const excluded = combinedExcluded.includes(row.number);
              const isFocus = focusNumber === row.number;
              return (
                <tr
                
                  key={row.number}
  onClick={() => pickNumber(row.number)} 
                  style={{ background: isFocus ? '#fff3e0' : excluded ? '#fdf2f2' : undefined, cursor: 'pointer' }}
                  title="Click to focus this number"
                >
                  <td style={tdNum}><b>{row.number}</b></td>
                  <td style={td}>{(row.baseProb * 100).toFixed(2)}</td>
                  <td style={{ ...td, fontWeight: 600, color: '#1a4fa3' }}>{(row.biasedProb * 100).toFixed(2)}</td>
                  {showSimulation && (
                    <td style={{ ...td, color: '#00695c' }}>
                      {row.simulatedProb !== undefined ? (row.simulatedProb * 100).toFixed(2) : '—'}
                    </td>
                  )}
                  <td style={{ ...td, fontSize: 12 }}>{excluded ? 'Excluded' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(90px, 1fr))`, gap: 8 }}>
          {gridColumns.map((col, ci) => (
            <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {col.map(row => {
                const excluded = combinedExcluded.includes(row.number);
                const isFocus = focusNumber === row.number;
                return (
                  <div
                  
                    key={row.number}
  onClick={() => pickNumber(row.number)} 
                    style={{
                      border: isFocus ? '2px solid #ff9800' : '1px solid #d3daf2',
                      background: excluded ? '#fdf2f2' : '#fff',
                      padding: '6px 8px',
                      borderRadius: 6,
                      lineHeight: 1.25,
                      cursor: 'pointer',
                    }}
                    title="Click to focus this number"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span><b>{row.number}</b></span>
                      {excluded && <span style={{ fontSize: 10, color: '#b40000', fontWeight: 600 }}>EXCL</span>}
                    </div>
                    <div style={miniRow}><span style={miniLabel}>Base:</span><span>{(row.baseProb * 100).toFixed(2)}%</span></div>
                    <div style={miniRow}><span style={miniLabel}>Biased:</span><span style={{ fontWeight: 600, color: '#1a4fa3' }}>{(row.biasedProb * 100).toFixed(2)}%</span></div>
                    {showSimulation && (
                      <div style={miniRow}><span style={miniLabel}>Sim:</span><span style={{ color: '#00695c' }}>
                        {row.simulatedProb !== undefined ? (row.simulatedProb * 100).toFixed(2) + '%' : '—'}
                      </span></div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: '#666', marginTop: 10 }}>
        Simulation draws {drawSize} unique numbers from the displayed weighted probabilities; candidate generation handles main/supplementary structure separately.
      </div>
    </section>
  );
};

const th: React.CSSProperties = { textAlign: 'right', padding: '4px 6px', fontWeight: 600, borderBottom: '1px solid #c5cee8', fontSize: 12 };
const td: React.CSSProperties = { textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid #eef1f9', fontVariantNumeric: 'tabular-nums' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'left', fontVariantNumeric: 'tabular-nums' };
const miniRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 2 };
const miniLabel: React.CSSProperties = { color: '#555', paddingRight: 4 };
