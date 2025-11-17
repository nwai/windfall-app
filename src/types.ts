export type MonteCarloLayout = "grid" | "table";

export interface OperatorsPanelProps {
  entropy: number;
  setEntropy: (v: number) => void;
  entropyEnabled: boolean;
  setEntropyEnabled: (v: boolean) => void;
  hamming: number;
  setHamming: (v: number) => void;
  hammingEnabled: boolean;
  setHammingEnabled: (v: boolean) => void;
  jaccard: number;
  setJaccard: (v: number) => void;
  jaccardEnabled: boolean;
  setJaccardEnabled: (v: boolean) => void;
  lambda: number;
  setLambda: (v: number) => void;
  minRecentMatches: number;
  setMinRecentMatches: (v: number) => void;
  recentMatchBias: number;
  setRecentMatchBias: (v: number) => void;
  previewStats: { entropy: number; hamming: number; jaccard: number };
  gpwfEnabled: boolean;
  setGPWFEnabled: (v: boolean) => void;
  gpwf_window_size: number;
  setGPWFWindowSize: (v: number) => void;
  maxGPWFWindow: number;
  gpwf_bias_factor: number;
  setGPWFBiasFactor: (v: number) => void;
  gpwf_floor: number;
  setGPWFFloor: (v: number) => void;
  gpwf_scale_multiplier: number;
  setGPWFScaleMultiplier: (v: number) => void;
}

// (Keep the rest of your types below, if any)

export type CandidateSet = {
  main: number[];
  supp: number[];
  score?: number;
  trace?: string[];
  octagonalScore?: number;
  octagonalProfile?: number[];
  // OGA analytics
  ogaScore?: number;
  ogaPercentile?: number;
  // Add these for OGA Top sorting and tiebreaker
  matchedNumbers?: number[];
  numMatches?: number;
  matchHistoryFrequency?: number;
  patternMatches?: number;
};


export type Knobs = {
  enableSDE1: boolean;
  enableHC3: boolean;
  enableOGA: boolean;
  enableGPWF: boolean;
  enableEntropy: boolean;
  enableHamming: boolean;
  enableJaccard: boolean;
  F: number;
  M: number;
  Q: number;
  Y: number;
  Historical_Weight: number;
  gpwf_window_size: number;
  gpwf_bias_factor: number;
  gpwf_floor: number;
  gpwf_scale_multiplier: number;
  lambda: number;
  octagonal_top: number;
  exact_set_override: boolean;
  hamming_relax: boolean;
  gpwf_targeted_mode: boolean;
};

export interface Draw {
  main: number[];
  supp: number[];
  date: string;
  isSimulated?: boolean;
}

export interface OperatorsPanelProps {
  entropy: number;
  setEntropy: (v: number) => void;
  entropyEnabled: boolean;
  setEntropyEnabled: (v: boolean) => void;
  hamming: number;
  setHamming: (v: number) => void;
  hammingEnabled: boolean;
  setHammingEnabled: (v: boolean) => void;
  jaccard: number;
  setJaccard: (v: number) => void;
  jaccardEnabled: boolean;
  setJaccardEnabled: (v: boolean) => void;
  lambda: number;
  setLambda: (v: number) => void;
  minRecentMatches: number;
  setMinRecentMatches: (v: number) => void;
  recentMatchBias: number;
  setRecentMatchBias: (v: number) => void;
  previewStats: { entropy: number; hamming: number; jaccard: number };
  gpwfEnabled: boolean;
  setGPWFEnabled: (v: boolean) => void;
  gpwf_window_size: number;
  setGPWFWindowSize: (v: number) => void;
  maxGPWFWindow: number;
  gpwf_bias_factor: number;
  setGPWFBiasFactor: (v: number) => void;
  gpwf_floor: number;
  setGPWFFloor: (v: number) => void;
  gpwf_scale_multiplier: number;
  setGPWFScaleMultiplier: (v: number) => void;

  // NEW: OGA Top control (restored for Generate Candidates post-process)
  octagonal_top: number;
  setOctagonalTop: (v: number) => void;
}