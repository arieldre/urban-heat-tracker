/**
 * GET  /api/upload-video  → account video library + active UH campaign video lists
 * POST /api/upload-video  → upload (action=upload) | remove (action=remove)
 *
 * UAC (MULTI_CHANNEL) campaigns: videos live in ad.appAd.youtubeVideos[] — NOT asset links.
 * assetGroupAssets and campaignAssets both fail for UAC. Correct path: ads:mutate.
 * Read + write: all 4 UH campaign IDs. Ad group ID resolved dynamically per campaign.
 */
import { getAccessToken, gaQuery, fetchYoutubeTitles } from './_utils/google.js';
import { kvGet, kvSet } from './_utils/kv.js';

export const maxDuration = 60;

const UH_CAMPAIGN_IDS = ['22784768376', '22879160345', '23583585016', '23583625147'];
const VIDEO_LIMIT = 20;
const INV_CUSTOMER_ID_UV = (process.env.INV_GOOGLE_CUSTOMER_ID || '5004458850').replace(/[\s-]/g, '');

const GEO_IDS = {
  US: 2840, CA: 2124, GB: 2826, AU: 2036, DE: 2276, FR: 2250,
  IN: 2356, PH: 2608, MY: 2458, TH: 2764, VN: 2704, ID: 2360,
  BR: 2076, MX: 2484, SG: 2702, JP: 2392, KR: 2410, IL: 2376,
};

const GAME_APP_IDS = {
  uh:  { android: 'gg.oneupgames.ggclient',         ios: '' },
  inv: { android: 'hitzone.anima.spirit.guardians',  ios: '6755186220' },
};

const CAMPAIGN_LABELS = {
  '22784768376': 'Fast Prog (IN GP)',
  '22879160345': 'Battle Act (IN GP)',
  '23583585016': 'US GP',
  '23583625147': 'US iOS',
};

const VIDEO_FIELD_TYPES = new Set(['YOUTUBE_VIDEO', 'PORTRAIT_YOUTUBE_VIDEO', 'SQUARE_YOUTUBE_VIDEO']);
const ASSET_CACHE_KEY = 'library/uh-google.json';

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

function makeHeaders(token, cid) {
  return {
    'Authorization':     `Bearer ${token}`,
    'developer-token':   process.env.GOOGLE_DEVELOPER_TOKEN,
    'login-customer-id': cid || (process.env.GOOGLE_CUSTOMER_ID || '').replace(/[\s-]/g, ''),
    'Content-Type':      'application/json',
  };
}

async function getExistingVideoAssets(token, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = await kvGet(ASSET_CACHE_KEY);
    if (cached) return cached;
  }

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

  const noName = assets.filter(a => !a.name).map(a => a.videoId);
  if (noName.length > 0) {
    const titles = await fetchYoutubeTitles(noName);
    for (const a of assets) {
      if (!a.name && titles[a.videoId]) a.name = titles[a.videoId];
    }
  }

  const filtered = assets.filter(a => /^uh/i.test(a.name) || /urban heat/i.test(a.name));
  kvSet(ASSET_CACHE_KEY, filtered, 4 * 3600).catch(e => console.error('[kv] uh-google cache write:', e.message));
  return filtered;
}

// Queries the ad (and its video list) directly by campaign ID — no hardcoded ad group IDs needed
async function getAdVideosByCampaignId(token, campaignId) {
  const result = await gaQuery(token, `
    SELECT ad_group_ad.ad.resource_name, ad_group_ad.ad.app_ad.youtube_videos
    FROM ad_group_ad
    WHERE campaign.id = ${campaignId}
  `);
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
  const ad = result.results?.[0]?.adGroupAd?.ad;
  return {
    adRN:   ad?.resourceName || null,
    videos: ad?.appAd?.youtubeVideos || [],
  };
}

async function addVideoToAd(token, customerId, campaignId, assetRN) {
  const { adRN, videos } = await getAdVideosByCampaignId(token, campaignId);
  if (!adRN) throw new Error(`No ad found for campaign ${campaignId} — create an ad group + ad first`);
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

async function removeVideoFromAd(token, customerId, campaignId, assetRN) {
  const { adRN, videos } = await getAdVideosByCampaignId(token, campaignId);
  if (!adRN) throw new Error(`No ad found for campaign ${campaignId}`);
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

// IAA = all_conversions - conversions (in-app actions beyond installs)
async function fetchIaaMetrics(token, campId) {
  const today = new Date();
  const from  = new Date(today);
  from.setDate(from.getDate() - 30);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr   = today.toISOString().slice(0, 10);

  const result = await gaQuery(token, `
    SELECT asset.id, metrics.conversions, metrics.all_conversions
    FROM ad_group_ad_asset_view
    WHERE campaign.id = ${campId}
      AND segments.date BETWEEN '${fromStr}' AND '${toStr}'
      AND campaign.status = 'ENABLED'
  `);
  if (result.error) {
    console.error('[fetchIaaMetrics] campId:', campId, JSON.stringify(result.error));
    return {};
  }

  const byId = {};
  for (const r of result.results || []) {
    const id = String(r.asset?.id || '');
    if (!id) continue;
    if (!byId[id]) byId[id] = { conversions: 0, allConversions: 0 };
    byId[id].conversions    += parseFloat(r.metrics?.conversions    || 0);
    byId[id].allConversions += parseFloat(r.metrics?.allConversions || 0);
  }
  console.log(`[fetchIaaMetrics] campId:${campId} assets:${Object.keys(byId).length} rows:${result.results?.length}`);
  return byId;
}

async function getActiveCampaigns(token, customerId, assetLibrary) {
  // Fetch bid + daily budget for all 4 campaigns in one GAQL call
  const idList = UH_CAMPAIGN_IDS.join(', ');
  const bbResult = await gaQuery(token, `
    SELECT campaign.id, campaign.target_cpa.target_cpa_micros, campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.id IN (${idList})
  `).catch(() => ({ results: [] }));

  const bidBudget = {};
  for (const r of bbResult.results || []) {
    const id = String(r.campaign?.id);
    bidBudget[id] = {
      tcpa: r.campaign?.targetCpa?.targetCpaMicros
        ? +(Number(r.campaign.targetCpa.targetCpaMicros) / 1_000_000).toFixed(2)
        : null,
      dailyBudget: r.campaignBudget?.amountMicros
        ? +(Number(r.campaignBudget.amountMicros) / 1_000_000).toFixed(2)
        : null,
    };
  }

  return Promise.all(UH_CAMPAIGN_IDS.map(async (campId) => {
    const [{ adRN, videos: adVideos }, live, gaIaa] = await Promise.all([
      getAdVideosByCampaignId(token, campId),
      kvGet(`tracker/${campId}/live.json`),
      fetchIaaMetrics(token, campId),
    ]);

    const kvByAssetId = {};
    for (const a of (live?.assets || [])) {
      if (!VIDEO_FIELD_TYPES.has(a.fieldType)) continue;
      if (!kvByAssetId[a.id]) {
        kvByAssetId[a.id] = {
          name: a.name, youtubeId: a.youtubeId, orientation: a.orientation,
          performanceLabel: a.performanceLabel || 'UNSPECIFIED',
          spend: 0, conversions: 0, iaa: 0,
        };
      }
      kvByAssetId[a.id].spend       += a.spend || 0;
      kvByAssetId[a.id].conversions += a.conversions || 0;
      kvByAssetId[a.id].iaa         += a.iaa || 0;
      if (a.performanceLabel && a.performanceLabel !== 'UNSPECIFIED') {
        kvByAssetId[a.id].performanceLabel = a.performanceLabel;
      }
    }
    for (const [assetId, kv] of Object.entries(kvByAssetId)) {
      const ga       = gaIaa[assetId] || {};
      const gaIaaVal = (ga.allConversions || 0) - (ga.conversions || 0);
      const iaa      = kv.iaa > 0 ? kv.iaa : gaIaaVal;
      kv.cpa    = kv.conversions > 0 ? +(kv.spend / kv.conversions).toFixed(4) : null;
      kv.cpaIaa = iaa > 0            ? +(kv.spend / iaa).toFixed(4)            : null;
      kv.spend  = +kv.spend.toFixed(2);
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
        cpaIaa:           kv?.cpaIaa ?? null,
        performanceLabel: kv?.performanceLabel || 'UNSPECIFIED',
      };
    });

    const bb = bidBudget[campId] || {};
    return {
      campaignId:    campId,
      campaignLabel: CAMPAIGN_LABELS[campId],
      count:         adVideos.length,
      limit:         VIDEO_LIMIT,
      atLimit:       adVideos.length >= VIDEO_LIMIT,
      assets,
      tcpa:          bb.tcpa ?? null,
      dailyBudget:   bb.dailyBudget ?? null,
    };
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const customerId = (process.env.GOOGLE_CUSTOMER_ID || '').replace(/[\s-]/g, '');
  let token;
  try { token = await getAccessToken(); }
  catch (e) { return res.status(500).json({ error: 'Google auth failed: ' + e.message }); }

  if (req.method === 'GET') {
    try {
      const refresh = req.query.refresh === '1';
      const [videoAssets, ...historyResults] = await Promise.all([
        getExistingVideoAssets(token, refresh),
        ...UH_CAMPAIGN_IDS.map(id => kvGet(`tracker/${id}/history.json`)),
      ]);
      const assetLibrary = new Map(videoAssets.map(a => [a.id, a]));
      const activeCampaigns = await getActiveCampaigns(token, customerId, assetLibrary);

      const historyYoutubeIds = new Set();
      for (const hist of historyResults) {
        for (const entry of (hist || [])) {
          if (entry.youtubeId) historyYoutubeIds.add(entry.youtubeId);
        }
      }

      return res.status(200).json({ assetGroups: [], videoAssets, activeCampaigns, historyYoutubeIds: [...historyYoutubeIds] });
    } catch (e) {
      console.error('[upload-video GET]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { action = 'upload', campaignId, assetId,
            youtubeUrl, existingAssetResourceName, fieldType, name } = req.body || {};

    // CREATE GOOGLE UAC CAMPAIGN
    if (action === 'create-campaign') {
      const { game = 'uh', campaignName, appId, platform = 'android', dailyBudget, tcpa, countries = [] } = req.body || {};
      if (!campaignName || !dailyBudget || !tcpa) {
        return res.status(400).json({ error: 'campaignName, dailyBudget, tcpa required' });
      }
      const cid = game === 'inv' ? INV_CUSTOMER_ID_UV : customerId;
      const resolvedAppId = appId || GAME_APP_IDS[game]?.[platform] || '';
      if (!resolvedAppId) return res.status(400).json({ error: `No app ID for game=${game} platform=${platform} — provide appId` });

      const budgetMicros = String(Math.round(parseFloat(dailyBudget) * 1_000_000));
      const tcpaMicros   = String(Math.round(parseFloat(tcpa) * 1_000_000));
      const appStore = platform === 'ios' ? 'APPLE_APP_STORE' : 'GOOGLE_APP_STORE';

      try {
        const budgetR = await fetch(`https://googleads.googleapis.com/v23/customers/${cid}/campaignBudgets:mutate`, {
          method: 'POST', headers: makeHeaders(token, cid),
          body: JSON.stringify({ operations: [{ create: {
            name: `${campaignName}_budget`,
            amountMicros: budgetMicros,
            deliveryMethod: 'STANDARD',
            explicitlyShared: false,
          }}] }),
        });
        const budgetData = await budgetR.json();
        if (!budgetData.results) throw new Error(`Budget: ${budgetData.error?.message || JSON.stringify(budgetData)}`);
        const budgetRN = budgetData.results[0].resourceName;

        const campR = await fetch(`https://googleads.googleapis.com/v23/customers/${cid}/campaigns:mutate`, {
          method: 'POST', headers: makeHeaders(token, cid),
          body: JSON.stringify({ operations: [{ create: {
            name: campaignName,
            advertisingChannelType: 'MULTI_CHANNEL',
            advertisingChannelSubType: 'APP_CAMPAIGN',
            appCampaignSetting: { appId: resolvedAppId, appStore, biddingStrategyGoalType: 'OPTIMIZE_INSTALLS_TARGET_INSTALL_COST' },
            targetCpa: { targetCpaMicros: tcpaMicros },
            campaignBudget: budgetRN,
            status: 'PAUSED',
            containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
          }}] }),
        });
        const campData = await campR.json();
        if (!campData.results) throw new Error(`Campaign: ${campData.error?.message || JSON.stringify(campData)}`);
        const campRN = campData.results[0].resourceName;
        const campId = campRN.split('/').pop();

        let geoAdded = 0;
        if (countries.length > 0) {
          const geoOps = countries
            .map(c => GEO_IDS[c.toUpperCase()]).filter(Boolean)
            .map(geoId => ({ create: { campaign: campRN, location: { geoTargetConstant: `geoTargetConstants/${geoId}` } } }));
          if (geoOps.length > 0) {
            const geoR = await fetch(`https://googleads.googleapis.com/v23/customers/${cid}/campaignCriteria:mutate`, {
              method: 'POST', headers: makeHeaders(token, cid),
              body: JSON.stringify({ operations: geoOps }),
            });
            const geoData = await geoR.json();
            geoAdded = geoData.results?.length || 0;
            if (!geoData.results) console.warn('[create-campaign] geo failed:', geoData.error?.message);
          }
        }

        console.log(`[upload-video/create-campaign/${game}] campaign ${campId} budget ${budgetRN} geo ${geoAdded}`);
        return res.status(200).json({ campaignId: campId, campaignRN: campRN, budgetRN, name: campaignName, geoAdded,
          note: 'Campaign created (PAUSED). Create an ad group + ad in Google Ads UI, then add videos via Upload tab.' });
      } catch (e) {
        console.error('[upload-video/create-campaign]', e);
        return res.status(500).json({ error: e.message });
      }
    }

    if (!UH_CAMPAIGN_IDS.includes(campaignId)) {
      return res.status(403).json({ error: `Write blocked: campaign ${campaignId} is not an allowed UH campaign.` });
    }

    // REMOVE
    if (action === 'remove') {
      if (!assetId) return res.status(400).json({ error: 'assetId required' });
      const assetRN = `customers/${customerId}/assets/${assetId}`;
      try {
        const result = await removeVideoFromAd(token, customerId, campaignId, assetRN);
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
      const result = await addVideoToAd(token, customerId, campaignId, assetRN);
      console.log(`[upload-video] Added ${assetRN} to campaign ${campaignId}`);
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
