import { describe, it, expect } from 'vitest';
import { cpaTrend, spendVelocity, daysActive, dynamicCpaThresholds, splitWindow } from '../utils/trends.js';

const makeDays = (count, startDate = '2026-03-15') => {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), spend: 10, conversions: 5, impressions: 100, clicks: 10 };
  });
};

describe('splitWindow', () => {
  it('splits daily into recent and prior windows', () => {
    const daily = makeDays(14);
    const { recent, prior } = splitWindow(daily, 7);
    expect(recent).toHaveLength(7);
    expect(prior).toHaveLength(7);
  });

  it('handles short arrays', () => {
    const daily = makeDays(3);
    const { recent, prior } = splitWindow(daily, 7);
    expect(recent).toHaveLength(3);
    expect(prior).toHaveLength(0);
  });
});

describe('cpaTrend', () => {
  it('returns improving when CPA decreased >10%', () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-03-${10 + i}`, spend: 10, conversions: 5 })),  // prior: CPA = 2
      ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-03-${17 + i}`, spend: 5, conversions: 5 })),   // recent: CPA = 1
    ];
    const result = cpaTrend(daily);
    expect(result.direction).toBe('improving');
    expect(result.recentCpa).toBe(1);
    expect(result.priorCpa).toBe(2);
  });

  it('returns worsening when CPA increased >10%', () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-03-${10 + i}`, spend: 5, conversions: 5 })),   // prior: CPA = 1
      ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-03-${17 + i}`, spend: 10, conversions: 5 })),  // recent: CPA = 2
    ];
    const result = cpaTrend(daily);
    expect(result.direction).toBe('worsening');
  });

  it('returns flat when change <10%', () => {
    const daily = makeDays(14); // uniform CPA
    const result = cpaTrend(daily);
    expect(result.direction).toBe('flat');
  });

  it('returns new when no prior data', () => {
    const daily = makeDays(3);
    const result = cpaTrend(daily);
    expect(result.direction).toBe('new');
  });
});

describe('spendVelocity', () => {
  it('detects scaling when spend increased >25%', () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-03-${10 + i}`, spend: 5 })),  // prior: $35
      ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-03-${17 + i}`, spend: 15 })), // recent: $105
    ];
    const result = spendVelocity(daily);
    expect(result.direction).toBe('scaling');
  });

  it('detects throttled when spend decreased >25%', () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-03-${10 + i}`, spend: 15 })),
      ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-03-${17 + i}`, spend: 5 })),
    ];
    const result = spendVelocity(daily);
    expect(result.direction).toBe('throttled');
  });

  it('returns stable when change <25%', () => {
    const daily = makeDays(14);
    const result = spendVelocity(daily);
    expect(result.direction).toBe('stable');
  });
});

describe('daysActive', () => {
  it('calculates days between dates', () => {
    expect(daysActive('2026-03-01', '2026-03-10')).toBe(10);
  });

  it('returns 1 for same day', () => {
    expect(daysActive('2026-03-01', '2026-03-01')).toBe(1);
  });

  it('returns null for missing dates', () => {
    expect(daysActive(null, '2026-03-10')).toBeNull();
  });
});

describe('dynamicCpaThresholds', () => {
  it('computes thresholds from median', () => {
    const assets = [
      { cpa: 0.10, spend: 10 },
      { cpa: 0.20, spend: 10 },
      { cpa: 0.30, spend: 10 },
      { cpa: 0.40, spend: 10 },
      { cpa: 0.50, spend: 10 },
    ];
    const [good, mid] = dynamicCpaThresholds(assets);
    // median = 0.30
    expect(good).toBeCloseTo(0.24, 2); // 0.3 * 0.8
    expect(mid).toBeCloseTo(0.39, 2);  // 0.3 * 1.3
  });

  it('returns defaults for empty assets', () => {
    const [good, mid] = dynamicCpaThresholds([]);
    expect(good).toBe(0.35);
    expect(mid).toBe(0.65);
  });
});
