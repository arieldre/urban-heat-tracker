import { hasCredentials } from './_utils/facebook.js';
import { getAdCampaignId, updateAdStatus } from './_utils/fb-mutations.js';
import { hasInvCredentials, updateInvAdStatus } from './_utils/invokers-facebook.js';

const ALLOWED_CAMPAIGN = process.env.FB_CONTROL_CAMPAIGN_ID;
const VALID_STATUSES = new Set(['ACTIVE', 'PAUSED']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { adId, status, game } = req.body || {};

  if (!adId || !/^\d+$/.test(String(adId))) {
    return res.status(400).json({ error: 'Invalid adId' });
  }
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: 'status must be ACTIVE or PAUSED' });
  }

  // Invokers — no campaign restriction, any ad in the INV account
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
      console.warn(`[fb-control] Blocked: ad ${adId} is in campaign ${campaignId}, not ${ALLOWED_CAMPAIGN}`);
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
