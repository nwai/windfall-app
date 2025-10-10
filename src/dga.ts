export type Diamond = {
  centerRow: number;
  centerCol: number;
  radius: number;
};

// Utility to make a diamond object
export function makeDiamond(centerRow: number, centerCol: number, radius: number): Diamond {
  return { centerRow, centerCol, radius };
}

// Given a grid of numbers (nRows x nCols), return all diamonds of all radii containing only nonzero entries.
// Returns an array of { centerRow, centerCol, radius }
export function findDiamondsAllRadii(
  grid: number[][],
  minRadius: number = 1,
  maxRadius?: number
): Diamond[] {
  const nRows = grid.length;
  const nCols = grid[0]?.length || 0;
  if (!nRows || !nCols) return [];
  const diamonds: Diamond[] = [];

  const maxPossibleRadius = Math.min(nRows, nCols) >> 1;
  const realMaxRadius = maxRadius ?? maxPossibleRadius;

  for (let radius = minRadius; radius <= realMaxRadius; ++radius) {
    for (let r = radius; r < nRows - radius; ++r) {
      for (let c = radius; c < nCols - radius; ++c) {
        let allFilled = true;
        for (let dr = -radius; dr <= radius; ++dr) {
          for (let dc = -radius; dc <= radius; ++dc) {
            if (Math.abs(dr) + Math.abs(dc) <= radius) {
              const rr = r + dr;
              const cc = c + dc;
              if (grid[rr]?.[cc] === 0) {
                allFilled = false;
                break;
              }
            }
          }
          if (!allFilled) break;
        }
        if (allFilled) {
          diamonds.push(makeDiamond(r, c, radius));
        }
      }
    }
  }
  return diamonds;
}

// Diamonds for a *single* radius (legacy)
export function findDiamonds(
  grid: number[][],
  radius: number
): Diamond[] {
  return findDiamondsAllRadii(grid, radius, radius);
}

// Return the set of numbers on the prediction edge (rightmost column) of any diamond
export function getPredictedNumbers(
  diamonds: Diamond[],
  predCol: number
): number[] {
  const predictedRows = new Set<number>();
  for (const d of diamonds) {
    // Find diamonds whose rightmost edge touches the prediction column
    if (d.centerCol + d.radius === predCol) {
      for (let dr = -d.radius; dr <= d.radius; ++dr) {
        const r = d.centerRow + dr;
        const c = d.centerCol + (d.radius - Math.abs(dr));
        predictedRows.add(r + 1); // +1 to match number label
      }
    }
  }
  return Array.from(predictedRows).sort((a, b) => a - b);
}

// Example: buildDrawGrid (assumes gridSize is number of rows/numbers)
// Each row is a number, each column is a draw
export function buildDrawGrid(
  history: { main: number[]; supp: number[] }[],
  gridSize: number,
  nDraws: number
): number[][] {
  const grid = Array.from({ length: gridSize }, () => Array(nDraws).fill(0));
  for (let c = 0; c < nDraws; ++c) {
    const draw = history[c];
    if (!draw) continue;
    draw.main.forEach((n) => {
      if (n >= 1 && n <= gridSize) grid[n - 1][c] = 1;
    });
    draw.supp.forEach((n) => {
      if (n >= 1 && n <= gridSize) grid[n - 1][c] = 2;
    });
  }
  return grid;
}