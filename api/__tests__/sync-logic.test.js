import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock KV
const kvStore = {};
vi.mock('../utils/kv.js', () => ({
  kvGet: vi.fn(async (key) => kvStore[key] || null),
  kvSet: vi.fn(async (key, value) => { kvStore[key] = value; }),
}));

// Use dates relative to "now" so staleness logic works correctly
const today = new Date();
const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
const recentDate = yesterday.toISOString().slice(0, 10);
const recentDate2 = twoDaysAgo.toISOString().slice(0, 10);
const staleDate = '2026-03-05'; // clearly stale — weeks ago

// Mock Google API
vi.mock('../utils/google.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAccessToken: vi.fn(async () => 'mock-token'),
    gaQuery: vi.fn(async () => ({
      results: [
        // Campaign 1 - video asset (recent — should be live)
        {
          campaign: { id: '22784768376', name: 'H48fastprogression' },
          asset: { id: '100', name: 'TestVideo', youtubeVideoAsset: { youtubeVideoId: 'abc123' } },
          adGroupAdAssetView: { fieldType: 'YOUTUBE_VIDEO', performanceLabel: 'GOOD', enabled: true },
          segments: { date: recentDate2 },
          metrics: { impressions: '1000', clicks: '50', costMicros: '500000', conversions: '10' },
        },
        // Campaign 1 - same asset another day
        {
          campaign: { id: '22784768376', name: 'H48fastprogression' },
          asset: { id: '100', name: 'TestVideo', youtubeVideoAsset: { youtubeVideoId: 'abc123' } },
          adGroupAdAssetView: { fieldType: 'YOUTUBE_VIDEO', performanceLabel: 'GOOD', enabled: true },
          segments: { date: recentDate },
          metrics: { impressions: '2000', clicks: '100', costMicros: '800000', conversions: '15' },
        },
        // Campaign 1 - STALE video asset (last data weeks ago — should go to history)
        {
          campaign: { id: '22784768376', name: 'H48fastprogression' },
          asset: { id: '150', name: 'StaleVideo', youtubeVideoAsset: { youtubeVideoId: 'stale999' } },
          adGroupAdAssetView: { fieldType: 'YOUTUBE_VIDEO', performanceLabel: 'LOW', enabled: true },
          segments: { date: staleDate },
          metrics: { impressions: '200', clicks: '5', costMicros: '100000', conversions: '1' },
        },
        // Campaign 1 - text asset
        {
          campaign: { id: '22784768376', name: 'H48fastprogression' },
          asset: { id: '200', name: '', textAsset: { text: 'Fight like a boss' } },
          adGroupAdAssetView: { fieldType: 'HEADLINE', performanceLabel: 'BEST', enabled: true },
          segments: { date: recentDate },
          metrics: { impressions: '5000', clicks: '200', costMicros: '1000000', conversions: '30' },
        },
        // Campaign 2 - video (recent)
        {
          campaign: { id: '22879160345', name: 'H48battleactivitygrows' },
          asset: { id: '300', name: 'BattleVideo', youtubeVideoAsset: { youtubeVideoId: 'def456' } },
          adGroupAdAssetView: { fieldType: 'PORTRAIT_YOUTUBE_VIDEO', performanceLabel: 'LOW', enabled: true },
          segments: { date: recentDate },
          metrics: { impressions: '500', clicks: '10', costMicros: '300000', conversions: '2' },
        },
      ],
    })),
    fetchYoutubeTitles: vi.fn(async () => ({})),
  };
});

describe('sync-logic', () => {
  beforeEach(() => {
    Object.keys(kvStore).forEach(k => delete kvStore[k]);
  });

  it('syncs all 4 campaigns and returns summary', async () => {
    const { runSync } = await import('../utils/sync-logic.js');
    const result = await runSync();

    expect(result.ok).toBe(true);
    expect(result.synced).toBe(4);
    expect(result.totalAdded).toBeGreaterThan(0);
    expect(result.syncedAt).toBeTruthy();
  });

  it('stores live assets in KV with correct structure', async () => {
    const { runSync } = await import('../utils/sync-logic.js');
    await runSync();

    const live = kvStore['tracker/22784768376/live.json'];
    expect(live).toBeTruthy();
    expect(live.lastSyncedAt).toBeTruthy();
    expect(live.campaignName).toBe('H48fastprogression');
    expect(Array.isArray(live.assets)).toBe(true);
  });

  it('correctly aggregates metrics across days', async () => {
    const { runSync } = await import('../utils/sync-logic.js');
    await runSync();

    const live = kvStore['tracker/22784768376/live.json'];
    const video = live.assets.find(a => a.youtubeId === 'abc123');
    expect(video).toBeTruthy();
    // 500000 + 800000 micros = 1.3
    expect(video.spend).toBe(1.3);
    // 10 + 15 = 25
    expect(video.conversions).toBe(25);
    // 1.3 / 25 = 0.052
    expect(video.cpa).toBe(0.052);
    expect(video.impressions).toBe(3000);
    expect(video.clicks).toBe(150);
  });

  it('builds daily breakdown array', async () => {
    const { runSync } = await import('../utils/sync-logic.js');
    await runSync();

    const live = kvStore['tracker/22784768376/live.json'];
    const video = live.assets.find(a => a.youtubeId === 'abc123');
    expect(video.daily).toHaveLength(2);
    expect(video.daily[0].date).toBe(recentDate2);
    expect(video.daily[1].date).toBe(recentDate);
  });

  it('moves stale assets to history automatically', async () => {
    const { runSync } = await import('../utils/sync-logic.js');
    await runSync();

    // Stale video should NOT be in live
    const live = kvStore['tracker/22784768376/live.json'];
    const staleInLive = live.assets.find(a => a.youtubeId === 'stale999');
    expect(staleInLive).toBeUndefined();

    // Stale video SHOULD be in history
    const history = kvStore['tracker/22784768376/history.json'];
    const staleInHistory = history.find(h => h.youtubeId === 'stale999');
    expect(staleInHistory).toBeTruthy();
    expect(staleInHistory.removedAt).toBe(staleDate);
    expect(staleInHistory.reason).toContain('No data since');
  });

  it('sets correct orientation for portrait videos', async () => {
    const { runSync } = await import('../utils/sync-logic.js');
    await runSync();

    const live = kvStore['tracker/22879160345/live.json'];
    const portrait = live.assets.find(a => a.youtubeId === 'def456');
    expect(portrait.orientation).toBe('9x16');
  });

  it('stores text assets as descriptions', async () => {
    const { runSync } = await import('../utils/sync-logic.js');
    await runSync();

    const descs = kvStore['tracker/22784768376/descriptions.json'];
    expect(descs).toBeTruthy();
    expect(Array.isArray(descs.live)).toBe(true);
    expect(Array.isArray(descs.history)).toBe(true);
    const headline = descs.live.find(d => d.text === 'Fight like a boss');
    expect(headline).toBeTruthy();
    expect(headline.performanceLabel).toBe('BEST');
  });

  it('stores snapshot for future diffing', async () => {
    const { runSync } = await import('../utils/sync-logic.js');
    await runSync();

    const snapshot = kvStore['tracker/22784768376/snapshot.json'];
    expect(Array.isArray(snapshot)).toBe(true);
    expect(snapshot.length).toBeGreaterThan(0);
  });

  it('detects fully removed assets on second sync', async () => {
    const { runSync } = await import('../utils/sync-logic.js');

    // First sync seeds data
    await runSync();

    // Second sync: campaign 2 video completely gone from API
    const { gaQuery } = await import('../utils/google.js');
    gaQuery.mockResolvedValueOnce({
      results: [
        {
          campaign: { id: '22784768376', name: 'H48fastprogression' },
          asset: { id: '100', name: 'TestVideo', youtubeVideoAsset: { youtubeVideoId: 'abc123' } },
          adGroupAdAssetView: { fieldType: 'YOUTUBE_VIDEO', performanceLabel: 'GOOD', enabled: true },
          segments: { date: recentDate },
          metrics: { impressions: '1000', clicks: '50', costMicros: '500000', conversions: '10' },
        },
      ],
    });

    const result2 = await runSync();
    expect(result2.totalRemoved).toBeGreaterThan(0);

    const history = kvStore['tracker/22879160345/history.json'];
    expect(history.length).toBeGreaterThan(0);
    const removed = history.find(h => h.youtubeId === 'def456');
    expect(removed).toBeTruthy();
    expect(removed.reason).toBe('Removed from campaign');
  });

  it('sets status=pending for zero-spend assets', async () => {
    const { gaQuery } = await import('../utils/google.js');
    gaQuery.mockResolvedValueOnce({
      results: [
        {
          campaign: { id: '22784768376', name: 'H48fastprogression' },
          asset: { id: '999', name: 'NewVideo', youtubeVideoAsset: { youtubeVideoId: 'new123' } },
          adGroupAdAssetView: { fieldType: 'YOUTUBE_VIDEO', performanceLabel: 'UNSPECIFIED', enabled: true },
          segments: { date: recentDate },
          metrics: { impressions: '0', clicks: '0', costMicros: '0', conversions: '0' },
        },
      ],
    });

    const { runSync } = await import('../utils/sync-logic.js');
    await runSync();

    const live = kvStore['tracker/22784768376/live.json'];
    const pending = live.assets.find(a => a.youtubeId === 'new123');
    expect(pending.status).toBe('pending');
    expect(pending.cpa).toBeNull();
  });
});
