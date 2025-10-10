import React from 'react';
import { useCandidates } from '../../shared/CandidatesContext';

export const LockToggle: React.FC = () => {
  const { lock, setLock } = useCandidates();
  return (
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
  );
};