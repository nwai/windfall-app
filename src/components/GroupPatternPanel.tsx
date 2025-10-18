/**
 * Zone Pattern Analysis (ZPA) Panel - GroupPatternPanel
 * 
 * Displays:
 * - Top zone patterns with count, R², p-value, and trend direction
 * - Per-number heatmap showing zone membership
 * - Dynamic explanatory text about zone trends
 */

import React, { useMemo } from 'react';
import { Draw } from '../types';
import { showToast } from '../lib/toastBus';
import {
  countZonePatterns,
  analyzeZoneTrends,
  ZonePatternCount,
  ZoneTrend,
  getZoneLabel,
  ZONE_RANGES,
  calculateSumMainsTrend,
  linearRegression,
} from '../lib/zoneAnalysis';

interface GroupPatternPanelProps {
  draws: Draw[];
  maxPatterns?: number;
}

export function GroupPatternPanel({ draws, maxPatterns = 10 }: GroupPatternPanelProps) {
  // Analyze zone patterns
  const patternCounts = useMemo(() => countZonePatterns(draws), [draws]);
  const topPatterns = useMemo(
    () => patternCounts.slice(0, maxPatterns),
    [patternCounts, maxPatterns]
  );
  
  // Analyze zone trends
  const zoneTrends = useMemo(() => analyzeZoneTrends(draws), [draws]);
  
  // Calculate aggregate trend for "sum(mains)"
  const sumMainsTrend = useMemo(() => calculateSumMainsTrend(zoneTrends), [zoneTrends]);
  
  // Calculate per-pattern regression
  const patternRegressions = useMemo(() => {
    return topPatterns.map(pattern => {
      const x = pattern.drawIndices;
      const y = new Array(x.length).fill(1); // Binary: pattern appeared
      
      // Create time series of pattern frequency (moving average)
      const windowSize = Math.max(3, Math.floor(draws.length / 20));
      const frequencies: number[] = [];
      const timePoints: number[] = [];
      
      for (let i = windowSize; i < draws.length; i++) {
        const recentIndices = pattern.drawIndices.filter(
          idx => idx >= i - windowSize && idx <= i
        );
        frequencies.push(recentIndices.length / windowSize);
        timePoints.push(i);
      }
      
      if (timePoints.length === 0) {
        return { slope: 0, intercept: 0, rSquared: 0, pValue: 1 };
      }
      
      return linearRegression(timePoints, frequencies);
    });
  }, [topPatterns, draws.length]);
  
  // Determine direction arrows for each pattern
  const directions = useMemo(() => {
    const n = draws.length;
    const adaptiveThreshold = Math.max(0.01, 0.06 / Math.sqrt(n));
    
    return patternRegressions.map(reg => {
      if (reg.pValue < 0.1) {
        // Significant: use slope sign
        if (reg.slope > 0) return '↑';
        if (reg.slope < 0) return '↓';
        return '→';
      } else {
        // Not significant: use magnitude threshold
        if (Math.abs(reg.slope) >= adaptiveThreshold) {
          if (reg.slope > 0) return '↑';
          if (reg.slope < 0) return '↓';
        }
        return '→';
      }
    });
  }, [patternRegressions, draws.length]);
  
  // Generate dynamic explanatory sentence
  const explanationText = useMemo(() => {
    const n = draws.length;
    const upZones = zoneTrends.filter(t => t.direction === 'up').map(t => t.zoneIdx + 1);
    const downZones = zoneTrends.filter(t => t.direction === 'down').map(t => t.zoneIdx + 1);
    
    let text = `Analyzed ${n} draws. `;
    
    if (upZones.length > 0) {
      text += `Trending up: zones ${upZones.join(', ')}. `;
    }
    if (downZones.length > 0) {
      text += `Trending down: zones ${downZones.join(', ')}. `;
    }
    if (upZones.length === 0 && downZones.length === 0) {
      text += `No significant zone trends detected. `;
    }
    
    text += `Sum(mains) slope: ${sumMainsTrend.slope.toFixed(4)}, p-value: ${sumMainsTrend.pValue.toFixed(4)}.`;
    
    return text;
  }, [draws.length, zoneTrends, sumMainsTrend]);
  
  // Handler for copying JSON to clipboard
  const handleCopyJSON = () => {
    const data = {
      drawCount: draws.length,
      topPatterns: topPatterns.map((pattern, idx) => ({
        pattern: pattern.key,
        count: pattern.count,
        rSquared: patternRegressions[idx].rSquared,
        pValue: patternRegressions[idx].pValue,
        trend: directions[idx],
      })),
      zoneTrends: zoneTrends.map((trend, idx) => ({
        zone: idx + 1,
        range: `${ZONE_RANGES[idx][0]}-${ZONE_RANGES[idx][1]}`,
        slope: trend.slope,
        pValue: trend.pValue,
        direction: trend.direction,
      })),
      sumMainsTrend: {
        slope: sumMainsTrend.slope,
        pValue: sumMainsTrend.pValue,
      },
    };
    
    const jsonString = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(jsonString)
      .then(() => {
        showToast('Zone analysis copied to clipboard');
      })
      .catch(() => {
        showToast('Failed to copy to clipboard');
      });
  };
  
  return (
    <div style={{ padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Zone Pattern Analysis (ZPA)</h2>
        <button
          onClick={handleCopyJSON}
          style={{
            padding: '8px 16px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
          title="Copy zone analysis as JSON to clipboard"
        >
          Copy JSON
        </button>
      </div>
      
      {/* Top Patterns Table */}
      <div style={{ marginBottom: '2rem' }}>
        <h3>Top Zone Patterns (Mains)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.9rem',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <th
                  style={{ ...headerStyle, cursor: 'help' }}
                  title="Zones hit in this pattern (0-indexed)"
                >
                  Pattern
                </th>
                <th
                  style={{ ...headerStyle, cursor: 'help' }}
                  title="Number of draws where this exact 9-zone pattern occurred"
                >
                  Count
                </th>
                <th
                  style={{ ...headerStyle, cursor: 'help' }}
                  title="Coefficient of determination - how well the trend line fits the data (0-1)"
                >
                  R²
                </th>
                <th
                  style={{ ...headerStyle, cursor: 'help' }}
                  title="Statistical significance of the trend (lower = more significant)"
                >
                  p-value
                </th>
                <th
                  style={{ ...headerStyle, cursor: 'help' }}
                  title="Trend direction: ↑ increasing, ↓ decreasing, → flat/stable"
                >
                  Trend
                </th>
              </tr>
            </thead>
            <tbody>
              {topPatterns.map((pattern, idx) => (
                <tr key={pattern.key} style={{ borderBottom: '1px solid #ddd' }}>
                  <td
                    style={{ ...cellStyle, fontFamily: 'monospace' }}
                    title={`Zones: ${pattern.key
                      .split('-')
                      .map(z => getZoneLabel(parseInt(z)))
                      .join(', ')}`}
                  >
                    {pattern.key}
                  </td>
                  <td
                    style={{ ...cellStyle, textAlign: 'center' }}
                    title={`This pattern appeared in ${pattern.count} out of ${draws.length} draws (${((pattern.count / draws.length) * 100).toFixed(1)}%)`}
                  >
                    {pattern.count}
                  </td>
                  <td
                    style={{ ...cellStyle, textAlign: 'center' }}
                    title={`R² = ${patternRegressions[idx].rSquared.toFixed(4)}: ${getRSquaredDescription(patternRegressions[idx].rSquared)}`}
                  >
                    {patternRegressions[idx].rSquared.toFixed(3)}
                  </td>
                  <td
                    style={{ ...cellStyle, textAlign: 'center' }}
                    title={`p-value = ${patternRegressions[idx].pValue.toFixed(4)}: ${getPValueDescription(patternRegressions[idx].pValue)}`}
                  >
                    {patternRegressions[idx].pValue.toFixed(3)}
                  </td>
                  <td
                    style={{
                      ...cellStyle,
                      textAlign: 'center',
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      color: getDirectionColor(directions[idx]),
                    }}
                    title={getDirectionTooltip(
                      directions[idx],
                      patternRegressions[idx],
                      draws.length
                    )}
                  >
                    {directions[idx]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Per-Number Zone Heatmap */}
      <div style={{ marginBottom: '2rem' }}>
        <h3>Zone Membership Heatmap</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '0.5rem' }}>
          {ZONE_RANGES.map((range, zoneIdx) => {
            const [lo, hi] = range;
            const trend = zoneTrends[zoneIdx];
            const bgColor = getTrendColor(trend);
            
            return (
              <div
                key={zoneIdx}
                style={{
                  padding: '0.5rem',
                  backgroundColor: bgColor,
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  textAlign: 'center',
                }}
                title={`${getZoneLabel(zoneIdx)}: slope=${trend.slope.toFixed(4)}, p=${trend.pValue.toFixed(3)}, direction=${trend.direction}`}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  Zone {zoneIdx + 1}
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  {lo}-{hi}
                </div>
                <div style={{ fontSize: '1.2rem', marginTop: '0.25rem' }}>
                  {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Explanatory Text */}
      <div
        style={{
          padding: '1rem',
          backgroundColor: '#f9f9f9',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontSize: '0.95rem',
          lineHeight: '1.5',
        }}
      >
        {explanationText}
      </div>
    </div>
  );
}

// Styles
const headerStyle: React.CSSProperties = {
  padding: '0.75rem',
  textAlign: 'left',
  fontWeight: 'bold',
  borderBottom: '2px solid #333',
};

const cellStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
};

// Helper functions
function getRSquaredDescription(rSquared: number): string {
  if (rSquared >= 0.7) return 'Strong fit';
  if (rSquared >= 0.4) return 'Moderate fit';
  if (rSquared >= 0.2) return 'Weak fit';
  return 'Very weak fit';
}

function getPValueDescription(pValue: number): string {
  if (pValue < 0.01) return 'Highly significant';
  if (pValue < 0.05) return 'Significant';
  if (pValue < 0.1) return 'Marginally significant';
  return 'Not significant';
}

function getDirectionColor(direction: string): string {
  if (direction === '↑') return '#28a745'; // Green
  if (direction === '↓') return '#dc3545'; // Red
  return '#6c757d'; // Gray
}

function getDirectionTooltip(
  direction: string,
  regression: { slope: number; pValue: number },
  n: number
): string {
  const threshold = Math.max(0.01, 0.06 / Math.sqrt(n));
  
  if (regression.pValue < 0.1) {
    return `Significant trend (p<0.1): ${direction === '↑' ? 'increasing' : direction === '↓' ? 'decreasing' : 'stable'}`;
  } else if (Math.abs(regression.slope) >= threshold) {
    return `Magnitude-based: slope ${regression.slope.toFixed(4)} exceeds threshold ${threshold.toFixed(4)}`;
  } else {
    return `Flat: no significant trend (p=${regression.pValue.toFixed(3)}, slope=${regression.slope.toFixed(4)})`;
  }
}

function getTrendColor(trend: ZoneTrend): string {
  // Color based on direction and significance
  const alpha = trend.pValue < 0.1 ? 0.3 : 0.1; // More opaque if significant
  
  if (trend.direction === 'up') {
    return `rgba(40, 167, 69, ${alpha})`; // Green
  } else if (trend.direction === 'down') {
    return `rgba(220, 53, 69, ${alpha})`; // Red
  } else {
    return `rgba(108, 117, 125, ${alpha})`; // Gray
  }
}
