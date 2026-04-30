# Urban Heat Tracker — Success Log
<!-- append-only, newest first, ISO timestamps -->

## 2026-04-23T — Text asset add/remove for IN campaigns
- **What:** Add/remove headlines and descriptions directly in Google Ads APP_AD via dashboard UI
- **How:** `api/edit-descriptions.js` — GET reads live `appAd.headlines[]` / `appAd.descriptions[]` from Google; POST add/remove mutates via `ads:mutate` (same pattern as youtube_videos). DescriptionsTable gains add form + ✕ remove buttons for IN campaigns only.
- **Also:** Deleted `api/migrate-history.js` (one-off, unused). Function count back to 11/12.
- **Commit:** `2441db6`
- **Verified in prod:** add and remove both confirmed working ✓
