export type DiamondShape = 'manhattan' | 'square' | 'circle' | 'doubleHelix';

export interface DiamondModel {
  id: string;
  centerRow: number;
  centerCol: number;
  radius: number;

  // New fields (all optional; keep defaults friendly)
  shape?: DiamondShape;   // default 'manhattan'
  fill?: boolean;         // default true
  opacity?: number;       // 0..1, default 1
  hidden?: boolean;       // default false
}