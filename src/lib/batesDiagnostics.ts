/**
 * Shape for per-number diagnostics the BatesPanel can share.
 */
export interface BatesDiagRow {
  number: number;
  final: number;
  baseConvex: number;
  triPortion: number;
  batesPortion: number;
  hotColdFactor: number;
  globalFactor: number;
  condFactor: number;
  isHot: boolean;
  isCold: boolean;
}

export interface BatesDiagnostics {
  rows: BatesDiagRow[];
  generatedAt: string;
}