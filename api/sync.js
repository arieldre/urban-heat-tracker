/**
 * GET /api/sync
 * Manual sync trigger — same logic as cron but no auth.
 * Use for initial seeding and on-demand refresh.
 */
import { runSync } from './_utils/sync-logic.js';
import { hasCredentials } from './_utils/google.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!hasCredentials()) {
    return res.status(200).json({ available: false, reason: 'Google Ads credentials not configured' });
  }

  try {
    const result = await runSync();
    return res.status(200).json(result);
  } catch (e) {
    console.error('[sync]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
