import { useState, useEffect, useMemo } from 'react';
import VideoPreview from './VideoPreview.jsx';

const FIELD_TYPES = {
  YOUTUBE_VIDEO:          'Landscape 16:9',
  PORTRAIT_YOUTUBE_VIDEO: 'Portrait 9:16',
  SQUARE_YOUTUBE_VIDEO:   'Square 1:1',
};

const PERF_COLORS = {
  BEST:        'text-green',
  GOOD:        'text-accent2',
  LOW:         'text-red',
  LEARNING:    'text-orange',
  PENDING:     'text-orange',
  UNSPECIFIED: 'text-muted',
};

function parseYouTubeId(input) {
  if (!input) return null;
  const t = input.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  try {
    const url = new URL(t);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('?')[0];
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2];
      return url.searchParams.get('v');
    }
  } catch {}
  return null;
}

function detectOrientationFromName(name) {
  if (!name) return null;
  const m = name.match(/(\d{3,4})x(\d{3,4})/);
  if (!m) return null;
  const w = parseInt(m[1]);
  const h = parseInt(m[2]);
  if (w === h) return 'SQUARE_YOUTUBE_VIDEO';
  if (h > w) return 'PORTRAIT_YOUTUBE_VIDEO';
  return 'YOUTUBE_VIDEO';
}

function VideoThumb({ videoId, name, inHistory }) {
  return (
    <div className={`flex items-start gap-3 p-2.5 rounded border bg-surface2 ${inHistory ? 'border-orange/40' : 'border-border'}`}>
      <div className="relative shrink-0">
        <VideoPreview youtubeId={videoId}>
          <img
            src={`https://img.youtube.com/vi/${videoId}/default.jpg`}
            alt=""
            className="w-[80px] h-[45px] object-cover rounded bg-bg mt-0.5"
          />
        </VideoPreview>
        {inHistory && (
          <div className="absolute -top-1 -left-1 bg-orange text-bg font-mono text-[7px] font-semibold px-1 py-0.5 rounded uppercase tracking-wider leading-none">
            History
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[11px] text-text break-words leading-snug">
          {name || videoId}
        </div>
        {name && <div className="font-mono text-[9px] text-muted mt-0.5">{videoId}</div>}
      </div>
    </div>
  );
}

function CapacityBar({ count, limit }) {
  const pct = Math.min((count / limit) * 100, 100);
  const color = count >= limit ? 'bg-red' : count >= limit * 0.8 ? 'bg-orange' : 'bg-green';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-mono text-[10px] font-semibold ${count >= limit ? 'text-red' : 'text-text2'}`}>
        {count}/{limit}
      </span>
    </div>
  );
}

function ActiveVideoRow({ asset, onRemove, removing }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0">
      <VideoPreview youtubeId={asset.youtubeId}>
        <img
          src={`https://img.youtube.com/vi/${asset.youtubeId}/default.jpg`}
          alt=""
          className="w-[56px] h-[32px] object-cover rounded shrink-0 bg-bg mt-0.5"
        />
      </VideoPreview>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] text-text break-words leading-snug">{asset.name || asset.youtubeId}</div>
        <div className="flex gap-3 mt-1 flex-wrap">
          <span className="font-mono text-[9px] text-text2">
            Cost: <strong className="text-text">${asset.spend?.toFixed(2) ?? '—'}</strong>
          </span>
          <span className="font-mono text-[9px] text-text2">
            CPI: <strong className="text-text">{asset.cpa != null ? `$${asset.cpa.toFixed(2)}` : '—'}</strong>
          </span>
          <span className="font-mono text-[9px] text-text2">
            CPA IAA: <strong className="text-text">{asset.cpaIaa != null ? `$${asset.cpaIaa.toFixed(2)}` : '—'}</strong>
          </span>
          <span className={`font-mono text-[9px] font-semibold ${PERF_COLORS[asset.performanceLabel] || 'text-muted'}`}>
            {asset.performanceLabel || 'UNSPECIFIED'}
          </span>
          <span className="font-mono text-[9px] text-muted">{asset.orientation || FIELD_TYPES[asset.fieldType] || asset.fieldType}</span>
        </div>
      </div>
      <button
        onClick={() => onRemove(asset)}
        disabled={removing}
        className="shrink-0 font-mono text-[9px] text-red border border-red/30 hover:border-red rounded px-1.5 py-0.5 cursor-pointer disabled:opacity-40 transition-colors ml-1"
      >
        {removing ? '…' : 'Remove'}
      </button>
    </div>
  );
}

export default function UploadVideosTab() {
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [videoAssets, setVideoAssets]         = useState([]);
  const [activeCampaigns, setActiveCampaigns] = useState([]);
  const [historyIds, setHistoryIds]           = useState(new Set());

  // Form
  const [mode, setMode]             = useState('new');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedAssetRN, setSelectedAssetRN] = useState('');
  const [campaignId, setCampaignId]           = useState(null);
  const [fieldType, setFieldType]             = useState('YOUTUBE_VIDEO');
  const [assetName, setAssetName]             = useState('');

  const [submitting, setSubmitting]   = useState(false);
  const [removingId, setRemovingId]   = useState(null);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState(null);

  const selectedCamp = activeCampaigns.find(c => c.campaignId === campaignId);

  const liveAssetRNs = useMemo(
    () => new Set((selectedCamp?.assets || []).map(a => a.assetRN)),
    [selectedCamp]
  );
  const liveVideos      = useMemo(() => videoAssets.filter(a =>  liveAssetRNs.has(a.resourceName)), [videoAssets, liveAssetRNs]);
  const availableVideos = useMemo(() => videoAssets.filter(a => !liveAssetRNs.has(a.resourceName)), [videoAssets, liveAssetRNs]);

  useEffect(() => {
    if (selectedAssetRN && liveAssetRNs.has(selectedAssetRN)) {
      const first = availableVideos[0];
      setSelectedAssetRN(first?.resourceName || '');
      if (first) {
        const detected = detectOrientationFromName(first.name);
        if (detected) setFieldType(detected);
      }
    }
  }, [campaignId, liveAssetRNs]);

  const loadData = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    const url = isRefresh ? '/api/upload-video?refresh=1' : '/api/upload-video';
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setLoadError(d.error); return; }
        const assets = d.videoAssets || [];
        const campaigns = d.activeCampaigns || [];
        setVideoAssets(assets);
        setActiveCampaigns(campaigns);
        setHistoryIds(new Set(d.historyYoutubeIds || []));
        // Keep existing campaign selection if still valid, else default to first
        setCampaignId(prev => {
          if (prev && campaigns.some(c => c.campaignId === prev)) return prev;
          return campaigns[0]?.campaignId || null;
        });
        // Default asset selection against first campaign
        const campLiveRNs = new Set(
          (campaigns[0]?.assets || []).map(a => a.assetRN)
        );
        const firstAvail = assets.find(a => !campLiveRNs.has(a.resourceName));
        if (firstAvail) {
          setSelectedAssetRN(firstAvail.resourceName);
          const detected = detectOrientationFromName(firstAvail.name);
          if (detected) setFieldType(detected);
        }
      })
      .catch(e => setLoadError('Network error: ' + e.message))
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { loadData(); }, []);

  const selectAsset = (a) => {
    setSelectedAssetRN(a.resourceName);
    setMode('existing');
    const detected = detectOrientationFromName(a.name);
    if (detected) setFieldType(detected);
  };

  const handleRemove = async (asset) => {
    setRemovingId(asset.id);
    setError(null);
    try {
      const r = await fetch('/api/upload-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', campaignId, assetId: asset.id }),
      });
      const data = await r.json();
      if (!r.ok || data.error) setError(data.error || `HTTP ${r.status}`);
      else loadData(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setRemovingId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    const body = {
      action: 'upload',
      campaignId,
      fieldType,
      ...(mode === 'existing'
        ? { existingAssetResourceName: selectedAssetRN }
        : { youtubeUrl, name: assetName }
      ),
    };

    try {
      const r = await fetch('/api/upload-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok || data.error) setError(data.error || `HTTP ${r.status}`);
      else { setResult(data); loadData(true); }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => { setResult(null); setError(null); setYoutubeUrl(''); setAssetName(''); };
  const videoId = mode === 'new' ? parseYouTubeId(youtubeUrl) : null;
  const selectedAsset = availableVideos.find(a => a.resourceName === selectedAssetRN);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="font-mono text-[11px] text-muted">Loading Google Ads data…</div>
    </div>
  );
  if (loadError) return (
    <div className="flex items-center justify-center h-64">
      <div className="font-mono text-[11px] text-red max-w-md text-center">{loadError}</div>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">

      {/* Left — video asset library */}
      <div className="w-[300px] shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="font-mono text-[10px] text-text2 uppercase tracking-wider">
            Account Videos <span className="text-muted">({videoAssets.length})</span>
          </div>
          <button onClick={() => loadData(true)} disabled={refreshing}
            className="font-mono text-[9px] text-accent2 border border-[rgba(71,200,255,0.25)] hover:border-accent2 rounded px-2 py-0.5 cursor-pointer disabled:opacity-40 transition-colors"
          >
            {refreshing ? '…' : '↻'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">

          {liveVideos.length > 0 && (
            <div className="mb-2">
              <div className="font-mono text-[8px] text-accent uppercase tracking-wider px-1 pt-1 pb-1.5">
                In Campaign ({liveVideos.length})
              </div>
              <div className="space-y-1.5 opacity-50">
                {liveVideos.map(a => (
                  <VideoThumb key={a.resourceName} videoId={a.videoId} name={a.name} inHistory={historyIds.has(a.videoId)} />
                ))}
              </div>
            </div>
          )}

          {availableVideos.length > 0 && (
            <div>
              <div className="font-mono text-[8px] text-muted uppercase tracking-wider px-1 pt-1 pb-1.5 flex items-center gap-2">
                Available ({availableVideos.length})
                {availableVideos.filter(a => historyIds.has(a.videoId)).length > 0 && (
                  <span className="text-orange">· {availableVideos.filter(a => historyIds.has(a.videoId)).length} prev used</span>
                )}
              </div>
              <div className="space-y-1.5">
                {availableVideos.map(a => (
                  <div key={a.resourceName}
                    onClick={() => selectAsset(a)}
                    className={`cursor-pointer rounded border transition-colors ${
                      selectedAssetRN === a.resourceName && mode === 'existing'
                        ? 'border-accent2/60' : 'border-transparent hover:border-border'
                    }`}
                  >
                    <VideoThumb videoId={a.videoId} name={a.name} inHistory={historyIds.has(a.videoId)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {videoAssets.length === 0 && (
            <div className="font-mono text-[10px] text-muted pt-4 text-center">No video assets.</div>
          )}
        </div>
      </div>

      {/* Right — campaign management + upload form */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-0">

          {/* Campaign capacity + active videos */}
          <div className="border-b border-border p-5">
            <div className="font-mono text-[10px] text-text2 uppercase tracking-wider mb-3">
              Active Videos — All UH Campaigns
            </div>

            {/* Campaign selector tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {activeCampaigns.map(camp => (
                <button key={camp.campaignId} onClick={() => setCampaignId(camp.campaignId)}
                  className={`flex-1 min-w-[140px] px-3 py-2 rounded border cursor-pointer transition-colors text-left ${
                    campaignId === camp.campaignId ? 'border-accent bg-surface2' : 'border-border hover:border-muted bg-surface2'
                  }`}
                >
                  <div className="font-mono text-[10px] font-semibold text-text mb-1.5">{camp.campaignLabel}</div>
                  <CapacityBar count={camp.count} limit={camp.limit} />
                  {(camp.tcpa !== null || camp.dailyBudget !== null) && (
                    <div className="flex gap-3 mt-1.5 font-mono text-[9px] text-muted">
                      {camp.tcpa !== null && (
                        <span>tCPA: <strong className="text-text2">${camp.tcpa}</strong></span>
                      )}
                      {camp.dailyBudget !== null && (
                        <span>Budget: <strong className="text-text2">${camp.dailyBudget}/d</strong></span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Active video list for selected campaign */}
            {selectedCamp && (
              <div>
                {selectedCamp.atLimit && (
                  <div className="font-mono text-[10px] text-red bg-red/5 border border-red/20 rounded px-3 py-2 mb-3">
                    At {selectedCamp.limit}-video limit — remove a video before uploading.
                  </div>
                )}
                {error && (
                  <div className="font-mono text-[10px] text-red bg-surface2 border border-red/30 rounded px-3 py-2 mb-3">
                    {error}
                  </div>
                )}
                {selectedCamp.assets.length === 0 ? (
                  <div className="font-mono text-[10px] text-muted">No active videos in this campaign.</div>
                ) : (
                  <div className="bg-surface2 border border-border rounded px-3 py-1">
                    {selectedCamp.assets.map(asset => (
                      <ActiveVideoRow
                        key={asset.id}
                        asset={asset}
                        onRemove={handleRemove}
                        removing={removingId === asset.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Upload form */}
          <div className="p-5">
            <div className="font-mono text-[10px] text-text2 uppercase tracking-wider mb-4">
              Upload New Video
            </div>

            {result && (
              <div className="space-y-2 mb-5">
                <div className="text-green font-mono text-[11px] font-semibold">✓ Linked successfully to {result.campaignLabel}</div>
                <button onClick={resetForm} className="font-mono text-[11px] text-accent2 underline cursor-pointer">
                  Upload another
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 max-w-[480px]">

              {/* Mode */}
              <div>
                <div className="font-mono text-[10px] text-text2 uppercase tracking-wider mb-2">Source</div>
                <div className="flex gap-2">
                  {[['new', 'New YouTube URL'], ['existing', 'Existing Asset']].map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setMode(val)}
                      className={`flex-1 py-2 font-mono text-[10px] rounded border cursor-pointer transition-colors ${
                        mode === val ? 'border-accent text-accent bg-surface2' : 'border-border text-text2 bg-surface2 hover:border-muted'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {mode === 'new' && (
                <div>
                  <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">YouTube URL or Video ID</label>
                  <input type="text" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)}
                    placeholder="https://youtu.be/... or 11-char ID" required
                    className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted focus:border-accent2 outline-none"
                  />
                  {youtubeUrl && (
                    <div className={`font-mono text-[10px] mt-1 ${videoId ? 'text-green' : 'text-red'}`}>
                      {videoId ? `✓ ID: ${videoId}` : '✗ Could not parse video ID'}
                    </div>
                  )}
                  {videoId && <div className="mt-2"><VideoThumb videoId={videoId} name="Preview" /></div>}
                </div>
              )}

              {mode === 'existing' && (
                <div>
                  <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                    Selected Asset <span className="text-muted normal-case">({availableVideos.length} available)</span>
                  </label>
                  {availableVideos.length === 0 ? (
                    <div className="font-mono text-[10px] text-muted">All account videos are already in this campaign.</div>
                  ) : (
                    <>
                      <select value={selectedAssetRN}
                        onChange={e => {
                          setSelectedAssetRN(e.target.value);
                          const a = availableVideos.find(v => v.resourceName === e.target.value);
                          if (a) {
                            const detected = detectOrientationFromName(a.name);
                            if (detected) setFieldType(detected);
                          }
                        }}
                        required
                        className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 cursor-pointer"
                      >
                        {availableVideos.map(a => (
                          <option key={a.resourceName} value={a.resourceName}>{a.name || a.videoId}</option>
                        ))}
                      </select>
                      {selectedAsset && <div className="mt-2"><VideoThumb videoId={selectedAsset.videoId} name={selectedAsset.name} /></div>}
                    </>
                  )}
                </div>
              )}

              {/* Campaign selector */}
              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                  Campaign
                </label>
                <div className="flex gap-2 flex-wrap">
                  {activeCampaigns.map(camp => (
                    <button key={camp.campaignId} type="button" onClick={() => setCampaignId(camp.campaignId)}
                      className={`flex-1 min-w-[120px] py-2 font-mono text-[10px] rounded border cursor-pointer transition-colors ${
                        campaignId === camp.campaignId ? 'border-accent text-accent bg-surface2' : 'border-border text-text2 bg-surface2 hover:border-muted'
                      } ${camp.atLimit ? 'border-red/40 text-red' : ''}`}
                    >
                      {camp.campaignLabel}
                      <span className="ml-1 text-muted">({camp.count}/{camp.limit})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Orientation */}
              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-2">
                  Orientation
                  {mode === 'existing' && selectedAsset && detectOrientationFromName(selectedAsset.name) && (
                    <span className="ml-2 normal-case text-accent2">auto-detected</span>
                  )}
                </label>
                <div className="flex gap-2">
                  {Object.entries(FIELD_TYPES).map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setFieldType(val)}
                      className={`flex-1 py-2 font-mono text-[10px] rounded border cursor-pointer transition-colors ${
                        fieldType === val ? 'border-accent text-accent bg-surface2' : 'border-border text-text2 bg-surface2 hover:border-muted'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {mode === 'new' && (
                <div>
                  <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                    Asset Name <span className="text-muted normal-case">(optional)</span>
                  </label>
                  <input type="text" value={assetName} onChange={e => setAssetName(e.target.value)}
                    placeholder={videoId ? `UH_${videoId}_${fieldType}` : 'auto-generated'}
                    className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted focus:border-accent2 outline-none"
                  />
                </div>
              )}

              <button type="submit"
                disabled={submitting || selectedCamp?.atLimit || (mode === 'new' && !videoId) || (mode === 'existing' && availableVideos.length === 0)}
                className="w-full py-2.5 font-mono text-[11px] font-semibold bg-accent text-bg rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
              >
                {submitting ? 'Uploading…' : selectedCamp?.atLimit ? 'Campaign at limit — remove a video first' : 'Upload to Google Ads'}
              </button>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
