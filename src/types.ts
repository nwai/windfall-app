export type MonteCarloLayout = "grid" | "table";

export type OperatorsPanelProps = {
  entropy: number;
  setEntropy: (v: number) => void;

  setEntropyEnabled: (v: boolean) => void;

  hamming: number;
  setHamming: (v: number) => void;

  setHammingEnabled: (v: boolean) => void;

  jaccard: number;
  setJaccard: (v: number) => void;

  setJaccardEnabled: (v: boolean) => void;

  lambda: number;
  setLambda: (v: number) => void;

  minRecentMatches: number;
  setMinRecentMatches: (v: number) => void;
  recentMatchBias: number;
  setRecentMatchBias: (v: number) => void;

  previewStats: { hamming: number; entropy: number; jaccard: number };
  entropyEnabled: boolean;
  hammingEnabled: boolean;
  jaccardEnabled: boolean;

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

  // NEW: Monte Carlo layout controls
  mcLayout: MonteCarloLayout;
  setMcLayout: (v: MonteCarloLayout) => void;
  mcColumns: number;
  setMcColumns: (v: number) => void;
};

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
};

export type Draw = {
  main: number[];
  supp: number[];
  date: string;
  // Simulated draw flag
  isSimulated?: boolean;
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