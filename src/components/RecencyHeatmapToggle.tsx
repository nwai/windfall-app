import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import {
  computeRecencyBuckets,
  RECENCY_BUCKET_COLORS,
  RECENCY_BUCKET_LABELS,
} from "../lib/recencyBuckets";

// This wrapper computes recency buckets and hands them to your existing TemperatureHeatmap.
// Adapt the prop names below to match your TemperatureHeatmap API.
type Props = {
  history: Draw[];                  // WFMQY-filtered history
  baselineStops: number[];          // your existing bucketStops for the default mode
  baselineLabels: string[];         // your existing bucketLabels for the default mode
  baselineColors: string[];         // your existing bucketColors for the default mode
  renderHeatmap: (opts: {
    bucketLabels: string[];
    bucketColors: string[];
    bucketAssignments?: number[];   // optional: per-number bucket index, if your component supports it
    useRecency: boolean;
  }) => React.ReactNode;
};

export const RecencyHeatmapToggle: React.FC<Props> = ({
  history,
  baselineStops,
  baselineLabels,
  baselineColors,
  renderHeatmap,
}) => {
  const [useRecency, setUseRecency] = useState(false);

  const recencyBuckets = useMemo(() => computeRecencyBuckets(history), [history]);
  const bucketAssignments = useMemo(() => recencyBuckets.buckets, [recencyBuckets]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={useRecency}
          onChange={(e) => setUseRecency(e.target.checked)}
        />
        Use recency buckets (volcanic = latest draw; prehistoric = ≥12 draws absent)
      </label>

      {renderHeatmap({
        bucketLabels: useRecency ? RECENCY_BUCKET_LABELS : baselineLabels,
        bucketColors: useRecency ? RECENCY_BUCKET_COLORS : baselineColors,
        bucketAssignments: useRecency ? bucketAssignments : undefined,
        useRecency,
      })}
    </div>
  );
};