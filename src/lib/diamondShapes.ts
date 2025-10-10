import type { DiamondShape } from '../types/Diamond';

export interface ShapeEvalOptions {
  dr: number;    // row - centerRow
  dc: number;    // col - centerCol
  radius: number;
  boundaryOnly?: boolean;
}

/**
 * Return true if (dr, dc) is inside the given shape of 'radius'.
 * If boundaryOnly, only true for edge/border cells.
 */
export function isCellInShape(shape: DiamondShape, opts: ShapeEvalOptions): boolean {
  const { dr, dc, radius, boundaryOnly } = opts;

  switch (shape) {
    case 'manhattan': {
      const d = Math.abs(dr) + Math.abs(dc);
      return boundaryOnly ? d === radius : d <= radius;
    }
    case 'square': {
      const m = Math.max(Math.abs(dr), Math.abs(dc));
      return boundaryOnly ? m === radius : m <= radius;
    }
    case 'circle': {
      const d2 = dr * dr + dc * dc;
      const r2 = radius * radius;
      if (boundaryOnly) {
        const dist = Math.sqrt(d2);
        return Math.abs(dist - radius) <= 0.5;
      }
      return d2 <= r2;
    }
    case 'doubleHelix': {
      // Keep this for v2; initially treat as circle to avoid surprises.
      const d2 = dr * dr + dc * dc;
      return boundaryOnly ? Math.abs(Math.sqrt(d2) - radius) <= 0.5 : d2 <= radius * radius;
    }
  }
}