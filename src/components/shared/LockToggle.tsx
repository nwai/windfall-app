import React from 'react';
import { useCandidates } from '../../shared/CandidatesContext';
import { HigButton } from './HigControls';

export const LockToggle: React.FC = () => {
  const { lock, setLock } = useCandidates();
  return (
    <HigButton
      onClick={() => setLock(l => !l)}
      variant={lock ? "danger" : "primary"}
      size="compact"
      aria-pressed={lock}
    >
      {lock ? 'Unlock Editing' : 'Lock UI'}
    </HigButton>
  );
};
