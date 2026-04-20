/**
 * Core FB sync logic — mirrors sync-logic.js patterns for Google Ads.
 * Fetches Facebook ad creatives + daily insights, diffs against stored
 * snapshots, and writes live/history to KV (both global + per-campaign).
 */
import { kvGet, kvSet } from './kv.js';
import { fetchAds, fetchInsights, extractActions } from './facebook.js';
import { detectOrientation } from './google.js';

function deriveFBShortLabel(name = '') {
  const parts = name.replace(/^UH_FB_/i, '').replace(/^UH_/i, '').split('_');
  const filtered = parts.filter(p => !/^\d{6}$/.test(p));
  return filtered.slice(0, 3).join(' ').slice(0, 14) || name.slice(0, 14);
}

const STALE_DAYS = 3;

export async function runFBSync() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const earliest = new Date('2026-03-01');
  const rolling = new Date(today);
  rolling.setDate(rolling.getDate() - 45);
  const from = (rolling > earliest ? rolling : earliest).toISOString().slice(0, 10);
  const to = yesterday.toISOString().slice(0, 10);

  console.log(`[fb-sync] fetching ${from} → ${to}`);

  // Fetch ads metadata + daily insights in parallel
  const [ads, insights] = await Promise.all([
    fetchAds(),
    fetchInsights(from, to),
  ]);

  console.log(`[fb-sync] ${ads.length} ads, ${insights.length} insight rows`);

  // Build daily metrics map: adId → { date → { spend, impressions, clicks, purchases, installs } }
  const dailyMap = {};
  for (const row of insights) {
    const adId = row.ad_id;
    if (!adId) continue;
    if (!dailyMap[adId]) dailyMap[adId] = {};

    const date = row.date_start;
    const { purchases, installs } = extractActions(row.actions);
    dailyMap[adId][date] = {
      spend: parseFloat(row.spend || 0),
      impressions: parseInt(row.impressions || 0),
      clicks: parseInt(row.clicks || 0),
      purchases,
      installs,
    };
  }

  // Staleness cutoff
  const staleDate = new Date(yesterday);
  staleDate.setDate(staleDate.getDate() - STALE_DAYS);
  const staleCutoff = staleDate.toISOString().slice(0, 10);

  const now = new Date().toISOString();
  const liveAssets = [];
  const autoHistory = [];

  for (const ad of ads) {
    const adId = ad.id;
    const daily = dailyMap[adId] || {};
    const dailyEntries = Object.entries(daily).sort(([a], [b]) => a.localeCompare(b));

    // Aggregate totals
    let spend = 0, impressions = 0, clicks = 0, purchases = 0, installs = 0;
    for (const [, d] of dailyEntries) {
      spend += d.spend;
      impressions += d.impressions;
      clicks += d.clicks;
      purchases += d.purchases;
      installs += d.installs;
    }

    spend = +spend.toFixed(2);
    purchases = +purchases.toFixed(2);
    installs = +installs.toFixed(2);
    const cpa = purchases > 0 ? +(spend / purchases).toFixed(4) : null;
    const cpi = installs > 0 ? +(spend / installs).toFixed(4) : null;
    const ctr = impressions > 0 ? +((clicks / impressions) * 100).toFixed(3) : null;

    const firstSeenAt = dailyEntries[0]?.[0] || to;
    const lastSeenAt = dailyEntries[dailyEntries.length - 1]?.[0] || to;

    const creative = ad.creative || {};
    const orientation = detectOrientation(ad.name, null);

    const dailyArray = dailyEntries.map(([date, d]) => ({
      date,
      spend: +d.spend.toFixed(2),
      impressions: d.impressions,
      clicks: d.clicks,
      purchases: +d.purchases.toFixed(2),
      installs: +d.installs.toFixed(2),
      cpa: d.purchases > 0 ? +(d.spend / d.purchases).toFixed(4) : null,
    }));

    const asset = {
      id: adId,
      key: adId,
      name: ad.name,
      status: ad.effective_status || ad.status,
      campaignId: ad.campaign?.id || null,
      campaignName: ad.campaign?.name || null,
      campaignStatus: ad.campaign?.status || null,
      creativeId: creative.id || null,
      thumbnailUrl: creative.thumbnail_url || null,
      videoId: creative.video_id || null,
      orientation,
      spend,
      impressions,
      clicks,
      purchases,
      installs,
      cpa,
      cpi,
      ctr,
      firstSeenAt,
      lastSeenAt,
      daily: dailyArray,
      network: 'facebook',
    };

    if (lastSeenAt < staleCutoff) {
      autoHistory.push({
        id: adId,
        key: adId,
        name: ad.name,
        campaignId: asset.campaignId,
        campaignName: asset.campaignName,
        thumbnailUrl: asset.thumbnailUrl,
        videoId: asset.videoId,
        orientation,
        removedAt: lastSeenAt,
        lastSeenAt,
        firstSeenAt,
        lastCpa: cpa,
        lastCpi: cpi,
        lastSpend: spend,
        lastPurchases: purchases,
        lastInstalls: installs,
        reason: `No data since ${lastSeenAt}`,
        network: 'facebook',
      });
    } else {
      liveAssets.push(asset);
    }
  }

  // Snapshot diff: detect ads completely gone from API
  const prevSnapshot = (await kvGet('tracker/fb/snapshot.json')) || [];
  const prevLive = (await kvGet('tracker/fb/live.json')) || { assets: [] };
  const prevHistory = (await kvGet('tracker/fb/history.json')) || [];

  const allCurrentIds = new Set(ads.map(a => a.id));
  const prevIds = new Set(prevSnapshot);
  const goneFromApi = [...prevIds].filter(id => !allCurrentIds.has(id));

  const apiRemovals = [];
  for (const id of goneFromApi) {
    const prev = prevLive.assets?.find(a => a.id === id);
    if (prev) {
      apiRemovals.push({
        id,
        key: id,
        name: prev.name,
        campaignId: prev.campaignId,
        campaignName: prev.campaignName,
        thumbnailUrl: prev.thumbnailUrl,
        videoId: prev.videoId,
        orientation: prev.orientation,
        removedAt: prev.lastSeenAt || now.slice(0, 10),
        lastSeenAt: prev.lastSeenAt || now.slice(0, 10),
        firstSeenAt: prev.firstSeenAt || now.slice(0, 10),
        lastCpa: prev.cpa,
        lastCpi: prev.cpi,
        lastSpend: prev.spend,
        lastPurchases: prev.purchases,
        lastInstalls: prev.installs,
        reason: 'Removed from campaign',
        network: 'facebook',
      });
    }
  }

  // Deduplicate history
  const existingHistoryKeys = new Set(prevHistory.map(h => h.key));
  const newEntries = [...autoHistory, ...apiRemovals].filter(h => !existingHistoryKeys.has(h.key));
  const mergedHistory = [...prevHistory, ...newEntries];

  // Build campaign list — only campaigns where campaign itself is ACTIVE
  const campaignMap = {};
  for (const asset of liveAssets) {
    const cid = asset.campaignId || 'unknown';
    if (!campaignMap[cid]) {
      campaignMap[cid] = {
        id: cid,
        name: asset.campaignName || cid,
        campaignStatus: asset.campaignStatus,
      };
    }
  }
  const campaigns = Object.values(campaignMap)
    .filter(c => c.campaignStatus === 'ACTIVE')
    .map(c => ({ id: c.id, name: c.name, shortLabel: deriveFBShortLabel(c.name) }));

  const liveKeys = liveAssets.map(a => a.id);
  await Promise.all([
    kvSet('tracker/fb/live.json', { lastSyncedAt: now, assets: liveAssets }),
    kvSet('tracker/fb/history.json', mergedHistory),
    kvSet('tracker/fb/snapshot.json', liveKeys),
    kvSet('tracker/fb/campaigns.json', campaigns),
  ]);

  const added = liveKeys.filter(k => !prevIds.has(k)).length;
  console.log(`[fb-sync] ${liveAssets.length} live, ${newEntries.length} → history, ${campaigns.length} campaigns`);

  return { ok: true, synced: campaigns.length, totalAdded: added, totalRemoved: newEntries.length, syncedAt: now };
}
