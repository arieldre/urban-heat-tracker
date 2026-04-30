import { kvGet, kvSet } from './kv.js';
import { fetchInvAds, fetchInvInsights, extractInvActions } from './invokers-facebook.js';
import { detectOrientation } from './google.js';
import { fetchInvAfEnrichment, hasAfCredentials } from './inv-af-mcp.js';

function deriveInvShortLabel(name = '') {
  // INV_FB_iOS_PH_All_MAI_Install_270426_New App → iOS PH MAI
  const parts = name.replace(/^INV_FB_/i, '').replace(/^INV_/i, '').split('_');
  const filtered = parts.filter(p => !/^\d{6}$/.test(p) && p !== 'All' && p !== 'Install');
  return filtered.slice(0, 3).join(' ').slice(0, 16) || name.slice(0, 16);
}

const STALE_DAYS = 3;

export async function runInvFBSync() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const earliest = new Date('2026-01-01');
  const rolling = new Date(today);
  rolling.setDate(rolling.getDate() - 14);
  const from = (rolling > earliest ? rolling : earliest).toISOString().slice(0, 10);
  const to = yesterday.toISOString().slice(0, 10);

  console.log(`[inv-fb-sync] fetching ${from} → ${to}`);

  const afPromise = hasAfCredentials()
    ? fetchInvAfEnrichment(from, to).catch(e => { console.warn('[inv-fb-sync] AF enrichment failed:', e.message); return new Map(); })
    : Promise.resolve(new Map());

  const [ads, insights, afEnrichment] = await Promise.all([
    fetchInvAds(),
    fetchInvInsights(from, to),
    afPromise,
  ]);

  console.log(`[inv-fb-sync] AF enrichment: ${afEnrichment.size} ad names matched`);

  console.log(`[inv-fb-sync] ${ads.length} ads, ${insights.length} insight rows`);

  const dailyMap = {};
  for (const row of insights) {
    const adId = row.ad_id;
    if (!adId) continue;
    if (!dailyMap[adId]) dailyMap[adId] = {};
    const date = row.date_start;
    const { purchases, installs } = extractInvActions(row.actions);
    dailyMap[adId][date] = {
      spend: parseFloat(row.spend || 0),
      impressions: parseInt(row.impressions || 0),
      clicks: parseInt(row.clicks || 0),
      purchases,
      installs,
    };
  }

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
      cpi: d.installs > 0 ? +(d.spend / d.installs).toFixed(4) : null,
    }));

    const af = afEnrichment.get(ad.name) || {};
    const afInstalls = af.afInstalls || null;
    const afCpi = afInstalls > 0 ? +(spend / afInstalls).toFixed(4) : null;

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
      afInstalls,
      afCpi,
      roas1: af.roas1 ? +af.roas1.toFixed(4) : null,
      roas7: af.roas7 ? +af.roas7.toFixed(4) : null,
      rev1: af.rev1 ? +af.rev1.toFixed(2) : null,
      rev7: af.rev7 ? +af.rev7.toFixed(2) : null,
      firstSeenAt,
      lastSeenAt,
      daily: dailyArray,
      network: 'facebook',
      game: 'invokers',
    };

    if (lastSeenAt < staleCutoff) {
      autoHistory.push({
        id: adId, key: adId, name: ad.name,
        campaignId: asset.campaignId, campaignName: asset.campaignName,
        thumbnailUrl: asset.thumbnailUrl, videoId: asset.videoId, orientation,
        removedAt: lastSeenAt, lastSeenAt, firstSeenAt,
        lastCpa: cpa, lastCpi: cpi, lastSpend: spend,
        lastPurchases: purchases, lastInstalls: installs,
        reason: `No data since ${lastSeenAt}`, network: 'facebook', game: 'invokers',
      });
    } else {
      liveAssets.push(asset);
    }
  }

  const prevSnapshot = (await kvGet('tracker/inv-fb/snapshot.json')) || [];
  const prevLive = (await kvGet('tracker/inv-fb/live.json')) || { assets: [] };
  const prevHistory = (await kvGet('tracker/inv-fb/history.json')) || [];

  const allCurrentIds = new Set(ads.map(a => a.id));
  const prevIds = new Set(prevSnapshot);
  const goneFromApi = [...prevIds].filter(id => !allCurrentIds.has(id));

  const apiRemovals = [];
  for (const id of goneFromApi) {
    const prev = prevLive.assets?.find(a => a.id === id);
    if (prev) {
      apiRemovals.push({
        id, key: id, name: prev.name,
        campaignId: prev.campaignId, campaignName: prev.campaignName,
        thumbnailUrl: prev.thumbnailUrl, videoId: prev.videoId, orientation: prev.orientation,
        removedAt: prev.lastSeenAt || now.slice(0, 10),
        lastSeenAt: prev.lastSeenAt || now.slice(0, 10),
        firstSeenAt: prev.firstSeenAt || now.slice(0, 10),
        lastCpa: prev.cpa, lastCpi: prev.cpi, lastSpend: prev.spend,
        lastPurchases: prev.purchases, lastInstalls: prev.installs,
        reason: 'Removed from campaign', network: 'facebook', game: 'invokers',
      });
    }
  }

  const existingHistoryKeys = new Set(prevHistory.map(h => h.key));
  const newEntries = [...autoHistory, ...apiRemovals].filter(h => !existingHistoryKeys.has(h.key));
  const mergedHistory = [...prevHistory, ...newEntries];

  const campaignMap = {};
  for (const asset of liveAssets) {
    const cid = asset.campaignId || 'unknown';
    if (!campaignMap[cid]) {
      campaignMap[cid] = { id: cid, name: asset.campaignName || cid, campaignStatus: asset.campaignStatus, hasActiveAd: false };
    }
    if (asset.status === 'ACTIVE') campaignMap[cid].hasActiveAd = true;
  }
  const campaigns = Object.values(campaignMap)
    .filter(c => c.campaignStatus === 'ACTIVE' || (c.campaignStatus == null && c.hasActiveAd))
    .map(c => ({ id: c.id, name: c.name, shortLabel: deriveInvShortLabel(c.name) }));

  const liveKeys = liveAssets.map(a => a.id);
  await Promise.all([
    kvSet('tracker/inv-fb/live.json', { lastSyncedAt: now, assets: liveAssets }),
    kvSet('tracker/inv-fb/history.json', mergedHistory),
    kvSet('tracker/inv-fb/snapshot.json', liveKeys),
    kvSet('tracker/inv-fb/campaigns.json', campaigns),
  ]);

  const added = liveKeys.filter(k => !prevIds.has(k)).length;
  console.log(`[inv-fb-sync] ${liveAssets.length} live, ${newEntries.length} → history, ${campaigns.length} campaigns`);
  return { ok: true, synced: campaigns.length, totalAdded: added, totalRemoved: newEntries.length, syncedAt: now };
}
