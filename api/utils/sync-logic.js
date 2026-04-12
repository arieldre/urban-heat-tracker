/**
 * Core sync logic — shared by cron and manual sync endpoints.
 * Fetches Google Ads assets, diffs against stored snapshots, updates KV.
 */
import { kvGet, kvSet } from './kv.js';
import {
  getAccessToken, gaQuery, CAMPAIGN_IDS, CAMPAIGN_LABELS,
  VIDEO_TYPES, TEXT_TYPES, detectOrientation, fetchYoutubeTitles,
} from './google.js';

/**
 * Run full sync for all campaigns. Returns summary.
 */
export async function runSync() {
  const token = await getAccessToken();

  // Date range: max(2026-03-01, today-45d) → yesterday
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const rolling = new Date(today);
  rolling.setDate(rolling.getDate() - 45);
  const earliest = new Date('2026-03-01');
  const from = (rolling > earliest ? rolling : earliest).toISOString().slice(0, 10);
  const to = yesterday.toISOString().slice(0, 10);

  console.log(`[sync] fetching ${from} → ${to}`);

  // Single GAQL query for all 4 campaigns
  const raw = await gaQuery(token, `
    SELECT
      campaign.id, campaign.name,
      asset.id, asset.name,
      asset.youtube_video_asset.youtube_video_id,
      asset.text_asset.text,
      ad_group_ad_asset_view.performance_label,
      ad_group_ad_asset_view.field_type,
      ad_group_ad_asset_view.enabled,
      segments.date,
      metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM ad_group_ad_asset_view
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.id IN (${CAMPAIGN_IDS.join(', ')})
      AND campaign.status = 'ENABLED'
  `);

  if (raw.error) throw new Error(raw.error.message || JSON.stringify(raw.error));
  const results = raw.results || [];
  console.log(`[sync] ${results.length} rows returned`);

  // Group by campaign
  const byCampaign = {};
  for (const id of CAMPAIGN_IDS) {
    byCampaign[id] = { videos: {}, texts: {} };
  }

  for (const r of results) {
    const campId = r.campaign?.id;
    if (!campId || !byCampaign[campId]) continue;

    const view = r.adGroupAdAssetView || {};
    const asset = r.asset || {};
    const fieldType = view.fieldType;
    const assetId = asset.id;
    if (!assetId || !fieldType) continue;

    const isVideo = VIDEO_TYPES.has(fieldType);
    const isText = TEXT_TYPES.has(fieldType);
    if (!isVideo && !isText) continue;

    const bucket = isVideo ? byCampaign[campId].videos : byCampaign[campId].texts;
    const key = `${assetId}_${fieldType}`;

    if (!bucket[key]) {
      bucket[key] = {
        id: assetId,
        key,
        youtubeId: asset.youtubeVideoAsset?.youtubeVideoId || null,
        name: asset.name || '',
        fieldType,
        orientation: null, // set after name is finalized
        text: asset.textAsset?.text || null,
        performanceLabel: 'UNSPECIFIED',
        spend: 0,
        conversions: 0,
        impressions: 0,
        clicks: 0,
        daily: {},
      };
    }

    const m = bucket[key];
    if (view.performanceLabel && view.performanceLabel !== 'UNSPECIFIED') {
      m.performanceLabel = view.performanceLabel;
    }

    const impressions = parseInt(r.metrics?.impressions || 0);
    const clicks = parseInt(r.metrics?.clicks || 0);
    const spend = (r.metrics?.costMicros || 0) / 1e6;
    const conversions = parseFloat(r.metrics?.conversions || 0);

    m.impressions += impressions;
    m.clicks += clicks;
    m.spend += spend;
    m.conversions += conversions;

    const date = r.segments?.date;
    if (date) {
      if (!m.daily[date]) m.daily[date] = { spend: 0, conversions: 0, impressions: 0, clicks: 0 };
      m.daily[date].spend += spend;
      m.daily[date].conversions += conversions;
      m.daily[date].impressions += impressions;
      m.daily[date].clicks += clicks;
    }
  }

  // Fetch YouTube titles for all videos
  const allYtIds = [];
  for (const camp of Object.values(byCampaign)) {
    for (const v of Object.values(camp.videos)) {
      if (v.youtubeId && !v.name) allYtIds.push(v.youtubeId);
    }
  }
  const ytTitles = await fetchYoutubeTitles(allYtIds);

  // Process each campaign
  const summary = { synced: 0, totalAdded: 0, totalRemoved: 0 };
  const now = new Date().toISOString();

  for (const campId of CAMPAIGN_IDS) {
    const camp = byCampaign[campId];

    // Staleness threshold: assets with no data in last 3 days are considered removed
    const STALE_DAYS = 3;
    const staleDate = new Date(yesterday);
    staleDate.setDate(staleDate.getDate() - STALE_DAYS);
    const staleCutoff = staleDate.toISOString().slice(0, 10);

    // Finalize & classify video assets
    const liveAssets = [];
    const autoHistory = [];

    for (const v of Object.values(camp.videos)) {
      if (!v.name && v.youtubeId && ytTitles[v.youtubeId]) {
        v.name = ytTitles[v.youtubeId];
      }
      v.orientation = detectOrientation(v.name, v.fieldType);
      v.spend = +v.spend.toFixed(2);
      v.conversions = +v.conversions.toFixed(2);
      v.cpa = v.conversions > 0 ? +(v.spend / v.conversions).toFixed(2) : null;
      v.ctr = v.impressions > 0 ? +((v.clicks / v.impressions) * 100).toFixed(3) : null;
      v.url = v.youtubeId ? `https://www.youtube.com/watch?v=${v.youtubeId}` : null;

      // Build daily array and find first/last active dates
      const dailyEntries = Object.entries(v.daily).sort(([a], [b]) => a.localeCompare(b));
      v.daily = dailyEntries.map(([date, d]) => ({
        date,
        spend: +d.spend.toFixed(2),
        conversions: +d.conversions.toFixed(2),
        impressions: d.impressions,
        clicks: d.clicks,
        cpa: d.conversions > 0 ? +(d.spend / d.conversions).toFixed(2) : null,
      }));

      v.firstSeenAt = dailyEntries[0]?.[0] || to;
      v.lastSeenAt = dailyEntries[dailyEntries.length - 1]?.[0] || to;

      // Classify: if last active date is before staleness cutoff → history
      if (v.lastSeenAt < staleCutoff) {
        autoHistory.push({
          id: v.id,
          key: v.key,
          youtubeId: v.youtubeId,
          name: v.name,
          orientation: v.orientation,
          url: v.url,
          removedAt: v.lastSeenAt,
          lastCpa: v.cpa,
          lastSpend: v.spend,
          lastConversions: v.conversions,
          lastPerformanceLabel: v.performanceLabel,
          reason: `No data since ${v.lastSeenAt}`,
          firstSeenAt: v.firstSeenAt,
        });
      } else {
        v.status = v.spend > 0 ? 'live' : 'pending';
        liveAssets.push(v);
      }
    }

    // Finalize & classify text assets (same staleness logic)
    const liveTexts = [];
    const historyTexts = [];

    for (const t of Object.values(camp.texts)) {
      t.spend = +t.spend.toFixed(2);
      t.conversions = +t.conversions.toFixed(2);

      const dailyEntries = Object.entries(t.daily).sort(([a], [b]) => a.localeCompare(b));
      t.daily = dailyEntries.map(([date, d]) => ({
        date,
        spend: +d.spend.toFixed(2),
        conversions: +d.conversions.toFixed(2),
        impressions: d.impressions,
        clicks: d.clicks,
      }));
      t.firstSeenAt = dailyEntries[0]?.[0] || to;
      t.lastSeenAt = dailyEntries[dailyEntries.length - 1]?.[0] || to;

      if (t.lastSeenAt < staleCutoff) {
        t.status = 'history';
        historyTexts.push(t);
      } else {
        t.status = 'live';
        liveTexts.push(t);
      }
    }

    // Merge with previous history (snapshot diff for assets that fully disappeared from API)
    const prevSnapshot = (await kvGet(`tracker/${campId}/snapshot.json`)) || [];
    const prevLive = (await kvGet(`tracker/${campId}/live.json`)) || { assets: [] };
    const prevHistory = (await kvGet(`tracker/${campId}/history.json`)) || [];

    const allCurrentKeys = new Set(Object.values(camp.videos).map(v => v.key));
    const prevKeys = new Set(prevSnapshot);

    // Assets in previous snapshot but completely gone from API
    const goneFromApi = [...prevKeys].filter(k => !allCurrentKeys.has(k));
    const apiRemovals = [];
    for (const rk of goneFromApi) {
      const prev = prevLive.assets?.find(a => a.key === rk);
      if (prev) {
        apiRemovals.push({
          id: prev.id,
          key: rk,
          youtubeId: prev.youtubeId,
          name: prev.name,
          orientation: prev.orientation,
          url: prev.url,
          removedAt: now.slice(0, 10),
          lastCpa: prev.cpa,
          lastSpend: prev.spend,
          lastConversions: prev.conversions,
          lastPerformanceLabel: prev.performanceLabel,
          reason: 'Removed from campaign',
          firstSeenAt: prev.firstSeenAt || now.slice(0, 10),
        });
      }
    }

    // Deduplicate: don't re-add assets already in history
    const existingHistoryKeys = new Set(prevHistory.map(h => h.key));
    const newEntries = [...autoHistory, ...apiRemovals].filter(h => !existingHistoryKeys.has(h.key));
    const mergedHistory = [...prevHistory, ...newEntries];

    // Write to KV
    const liveKeys = liveAssets.map(v => v.key);
    await Promise.all([
      kvSet(`tracker/${campId}/live.json`, {
        lastSyncedAt: now,
        campaignName: CAMPAIGN_LABELS[campId] || campId,
        assets: liveAssets,
      }),
      kvSet(`tracker/${campId}/history.json`, mergedHistory),
      kvSet(`tracker/${campId}/descriptions.json`, { live: liveTexts, history: historyTexts }),
      kvSet(`tracker/${campId}/snapshot.json`, liveKeys),
    ]);

    summary.synced++;
    summary.totalAdded += liveKeys.filter(k => !prevKeys.has(k)).length;
    summary.totalRemoved += newEntries.length;

    console.log(`[sync] ${CAMPAIGN_LABELS[campId]}: ${liveAssets.length} live, ${newEntries.length} → history, ${liveTexts.length} live texts, ${historyTexts.length} history texts`);
  }

  return { ok: true, ...summary, syncedAt: now };
}
