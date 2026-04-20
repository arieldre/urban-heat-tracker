/**
 * Facebook Graph API v20 helper.
 * User access token (long-lived) — no server-side OAuth flow needed.
 */

const {
  FB_ACCESS_TOKEN,
  FB_AD_ACCOUNT_ID,
  FB_API_VERSION = 'v20.0',
} = process.env;

const BASE = `https://graph.facebook.com/${FB_API_VERSION}`;

export function hasCredentials() {
  return !!(FB_ACCESS_TOKEN && FB_AD_ACCOUNT_ID);
}

export { FB_AD_ACCOUNT_ID };

/**
 * Paginate through all pages of a Graph API list endpoint.
 * Returns flat array of all items across pages.
 */
async function graphAll(url, params = {}) {
  const qs = new URLSearchParams({ access_token: FB_ACCESS_TOKEN, ...params });
  let endpoint = `${url}?${qs}`;
  const items = [];

  while (endpoint) {
    const r = await fetch(endpoint);
    const data = await r.json();
    if (data.error) throw new Error(`FB API: ${data.error.message} (code ${data.error.code})`);
    if (data.data) items.push(...data.data);
    endpoint = data.paging?.next || null;
  }

  return items;
}

/**
 * Fetch all non-deleted ads for the account with creative metadata.
 * Returns: [{ id, name, status, campaignId, campaignName, creative }]
 */
export async function fetchAds() {
  const all = await graphAll(`${BASE}/${FB_AD_ACCOUNT_ID}/ads`, {
    fields: 'id,name,status,campaign{id,name},creative{id,name,thumbnail_url,video_id,image_url}',
    limit: '500',
  });
  // Exclude deleted ads — track active and paused
  return all.filter(a => a.status !== 'DELETED' && a.status !== 'ARCHIVED');
}

/**
 * Fetch daily ad insights for a date range.
 * Returns: [{ ad_id, date_start, spend, impressions, clicks, actions }]
 */
export async function fetchInsights(since, until) {
  return graphAll(`${BASE}/${FB_AD_ACCOUNT_ID}/insights`, {
    level: 'ad',
    time_increment: '1',
    fields: 'ad_id,spend,impressions,clicks,actions',
    time_range: JSON.stringify({ since, until }),
    limit: '500',
  });
}

/**
 * Extract purchase + install counts from actions array.
 */
export function extractActions(actions = []) {
  const map = {};
  for (const a of actions) map[a.action_type] = parseFloat(a.value || 0);
  return {
    purchases: map['omni_purchase'] || map['purchase'] || 0,
    installs: map['mobile_app_install'] || 0,
  };
}
