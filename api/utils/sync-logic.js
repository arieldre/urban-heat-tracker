/**
 * Core sync logic — shared by cron and manual sync endpoints.
 * Fetches Google Ads assets, diffs against stored snapshots, updates KV.
 */
import { kvGet, kvSet } from './kv.js';
import {
  getAccessToken, gaQuery, CAMPAIGN_IDS, CAMPAIGN_LABELS,
  VIDEO_TYPES, TEXT_TYPES, orientationFromFieldType, fetchYoutubeTitles,
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
        orientation: isVideo ? orientationFromFieldType(fieldType) : null,
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

    // Finalize video assets
    const videoAssets = Object.values(camp.videos).map(v => {
      if (!v.name && v.youtubeId && ytTitles[v.youtubeId]) {
        v.name = ytTitles[v.youtubeId];
      }
      v.spend = +v.spend.toFixed(2);
      v.conversions = +v.conversions.toFixed(2);
      v.cpa = v.conversions > 0 ? +(v.spend / v.conversions).toFixed(2) : null;
      v.ctr = v.impressions > 0 ? +((v.clicks / v.impressions) * 100).toFixed(3) : null;
      v.status = v.spend > 0 ? 'live' : 'pending';
      v.url = v.youtubeId ? `https://www.youtube.com/watch?v=${v.youtubeId}` : null;
      // Build daily array
      v.daily = Object.entries(v.daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({
          date,
          spend: +d.spend.toFixed(2),
          conversions: +d.conversions.toFixed(2),
          impressions: d.impressions,
          clicks: d.clicks,
          cpa: d.conversions > 0 ? +(d.spend / d.conversions).toFixed(2) : null,
        }));
      return v;
    });

    // Finalize text assets
    const textAssets = Object.values(camp.texts).map(t => {
      t.spend = +t.spend.toFixed(2);
      t.conversions = +t.conversions.toFixed(2);
      return t;
    });

    // Diff against previous snapshot
    const prevSnapshot = (await kvGet(`tracker/${campId}/snapshot.json`)) || [];
    const prevLive = (await kvGet(`tracker/${campId}/live.json`)) || { assets: [] };
    const prevHistory = (await kvGet(`tracker/${campId}/history.json`)) || [];

    const prevKeys = new Set(prevSnapshot);
    const currentKeys = new Set(videoAssets.map(v => v.key));

    // Find removed assets
    const removedKeys = [...prevKeys].filter(k => !currentKeys.has(k));
    const newHistory = [...prevHistory];

    for (const rk of removedKeys) {
      const prev = prevLive.assets?.find(a => a.key === rk);
      if (prev) {
        newHistory.push({
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
          reason: 'Removed by Google',
          firstSeenAt: prev.firstSeenAt || now.slice(0, 10),
        });
      }
    }

    // Preserve firstSeenAt for continuing assets
    for (const v of videoAssets) {
      const prev = prevLive.assets?.find(a => a.key === v.key);
      v.firstSeenAt = prev?.firstSeenAt || now.slice(0, 10);
      v.lastSeenAt = now.slice(0, 10);
    }

    // Write to KV
    await Promise.all([
      kvSet(`tracker/${campId}/live.json`, {
        lastSyncedAt: now,
        campaignName: CAMPAIGN_LABELS[campId] || campId,
        assets: videoAssets,
      }),
      kvSet(`tracker/${campId}/history.json`, newHistory),
      kvSet(`tracker/${campId}/descriptions.json`, textAssets),
      kvSet(`tracker/${campId}/snapshot.json`, [...currentKeys]),
    ]);

    const added = [...currentKeys].filter(k => !prevKeys.has(k)).length;
    summary.synced++;
    summary.totalAdded += added;
    summary.totalRemoved += removedKeys.length;

    console.log(`[sync] ${CAMPAIGN_LABELS[campId]}: ${videoAssets.length} live, ${removedKeys.length} removed, ${added} added, ${textAssets.length} texts`);
  }

  return { ok: true, ...summary, syncedAt: now };
}
