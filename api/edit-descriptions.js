/**
 * GET  /api/edit-descriptions            → headlines + descriptions for IN UH campaigns
 * POST /api/edit-descriptions            → add/remove text asset (action, campaignId, fieldType, text)
 *
 * GET  /api/edit-descriptions?type=videos[&campaignId=X] → list video assets for Invokers Google
 * POST /api/edit-descriptions            → pause/remove or resume/add video (type, action, assetId, campaignId)
 *
 * All mutations use the same ads:mutate pattern: read full list → modify → send full list.
 * Videos use login-customer-id = INV_GOOGLE_CUSTOMER_ID (5004458850), texts use UH customer ID.
 */
import { getAccessToken, gaQuery } from './_utils/google.js';

export const maxDuration = 60;

// ── UH text asset constants ────────────────────────────────────────────────────
const UH_CAMPAIGN_IDS = ['22784768376', '22879160345', '23583585016', '23583625147'];
const CAMPAIGN_LABELS = {
  '22784768376': 'Fast Prog (IN GP)',
  '22879160345': 'Battle Act (IN GP)',
  '23583585016': 'US GP',
  '23583625147': 'US iOS',
};
const FIELD_MAP = {
  HEADLINE:    { adField: 'headlines',    updateMask: 'app_ad.headlines',    limit: 5, maxLen: 30 },
  DESCRIPTION: { adField: 'descriptions', updateMask: 'app_ad.descriptions', limit: 5, maxLen: 90 },
};

// ── Invokers Google constants ─────────────────────────────────────────────────
const INV_CUSTOMER_ID = (process.env.INV_GOOGLE_CUSTOMER_ID || '5004458850').replace(/[\s-]/g, '');

function deriveInvGoogleShortLabel(name = '') {
  const parts = name.replace(/^INV_/i, '').replace(/^GG_/i, '').split('_');
  const filtered = parts.filter(p => !/^\d{6}$/.test(p) && p !== 'All');
  return filtered.slice(0, 3).join(' ').slice(0, 16) || name.slice(0, 16);
}

async function getInvGoogleCampaigns(token) {
  const result = await gaQuery(token, `
    SELECT campaign.id, campaign.name
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND campaign.advertising_channel_type = 'MULTI_CHANNEL'
  `, INV_CUSTOMER_ID);
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
  return (result.results || []).map(r => ({
    id: String(r.campaign.id),
    name: r.campaign.name,
    shortLabel: deriveInvGoogleShortLabel(r.campaign.name),
  }));
}

function parseYouTubeId(input) {
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

async function createInvYouTubeAsset(token, videoId, name) {
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${INV_CUSTOMER_ID}/assets:mutate`,
    {
      method: 'POST',
      headers: makeHeaders(token, INV_CUSTOMER_ID),
      body: JSON.stringify({
        operations: [{ create: { name, youtubeVideoAsset: { youtubeVideoId: videoId } } }],
      }),
    }
  );
  const data = await r.json();
  if (data.error || !data.results) throw new Error(data.error?.message || JSON.stringify(data));
  return data.results[0].resourceName;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
function makeHeaders(token, customerId) {
  return {
    'Authorization':     `Bearer ${token}`,
    'developer-token':   process.env.GOOGLE_DEVELOPER_TOKEN,
    'login-customer-id': customerId,
    'Content-Type':      'application/json',
  };
}

async function getAdTexts(token, campaignId) {
  const result = await gaQuery(token, `
    SELECT ad_group_ad.ad.resource_name,
           ad_group_ad.ad.app_ad.headlines,
           ad_group_ad.ad.app_ad.descriptions
    FROM ad_group_ad
    WHERE campaign.id = ${campaignId}
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

async function getInvBidInfo(token) {
  // Step 1: get campaign id, tCPA, budget resource name
  const campResult = await gaQuery(token, `
    SELECT campaign.id, campaign.name,
           campaign.target_cpa.target_cpa_micros,
           campaign.campaign_budget
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND campaign.advertising_channel_type = 'MULTI_CHANNEL'
  `, INV_CUSTOMER_ID);
  if (campResult.error) throw new Error(campResult.error.message || JSON.stringify(campResult.error));
  const camp = campResult.results?.[0]?.campaign;
  if (!camp) throw new Error('No active UAC campaign found for Invokers');

  // Step 2: get budget amount from budget resource
  const budgetRN = camp.campaignBudget;
  const budgetResult = await gaQuery(token, `
    SELECT campaign_budget.amount_micros, campaign_budget.resource_name
    FROM campaign_budget
    WHERE campaign_budget.resource_name = '${budgetRN}'
  `, INV_CUSTOMER_ID);
  if (budgetResult.error) throw new Error(budgetResult.error.message || JSON.stringify(budgetResult.error));
  const budget = budgetResult.results?.[0]?.campaignBudget;

  return {
    campaignId: String(camp.id),
    campaignName: camp.name,
    campaignRN: `customers/${INV_CUSTOMER_ID}/campaigns/${camp.id}`,
    tcpaMicros: String(camp.targetCpa?.targetCpaMicros || '0'),
    budgetRN: budget?.resourceName || budgetRN,
    budgetMicros: String(budget?.amountMicros || '0'),
  };
}

async function getInvActiveVideos(token, campaignId) {
  const result = await gaQuery(token, `
    SELECT ad_group_ad.ad.resource_name, ad_group_ad.ad.app_ad.youtube_videos
    FROM ad_group_ad
    WHERE campaign.id = ${campaignId}
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

  // ── Invokers bid & budget info ────────────────────────────────────────────────
  if (req.method === 'GET' && req.query.type === 'bid-info') {
    try {
      const info = await getInvBidInfo(token);
      return res.status(200).json(info);
    } catch (e) {
      console.error('[edit-descriptions GET bid-info]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST' && req.body?.type === 'bid-update') {
    const { field, value } = req.body;
    if (!['tcpa', 'budget'].includes(field)) return res.status(400).json({ error: 'field must be "tcpa" or "budget"' });
    const micros = Math.round(parseFloat(value) * 1_000_000);
    if (!micros || micros <= 0) return res.status(400).json({ error: 'value must be positive number in dollars' });

    try {
      const info = await getInvBidInfo(token);
      if (field === 'tcpa') {
        const r = await fetch(
          `https://googleads.googleapis.com/v23/customers/${INV_CUSTOMER_ID}/campaigns:mutate`,
          {
            method: 'POST',
            headers: makeHeaders(token, INV_CUSTOMER_ID),
            body: JSON.stringify({
              operations: [{
                update: { resourceName: info.campaignRN, targetCpa: { targetCpaMicros: String(micros) } },
                updateMask: 'target_cpa.target_cpa_micros',
              }],
            }),
          }
        );
        const data = await r.json();
        if (!data.results) throw new Error(data.error?.message || JSON.stringify(data));
        console.log(`[edit-descriptions] tCPA updated: ${info.tcpaMicros} → ${micros}`);
        return res.status(200).json({ ok: true, field, newMicros: String(micros) });
      }

      if (field === 'budget') {
        const r = await fetch(
          `https://googleads.googleapis.com/v23/customers/${INV_CUSTOMER_ID}/campaignBudgets:mutate`,
          {
            method: 'POST',
            headers: makeHeaders(token, INV_CUSTOMER_ID),
            body: JSON.stringify({
              operations: [{
                update: { resourceName: info.budgetRN, amountMicros: String(micros) },
                updateMask: 'amount_micros',
              }],
            }),
          }
        );
        const data = await r.json();
        if (!data.results) throw new Error(data.error?.message || JSON.stringify(data));
        console.log(`[edit-descriptions] budget updated: ${info.budgetMicros} → ${micros}`);
        return res.status(200).json({ ok: true, field, newMicros: String(micros) });
      }
    } catch (e) {
      console.error('[edit-descriptions POST bid-update]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Invokers video assets ────────────────────────────────────────────────────
  if (req.method === 'GET' && req.query.type === 'videos') {
    try {
      const campaigns = await getInvGoogleCampaigns(token);
      const selectedId = req.query.campaignId;
      const activeCampaignId = selectedId || (campaigns[0]?.id ?? null);

      if (!activeCampaignId) return res.status(200).json({ videos: [], campaigns, adRN: null });

      const today = new Date();
      const from  = new Date(today);
      from.setDate(from.getDate() - 30);
      const fromStr = from.toISOString().slice(0, 10);
      const toStr   = today.toISOString().slice(0, 10);

      const [assetsResult, metricsResult, activeVideos] = await Promise.all([
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
          WHERE campaign.id = ${activeCampaignId}
            AND ad_group_ad_asset_view.field_type = 'YOUTUBE_VIDEO'
        `, INV_CUSTOMER_ID),
        gaQuery(token, `
          SELECT
            asset.id,
            metrics.cost_micros,
            metrics.conversions,
            metrics.all_conversions
          FROM ad_group_ad_asset_view
          WHERE campaign.id = ${activeCampaignId}
            AND ad_group_ad_asset_view.field_type = 'YOUTUBE_VIDEO'
            AND segments.date BETWEEN '${fromStr}' AND '${toStr}'
        `, INV_CUSTOMER_ID),
        getInvActiveVideos(token, activeCampaignId),
      ]);
      if (assetsResult.error) throw new Error(assetsResult.error.message || JSON.stringify(assetsResult.error));

      // Aggregate 30d metrics by asset ID
      const metricsByAsset = {};
      for (const row of (metricsResult.results || [])) {
        const id = String(row.asset?.id || '');
        if (!id) continue;
        if (!metricsByAsset[id]) metricsByAsset[id] = { costMicros: 0, conversions: 0, allConversions: 0 };
        metricsByAsset[id].costMicros    += parseFloat(row.metrics?.costMicros    || 0);
        metricsByAsset[id].conversions   += parseFloat(row.metrics?.conversions   || 0);
        metricsByAsset[id].allConversions += parseFloat(row.metrics?.allConversions || 0);
      }

      const activeSet = new Set(activeVideos.youtubeVideos.map(v => v.asset));
      const videos = (assetsResult.results || []).map(row => {
        const view  = row.adGroupAdAssetView;
        const asset = row.asset;
        const assetRN = asset?.resourceName;
        const assetId = String(asset?.id || '');
        const m = metricsByAsset[assetId] || {};
        const spend = m.costMicros ? +(m.costMicros / 1_000_000).toFixed(2) : 0;
        const iaa   = (m.allConversions || 0) - (m.conversions || 0);
        return {
          assetId,
          assetRN,
          campaignId: activeCampaignId,
          name:             asset?.name || '',
          videoId:          asset?.youtubeVideoAsset?.youtubeVideoId   || '',
          title:            asset?.youtubeVideoAsset?.youtubeVideoTitle || '',
          fieldType:        view?.fieldType || 'YOUTUBE_VIDEO',
          performanceLabel: view?.performanceLabel || 'UNSPECIFIED',
          active:           activeSet.has(assetRN),
          spend,
          installs:   m.conversions   ? +m.conversions.toFixed(0)   : 0,
          cpi:        m.conversions > 0 ? +(spend / m.conversions).toFixed(2)  : null,
          cpaIaa:     iaa > 0           ? +(spend / iaa).toFixed(2)            : null,
        };
      });
      return res.status(200).json({ videos, campaigns, adRN: activeVideos.adRN });
    } catch (e) {
      console.error('[edit-descriptions GET videos]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST' && req.body?.type === 'videos') {
    const { action, assetId, youtubeUrl, assetName, campaignId: postCampaignId } = req.body;
    if (!postCampaignId) return res.status(400).json({ error: 'campaignId required' });

    if (action === 'upload') {
      const videoId = parseYouTubeId(youtubeUrl);
      if (!videoId) return res.status(400).json({ error: 'Could not parse YouTube video ID' });
      try {
        const { adRN, youtubeVideos } = await getInvActiveVideos(token, postCampaignId);
        if (youtubeVideos.length >= 20) return res.status(400).json({ error: 'At 20-video limit — remove one first' });
        const name = assetName?.trim() || `INV_${videoId}`;
        const assetRN = await createInvYouTubeAsset(token, videoId, name);
        const newList = [...youtubeVideos, { asset: assetRN }];
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
        console.log(`[edit-descriptions] uploaded video ${videoId} as ${assetRN}, active: ${newList.length}`);
        return res.status(200).json({ ok: true, assetRN, videoId, name, activeCount: newList.length });
      } catch (e) {
        console.error('[edit-descriptions POST videos upload]', e.message);
        return res.status(500).json({ error: e.message });
      }
    }

    if (!['pause', 'resume'].includes(action)) return res.status(400).json({ error: 'action must be "pause", "resume", or "upload"' });
    if (!assetId) return res.status(400).json({ error: 'assetId required' });

    try {
      const { adRN, youtubeVideos } = await getInvActiveVideos(token, postCampaignId);
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
        UH_CAMPAIGN_IDS.map(async (campId) => {
          const { headlines, descriptions } = await getAdTexts(token, campId);
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
    if (!UH_CAMPAIGN_IDS.includes(campaignId)) {
      return res.status(403).json({ error: `Write blocked: campaign ${campaignId} is not a UH campaign.` });
    }
    const mapping = FIELD_MAP[fieldType];
    if (!mapping) return res.status(400).json({ error: `Unsupported fieldType: ${fieldType}. Use HEADLINE or DESCRIPTION.` });
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
    const trimmed = text.trim();
    if (trimmed.length > mapping.maxLen) {
      return res.status(400).json({ error: `${fieldType} max length is ${mapping.maxLen} chars (got ${trimmed.length})` });
    }

    try {
      const current = await getAdTexts(token, campaignId);
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
