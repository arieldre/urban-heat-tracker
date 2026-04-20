/**
 * GET /api/cron/sync-tracker
 * Daily cron — syncs all 4 campaigns from Google Ads.
 * Protected by CRON_SECRET. Schedule: 0 6 * * * (6am UTC daily)
 */
import { runSync } from '../_utils/sync-logic.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await runSync();
    console.log(`[cron/sync-tracker] done:`, result);
    return res.status(200).json(result);
  } catch (e) {
    console.error('[cron/sync-tracker]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
