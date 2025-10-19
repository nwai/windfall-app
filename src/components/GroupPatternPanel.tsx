/**
 * Zone Pattern Analysis (ZPA) Panel - GroupPatternPanel (Legacy Minimal Version)
 * 
 * Simple display showing per-zone mains count across draws.
 * No dependencies on zoneAnalysis, no regression analysis, no toasts.
 */

import React, { useMemo } from 'react';
import { Draw } from '../types';

interface GroupPatternPanelProps {
  draws: Draw[];
}

// 9 zones: 1-5, 6-10, 11-15, 16-20, 21-25, 26-30, 31-35, 36-40, 41-45
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

export function GroupPatternPanel({ draws }: GroupPatternPanelProps) {
  // Calculate per-zone mains count
  const zoneCounts = useMemo(() => {
    const counts = new Array(9).fill(0);
    
    for (const draw of draws) {
      for (const num of draw.main) {
        // Find which zone this number belongs to
        for (let zoneIdx = 0; zoneIdx < ZONE_RANGES.length; zoneIdx++) {
          const [lo, hi] = ZONE_RANGES[zoneIdx];
          if (num >= lo && num <= hi) {
            counts[zoneIdx]++;
            break;
          }
        }
      }
    }
    
    return counts;
  }, [draws]);
  
  return (
    <div style={{ padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 1rem 0' }}>Zone Pattern Analysis (ZPA)</h2>
      
      {/* Per-Zone Mains Count */}
      <div style={{ marginBottom: '2rem' }}>
        <h3>Mains Count Per Zone</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '0.5rem' }}>
          {ZONE_RANGES.map((range, zoneIdx) => {
            const [lo, hi] = range;
            const count = zoneCounts[zoneIdx];
            
            return (
              <div
                key={zoneIdx}
                style={{
                  padding: '0.5rem',
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  Zone {zoneIdx + 1}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                  {lo}-{hi}
                </div>
                <div style={{ fontSize: '1.2rem', marginTop: '0.25rem', fontWeight: 'bold' }}>
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Summary */}
      <div
        style={{
          padding: '1rem',
          backgroundColor: '#f9f9f9',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontSize: '0.95rem',
        }}
      >
        Analyzed {draws.length} draws. The counts above show how many times each zone 
        appeared in the main numbers across all draws.
      </div>
    </div>
  );
}
