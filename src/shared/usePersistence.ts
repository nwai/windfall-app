import { useEffect, useRef } from 'react';
import { useCandidates } from './CandidatesContext';

const STORAGE_KEY = 'brokenMeadowCandidatesV1';

export function usePersistence() {
  const state = useCandidates();
  const first = useRef(true);

  // Load
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Basic guarded assignments (example)
      if (Array.isArray(parsed.numberFrequency)) state.setNumberFrequency(parsed.numberFrequency);
      if (Array.isArray(parsed.generatedCandidates)) state.setGeneratedCandidates(parsed.generatedCandidates);
      if (Array.isArray(parsed.oddEvenRatios)) state.setOddEvenRatios(parsed.oddEvenRatios);
      if (parsed.candidateCount) state.setCandidateCount(parsed.candidateCount);
      if (parsed.lock !== undefined) state.setLock(!!parsed.lock);
    } catch {}
  }, []);

  // Save (debounced)
  useEffect(() => {
    const handle = setTimeout(() => {
      const payload = {
        numberFrequency: state.numberFrequency,
        candidateCount: state.candidateCount,
        generatedCandidates: state.generatedCandidates,
        oddEvenRatios: state.oddEvenRatios,
        lock: state.lock
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {}
    }, 300);
    return () => clearTimeout(handle);
  }, [
    state.numberFrequency,
    state.candidateCount,
    state.generatedCandidates,
    state.oddEvenRatios,
    state.lock
  ]);
}