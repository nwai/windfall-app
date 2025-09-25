export enum PanelId {
  Phase0History = 'phase0History',
  OddEvenRatios = 'oddEvenRatios',
  NumberFrequency = 'numberFrequency',
  CandidateControls = 'candidateControls',
  GeneratedCandidates = 'generatedCandidates',
  WFMQY = 'wfmqy',
  MonteCarlo = 'monteCarlo'
}

/**
 * Final desired order after reorganization.
 */
export const PANEL_ORDER: PanelId[] = [
  PanelId.Phase0History,
  PanelId.OddEvenRatios,
  PanelId.NumberFrequency,
  PanelId.CandidateControls,
  PanelId.GeneratedCandidates,
  PanelId.WFMQY,
  PanelId.MonteCarlo
];