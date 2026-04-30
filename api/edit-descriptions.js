/**
 * GET  /api/edit-descriptions            → headlines + descriptions for IN UH campaigns
 * POST /api/edit-descriptions            → add/remove text asset (action, campaignId, fieldType, text)
 *
 * GET  /api/edit-descriptions?type=videos → list all video assets for Invokers UAC ad
 * POST /api/edit-descriptions            → pause/remove or resume/add video (type, action, assetId)
 *
 * All mutations use the same ads:mutate pattern: read full list → modify → send full list.
 * Videos use login-customer-id = INV_GOOGLE_CUSTOMER_ID (5004458850), texts use UH customer ID.
 */
import { getAccessToken, gaQuery } from './_utils/google.js';

export const maxDuration = 60;

// ── UH text asset constants ────────────────────────────────────────────────────
const IN_CAMPAIGN_IDS = ['22784768376', '22879160345'];
const CAMPAIGN_AD_GROUPS = {
  '22784768376': '182709178495',
  '22879160345': '183171683706',
};
const CAMPAIGN_LABELS = {
  '22784768376': 'Fast Prog (IN GP)',
  '22879160345': 'Battle Act (IN GP)',
};
const FIELD_MAP = {
  HEADLINE:    { adField: 'headlines',    updateMask: 'app_ad.headlines',    limit: 5, maxLen: 30 },
  DESCRIPTION: { adField: 'descriptions', updateMask: 'app_ad.descriptions', limit: 5, maxLen: 90 },
};

// ── Invokers Google video constants ───────────────────────────────────────────
const INV_CUSTOMER_ID = (process.env.INV_GOOGLE_CUSTOMER_ID || '5004458850').replace(/[\s-]/g, '');
const INV_ADGROUP_ID  = '191981823769';

// ── Shared helpers ─────────────────────────────────────────────────────────────
function makeHeaders(token, customerId) {
  return {
    'Authorization':     `Bearer ${token}`,
    'developer-token':   process.env.GOOGLE_DEVELOPER_TOKEN,
    'login-customer-id': customerId,
    'Content-Type':      'application/json',
  };
}

async function getAdTexts(token, adGroupId) {
  const result = await gaQuery(token, `
    SELECT ad_group_ad.ad.resource_name,
           ad_group_ad.ad.app_ad.headlines,
           ad_group_ad.ad.app_ad.descriptions
    FROM ad_group_ad
    WHERE ad_group.id = ${adGroupId}
  `);
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
  const ad = result.results?.[0]?.adGroupAd?.ad;
  return {
    adRN:         ad?.resourceName,
    headlines:    ad?.appAd?.headlines    || [],
    descriptions: ad?.appAd?.descriptions || [],
  };
}

async function mutateAdTexts(token, customerId, adRN, adField, newList, updateMask) {
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/ads:mutate`,
    {
      method: 'POST',
      headers: makeHeaders(token, customerId),
      body: JSON.stringify({
        operations: [{ update: { resourceName: adRN, appAd: { [adField]: newList } }, updateMask }],
      }),
    }
  );
  const data = await r.json();
  if (!data.results) throw new Error(data.error?.message || JSON.stringify(data));
  return data;
}

async function getInvActiveVideos(token) {
  const result = await gaQuery(token, `
    SELECT ad_group_ad.ad.resource_name, ad_group_ad.ad.app_ad.youtube_videos
    FROM ad_group_ad
    WHERE ad_group.id = ${INV_ADGROUP_ID}
  `, INV_CUSTOMER_ID);
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
  const ad = result.results?.[0]?.adGroupAd?.ad;
  return { adRN: ad?.resourceName, youtubeVideos: ad?.appAd?.youtubeVideos || [] };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const uhCustomerId = (process.env.GOOGLE_CUSTOMER_ID || '').replace(/[\s-]/g, '');
  let token;
  try { token = await getAccessToken(); }
  catch (e) { return res.status(500).json({ error: 'Google auth failed: ' + e.message }); }

  // ── Invokers video assets ────────────────────────────────────────────────────
  if (req.method === 'GET' && req.query.type === 'videos') {
    try {
      const [assetsResult, activeVideos] = await Promise.all([
        gaQuery(token, `
          SELECT
            ad_group_ad_asset_view.resource_name,
            ad_group_ad_asset_view.field_type,
            ad_group_ad_asset_view.performance_label,
            ad_group_ad_asset_view.enabled,
            asset.resource_name,
            asset.id,
            asset.name,
            asset.youtube_video_asset.youtube_video_id,
            asset.youtube_video_asset.youtube_video_title
          FROM ad_group_ad_asset_view
          WHERE ad_group.id = ${INV_ADGROUP_ID}
            AND ad_group_ad_asset_view.field_type = 'YOUTUBE_VIDEO'
        `, INV_CUSTOMER_ID),
        getInvActiveVideos(token),
      ]);
      if (assetsResult.error) throw new Error(assetsResult.error.message || JSON.stringify(assetsResult.error));

      const activeSet = new Set(activeVideos.youtubeVideos.map(v => v.asset));
      const videos = (assetsResult.results || []).map(row => {
        const view = row.adGroupAdAssetView;
        const asset = row.asset;
        const assetRN = asset?.resourceName;
        return {
          assetId:          String(asset?.id || ''),
          assetRN,
          name:             asset?.name || '',
          videoId:          asset?.youtubeVideoAsset?.youtubeVideoId   || '',
          title:            asset?.youtubeVideoAsset?.youtubeVideoTitle || '',
          fieldType:        view?.fieldType || 'YOUTUBE_VIDEO',
          performanceLabel: view?.performanceLabel || 'UNSPECIFIED',
          active:           activeSet.has(assetRN),
        };
      });
      return res.status(200).json({ videos, adRN: activeVideos.adRN });
    } catch (e) {
      console.error('[edit-descriptions GET videos]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST' && req.body?.type === 'videos') {
    const { action, assetId } = req.body;
    if (!['pause', 'resume'].includes(action)) return res.status(400).json({ error: 'action must be "pause" or "resume"' });
    if (!assetId) return res.status(400).json({ error: 'assetId required' });

    try {
      const { adRN, youtubeVideos } = await getInvActiveVideos(token);
      const assetRN = `customers/${INV_CUSTOMER_ID}/assets/${assetId}`;

      let newList;
      if (action === 'pause') {
        if (!youtubeVideos.some(v => v.asset === assetRN)) {
          return res.status(400).json({ error: 'Asset not in active list' });
        }
        newList = youtubeVideos.filter(v => v.asset !== assetRN);
      } else {
        if (youtubeVideos.some(v => v.asset === assetRN)) return res.status(400).json({ error: 'Asset already active' });
        if (youtubeVideos.length >= 20) return res.status(400).json({ error: 'At 20-video limit — remove one first' });
        newList = [...youtubeVideos, { asset: assetRN }];
      }

      const r = await fetch(
        `https://googleads.googleapis.com/v23/customers/${INV_CUSTOMER_ID}/ads:mutate`,
        {
          method: 'POST',
          headers: makeHeaders(token, INV_CUSTOMER_ID),
          body: JSON.stringify({
            operations: [{ update: { resourceName: adRN, appAd: { youtubeVideos: newList } }, updateMask: 'app_ad.youtube_videos' }],
          }),
        }
      );
      const data = await r.json();
      if (!data.results) throw new Error(data.error?.message || JSON.stringify(data));

      console.log(`[edit-descriptions] video ${action} ${assetId}: ${youtubeVideos.length}→${newList.length}`);
      return res.status(200).json({ ok: true, action, assetId, activeCount: newList.length });
    } catch (e) {
      console.error('[edit-descriptions POST videos]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── UH text assets ───────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const campaigns = await Promise.all(
        IN_CAMPAIGN_IDS.map(async (campId) => {
          const { headlines, descriptions } = await getAdTexts(token, CAMPAIGN_AD_GROUPS[campId]);
          return {
            campaignId:    campId,
            campaignLabel: CAMPAIGN_LABELS[campId],
            headlines:     headlines.map(h => h.text),
            descriptions:  descriptions.map(d => d.text),
          };
        })
      );
      return res.status(200).json({ campaigns });
    } catch (e) {
      console.error('[edit-descriptions GET]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { action, campaignId, fieldType, text } = req.body || {};
    if (!IN_CAMPAIGN_IDS.includes(campaignId)) {
      return res.status(403).json({ error: `Write blocked: campaign ${campaignId} is not an IN campaign.` });
    }
    const mapping = FIELD_MAP[fieldType];
    if (!mapping) return res.status(400).json({ error: `Unsupported fieldType: ${fieldType}. Use HEADLINE or DESCRIPTION.` });
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
    const trimmed = text.trim();
    if (trimmed.length > mapping.maxLen) {
      return res.status(400).json({ error: `${fieldType} max length is ${mapping.maxLen} chars (got ${trimmed.length})` });
    }

    try {
      const current = await getAdTexts(token, CAMPAIGN_AD_GROUPS[campaignId]);
      const { adRN, [mapping.adField]: currentList } = current;

      if (action === 'add') {
        if (currentList.length >= mapping.limit) {
          return res.status(400).json({ error: `At ${mapping.limit}-asset limit for ${fieldType} — remove one first` });
        }
        if (currentList.some(a => a.text === trimmed)) {
          return res.status(400).json({ error: `"${trimmed}" already exists in ${fieldType}` });
        }
        const newList = [...currentList, { text: trimmed }];
        await mutateAdTexts(token, uhCustomerId, adRN, mapping.adField, newList, mapping.updateMask);
        console.log(`[edit-descriptions] Added ${fieldType} to ${campaignId}: "${trimmed}"`);
        return res.status(200).json({ ok: true, count: newList.length });
      }

      if (action === 'remove') {
        if (!currentList.some(a => a.text === trimmed)) {
          return res.status(400).json({ error: `"${trimmed}" not found in ${fieldType}` });
        }
        const newList = currentList.filter(a => a.text !== trimmed);
        await mutateAdTexts(token, uhCustomerId, adRN, mapping.adField, newList, mapping.updateMask);
        console.log(`[edit-descriptions] Removed ${fieldType} from ${campaignId}: "${trimmed}"`);
        return res.status(200).json({ ok: true, count: newList.length });
      }

      return res.status(400).json({ error: 'action must be "add" or "remove"' });
    } catch (e) {
      console.error('[edit-descriptions POST]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
