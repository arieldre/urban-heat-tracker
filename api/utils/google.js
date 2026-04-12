/**
 * Shared Google Ads API v23 helper.
 * OAuth token caching + GAQL query execution.
 * Pattern extracted from creative-dashboard/api/google-all-assets.js
 */

const {
  GOOGLE_DEVELOPER_TOKEN,
  GOOGLE_CUSTOMER_ID,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
} = process.env;

let _cachedToken = null;
let _tokenExpiry = 0;

export async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry - 60_000) return _cachedToken;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  _cachedToken = data.access_token;
  _tokenExpiry = Date.now() + data.expires_in * 1000;
  return _cachedToken;
}

export async function gaQuery(token, query) {
  const r = await fetch(
    `https://googleads.googleapis.com/v23/customers/${GOOGLE_CUSTOMER_ID}/googleAds:search`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'developer-token': GOOGLE_DEVELOPER_TOKEN,
        'login-customer-id': GOOGLE_CUSTOMER_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );
  return r.json();
}

export function hasCredentials() {
  return !!(GOOGLE_DEVELOPER_TOKEN && GOOGLE_CUSTOMER_ID && GOOGLE_CLIENT_ID &&
    GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN);
}

// Campaign IDs to track
export const CAMPAIGN_IDS = [
  '22784768376',  // H48fastprogression (IN GP)
  '22879160345',  // H48battleactivitygrows (IN GP)
  '23583585016',  // US_All_tROAS (US GP)
  '23583625147',  // US_All_tROAS_iOS (US iOS)
];

export const CAMPAIGN_LABELS = {
  '22784768376': 'H48fastprogression',
  '22879160345': 'H48battleactivitygrows',
  '23583585016': 'US_All_tROAS_GP',
  '23583625147': 'US_All_tROAS_iOS',
};

// Asset field type sets
export const VIDEO_TYPES = new Set([
  'YOUTUBE_VIDEO', 'PORTRAIT_YOUTUBE_VIDEO', 'SQUARE_YOUTUBE_VIDEO',
]);

export const TEXT_TYPES = new Set([
  'HEADLINE', 'DESCRIPTION', 'LONG_HEADLINE',
]);

export function orientationFromFieldType(ft) {
  if (ft?.includes('PORTRAIT')) return '9x16';
  if (ft?.includes('SQUARE')) return '1x1';
  return '16x9';
}

/**
 * Fetch YouTube video titles via oEmbed (no auth required).
 */
export async function fetchYoutubeTitles(videoIds) {
  const unique = [...new Set(videoIds.filter(Boolean))];
  if (!unique.length) return {};
  const results = await Promise.allSettled(
    unique.map(id =>
      fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
        .then(r => r.ok ? r.json() : null)
        .then(data => [id, data?.title || null])
        .catch(() => [id, null])
    )
  );
  return Object.fromEntries(results.map(r => r.value || [null, null]).filter(([id]) => id));
}
