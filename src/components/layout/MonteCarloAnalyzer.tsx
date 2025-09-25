import React from 'react';
import { PANEL_ORDER } from './panelOrder';
import { panelComponentMap } from './PanelRegistry';
import { PanelSection } from './PanelSection';
import { useCandidates } from '../../shared/CandidatesContext';

export const AppLayout: React.FC = () => {
  const { lock, setLock } = useCandidates();

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button
          onClick={() => setLock(l => !l)}
          style={{
            background: lock ? '#b33' : '#3a7',
            color: '#fff',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          {lock ? 'Unlock Editing' : 'Lock UI'}
        </button>
      </div>

      {PANEL_ORDER.map(id => {
        const Comp = panelComponentMap[id];
        return (
          <PanelSection
            key={id}
            id={id}
            title={panelTitle(id)}
            allowWhenLocked={id === 'phase0History'} // Example: maybe viewing history is allowed
          >
            <Comp />
          </PanelSection>
        );
      })}
    </div>
  );
};

function panelTitle(id: string) {
  switch (id) {
    case 'phase0History': return 'Phase 0 Draw History';
    case 'oddEvenRatios': return 'Odd / Even Ratios';
    case 'numberFrequency': return 'Number Frequency';
    case 'candidateControls': return 'Candidate Generation Controls';
    case 'generatedCandidates': return 'Generated Candidates';
    case 'wfmqy': return 'WFMQY Metrics';
    case 'monteCarlo': return 'Monte Carlo Simulation';
    default: return id;
  }
}