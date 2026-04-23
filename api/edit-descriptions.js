/**
 * GET  /api/edit-descriptions → current headlines + descriptions for IN campaigns (live from API)
 * POST /api/edit-descriptions → add (action=add) | remove (action=remove) text asset
 *
 * APP_AD text assets live in ad.appAd.headlines[] / ad.appAd.descriptions[].
 * Each entry is { text: "..." } (AdTextAsset) — not an asset resource name.
 * Same ads:mutate pattern as youtube_videos: read full list → modify → send full updated list.
 * Write: hard-blocked to IN campaign IDs only.
 */
import { getAccessToken, gaQuery } from './_utils/google.js';

export const maxDuration = 60;

const IN_CAMPAIGN_IDS = ['22784768376', '22879160345'];

const CAMPAIGN_AD_GROUPS = {
  '22784768376': '182709178495',
  '22879160345': '183171683706',
};

const CAMPAIGN_LABELS = {
  '22784768376': 'Fast Prog (IN GP)',
  '22879160345': 'Battle Act (IN GP)',
};

// APP_AD supports headlines[] and descriptions[] only — LONG_HEADLINE is not a mutable APP_AD field
const FIELD_MAP = {
  HEADLINE:    { adField: 'headlines',    updateMask: 'app_ad.headlines',    limit: 5, maxLen: 30 },
  DESCRIPTION: { adField: 'descriptions', updateMask: 'app_ad.descriptions', limit: 5, maxLen: 90 },
};

function makeHeaders(token) {
  return {
    'Authorization':     `Bearer ${token}`,
    'developer-token':   process.env.GOOGLE_DEVELOPER_TOKEN,
    'login-customer-id': process.env.GOOGLE_CUSTOMER_ID,
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
    adRN:        ad?.resourceName,
    headlines:   ad?.appAd?.headlines   || [],
    descriptions: ad?.appAd?.descriptions || [],
  };
}

async function mutateAdTexts(token, customerId, adRN, adField, newList, updateMask) {
  const appAdUpdate = { [adField]: newList };
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/ads:mutate`,
    {
      method: 'POST',
      headers: makeHeaders(token),
      body: JSON.stringify({
        operations: [{
          update: { resourceName: adRN, appAd: appAdUpdate },
          updateMask,
        }],
      }),
    }
  );
  const data = await r.json();
  if (!data.results) throw new Error(data.error?.message || JSON.stringify(data));
  return data;
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
    if (!mapping) {
      return res.status(400).json({ error: `Unsupported fieldType: ${fieldType}. Use HEADLINE or DESCRIPTION.` });
    }
    if (!text?.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }
    const trimmed = text.trim();
    if (trimmed.length > mapping.maxLen) {
      return res.status(400).json({ error: `${fieldType} max length is ${mapping.maxLen} chars (got ${trimmed.length})` });
    }

    const adGroupId = CAMPAIGN_AD_GROUPS[campaignId];

    try {
      const current = await getAdTexts(token, adGroupId);
      const { adRN, [mapping.adField]: currentList } = current;

      if (action === 'add') {
        if (currentList.length >= mapping.limit) {
          return res.status(400).json({ error: `At ${mapping.limit}-asset limit for ${fieldType} — remove one first` });
        }
        if (currentList.some(a => a.text === trimmed)) {
          return res.status(400).json({ error: `"${trimmed}" already exists in ${fieldType}` });
        }
        const newList = [...currentList, { text: trimmed }];
        await mutateAdTexts(token, customerId, adRN, mapping.adField, newList, mapping.updateMask);
        console.log(`[edit-descriptions] Added ${fieldType} to ${campaignId}: "${trimmed}"`);
        return res.status(200).json({ ok: true, count: newList.length });
      }

      if (action === 'remove') {
        if (!currentList.some(a => a.text === trimmed)) {
          return res.status(400).json({ error: `"${trimmed}" not found in ${fieldType}` });
        }
        const newList = currentList.filter(a => a.text !== trimmed);
        await mutateAdTexts(token, customerId, adRN, mapping.adField, newList, mapping.updateMask);
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
