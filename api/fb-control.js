import { hasCredentials } from './_utils/facebook.js';
import { getAdCampaignId, updateAdStatus } from './_utils/fb-mutations.js';
import { hasInvCredentials, updateInvAdStatus } from './_utils/invokers-facebook.js';

const ALLOWED_CAMPAIGN = process.env.FB_CONTROL_CAMPAIGN_ID;
const VALID_STATUSES = new Set(['ACTIVE', 'PAUSED']);

const BASE = 'https://graph.facebook.com/v21.0';
const invToken = () => process.env.INV_FB_ACCESS_TOKEN;
const invAccount = () => process.env.INV_FB_AD_ACCOUNT_ID || 'act_1121972276790088';
const INV_PAGE_ID = '769225059616541';

const uhToken = () => process.env.FB_ACCESS_TOKEN;
const uhAccount = () => process.env.FB_AD_ACCOUNT_ID || 'act_816445786671331';
const UH_PAGE_ID = '298207346705441';

function gameCredentials(game) {
  return game === 'uh'
    ? { token: uhToken(), account: uhAccount(), pageId: UH_PAGE_ID }
    : { token: invToken(), account: invAccount(), pageId: INV_PAGE_ID };
}

async function fbGet(token, path, params = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params });
  const r = await fetch(`${BASE}/${path}?${qs}`);
  const data = await r.json();
  if (data.error) throw new Error(`FB: ${data.error.message} (${data.error.code})`);
  return data;
}

async function fbGetAll(token, path, params = {}) {
  const items = [];
  const qs = new URLSearchParams({ access_token: token, limit: '100', ...params });
  let url = `${BASE}/${path}?${qs}`;
  while (url) {
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) throw new Error(`FB: ${data.error.message}`);
    items.push(...(data.data || []));
    url = data.paging?.next || null;
  }
  return items;
}

export default async function handler(req, res) {
  // --- GET: creative library, used IDs, adsets ---
  if (req.method === 'GET') {
    const { action, game = 'inv' } = req.query;
    const { token, account } = gameCredentials(game);
    if (!token) return res.status(500).json({ error: `Missing FB credentials for game=${game}` });

    try {
      if (action === 'library') {
        const videos = await fbGetAll(token, `${account}/advideos`, {
          fields: 'id,title,picture,length,created_time',
        });
        videos.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
        return res.json({ videos });
      }

      if (action === 'used') {
        const creatives = await fbGetAll(token, `${account}/adcreatives`, {
          fields: 'video_id,object_story_spec',
        });
        const ids = new Set();
        for (const c of creatives) {
          if (c.video_id) ids.add(c.video_id);
          const vid = c.object_story_spec?.video_data?.video_id;
          if (vid) ids.add(vid);
        }
        return res.json({ videoIds: [...ids] });
      }

      if (action === 'adsets') {
        const adsets = await fbGetAll(token, `${account}/adsets`, {
          fields: 'id,name,status,promoted_object',
          filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
        });
        const mapped = adsets.map(a => {
          const storeUrl = a.promoted_object?.object_store_url || '';
          const platform = storeUrl.includes('apple') || a.name?.toLowerCase().includes('ios')
            ? 'ios' : 'android';
          return { id: a.id, name: a.name, platform, storeUrl };
        });
        return res.json({ adsets: mapped });
      }

      if (action === 'campaigns') {
        const campaigns = await fbGetAll(token, `${account}/campaigns`, {
          fields: 'id,name,status,effective_status,objective,daily_budget',
          filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
        });
        return res.json({ campaigns });
      }

      if (action === 'adset-detail') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id required' });
        const adset = await fbGet(token, id, {
          fields: 'id,name,campaign_id,targeting,billing_event,optimization_goal,bid_amount,bid_strategy,promoted_object,destination_type,daily_budget,status',
        });
        return res.json({ adset });
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};

  // --- POST: create creative + ad ---
  if (body.action === 'create-ad') {
    const { videoId, adsetId, message = '', game: adGame = 'inv' } = body;
    if (!videoId || !adsetId) return res.status(400).json({ error: 'videoId and adsetId required' });
    const { token: adToken, account: adAccount, pageId } = gameCredentials(adGame);
    if (!adToken) return res.status(500).json({ error: `Missing FB credentials for game=${adGame}` });
    const prefix = adGame === 'uh' ? 'UH' : 'INV';

    try {
      // Detect iOS vs Android from adset promoted_object (BP-065: CTA URL must match)
      const adsetData = await fbGet(adToken, adsetId, { fields: 'name,promoted_object' });
      const storeUrl = adsetData.promoted_object?.object_store_url || '';
      if (!storeUrl) throw new Error('Adset has no object_store_url — cannot determine app store URL');

      // Get preferred thumbnail
      const thumbData = await fbGet(adToken, `${videoId}/thumbnails`);
      const preferred = thumbData.data?.find(t => t.is_preferred) || thumbData.data?.[0];
      if (!preferred) throw new Error('No thumbnail found for video ' + videoId);

      // Download + upload thumbnail to adimages (BP-065: image_hash required, not URL)
      const imgRes = await fetch(preferred.uri);
      if (!imgRes.ok) throw new Error('Failed to download thumbnail');
      const imgBuffer = await imgRes.arrayBuffer();

      const form = new FormData();
      form.append('thumbnail.jpg', new Blob([imgBuffer], { type: 'image/jpeg' }), 'thumbnail.jpg');
      form.append('access_token', adToken);

      const uploadRes = await fetch(`${BASE}/${adAccount}/adimages`, { method: 'POST', body: form });
      const uploadData = await uploadRes.json();
      if (uploadData.error) throw new Error(`Image upload: ${uploadData.error.message}`);
      const imageHash = uploadData.images?.['thumbnail.jpg']?.hash;
      if (!imageHash) throw new Error('No image hash from adimages upload');

      // Create creative
      const creativeRes = await fetch(`${BASE}/${adAccount}/adcreatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${prefix}_creative_${videoId}_${Date.now()}`,
          object_story_spec: {
            page_id: pageId,
            video_data: {
              video_id: videoId,
              image_hash: imageHash,
              ...(message && { message }),
              call_to_action: { type: 'INSTALL_MOBILE_APP', value: { link: storeUrl } },
            },
          },
          access_token: adToken,
        }),
      });
      const creativeData = await creativeRes.json();
      if (creativeData.error) throw new Error(`Creative: ${creativeData.error.message}`);

      // Create ad (PAUSED)
      const adRes = await fetch(`${BASE}/${adAccount}/ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${prefix}_ad_${videoId}_${Date.now()}`,
          adset_id: adsetId,
          creative: { creative_id: creativeData.id },
          status: 'PAUSED',
          access_token: adToken,
        }),
      });
      const adData = await adRes.json();
      if (adData.error) throw new Error(`Ad: ${adData.error.message}`);

      console.log(`[fb-control/create-ad/${adGame}] created ad ${adData.id} creative ${creativeData.id}`);
      return res.json({ adId: adData.id, creativeId: creativeData.id, imageHash });
    } catch (e) {
      console.error(`[fb-control/create-ad/${adGame}]`, e);
      return res.status(500).json({ error: e.message });
    }
  }

  // --- POST: create campaign ---
  if (body.action === 'create-campaign') {
    const { name, game: cg = 'inv', dailyBudget } = body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const { token: ct, account: ca } = gameCredentials(cg);
    if (!ct) return res.status(500).json({ error: `Missing FB credentials for game=${cg}` });
    try {
      const fbR = await fetch(`${BASE}/${ca}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          objective: 'OUTCOME_APP_PROMOTION',
          special_ad_categories: [],
          status: 'PAUSED',
          ...(dailyBudget && { daily_budget: String(Math.round(parseFloat(dailyBudget) * 100)) }),
          access_token: ct,
        }),
      });
      const fbD = await fbR.json();
      if (fbD.error) throw new Error(fbD.error.message);
      console.log(`[fb-control/create-campaign/${cg}] ${fbD.id}`);
      return res.json({ campaignId: fbD.id, name });
    } catch (e) {
      console.error('[fb-control/create-campaign]', e);
      return res.status(500).json({ error: e.message });
    }
  }

  // --- POST: create adset (clone from existing) ---
  if (body.action === 'create-adset') {
    const { campaignId: newCampId, sourceAdsetId, name, dailyBudget, game: ag = 'inv' } = body;
    if (!newCampId || !sourceAdsetId || !name || !dailyBudget) {
      return res.status(400).json({ error: 'campaignId, sourceAdsetId, name, dailyBudget required' });
    }
    const { token: at, account: aa } = gameCredentials(ag);
    if (!at) return res.status(500).json({ error: `Missing FB credentials for game=${ag}` });
    try {
      const src = await fbGet(at, sourceAdsetId, {
        fields: 'targeting,billing_event,optimization_goal,bid_amount,bid_strategy,promoted_object,destination_type,attribution_spec',
      });
      // Strip internal-only fields that FB rejects on create
      const promotedObj = src.promoted_object
        ? (({ application_id, object_store_url, custom_event_type, pixel_id, pixel_aggregation_rule }) =>
            Object.fromEntries(Object.entries({ application_id, object_store_url, custom_event_type, pixel_id, pixel_aggregation_rule }).filter(([, v]) => v != null))
          )(src.promoted_object)
        : null;
      const fbR = await fetch(`${BASE}/${aa}/adsets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          campaign_id: newCampId,
          billing_event: src.billing_event,
          optimization_goal: src.optimization_goal,
          ...(src.bid_amount && { bid_amount: src.bid_amount }),
          ...(src.bid_strategy && { bid_strategy: src.bid_strategy }),
          targeting: src.targeting,
          ...(promotedObj && { promoted_object: promotedObj }),
          ...(src.destination_type && src.destination_type !== 'UNDEFINED' && { destination_type: src.destination_type }),
          ...(src.attribution_spec?.length && { attribution_spec: src.attribution_spec }),
          daily_budget: String(Math.round(parseFloat(dailyBudget) * 100)),
          status: 'PAUSED',
          access_token: at,
        }),
      });
      const fbD = await fbR.json();
      if (fbD.error) throw new Error(fbD.error.message);
      console.log(`[fb-control/create-adset/${ag}] ${fbD.id} in campaign ${newCampId}`);
      return res.json({ adsetId: fbD.id, name });
    } catch (e) {
      console.error('[fb-control/create-adset]', e);
      return res.status(500).json({ error: e.message });
    }
  }

  // --- POST: pause/resume ad status ---
  const { adId, status, game } = body;

  if (!adId || !/^\d+$/.test(String(adId))) {
    return res.status(400).json({ error: 'Invalid adId' });
  }
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: 'status must be ACTIVE or PAUSED' });
  }

  // Invokers — no campaign restriction
  if (game === 'inv') {
    if (!hasInvCredentials()) return res.status(500).json({ error: 'Missing Invokers FB credentials' });
    try {
      await updateInvAdStatus(String(adId), status);
      console.log(`[fb-control/inv] ${status} ad ${adId}`);
      return res.status(200).json({ ok: true, adId, status });
    } catch (e) {
      console.error('[fb-control/inv]', e);
      return res.status(500).json({ error: e.message });
    }
  }

  // Urban Heat — campaign whitelist enforced
  if (!hasCredentials()) return res.status(500).json({ error: 'Missing FB credentials' });
  if (!ALLOWED_CAMPAIGN) return res.status(500).json({ error: 'FB_CONTROL_CAMPAIGN_ID not configured' });

  try {
    const campaignId = await getAdCampaignId(String(adId));
    if (campaignId !== ALLOWED_CAMPAIGN) {
      console.warn(`[fb-control] Blocked: ad ${adId} in campaign ${campaignId}, not ${ALLOWED_CAMPAIGN}`);
      return res.status(403).json({ error: 'Ad not in allowed campaign' });
    }
    await updateAdStatus(String(adId), status);
    console.log(`[fb-control] ${status} ad ${adId} in campaign ${campaignId}`);
    return res.status(200).json({ ok: true, adId, status });
  } catch (e) {
    console.error('[fb-control]', e);
    return res.status(500).json({ error: e.message });
  }
}
