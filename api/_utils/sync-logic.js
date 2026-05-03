/**
 * Core sync logic — shared by cron and manual sync endpoints.
 * Fetches Google Ads assets, diffs against stored snapshots, updates KV.
 */
import { kvGet, kvSet } from './kv.js';
import {
  getAccessToken, gaQuery, CAMPAIGN_IDS, CAMPAIGN_LABELS,
  VIDEO_TYPES, TEXT_TYPES, detectOrientation, fetchYoutubeTitles,
} from './google.js';

// IN campaigns: check APP_AD video list to surface LEARNING (0-impression) videos
const IN_AD_GROUPS = {
  '22784768376': '182709178495',
  '22879160345': '183171683706',
};

/**
 * Run full sync for all campaigns. Returns summary.
 */
export async function runSync() {
  const token = await getAccessToken();

  // Date range: max(2026-03-01, today-30d) → today
  // 30d matches Google Ads default report window. Includes today for intraday spend.
  const today = new Date();
  const rolling = new Date(today);
  rolling.setDate(rolling.getDate() - 30);
  const earliest = new Date('2026-03-01');
  const from = (rolling > earliest ? rolling : earliest).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);

  console.log(`[sync] fetching ${from} → ${to}`);

  // Main query — text+video assets. all_conversions excluded: incompatible with text_asset.text
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
        orientation: null,
        text: asset.textAsset?.text || null,
        performanceLabel: 'UNSPECIFIED',
        spend: 0,
        conversions: 0,
        allConversions: 0,
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

  // Separate query for all_conversions — no text_asset fields to avoid GAQL incompatibility.
  // No field_type filter: text asset rows won't match any video key and are ignored in merge.
  const allConvRaw = await gaQuery(token, `
    SELECT campaign.id, asset.id, ad_group_ad_asset_view.field_type,
           metrics.all_conversions
    FROM ad_group_ad_asset_view
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.id IN (${CAMPAIGN_IDS.join(', ')})
      AND campaign.status = 'ENABLED'
  `);
  if (allConvRaw.error) {
    console.error('[sync] all_conversions query failed:', JSON.stringify(allConvRaw.error));
  } else {
    for (const r of allConvRaw.results || []) {
      const campId = r.campaign?.id;
      const assetId = r.asset?.id;
      const fieldType = r.adGroupAdAssetView?.fieldType;
      if (!campId || !assetId || !fieldType || !byCampaign[campId]) continue;
      const key = `${assetId}_${fieldType}`;
      const v = byCampaign[campId].videos[key];
      if (v) v.allConversions += parseFloat(r.metrics?.allConversions || 0);
    }
    console.log(`[sync] all_conversions: ${allConvRaw.results?.length} rows merged`);
  }

  // Campaign-level metrics for accurate summary CPA.
  // Asset-level ad_group_ad_asset_view gives each asset full conversion credit (not fractional),
  // causing summed asset conversions to be N× inflated. Campaign-level query matches Google Ads UI.
  const campStatsRaw = await gaQuery(token, `
    SELECT campaign.id, metrics.cost_micros, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.id IN (${CAMPAIGN_IDS.join(', ')})
      AND campaign.status = 'ENABLED'
  `);
  const campaignStats = {};
  if (campStatsRaw.error) {
    console.error('[sync] campaign stats query failed:', JSON.stringify(campStatsRaw.error));
  } else {
    for (const r of campStatsRaw.results || []) {
      const cid = r.campaign?.id;
      if (!cid) continue;
      const spend = (r.metrics?.costMicros || 0) / 1e6;
      const conversions = parseFloat(r.metrics?.conversions || 0);
      campaignStats[cid] = {
        spend: +spend.toFixed(2),
        conversions: +conversions.toFixed(2),
        cpa: conversions > 0 ? +(spend / conversions).toFixed(4) : null,
      };
    }
    console.log(`[sync] campaign stats: ${Object.keys(campaignStats).length} campaigns`);
  }

  // Inject LEARNING videos: assets in APP_AD but not yet in ad_group_ad_asset_view (0 impressions)
  for (const [campId, adGroupId] of Object.entries(IN_AD_GROUPS)) {
    const adResult = await gaQuery(token,
      `SELECT ad_group_ad.ad.app_ad.youtube_videos FROM ad_group_ad WHERE ad_group.id = ${adGroupId}`
    );
    const adVideos = adResult.results?.[0]?.adGroupAd?.ad?.appAd?.youtubeVideos || [];
    const trackedAssetIds = new Set(Object.values(byCampaign[campId].videos).map(v => v.id));

    const pendingIds = adVideos
      .map(v => v.asset?.split('/').pop())
      .filter(id => id && !trackedAssetIds.has(id));

    if (!pendingIds.length) continue;

    const assetResult = await gaQuery(token,
      `SELECT asset.id, asset.youtube_video_asset.youtube_video_id FROM asset WHERE asset.id IN (${pendingIds.join(', ')})`
    );
    const pendingAssets = assetResult.results || [];
    const pendingYtIds = pendingAssets.map(a => a.asset.youtubeVideoAsset?.youtubeVideoId).filter(Boolean);
    const pendingTitles = await fetchYoutubeTitles(pendingYtIds);

    for (const pa of pendingAssets) {
      const assetId = pa.asset.id;
      const ytId = pa.asset.youtubeVideoAsset?.youtubeVideoId;
      const name = (ytId && pendingTitles[ytId]) || '';
      const orientation = detectOrientation(name, 'YOUTUBE_VIDEO');
      let fieldType = 'YOUTUBE_VIDEO';
      if (orientation === '9x16') fieldType = 'PORTRAIT_YOUTUBE_VIDEO';
      else if (orientation === '1x1') fieldType = 'SQUARE_YOUTUBE_VIDEO';
      const key = `${assetId}_${fieldType}`;
      byCampaign[campId].videos[key] = {
        id: assetId, key, youtubeId: ytId || null, name, fieldType, orientation,
        text: null, performanceLabel: 'LEARNING',
        spend: 0, conversions: 0, allConversions: 0, impressions: 0, clicks: 0, daily: {},
      };
    }
    console.log(`[sync] ${CAMPAIGN_LABELS[campId]}: ${pendingIds.length} LEARNING video(s) injected`);
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
    const staleDate = new Date(today);
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
      v.allConversions = +v.allConversions.toFixed(2);
      v.iaa = +(v.allConversions - v.conversions).toFixed(2);
      v.cpa    = v.conversions > 0 ? +(v.spend / v.conversions).toFixed(4) : null;
      v.cpaIaa = v.iaa > 0         ? +(v.spend / v.iaa).toFixed(4)         : null;
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
        cpa: d.conversions > 0 ? +(d.spend / d.conversions).toFixed(4) : null,
      }));

      v.firstSeenAt = dailyEntries[0]?.[0] || to;
      v.lastSeenAt = dailyEntries[dailyEntries.length - 1]?.[0] || to;

      // Classify: stale (no data in 3 days) OR UNSPECIFIED → history. LEARNING/PENDING stay live.
      if (!['LEARNING', 'PENDING'].includes(v.performanceLabel) && (v.lastSeenAt < staleCutoff || v.performanceLabel === 'UNSPECIFIED')) {
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
          reason: v.performanceLabel === 'UNSPECIFIED' ? 'Performance label unspecified' : `No data since ${v.lastSeenAt}`,
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
          removedAt: prev.lastSeenAt || now.slice(0, 10),
          lastSeenAt: prev.lastSeenAt || now.slice(0, 10),
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
        campaignStats: campaignStats[campId] || null,
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
