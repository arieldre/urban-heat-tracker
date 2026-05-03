/**
 * GET /api/cron/fb-sync-tracker
 * Daily cron — syncs all FB campaigns. Schedule: 0 7 * * * (7am UTC daily)
 * Protected by CRON_SECRET.
 */
import { runFBSync } from '../_utils/fb-sync-logic.js';
import { hasCredentials } from '../_utils/facebook.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!hasCredentials()) {
    return res.status(500).json({ error: 'Missing Facebook credentials' });
  }
  try {
    const result = await runFBSync();
    console.log('[cron/fb-sync-tracker] done:', result);
    return res.status(200).json(result);
  } catch (e) {
    console.error('[cron/fb-sync-tracker]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
