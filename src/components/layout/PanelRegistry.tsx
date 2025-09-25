import React from 'react';
import { PanelId } from './panelOrder';
import { Phase0DrawHistoryPanel } from '../candidates/Phase0DrawHistoryPanel';
import { OddEvenRatiosPanel } from '../candidates/OddEvenRatiosPanel';
import { NumberFrequencyPanel } from '../candidates/NumberFrequencyPanel';
import { CandidateGenerationControls } from '../candidates/CandidateGenerationControls';
import { GeneratedCandidatesPanel } from '../candidates/GeneratedCandidatesPanel';
import { WFMQYPanel } from '../candidates/WFMQYPanel';
import { MonteCarloPanel } from '../candidates/MonteCarloPanel';

export const panelComponentMap: Record<PanelId, React.FC> = {
  [PanelId.Phase0History]: Phase0DrawHistoryPanel,
  [PanelId.OddEvenRatios]: OddEvenRatiosPanel,
  [PanelId.NumberFrequency]: NumberFrequencyPanel,
  [PanelId.CandidateControls]: CandidateGenerationControls,
  [PanelId.GeneratedCandidates]: GeneratedCandidatesPanel,
  [PanelId.WFMQY]: WFMQYPanel,
  [PanelId.MonteCarlo]: MonteCarloPanel
};