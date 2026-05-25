export interface MainConstraintSelection<BucketKey extends string = string> {
  bucketKey: BucketKey;
  enabled: boolean;
  count: number;
  boost?: number;
  singleDigitBoost?: number;
  twoDigitBoost?: number;
}

export interface DerivedMainConstraintExclusions<BucketKey extends string = string> {
  shouldApply: boolean;
  totalSelectedMax: number;
  activeBucketKeys: BucketKey[];
  excludedBucketKeys: BucketKey[];
  excludedNumbers: number[];
}

/**
 * When the enabled main-number bucket maxima add up to more than the available
 * main slots, buckets that are off or set to zero can be safely treated as
 * exclusions to tighten generation — unless a bucket still has an explicit
 * generation boost, in which case it must remain eligible for sampling.
 */
export function deriveMainConstraintExclusions<BucketKey extends string>(
  rows: ReadonlyArray<MainConstraintSelection<BucketKey>>,
  bucketMap: Record<BucketKey, readonly number[]>,
  requiredMainCount: number = 6
): DerivedMainConstraintExclusions<BucketKey> {
  const activeRows = rows.filter((row) => row.enabled);
  const totalSelectedMax = activeRows.reduce((sum, row) => sum + Math.max(0, row.count), 0);
  const hasPositiveActiveBucket = activeRows.some((row) => row.count > 0);
  const shouldApply = hasPositiveActiveBucket && totalSelectedMax > requiredMainCount;

  if (!shouldApply) {
    return {
      shouldApply: false,
      totalSelectedMax,
      activeBucketKeys: rows.filter((row) => row.enabled && row.count > 0).map((row) => row.bucketKey),
      excludedBucketKeys: [],
      excludedNumbers: [],
    };
  }

  const activeBucketKeys = rows
    .filter((row) => row.enabled && row.count > 0)
    .map((row) => row.bucketKey);
  const excludedBucketKeys = rows
    .filter((row) => {
      const hasPositiveBoost = Math.max(
        row.boost ?? 0,
        row.singleDigitBoost ?? 0,
        row.twoDigitBoost ?? 0,
      ) > 0;
      return (!row.enabled || row.count === 0) && !hasPositiveBoost;
    })
    .map((row) => row.bucketKey);
  const excludedNumbers = Array.from(
    new Set(excludedBucketKeys.flatMap((bucketKey) => bucketMap[bucketKey] ?? []))
  ).sort((a, b) => a - b);

  return {
    shouldApply,
    totalSelectedMax,
    activeBucketKeys,
    excludedBucketKeys,
    excludedNumbers,
  };
}
