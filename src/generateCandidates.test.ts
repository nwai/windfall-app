import { generateCandidates } from './generateCandidates';
import { Draw, Knobs } from './types';

describe('Sum Range Filter', () => {
  const defaultKnobs: Knobs = {
    enableSDE1: false,
    enableHC3: false,
    enableOGA: false,
    enableGPWF: false,
    enableEntropy: false,
    enableHamming: false,
    enableJaccard: false,
    F: 0,
    M: 0,
    Q: 0,
    Y: 0,
    Historical_Weight: 0,
    gpwf_window_size: 0,
    gpwf_bias_factor: 0,
    gpwf_floor: 0,
    gpwf_scale_multiplier: 0,
    lambda: 0,
    octagonal_top: 0,
    exact_set_override: false,
    hamming_relax: false,
    gpwf_targeted_mode: false,
  };

  const history: Draw[] = [];
  const setTrace = jest.fn();

  it('should not filter when sumFilter is disabled', () => {
    const result = generateCandidates(
      10,
      history,
      defaultKnobs,
      setTrace,
      [],
      [],
      false,
      0,
      [],
      [],
      0,
      0,
      0,
      0,
      undefined,
      0,
      0,
      0,
      0,
      undefined,
      undefined,
      { enabled: false, min: 0, max: 100, includeSupp: true }
    );

    expect(result.rejectionStats.sumRange).toBe(0);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('should filter candidates outside sum range (main only)', () => {
    const result = generateCandidates(
      100,
      history,
      defaultKnobs,
      setTrace,
      [],
      [],
      false,
      0,
      [],
      [],
      0,
      0,
      0,
      0,
      undefined,
      0,
      0,
      0,
      0,
      undefined,
      undefined,
      { enabled: true, min: 120, max: 150, includeSupp: false }
    );

    // Check that all accepted candidates have sums within range
    result.candidates.forEach(candidate => {
      const sum = candidate.main.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThanOrEqual(120);
      expect(sum).toBeLessThanOrEqual(150);
    });

    expect(result.rejectionStats.sumRange).toBeGreaterThan(0);
  });

  it('should filter candidates outside sum range (main + supp)', () => {
    const result = generateCandidates(
      100,
      history,
      defaultKnobs,
      setTrace,
      [],
      [],
      false,
      0,
      [],
      [],
      0,
      0,
      0,
      0,
      undefined,
      0,
      0,
      0,
      0,
      undefined,
      undefined,
      { enabled: true, min: 150, max: 200, includeSupp: true }
    );

    // Check that all accepted candidates have sums within range
    result.candidates.forEach(candidate => {
      const sum = candidate.main.reduce((a, b) => a + b, 0) + 
                   candidate.supp.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThanOrEqual(150);
      expect(sum).toBeLessThanOrEqual(200);
    });

    expect(result.rejectionStats.sumRange).toBeGreaterThan(0);
  });

  it('should be backward compatible when sumFilter is not provided', () => {
    const result = generateCandidates(
      10,
      history,
      defaultKnobs,
      setTrace,
      [],
      [],
      false,
      0,
      [],
      [],
      0,
      0,
      0,
      0
    );

    expect(result.rejectionStats.sumRange).toBe(0);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('should use default values when sumFilter is undefined', () => {
    const result = generateCandidates(
      10,
      history,
      defaultKnobs,
      setTrace,
      [],
      [],
      false,
      0,
      [],
      [],
      0,
      0,
      0,
      0,
      undefined,
      0,
      0,
      0,
      0,
      undefined,
      undefined,
      undefined
    );

    expect(result.rejectionStats.sumRange).toBe(0);
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});
