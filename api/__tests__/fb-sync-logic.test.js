import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock KV
const kvStore = {};
vi.mock('../utils/kv.js', () => ({
  kvGet: vi.fn(async (key) => kvStore[key] || null),
  kvSet: vi.fn(async (key, value) => { kvStore[key] = value; }),
}));

const today = new Date();
const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
const recentDate = yesterday.toISOString().slice(0, 10);
const staleDate = '2026-03-05';

vi.mock('../utils/facebook.js', () => ({
  hasCredentials: vi.fn(() => true),
  FB_AD_ACCOUNT_ID: 'act_816445786671331',
  fetchAds: vi.fn(async () => [
    {
      id: 'ad_001',
      name: 'UH_UA_TestCreative_1080x1920_VD-ABC001',
      status: 'ACTIVE',
      campaign: { id: 'camp_001', name: 'UH_FB_GP_US_All_AEO_Purchase_160226' },
      creative: { id: 'cr_001', thumbnail_url: 'https://example.com/thumb1.jpg', video_id: 'vid_001' },
    },
    {
      id: 'ad_002',
      name: 'UH_UA_StaleCreative_1080x1080_VD-ABC002',
      status: 'ACTIVE',
      campaign: { id: 'camp_001', name: 'UH_FB_GP_US_All_AEO_Purchase_160226' },
      creative: { id: 'cr_002', thumbnail_url: 'https://example.com/thumb2.jpg', video_id: null },
    },
  ]),
  fetchInsights: vi.fn(async () => [
    // Recent ad — should be live
    {
      ad_id: 'ad_001',
      date_start: recentDate,
      spend: '500',
      impressions: '10000',
      clicks: '200',
      actions: [
        { action_type: 'omni_purchase', value: '15' },
        { action_type: 'mobile_app_install', value: '80' },
      ],
    },
    // Stale ad — should go to history
    {
      ad_id: 'ad_002',
      date_start: staleDate,
      spend: '100',
      impressions: '2000',
      clicks: '40',
      actions: [
        { action_type: 'omni_purchase', value: '3' },
        { action_type: 'mobile_app_install', value: '20' },
      ],
    },
  ]),
  extractActions: (actions = []) => {
    const map = {};
    for (const a of actions) map[a.action_type] = parseFloat(a.value || 0);
    return {
      purchases: map['omni_purchase'] || map['purchase'] || 0,
      installs: map['mobile_app_install'] || 0,
    };
  },
}));

describe('fb-sync-logic', () => {
  beforeEach(() => {
    Object.keys(kvStore).forEach(k => delete kvStore[k]);
    vi.clearAllMocks();
  });

  it('runs sync and returns ok summary', async () => {
    const { runFBSync } = await import('../utils/fb-sync-logic.js');
    const result = await runFBSync();
    expect(result.ok).toBe(true);
    expect(result.synced).toBe(1);
  });

  it('stores live assets in KV', async () => {
    const { runFBSync } = await import('../utils/fb-sync-logic.js');
    await runFBSync();

    const live = kvStore['tracker/fb/live.json'];
    expect(live).toBeTruthy();
    expect(live.lastSyncedAt).toBeTruthy();
    expect(Array.isArray(live.assets)).toBe(true);
  });

  it('moves stale ad to history with correct removedAt', async () => {
    const { runFBSync } = await import('../utils/fb-sync-logic.js');
    await runFBSync();

    const live = kvStore['tracker/fb/live.json'];
    const staleInLive = live.assets.find(a => a.id === 'ad_002');
    expect(staleInLive).toBeUndefined();

    const history = kvStore['tracker/fb/history.json'];
    const staleInHistory = history.find(h => h.id === 'ad_002');
    expect(staleInHistory).toBeTruthy();
    expect(staleInHistory.removedAt).toBe(staleDate);
    expect(staleInHistory.reason).toContain('No data since');
  });

  it('computes purchases + installs correctly', async () => {
    const { runFBSync } = await import('../utils/fb-sync-logic.js');
    await runFBSync();

    const live = kvStore['tracker/fb/live.json'];
    const ad = live.assets.find(a => a.id === 'ad_001');
    expect(ad).toBeTruthy();
    expect(ad.purchases).toBe(15);
    expect(ad.installs).toBe(80);
    expect(ad.spend).toBe(500);
    expect(ad.cpa).toBe(+(500 / 15).toFixed(4));
  });

  it('api removal uses lastSeenAt not today', async () => {
    const { runFBSync } = await import('../utils/fb-sync-logic.js');

    // First sync: seed ad_001 in live
    await runFBSync();

    // Second sync: ad_001 gone from API
    const { fetchAds, fetchInsights } = await import('../utils/facebook.js');
    fetchAds.mockResolvedValueOnce([]); // no ads returned
    fetchInsights.mockResolvedValueOnce([]);

    await runFBSync();

    const history = kvStore['tracker/fb/history.json'];
    const removed = history.find(h => h.id === 'ad_001');
    expect(removed).toBeTruthy();
    expect(removed.reason).toBe('Removed from campaign');
    expect(removed.removedAt).toBe(recentDate);
    expect(removed.lastSeenAt).toBe(recentDate);
    const todayStr = new Date().toISOString().slice(0, 10);
    expect(removed.removedAt).not.toBe(todayStr);
  });

  it('stores snapshot for future diffing', async () => {
    const { runFBSync } = await import('../utils/fb-sync-logic.js');
    await runFBSync();

    const snapshot = kvStore['tracker/fb/snapshot.json'];
    expect(Array.isArray(snapshot)).toBe(true);
    expect(snapshot.length).toBeGreaterThan(0);
  });

  it('sets correct orientation from ad name', async () => {
    const { runFBSync } = await import('../utils/fb-sync-logic.js');
    await runFBSync();

    const live = kvStore['tracker/fb/live.json'];
    const portrait = live.assets.find(a => a.id === 'ad_001');
    // 1080x1920 in name → 9x16
    expect(portrait.orientation).toBe('9x16');
  });
});
