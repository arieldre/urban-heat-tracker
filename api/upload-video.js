/**
 * GET  /api/upload-video  → account video library + active IN campaign video lists
 * POST /api/upload-video  → upload (action=upload) | remove (action=remove)
 *
 * UAC (MULTI_CHANNEL) campaigns: videos live in ad.appAd.youtubeVideos[] — NOT asset links.
 * assetGroupAssets and campaignAssets both fail for UAC. Correct path: ads:mutate.
 * Read: all 4 campaigns. Write/remove: hard-blocked to IN campaign IDs only.
 */
import { getAccessToken, gaQuery, CAMPAIGN_IDS, fetchYoutubeTitles } from './_utils/google.js';
import { kvGet } from './_utils/kv.js';

export const maxDuration = 60;

const IN_CAMPAIGN_IDS = ['22784768376', '22879160345'];
const VIDEO_LIMIT = 20;

const CAMPAIGN_LABELS = {
  '22784768376': 'Fast Prog (IN GP)',
  '22879160345': 'Battle Act (IN GP)',
  '23583585016': 'US GP',
  '23583625147': 'US iOS',
};

// UAC: one ad group per campaign, one ad per ad group
const CAMPAIGN_AD_GROUPS = {
  '22784768376': '182709178495',  // Fast Prog
  '22879160345': '183171683706',  // Battle Act
};

const VIDEO_FIELD_TYPES = new Set(['YOUTUBE_VIDEO', 'PORTRAIT_YOUTUBE_VIDEO', 'SQUARE_YOUTUBE_VIDEO']);

export function parseYouTubeId(input) {
  if (!input) return null;
  const t = input.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  try {
    const url = new URL(t);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('?')[0];
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2];
      return url.searchParams.get('v');
    }
  } catch {}
  return null;
}

function makeHeaders(token) {
  return {
    'Authorization':     `Bearer ${token}`,
    'developer-token':   process.env.GOOGLE_DEVELOPER_TOKEN,
    'login-customer-id': process.env.GOOGLE_CUSTOMER_ID,
    'Content-Type':      'application/json',
  };
}

async function getExistingVideoAssets(token) {
  const result = await gaQuery(token, `
    SELECT asset.id, asset.name, asset.resource_name,
           asset.youtube_video_asset.youtube_video_id
    FROM asset
    WHERE asset.type = YOUTUBE_VIDEO
    LIMIT 1000
  `);
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));

  const assets = (result.results || [])
    .map(r => ({
      id:           r.asset.id,
      name:         r.asset.name || '',
      resourceName: r.asset.resourceName,
      videoId:      r.asset.youtubeVideoAsset?.youtubeVideoId,
    }))
    .filter(a => a.videoId)
    .sort((a, b) => parseInt(b.id) - parseInt(a.id));

  // UAC assets have no name in Google Ads API — fetch YouTube titles for all without one
  const noName = assets.filter(a => !a.name).map(a => a.videoId);
  if (noName.length > 0) {
    const titles = await fetchYoutubeTitles(noName);
    for (const a of assets) {
      if (!a.name && titles[a.videoId]) a.name = titles[a.videoId];
    }
  }

  return assets;
}

// Get current video list from the actual ad (source of truth for UAC)
async function getAdVideos(token, adGroupId) {
  const result = await gaQuery(token, `
    SELECT ad_group_ad.ad.resource_name, ad_group_ad.ad.app_ad.youtube_videos
    FROM ad_group_ad
    WHERE ad_group.id = ${adGroupId}
  `);
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
  const ad = result.results?.[0]?.adGroupAd?.ad;
  return {
    adRN:   ad?.resourceName,
    videos: ad?.appAd?.youtubeVideos || [],
  };
}

async function addVideoToAd(token, customerId, adGroupId, assetRN) {
  const { adRN, videos } = await getAdVideos(token, adGroupId);
  if (videos.length >= VIDEO_LIMIT) throw new Error(`At ${VIDEO_LIMIT}-video limit — remove one first`);
  if (videos.some(v => v.asset === assetRN)) throw new Error('Video already in this campaign');
  const newList = [...videos, { asset: assetRN }];
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/ads:mutate`,
    { method: 'POST', headers: makeHeaders(token), body: JSON.stringify({
      operations: [{ update: { resourceName: adRN, appAd: { youtubeVideos: newList } }, updateMask: 'app_ad.youtube_videos' }],
    }) }
  );
  const data = await r.json();
  if (!data.results) throw new Error(data.error?.message || JSON.stringify(data));
  return { ok: true, count: newList.length };
}

async function removeVideoFromAd(token, customerId, adGroupId, assetRN) {
  const { adRN, videos } = await getAdVideos(token, adGroupId);
  if (!videos.some(v => v.asset === assetRN)) throw new Error('Video not found in this campaign ad');
  const newList = videos.filter(v => v.asset !== assetRN);
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/ads:mutate`,
    { method: 'POST', headers: makeHeaders(token), body: JSON.stringify({
      operations: [{ update: { resourceName: adRN, appAd: { youtubeVideos: newList } }, updateMask: 'app_ad.youtube_videos' }],
    }) }
  );
  const data = await r.json();
  if (!data.results) throw new Error(data.error?.message || JSON.stringify(data));
  return { ok: true, count: newList.length };
}

async function createYouTubeAsset(token, customerId, videoId, assetName) {
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/assets:mutate`,
    { method: 'POST', headers: makeHeaders(token), body: JSON.stringify({
      operations: [{ create: { name: assetName, youtubeVideoAsset: { youtubeVideoId: videoId } } }],
    }) }
  );
  const data = await r.json();
  if (data.error || !data.results) throw new Error(data.error?.message || JSON.stringify(data));
  return data.results[0].resourceName;
}

// Real-time ad video list + KV spend enrichment + asset library for names/thumbnails
async function getActiveCampaigns(token, customerId, assetLibrary) {
  return Promise.all(IN_CAMPAIGN_IDS.map(async (campId) => {
    const adGroupId = CAMPAIGN_AD_GROUPS[campId];
    const [{ videos: adVideos }, live] = await Promise.all([
      getAdVideos(token, adGroupId),
      kvGet(`tracker/${campId}/live.json`),
    ]);

    // Sum spend across fieldType variants of the same asset (UAC may report multiple)
    const kvByAssetId = {};
    for (const a of (live?.assets || [])) {
      if (!VIDEO_FIELD_TYPES.has(a.fieldType)) continue;
      if (!kvByAssetId[a.id]) {
        kvByAssetId[a.id] = {
          name: a.name, youtubeId: a.youtubeId, orientation: a.orientation,
          performanceLabel: a.performanceLabel || 'UNSPECIFIED',
          spend: 0, conversions: 0,
        };
      }
      kvByAssetId[a.id].spend       += a.spend || 0;
      kvByAssetId[a.id].conversions += a.conversions || 0;
      if (a.performanceLabel && a.performanceLabel !== 'UNSPECIFIED') {
        kvByAssetId[a.id].performanceLabel = a.performanceLabel;
      }
    }
    for (const kv of Object.values(kvByAssetId)) {
      kv.cpa   = kv.conversions > 0 ? +(kv.spend / kv.conversions).toFixed(4) : null;
      kv.spend = +kv.spend.toFixed(2);
    }

    const assets = adVideos.map(({ asset: assetRN }) => {
      const assetId = assetRN.split('/').pop();
      const kv  = kvByAssetId[assetId];
      const lib = assetLibrary.get(assetId);
      return {
        id:               assetId,
        assetRN,
        name:             kv?.name || lib?.name || '',
        youtubeId:        kv?.youtubeId || lib?.videoId || null,
        orientation:      kv?.orientation || null,
        spend:            kv?.spend ?? 0,
        cpa:              kv?.cpa ?? null,
        performanceLabel: kv?.performanceLabel || 'UNSPECIFIED',
      };
    });

    return {
      campaignId:    campId,
      campaignLabel: CAMPAIGN_LABELS[campId],
      count:         adVideos.length,
      limit:         VIDEO_LIMIT,
      atLimit:       adVideos.length >= VIDEO_LIMIT,
      assets,
    };
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const customerId = process.env.GOOGLE_CUSTOMER_ID;
  let token;
  try { token = await getAccessToken(); }
  catch (e) { return res.status(500).json({ error: 'Google auth failed: ' + e.message }); }

  if (req.method === 'GET') {
    try {
      const videoAssets = await getExistingVideoAssets(token);
      const assetLibrary = new Map(videoAssets.map(a => [a.id, a]));
      const activeCampaigns = await getActiveCampaigns(token, customerId, assetLibrary);
      return res.status(200).json({ assetGroups: [], videoAssets, activeCampaigns });
    } catch (e) {
      console.error('[upload-video GET]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { action = 'upload', campaignId, assetId,
            youtubeUrl, existingAssetResourceName, fieldType, name } = req.body || {};

    if (!IN_CAMPAIGN_IDS.includes(campaignId)) {
      return res.status(403).json({ error: `Write blocked: campaign ${campaignId} is not an IN campaign.` });
    }
    const adGroupId = CAMPAIGN_AD_GROUPS[campaignId];

    // REMOVE
    if (action === 'remove') {
      if (!assetId) return res.status(400).json({ error: 'assetId required' });
      const assetRN = `customers/${customerId}/assets/${assetId}`;
      try {
        const result = await removeVideoFromAd(token, customerId, adGroupId, assetRN);
        console.log(`[upload-video] Removed asset ${assetId} from campaign ${campaignId}`);
        return res.status(200).json(result);
      } catch (e) {
        console.error('[upload-video remove]', e.message);
        return res.status(500).json({ error: e.message });
      }
    }

    // UPLOAD
    try {
      let assetRN = existingAssetResourceName;
      if (!assetRN) {
        const videoId = parseYouTubeId(youtubeUrl);
        if (!videoId) return res.status(400).json({ error: 'Could not parse YouTube video ID.' });
        const assetName = name?.trim() || `UH_${videoId}${fieldType ? '_' + fieldType : ''}`;
        assetRN = await createYouTubeAsset(token, customerId, videoId, assetName);
      }
      const result = await addVideoToAd(token, customerId, adGroupId, assetRN);
      console.log(`[upload-video] Added ${assetRN} to campaign ${campaignId} (${adGroupId})`);
      return res.status(200).json({
        ...result, assetResourceName: assetRN, campaignId, campaignLabel: CAMPAIGN_LABELS[campaignId],
      });
    } catch (e) {
      console.error('[upload-video POST]', e.message, e.stack);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
