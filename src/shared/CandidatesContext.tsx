import React, { createContext, useContext, useState, useCallback } from 'react';

export interface NumberFrequency { value: number; hits: number; }
export interface MonteCarloConfig { runs: number; iterations: number; sde1: boolean; }
export interface MonteCarloResult { candidate: number[]; score: number; }

interface CandidatesState {
  numberFrequency: NumberFrequency[];
  setNumberFrequency: React.Dispatch<React.SetStateAction<NumberFrequency[]>>;

  candidateCount: number;
  setCandidateCount: React.Dispatch<React.SetStateAction<number>>;
  generatedCandidates: number[][];
  setGeneratedCandidates: React.Dispatch<React.SetStateAction<number[][]>>;

  oddEvenRatios: number[]; // example: [3,2] meaning 3 odd, 2 even
  setOddEvenRatios: React.Dispatch<React.SetStateAction<number[]>>;

  wfmqyMetrics: Record<string, number>;
  setWfmqyMetrics: React.Dispatch<React.SetStateAction<Record<string, number>>>;

  monteCarloConfig: MonteCarloConfig;
  setMonteCarloConfig: React.Dispatch<React.SetStateAction<MonteCarloConfig>>;
  monteCarloResults: MonteCarloResult[];
  setMonteCarloResults: React.Dispatch<React.SetStateAction<MonteCarloResult[]>>;

  phase0History: number[][];
  setPhase0History: React.Dispatch<React.SetStateAction<number[][]>>;

  lock: boolean;
  setLock: React.Dispatch<React.SetStateAction<boolean>>;
}

const CandidatesContext = createContext<CandidatesState | null>(null);

export const CandidatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [numberFrequency, setNumberFrequency] = useState<NumberFrequency[]>([]);
  const [candidateCount, setCandidateCount] = useState(50);
  const [generatedCandidates, setGeneratedCandidates] = useState<number[][]>([]);
  const [oddEvenRatios, setOddEvenRatios] = useState<number[]>([]);
  const [wfmqyMetrics, setWfmqyMetrics] = useState<Record<string, number>>({});
  const [monteCarloConfig, setMonteCarloConfig] = useState<MonteCarloConfig>({ runs: 100, iterations: 500, sde1: false });
  const [monteCarloResults, setMonteCarloResults] = useState<MonteCarloResult[]>([]);
  const [phase0History, setPhase0History] = useState<number[][]>([]);
  const [lock, setLock] = useState(false);

  return (
    <CandidatesContext.Provider value={{
      numberFrequency, setNumberFrequency,
      candidateCount, setCandidateCount,
      generatedCandidates, setGeneratedCandidates,
      oddEvenRatios, setOddEvenRatios,
      wfmqyMetrics, setWfmqyMetrics,
      monteCarloConfig, setMonteCarloConfig,
      monteCarloResults, setMonteCarloResults,
      phase0History, setPhase0History,
      lock, setLock
    }}>
      {children}
    </CandidatesContext.Provider>
  );
};

export function useCandidates() {
  const ctx = useContext(CandidatesContext);
  if (!ctx) throw new Error('useCandidates must be used inside CandidatesProvider');
  return ctx;
}