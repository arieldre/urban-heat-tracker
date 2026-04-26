import { hasCredentials } from './_utils/facebook.js';
import { getAdCampaignId, updateAdStatus } from './_utils/fb-mutations.js';

// Only ads belonging to this campaign can be paused/resumed.
// Server fetches the ad's real campaign from FB to verify — client value is never trusted.
const ALLOWED_CAMPAIGN = process.env.FB_CONTROL_CAMPAIGN_ID;
const VALID_STATUSES = new Set(['ACTIVE', 'PAUSED']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!hasCredentials()) return res.status(500).json({ error: 'Missing FB credentials' });
  if (!ALLOWED_CAMPAIGN) return res.status(500).json({ error: 'FB_CONTROL_CAMPAIGN_ID not configured' });

  const { adId, status } = req.body || {};

  if (!adId || !/^\d+$/.test(String(adId))) {
    return res.status(400).json({ error: 'Invalid adId' });
  }
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: 'status must be ACTIVE or PAUSED' });
  }

  try {
    // Verify ad belongs to the whitelisted campaign — never trust the client's campaignId
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
