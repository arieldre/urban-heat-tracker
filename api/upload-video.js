/**
 * GET  /api/upload-video  → asset groups (all campaigns, read) + existing YouTube video assets
 * POST /api/upload-video  → create/link YouTube video asset — write to IN campaigns ONLY
 *
 * Read: all 4 campaigns. Write: hard-blocked to IN campaign IDs only.
 * UAC campaigns use CampaignAsset linking; PMax uses AssetGroupAsset.
 */
import { getAccessToken, gaQuery, CAMPAIGN_IDS } from './_utils/google.js';

export const maxDuration = 30;

const IN_CAMPAIGN_IDS = ['22784768376', '22879160345'];

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
  // Non-fatal — UAC campaigns return no asset groups (they use campaign-level assets)
  try {
    const result = await gaQuery(token, `
      SELECT
        asset_group.id,
        asset_group.name,
        asset_group.resource_name,
        asset_group.status,
        campaign.id
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
  } catch {
    return [];
  }
}

async function getExistingVideoAssets(token) {
  // GAQL: enum values must NOT be quoted
  const result = await gaQuery(token, `
    SELECT
      asset.id,
      asset.name,
      asset.resource_name,
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

// For Performance Max campaigns with asset groups
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

// For UAC campaigns — link at campaign level
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const customerId = process.env.GOOGLE_CUSTOMER_ID;
  let token;
  try { token = await getAccessToken(); }
  catch (e) { return res.status(500).json({ error: 'Google auth failed: ' + e.message }); }

  if (req.method === 'GET') {
    try {
      const [assetGroups, videoAssets] = await Promise.all([
        getAssetGroups(token),
        getExistingVideoAssets(token),
      ]);
      return res.status(200).json({ assetGroups, videoAssets });
    } catch (e) {
      console.error('[upload-video GET]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { youtubeUrl, existingAssetResourceName, assetGroupResourceName, campaignId, fieldType, name } = req.body || {};

    if (!VALID_FIELD_TYPES.includes(fieldType)) {
      return res.status(400).json({ error: `fieldType must be one of: ${VALID_FIELD_TYPES.join(', ')}` });
    }

    // Safety gate — only IN campaigns can receive writes
    const targetCampaignId = campaignId || assetGroupResourceName?.match(/campaigns\/(\d+)/)?.[1];
    if (!IN_CAMPAIGN_IDS.includes(targetCampaignId)) {
      return res.status(403).json({ error: `Write blocked: campaign ${targetCampaignId} is not an IN campaign.` });
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
        // PMax campaign — use asset group linking
        linkRN = await linkViaAssetGroup(token, customerId, assetRN, assetGroupResourceName, fieldType);
      } else {
        // UAC campaign — use campaign-level linking
        const campaignRN = `customers/${customerId}/campaigns/${targetCampaignId}`;
        linkRN = await linkViaCampaign(token, customerId, assetRN, campaignRN, fieldType);
      }

      console.log(`[upload-video] Linked ${assetRN} → campaign ${targetCampaignId} [${fieldType}]`);
      return res.status(200).json({
        ok: true,
        assetResourceName: assetRN,
        linkResourceName:  linkRN,
        campaignId:        targetCampaignId,
        campaignLabel:     CAMPAIGN_LABELS[targetCampaignId],
        fieldType,
      });
    } catch (e) {
      console.error('[upload-video POST]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
