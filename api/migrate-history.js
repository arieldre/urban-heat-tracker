/**
 * One-time migration: fix removedAt for history entries created with the wrong date.
 * Entries with reason='Removed from campaign' used now.slice(0,10) instead of lastSeenAt.
 * This endpoint re-queries Google Ads for the widest available date range to find
 * each asset's actual last data date.
 *
 * POST /api/migrate-history  (protect with ?secret= in prod)
 * Returns { fixed: N, skipped: N, errors: [] }
 */
import { kvGet, kvSet } from './utils/kv.js';
import { getAccessToken, gaQuery, CAMPAIGN_IDS } from './utils/google.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret = process.env.MIGRATE_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await migrateHistory();
    return res.status(200).json(result);
  } catch (e) {
    console.error('[migrate-history]', e);
    return res.status(500).json({ error: e.message });
  }
}

export async function migrateHistory() {
  // Wide date range — covers all data since project start
  const from = '2026-03-01';
  const to = new Date();
  to.setDate(to.getDate() - 1);
  const toStr = to.toISOString().slice(0, 10);

  // Collect asset IDs that need fixing across all campaigns
  const needsFix = new Map(); // assetId → { campId, entryKey }
  const historyByCamp = {};

  for (const campId of CAMPAIGN_IDS) {
    const history = (await kvGet(`tracker/${campId}/history.json`)) || [];
    historyByCamp[campId] = history;

    for (const entry of history) {
      // Only fix entries that either: have no lastSeenAt stored, or were set to today's date
      // We detect "wrong" entries by checking if reason is 'Removed from campaign' and
      // lastSeenAt is missing (old entries didn't store it)
      if (entry.reason === 'Removed from campaign' && !entry.lastSeenAt) {
        needsFix.set(entry.id, { campId, key: entry.key });
      }
    }
  }

  if (needsFix.size === 0) {
    return { fixed: 0, skipped: 0, message: 'All entries already have lastSeenAt — nothing to migrate' };
  }

  console.log(`[migrate-history] ${needsFix.size} entries need fixing`);

  // Re-query Google Ads for all campaigns to find actual last dates
  const token = await getAccessToken();
  const raw = await gaQuery(token, `
    SELECT
      campaign.id,
      asset.id,
      ad_group_ad_asset_view.field_type,
      segments.date,
      metrics.cost_micros,
      metrics.impressions
    FROM ad_group_ad_asset_view
    WHERE segments.date BETWEEN '${from}' AND '${toStr}'
      AND campaign.id IN (${CAMPAIGN_IDS.join(', ')})
  `);

  if (raw.error) throw new Error(raw.error.message || JSON.stringify(raw.error));

  // Build map: assetId_fieldType → lastSeenDate
  const lastSeenMap = new Map();
  for (const r of (raw.results || [])) {
    const assetId = r.asset?.id;
    const fieldType = r.adGroupAdAssetView?.fieldType;
    const date = r.segments?.date;
    if (!assetId || !date || !fieldType) continue;

    const entryKey = `${assetId}_${fieldType}`;
    const cur = lastSeenMap.get(entryKey);
    if (!cur || date > cur) lastSeenMap.set(entryKey, date);
  }

  // Apply fixes to history entries
  let fixed = 0;
  let skipped = 0;
  const errors = [];

  for (const campId of CAMPAIGN_IDS) {
    const history = historyByCamp[campId];
    let changed = false;

    for (const entry of history) {
      if (entry.reason !== 'Removed from campaign' || entry.lastSeenAt) continue;

      const realLastSeen = lastSeenMap.get(entry.key);
      if (realLastSeen) {
        entry.removedAt = realLastSeen;
        entry.lastSeenAt = realLastSeen;
        changed = true;
        fixed++;
        console.log(`[migrate-history] Fixed ${entry.key}: removedAt → ${realLastSeen}`);
      } else {
        // Asset not found in any query — use removedAt - 1 day as best estimate
        // (sync runs daily, so last data was at least day before detection)
        if (entry.removedAt) {
          const d = new Date(entry.removedAt);
          d.setDate(d.getDate() - 1);
          const estimated = d.toISOString().slice(0, 10);
          entry.lastSeenAt = estimated;
          // Keep removedAt as-is since we don't have better data
          changed = true;
          skipped++;
          console.log(`[migrate-history] Estimated ${entry.key}: lastSeenAt → ${estimated} (no API data)`);
        } else {
          errors.push(`No data for ${entry.key} in campaign ${campId}`);
        }
      }
    }

    if (changed) {
      await kvSet(`tracker/${campId}/history.json`, history);
    }
  }

  return { fixed, skipped, errors, message: `Migration complete: ${fixed} fixed, ${skipped} estimated` };
}
