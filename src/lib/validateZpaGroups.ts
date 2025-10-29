// Flexible validator for ZPA groups: accepts 3×15, 5×9, 9×5, 15×3.
// Ensures coverage of 1..45 exactly, disjoint groups, uniform group sizes.

export type SchemeInfo = {
  zones: number;
  size: number;
  allowed: boolean;
};

const ALLOWED_ZONE_COUNTS = new Set([3, 5, 9, 15]);

function coversOneTo45(groups: number[][]): boolean {
  const flat = groups.flat();
  if (flat.length !== 45) return false;
  const set = new Set(flat);
  if (set.size !== 45) return false;
  for (let n = 1; n <= 45; n++) {
    if (!set.has(n)) return false;
  }
  return true;
}

export function validateZpaGroups(groups: unknown): SchemeInfo {
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error("ZPA groups must be a non-empty array.");
  }
  const zones = groups.length;
  const sizes = new Set<number>();
  for (const g of groups) {
    if (!Array.isArray(g) || g.length === 0) {
      throw new Error("Each zone must be a non-empty array of numbers.");
    }
    for (const n of g) {
      if (!Number.isInteger(n) || n < 1 || n > 45) {
        throw new Error(`Invalid number ${n} in groups; must be integers 1..45.`);
      }
    }
    sizes.add(g.length);
  }

  if (sizes.size !== 1) {
    throw new Error("All zones must have the same number of numbers.");
  }
  const [size] = Array.from(sizes);
  if (zones * size !== 45) {
    throw new Error(`Invalid partition: zones×size must equal 45 (got ${zones}×${size}).`);
  }

  if (!coversOneTo45(groups as number[][])) {
    throw new Error("Groups must be a disjoint partition that covers 1..45 exactly once.");
  }

  return {
    zones,
    size,
    allowed: ALLOWED_ZONE_COUNTS.has(zones),
  };
}

export function computeLayoutColumns(zones: number): number {
  // A simple layout strategy that keeps tiles tidy:
  // 3 → 3 columns (1 row), 5 → 5 columns (1 row),
  // 9 → 3 columns (3 rows), 15 → 5 columns (3 rows).
  if (zones === 3) return 3;
  if (zones === 5) return 5;
  if (zones === 9) return 3;
  if (zones === 15) return 5;
  // Fallback: clamp to 5 for readability
  return Math.min(5, zones);
}