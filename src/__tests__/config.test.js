import { describe, it, expect } from 'vitest';
import { CAMPAIGNS } from '../config.js';

describe('config', () => {
  it('has exactly 4 campaigns', () => {
    expect(CAMPAIGNS).toHaveLength(4);
  });

  it('each campaign has required fields', () => {
    for (const c of CAMPAIGNS) {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.shortLabel).toBeTruthy();
      expect(c.market).toBeTruthy();
    }
  });

  it('campaign IDs are unique', () => {
    const ids = CAMPAIGNS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes expected campaigns', () => {
    const labels = CAMPAIGNS.map(c => c.shortLabel);
    expect(labels).toContain('Fast Prog');
    expect(labels).toContain('Battle Act');
    expect(labels).toContain('US GP');
    expect(labels).toContain('US iOS');
  });
});
