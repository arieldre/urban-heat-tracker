import { runInvFBSync } from '../_utils/inv-fb-sync-logic.js';
import { hasInvCredentials } from '../_utils/invokers-facebook.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!hasInvCredentials()) {
    return res.status(500).json({ error: 'Missing Invokers FB credentials' });
  }
  try {
    const result = await runInvFBSync();
    console.log('[cron/inv-fb-sync-tracker] done:', result);
    return res.status(200).json(result);
  } catch (e) {
    console.error('[cron/inv-fb-sync-tracker]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
