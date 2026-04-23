/**
 * GET  /api/upload-video  → asset groups + existing YT video assets + active IN campaign videos
 * POST /api/upload-video  → upload (action=upload, default) | remove (action=remove)
 *
 * Read: all 4 campaigns. Write/remove: hard-blocked to IN campaign IDs only.
 * Video limit: 20 per IN campaign — upload blocked if at limit.
 */
import { getAccessToken, gaQuery, CAMPAIGN_IDS } from './_utils/google.js';
import { kvGet } from './_utils/kv.js';

export const maxDuration = 30;

const IN_CAMPAIGN_IDS = ['22784768376', '22879160345'];
const VIDEO_LIMIT = 20;

const CAMPAIGN_LABELS = {
  '22784768376': 'Fast Prog (IN GP)',
  '22879160345': 'Battle Act (IN GP)',
  '23583585016': 'US GP',
  '23583625147': 'US iOS',
};

const VALID_FIELD_TYPES = ['YOUTUBE_VIDEO', 'PORTRAIT_YOUTUBE_VIDEO', 'SQUARE_YOUTUBE_VIDEO'];

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

async function getAssetGroups(token) {
  try {
    const result = await gaQuery(token, `
      SELECT asset_group.id, asset_group.name, asset_group.resource_name,
             asset_group.status, campaign.id
      FROM asset_group
      WHERE campaign.id IN (${CAMPAIGN_IDS.join(', ')})
    `);
    if (result.error) return [];
    return (result.results || []).map(r => ({
      id:           r.assetGroup.id,
      name:         r.assetGroup.name,
      resourceName: r.assetGroup.resourceName,
      status:       r.assetGroup.status,
      campaignId:   r.campaign.id,
      campaignLabel: CAMPAIGN_LABELS[r.campaign.id] || r.campaign.id,
      writable:     IN_CAMPAIGN_IDS.includes(r.campaign.id),
    }));
  } catch { return []; }
}

async function getExistingVideoAssets(token) {
  const result = await gaQuery(token, `
    SELECT asset.id, asset.name, asset.resource_name,
           asset.youtube_video_asset.youtube_video_id
    FROM asset
    WHERE asset.type = YOUTUBE_VIDEO
    LIMIT 200
  `);
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
  return (result.results || [])
    .map(r => ({
      id:           r.asset.id,
      name:         r.asset.name,
      resourceName: r.asset.resourceName,
      videoId:      r.asset.youtubeVideoAsset?.youtubeVideoId,
    }))
    .filter(a => a.videoId);
}

// Read live video data for IN campaigns from KV (populated by sync)
async function getActiveCampaigns() {
  return Promise.all(IN_CAMPAIGN_IDS.map(async (campId) => {
    const live = await kvGet(`tracker/${campId}/live.json`);
    const assets = (live?.assets || []).filter(a =>
      a.fieldType === 'YOUTUBE_VIDEO' ||
      a.fieldType === 'PORTRAIT_YOUTUBE_VIDEO' ||
      a.fieldType === 'SQUARE_YOUTUBE_VIDEO'
    );
    return {
      campaignId:    campId,
      campaignLabel: CAMPAIGN_LABELS[campId],
      count:         assets.length,
      limit:         VIDEO_LIMIT,
      atLimit:       assets.length >= VIDEO_LIMIT,
      assets: assets.map(a => ({
        id:               a.id,
        key:              a.key,
        name:             a.name,
        youtubeId:        a.youtubeId,
        fieldType:        a.fieldType,
        spend:            a.spend,
        cpa:              a.cpa,
        performanceLabel: a.performanceLabel,
      })),
    };
  }));
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

async function linkViaAssetGroup(token, customerId, assetRN, assetGroupRN, fieldType) {
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/assetGroupAssets:mutate`,
    { method: 'POST', headers: makeHeaders(token), body: JSON.stringify({
      operations: [{ create: { assetGroup: assetGroupRN, asset: assetRN, fieldType } }],
    }) }
  );
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.results?.[0]?.resourceName;
}

async function linkViaCampaign(token, customerId, assetRN, campaignRN, fieldType) {
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/campaignAssets:mutate`,
    { method: 'POST', headers: makeHeaders(token), body: JSON.stringify({
      operations: [{ create: { campaign: campaignRN, asset: assetRN, fieldType } }],
    }) }
  );
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.results?.[0]?.resourceName;
}

async function removeFromCampaign(token, customerId, campaignId, assetId, fieldType) {
  // CampaignAsset resource name format: customers/{id}/campaignAssets/{campId}~{assetId}~{fieldType}
  const resourceName = `customers/${customerId}/campaignAssets/${campaignId}~${assetId}~${fieldType}`;
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/campaignAssets:mutate`,
    { method: 'POST', headers: makeHeaders(token), body: JSON.stringify({
      operations: [{ remove: resourceName }],
    }) }
  );
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return resourceName;
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
      const [assetGroups, videoAssets, activeCampaigns] = await Promise.all([
        getAssetGroups(token),
        getExistingVideoAssets(token),
        getActiveCampaigns(),
      ]);
      return res.status(200).json({ assetGroups, videoAssets, activeCampaigns });
    } catch (e) {
      console.error('[upload-video GET]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { action = 'upload', campaignId, assetId, fieldType,
            youtubeUrl, existingAssetResourceName, assetGroupResourceName, name } = req.body || {};

    // Safety gate — only IN campaigns can receive writes
    if (!IN_CAMPAIGN_IDS.includes(campaignId)) {
      return res.status(403).json({ error: `Write blocked: campaign ${campaignId} is not an IN campaign.` });
    }

    // REMOVE action
    if (action === 'remove') {
      if (!assetId || !fieldType) return res.status(400).json({ error: 'assetId and fieldType required for remove' });
      try {
        const removed = await removeFromCampaign(token, customerId, campaignId, assetId, fieldType);
        console.log(`[upload-video] Removed ${removed}`);
        return res.status(200).json({ ok: true, removed });
      } catch (e) {
        console.error('[upload-video remove]', e.message);
        return res.status(500).json({ error: e.message });
      }
    }

    // UPLOAD action — check limit first
    if (!VALID_FIELD_TYPES.includes(fieldType)) {
      return res.status(400).json({ error: `fieldType must be one of: ${VALID_FIELD_TYPES.join(', ')}` });
    }

    const activeCampaigns = await getActiveCampaigns();
    const camp = activeCampaigns.find(c => c.campaignId === campaignId);
    if (camp?.atLimit) {
      return res.status(409).json({
        error: `${camp.campaignLabel} is at the ${VIDEO_LIMIT}-video limit. Remove a video first.`,
        count: camp.count,
        limit: VIDEO_LIMIT,
      });
    }

    try {
      let assetRN = existingAssetResourceName;
      if (!assetRN) {
        const videoId = parseYouTubeId(youtubeUrl);
        if (!videoId) return res.status(400).json({ error: 'Could not parse YouTube video ID.' });
        const assetName = name?.trim() || `UH_${videoId}_${fieldType}`;
        assetRN = await createYouTubeAsset(token, customerId, videoId, assetName);
      }

      let linkRN;
      if (assetGroupResourceName) {
        linkRN = await linkViaAssetGroup(token, customerId, assetRN, assetGroupResourceName, fieldType);
      } else {
        const campaignRN = `customers/${customerId}/campaigns/${campaignId}`;
        linkRN = await linkViaCampaign(token, customerId, assetRN, campaignRN, fieldType);
      }

      console.log(`[upload-video] Linked ${assetRN} → campaign ${campaignId} [${fieldType}]`);
      return res.status(200).json({
        ok: true, assetResourceName: assetRN, linkResourceName: linkRN,
        campaignId, campaignLabel: CAMPAIGN_LABELS[campaignId], fieldType,
      });
    } catch (e) {
      console.error('[upload-video POST]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
