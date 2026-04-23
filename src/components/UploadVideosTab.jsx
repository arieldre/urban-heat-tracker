import { useState, useEffect } from 'react';

const FIELD_TYPES = {
  YOUTUBE_VIDEO:          'Landscape 16:9',
  PORTRAIT_YOUTUBE_VIDEO: 'Portrait 9:16',
  SQUARE_YOUTUBE_VIDEO:   'Square 1:1',
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

function VideoThumb({ videoId, name }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 p-2.5 rounded border border-border hover:border-accent2/40 transition-colors bg-surface2"
    >
      <img
        src={`https://img.youtube.com/vi/${videoId}/default.jpg`}
        alt=""
        className="w-[80px] h-[45px] object-cover rounded shrink-0 bg-bg"
      />
      <div className="min-w-0">
        <div className="font-mono text-[10px] text-text2 truncate group-hover:text-text transition-colors">
          {name || videoId}
        </div>
        <div className="font-mono text-[9px] text-muted mt-0.5">{videoId}</div>
      </div>
    </a>
  );
}

export default function UploadVideosTab() {
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [assetGroups, setAssetGroups] = useState([]);
  const [videoAssets, setVideoAssets] = useState([]);

  // Form state
  const [mode, setMode]                         = useState('new');   // 'new' | 'existing'
  const [youtubeUrl, setYoutubeUrl]             = useState('');
  const [selectedAssetRN, setSelectedAssetRN]   = useState('');
  const [assetGroupRN, setAssetGroupRN]         = useState('');
  const [fieldType, setFieldType]               = useState('YOUTUBE_VIDEO');
  const [assetName, setAssetName]               = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState(null);

  const loadData = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    fetch('/api/upload-video')
      .then(r => r.json())
      .then(d => {
        setAssetGroups(d.assetGroups || []);
        setVideoAssets(d.videoAssets || []);
        if (d.assetGroups?.length) setAssetGroupRN(d.assetGroups[0].resourceName);
        if (d.videoAssets?.length) setSelectedAssetRN(d.videoAssets[0].resourceName);
      })
      .catch(() => setLoadError('Failed to load data from Google Ads.'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    const body = mode === 'existing'
      ? { existingAssetResourceName: selectedAssetRN, assetGroupResourceName: assetGroupRN, fieldType }
      : { youtubeUrl, assetGroupResourceName: assetGroupRN, fieldType, name: assetName };

    try {
      const r = await fetch('/api/upload-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok || data.error) setError(data.error || `HTTP ${r.status}`);
      else { setResult(data); loadData(true); } // refresh library after upload
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setResult(null);
    setError(null);
    setYoutubeUrl('');
    setAssetName('');
  };

  const videoId = mode === 'new' ? parseYouTubeId(youtubeUrl) : null;
  const selectedAsset = videoAssets.find(a => a.resourceName === selectedAssetRN);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-[11px] text-muted">Loading Google Ads data…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-[11px] text-red">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* Left — existing video assets library */}
      <div className="w-[340px] shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="font-mono text-[10px] text-text2 uppercase tracking-wider">
            Video Assets in Account
            <span className="ml-2 text-muted">({videoAssets.length})</span>
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="font-mono text-[9px] text-accent2 border border-[rgba(71,200,255,0.25)] hover:border-accent2 rounded px-2 py-0.5 cursor-pointer disabled:opacity-40 transition-colors"
          >
            {refreshing ? '…' : '↻ Refresh'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {videoAssets.length === 0 && (
            <div className="font-mono text-[10px] text-muted pt-4 text-center">No video assets found.</div>
          )}
          {videoAssets.map(a => (
            <div
              key={a.resourceName}
              onClick={() => { setSelectedAssetRN(a.resourceName); setMode('existing'); }}
              className={`cursor-pointer rounded border transition-colors ${
                selectedAssetRN === a.resourceName && mode === 'existing'
                  ? 'border-accent2/60 bg-surface2'
                  : 'border-transparent hover:border-border'
              }`}
            >
              <VideoThumb videoId={a.videoId} name={a.name} />
            </div>
          ))}
        </div>
      </div>

      {/* Right — upload form */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[480px]">

          <div className="font-mono text-[10px] text-text2 uppercase tracking-wider mb-4">
            Upload to IN Campaigns Only
          </div>

          {/* Success */}
          {result && (
            <div className="space-y-3 mb-6">
              <div className="text-green font-mono text-[11px] font-semibold">✓ Linked successfully</div>
              <div className="bg-surface2 border border-border rounded p-3 font-mono text-[11px] space-y-1 text-text2">
                <div><span className="text-text">Campaign:</span> {result.campaign}</div>
                <div><span className="text-text">Group:</span> {result.group}</div>
                <div><span className="text-text">Orientation:</span> {FIELD_TYPES[result.fieldType]}</div>
              </div>
              <button onClick={resetForm} className="font-mono text-[11px] text-accent2 underline cursor-pointer">
                Upload another
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Mode toggle */}
            <div>
              <div className="font-mono text-[10px] text-text2 uppercase tracking-wider mb-2">Source</div>
              <div className="flex gap-2">
                {[['new', 'New YouTube URL'], ['existing', 'Existing Asset']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMode(val)}
                    className={`flex-1 py-2 font-mono text-[10px] rounded border cursor-pointer transition-colors ${
                      mode === val
                        ? 'border-accent text-accent bg-surface2'
                        : 'border-border text-text2 bg-surface2 hover:border-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* New URL input */}
            {mode === 'new' && (
              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                  YouTube URL or Video ID
                </label>
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={e => setYoutubeUrl(e.target.value)}
                  placeholder="https://youtu.be/... or 11-char ID"
                  required
                  className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted focus:border-accent2 outline-none"
                />
                {youtubeUrl && (
                  <div className={`font-mono text-[10px] mt-1 ${videoId ? 'text-green' : 'text-red'}`}>
                    {videoId ? `✓ ID: ${videoId}` : '✗ Could not parse video ID'}
                  </div>
                )}
                {videoId && (
                  <div className="mt-2">
                    <VideoThumb videoId={videoId} name="Preview" />
                  </div>
                )}
              </div>
            )}

            {/* Existing asset picker */}
            {mode === 'existing' && (
              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                  Selected Asset
                </label>
                <select
                  value={selectedAssetRN}
                  onChange={e => setSelectedAssetRN(e.target.value)}
                  required
                  className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 cursor-pointer"
                >
                  {videoAssets.map(a => (
                    <option key={a.resourceName} value={a.resourceName}>
                      {a.name || a.videoId}
                    </option>
                  ))}
                </select>
                {selectedAsset && (
                  <div className="mt-2">
                    <VideoThumb videoId={selectedAsset.videoId} name={selectedAsset.name} />
                  </div>
                )}
              </div>
            )}

            {/* Asset Group */}
            <div>
              <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                Asset Group
              </label>
              <select
                value={assetGroupRN}
                onChange={e => setAssetGroupRN(e.target.value)}
                required
                className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 cursor-pointer"
              >
                {assetGroups.map(g => (
                  <option key={g.resourceName} value={g.resourceName}>
                    {g.campaignLabel} — {g.name} ({g.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Orientation */}
            <div>
              <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-2">
                Orientation
              </label>
              <div className="flex gap-2">
                {Object.entries(FIELD_TYPES).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFieldType(val)}
                    className={`flex-1 py-2 font-mono text-[10px] rounded border cursor-pointer transition-colors ${
                      fieldType === val
                        ? 'border-accent text-accent bg-surface2'
                        : 'border-border text-text2 bg-surface2 hover:border-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional name (new mode only) */}
            {mode === 'new' && (
              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                  Asset Name <span className="text-muted normal-case">(optional — auto-generated if blank)</span>
                </label>
                <input
                  type="text"
                  value={assetName}
                  onChange={e => setAssetName(e.target.value)}
                  placeholder={videoId ? `UH_${videoId}_${fieldType}` : 'UH_<videoId>_<orientation>'}
                  className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted focus:border-accent2 outline-none"
                />
              </div>
            )}

            {error && (
              <div className="font-mono text-[11px] text-red bg-surface2 border border-red/30 rounded px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || (mode === 'new' && !videoId) || !assetGroupRN}
              className="w-full py-2.5 font-mono text-[11px] font-semibold bg-accent text-bg rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
            >
              {submitting ? 'Uploading…' : 'Upload to Google Ads — IN Only'}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}
