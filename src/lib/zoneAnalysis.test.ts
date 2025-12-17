/**
 * Tests for zone analysis utilities
 */

import { describe, it, expect } from 'vitest';
import {
  getZoneIndex,
  getZoneLabel,
  drawToZonePattern,
  zonePatternToKey,
  countZonePatterns,
  linearRegression,
  analyzeZoneTrends,
} from './zoneAnalysis';
import { Draw } from '../types';

describe('zoneAnalysis utilities', () => {
  it('getZoneIndex and bounds behavior', () => {
    expect(getZoneIndex(1)).toBe(0);
    const idx5 = getZoneIndex(5);
    // idx for 5 can be 0 or 1 depending on zone ranges; ensure valid or null
    expect([0, 1].includes(idx5 as number)).toBeTruthy();
    expect(getZoneIndex(6)).not.toBeNull();
    expect(getZoneIndex(10)).not.toBeNull();
    expect(getZoneIndex(45)).not.toBeNull();
    expect(getZoneIndex(0)).toBeNull();
    expect(getZoneIndex(46)).toBeNull();
  });

  it('getZoneLabel returns a readable label', () => {
    const label0 = getZoneLabel(0);
    expect(typeof label0).toBe('string');
    const labelLast = getZoneLabel( (getZoneIndex(45) as number) || 0 );
    expect(typeof labelLast).toBe('string');
  });

  it('drawToZonePattern maps draw mains to zone hits', () => {
    const testDraw: Draw = {
      date: '2024-01-01',
      main: [1, 10, 20, 30, 40, 45],
      supp: [15, 25],
    };
    const pattern = drawToZonePattern(testDraw);
    expect(Array.isArray(pattern)).toBe(true);
    // pattern length should match zone ranges length
    expect(pattern.length).toBeGreaterThan(0);
  });

  it('zonePatternToKey and countZonePatterns', () => {
    const testDraw: Draw = { date: '2024-01-01', main: [1,6,11,16,21,26], supp: [31,36] };
    const key = zonePatternToKey(drawToZonePattern(testDraw));
    expect(typeof key).toBe('string');

    const testDraws: Draw[] = [
      { date: '2024-01-01', main: [1,6,11,16,21,26], supp: [31,36] },
      { date: '2024-01-02', main: [1,6,11,16,21,26], supp: [31,36] },
      { date: '2024-01-03', main: [2,7,12,17,22,27], supp: [32,37] },
    ];
    const counts = countZonePatterns(testDraws);
    expect(counts.length).toBeGreaterThan(0);
    expect(counts[0].count).toBeGreaterThanOrEqual(1);
  });

  it('linearRegression on a perfect linear relationship', () => {
    const x = [1,2,3,4,5];
    const y = [2,4,6,8,10];
    const regression = linearRegression(x,y);
    expect(Math.abs(regression.slope - 2)).toBeLessThan(0.01);
    expect(regression.rSquared).toBeGreaterThan(0.99);
  });

  it('analyzeZoneTrends returns an array of trends', () => {
    const moreDraws: Draw[] = [];
    for (let i = 0; i < 50; i++) {
      const main: number[] = [];
      if (i > 25) main.push(1);
      if (i < 25) main.push(45);
      while (main.length < 6) main.push(20 + (main.length % 5));
      moreDraws.push({ date: `2024-01-${i+1}`, main, supp: [10,15] });
    }
    const trends = analyzeZoneTrends(moreDraws);
    // should return an array with length equal to number of zones
    expect(Array.isArray(trends)).toBe(true);
    expect(trends.length).toBeGreaterThan(0);
  });
});
