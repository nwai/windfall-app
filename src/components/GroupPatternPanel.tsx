import React, { useMemo } from 'react';
import { Draw } from '../types';

// Legacy, simple Zone Pattern Analysis (ZPA) panel
// - No zoneAnalysis dependency
// - No toasts
// - No regression, R², or p-values
// - Just basic per-zone counts for mains over all draws

// Nine zones of 5 numbers each: [1-5], [6-10], ..., [41-45]
const ZONE_RANGES: Array<[number, number]> = [
  [1, 5],
  [6, 10],
  [11, 15],
  [16, 20],
  [21, 25],
  [26, 30],
  [31, 35],
  [36, 40],
  [41, 45],
];

interface GroupPatternPanelProps {
  draws: Draw[];
}

export function GroupPatternPanel({ draws }: GroupPatternPanelProps) {
  const zoneStats = useMemo(() => {
    const counts = ZONE_RANGES.map(() => 0);
    const drawHits = ZONE_RANGES.map(() => 0);

    for (const d of draws) {
      // Count per-number hits by zone for mains
      const mains = d?.main ?? [];
      const zonesHitThisDraw = new Set<number>();

      for (const n of mains) {
        const zoneIdx = Math.min(8, Math.max(0, Math.floor((n - 1) / 5)));
        counts[zoneIdx] += 1;
        zonesHitThisDraw.add(zoneIdx);
      }

      // Track how many draws hit each zone at least once
      for (const z of zonesHitThisDraw) {
        drawHits[z] += 1;
      }
    }

    return ZONE_RANGES.map(([lo, hi], i) => ({
      zone: i + 1,
      range: `${lo}-${hi}`,
      mainsCount: counts[i],
      drawsWithHit: drawHits[i],
    }));
  }, [draws]);

  return (
    <section style={{ padding: '1rem' }}>
      <h2 style={{ margin: '0 0 12px' }}>Zone Pattern Analysis (ZPA)</h2>

      <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
        Basic view showing how often main numbers fell into each 5-number zone across all draws.
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={th}>Zone</th>
              <th style={th}>Range</th>
              <th style={th} title="Total main numbers within this zone across all draws">Mains count</th>
              <th style={th} title="Number of draws with at least one main in this zone">Draws with hit</th>
            </tr>
          </thead>
          <tbody>
            {zoneStats.map((z) => (
              <tr key={z.zone} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={td}>Zone {z.zone}</td>
                <td style={td}>{z.range}</td>
                <td style={{ ...td, textAlign: 'right' }}>{z.mainsCount}</td>
                <td style={{ ...td, textAlign: 'right' }}>{z.drawsWithHit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid #333',
};

const td: React.CSSProperties = {
  padding: '8px 10px',
};