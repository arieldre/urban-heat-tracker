/**
 * Video asset upload for IN campaigns ONLY.
 * GET  /api/upload-video          → existing video assets + asset groups for IN campaigns
 * POST /api/upload-video          → link existing asset OR create new YouTube asset, then link to asset group
 *
 * Hardcoded to IN campaign IDs — rejects any asset group outside these campaigns.
 */
import { getAccessToken, gaQuery } from './_utils/google.js';

export const maxDuration = 30;

// IN campaigns only — never touch US campaigns
const IN_CAMPAIGN_IDS = ['22784768376', '22879160345'];

const IN_CAMPAIGN_LABELS = {
  '22784768376': 'Fast Prog (IN GP)',
  '22879160345': 'Battle Act (IN GP)',
};

const VALID_FIELD_TYPES = ['YOUTUBE_VIDEO', 'PORTRAIT_YOUTUBE_VIDEO', 'SQUARE_YOUTUBE_VIDEO'];

export function parseYouTubeId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('?')[0];
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2];
      return url.searchParams.get('v');
    }
  } catch {}
  return null;
}

async function getAssetGroups(token) {
  const result = await gaQuery(token, `
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group.resource_name,
      asset_group.status,
      campaign.id,
      campaign.name
    FROM asset_group
    WHERE campaign.id IN (${IN_CAMPAIGN_IDS.join(', ')})
  `);
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
  return (result.results || []).map(r => ({
    id:            r.assetGroup.id,
    name:          r.assetGroup.name,
    resourceName:  r.assetGroup.resourceName,
    status:        r.assetGroup.status,
    campaignId:    r.campaign.id,
    campaignLabel: IN_CAMPAIGN_LABELS[r.campaign.id] || r.campaign.id,
  }));
}

async function getExistingVideoAssets(token) {
  const result = await gaQuery(token, `
    SELECT
      asset.id,
      asset.name,
      asset.resource_name,
      asset.youtube_video_asset.youtube_video_id
    FROM asset
    WHERE asset.type = 'YOUTUBE_VIDEO'
      AND asset.status != 'REMOVED'
    ORDER BY asset.name
    LIMIT 200
  `);
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
  return (result.results || []).map(r => ({
    id:           r.asset.id,
    name:         r.asset.name,
    resourceName: r.asset.resourceName,
    videoId:      r.asset.youtubeVideoAsset?.youtubeVideoId,
  })).filter(a => a.videoId);
}

async function createYouTubeAsset(token, customerId, videoId, assetName) {
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/assets:mutate`,
    {
      method: 'POST',
      headers: {
        'Authorization':     `Bearer ${token}`,
        'developer-token':   process.env.GOOGLE_DEVELOPER_TOKEN,
        'login-customer-id': customerId,
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        operations: [{
          create: {
            name: assetName,
            youtubeVideoAsset: { youtubeVideoId: videoId },
          },
        }],
      }),
    }
  );
  const data = await r.json();
  if (data.error || !data.results) throw new Error(data.error?.message || JSON.stringify(data));
  return data.results[0].resourceName;
}

async function linkAssetToGroup(token, customerId, assetResourceName, assetGroupResourceName, fieldType) {
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/assetGroupAssets:mutate`,
    {
      method: 'POST',
      headers: {
        'Authorization':     `Bearer ${token}`,
        'developer-token':   process.env.GOOGLE_DEVELOPER_TOKEN,
        'login-customer-id': customerId,
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        operations: [{
          create: {
            assetGroup: assetGroupResourceName,
            asset:      assetResourceName,
            fieldType,
          },
        }],
      }),
    }
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
  try {
    token = await getAccessToken();
  } catch (e) {
    return res.status(500).json({ error: 'Google auth failed: ' + e.message });
  }

  // GET — return existing video assets + asset groups for IN campaigns
  if (req.method === 'GET') {
    const [assetGroups, videoAssets] = await Promise.all([
      getAssetGroups(token),
      getExistingVideoAssets(token),
    ]);
    return res.status(200).json({ assetGroups, videoAssets });
  }

  // POST — link existing asset OR create new, then link to IN asset group
  if (req.method === 'POST') {
    const { youtubeUrl, existingAssetResourceName, assetGroupResourceName, fieldType, name } = req.body || {};

    if (!VALID_FIELD_TYPES.includes(fieldType)) {
      return res.status(400).json({ error: `fieldType must be one of: ${VALID_FIELD_TYPES.join(', ')}` });
    }

    // Validate asset group is an IN campaign — safety gate
    const groups = await getAssetGroups(token);
    const targetGroup = groups.find(g => g.resourceName === assetGroupResourceName);
    if (!targetGroup) {
      return res.status(403).json({ error: 'Asset group not found in IN campaigns. Upload blocked.' });
    }

    let assetResourceName;

    if (existingAssetResourceName) {
      // Reuse existing asset — no creation needed
      assetResourceName = existingAssetResourceName;
    } else {
      const videoId = parseYouTubeId(youtubeUrl);
      if (!videoId) return res.status(400).json({ error: 'Could not parse YouTube video ID.' });
      const assetName = name?.trim() || `UH_${videoId}_${fieldType}`;
      assetResourceName = await createYouTubeAsset(token, customerId, videoId, assetName);
    }

    const linkResourceName = await linkAssetToGroup(token, customerId, assetResourceName, assetGroupResourceName, fieldType);

    console.log(`[upload-video] Linked ${assetResourceName} → ${targetGroup.name} [${fieldType}]`);

    return res.status(200).json({
      ok: true,
      assetResourceName,
      linkResourceName,
      group:     targetGroup.name,
      campaign:  targetGroup.campaignLabel,
      fieldType,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
