# Urban Heat Tracker — Handoff
# Session: 2026-05-03

## Completed This Session
- GAQL injection guards in `api/edit-descriptions.js` (campaignId + assetId validated numeric)
- Fixed `CAMPAIGN_AD_GROUPS` undefined bug → pass campaignId directly to `getAdTexts`
- Fixed stale closure: `setAdsetId(prev => prev || ads.adsets[0].id)` in UHFBUploadTab + InvokersFBUploadTab
- Video title naming for FB ads: `videoTitle.replace(/\.[^/.]+$/, '')` as ad/creative name
- Committed `FBCampaignTab.jsx`, `GoogleCampaignTab.jsx`, `InvokersGoogleBidTab.jsx`, `middleware.js`
- Merged `feat/invokers-ux-parity` → master → deployed
- urban-heat-mcp: `fb_create_ad` now accepts `game=uh` (guard removed + title naming fixed)

## Last Commit
`18182fe` — feat: campaign/adset creation UI + Invokers bid editor + middleware

## Deploy Status
✅ urban-heat-tracker prod (`dpl_F6YAa4Gu4pznMZK9xJTc2FCZztFE`)
✅ urban-heat-mcp prod (`dpl_6q9ohAaAD94ur4Bvq5B5Q5ZRSeFb`)

## Next Action — UH FB write access
Option A — Meta official MCP (https://mcp.facebook.com/ads):
  See handoff note below. User has Business Manager 832971865153842.

Option B — Invokers token for FB_ACCESS_TOKEN:
  1. Graph API Explorer → Invokers app (1278274373280153)
  2. Permissions: ads_management, ads_read, business_management
  3. Generate User Token (personal FB account)
  4. Verify: GET /me/adaccounts → act_816445786671331 appears
  5. printf 'TOKEN' | npx vercel env add FB_ACCESS_TOKEN production && npx vercel --prod (in urban-heat-mcp)

## Remaining Gaps
- UH `fb_create_ad` in MCP blocked until token fixed (Option A or B above)
- Meta MCP OAuth in Claude Desktop — quit Claude Desktop → reopen → OAuth for meta-ads-uh
- Security: POST edit-descriptions + upload-video still no auth (open P1)
- Cron secret optional (bypassed if env not set)

## Key IDs (UH Facebook)
- Business Manager ID: 832971865153842
- Ad account: act_816445786671331
- Meta MCP URLs: https://mcp.meta.com/ads/832971865153842 (old) | https://mcp.facebook.com/ads (new?)
- LATAM GP campaign: 120243500953780720
- LATAM GP experiment adset: 120243500953800720
- Page ID: 298207346705441
- App store URL: http://play.google.com/store/apps/details?id=gg.oneupgames.ggclient

## Key IDs (UH Google)
- Customer ID: 9698502211
- Fast Prog: 22784768376 | Battle Act: 22879160345 | US GP: 23583585016 | US iOS: 23583625147

## Key IDs (Invokers)
- Google Customer ID: 5004458850
- FB ad account: act_1121972276790088
