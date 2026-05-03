import { useState, useEffect, useCallback } from 'react';

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

const VIDEO_LIMIT = 20;

const PERF_COLORS = {
  BEST:        'text-green',
  GOOD:        'text-text2',
  LOW:         'text-orange',
  LEARNING:    'text-muted',
  PENDING:     'text-muted',
  UNSPECIFIED: 'text-muted',
};

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

export default function InvokersGoogleUploadTab() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [assetName, setAssetName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [resumingId, setResumingId] = useState(null);

  const activeVideos = videos.filter(v => v.active);
  const inactiveVideos = videos.filter(v => !v.active);
  const atLimit = activeVideos.length >= VIDEO_LIMIT;
  const videoId = parseYouTubeId(youtubeUrl);

  const loadData = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    fetch('/api/edit-descriptions?type=videos')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setLoadError(d.error); return; }
        setVideos(d.videos || []);
      })
      .catch(e => setLoadError('Network error: ' + e.message))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRemove = async (video) => {
    setRemovingId(video.assetId);
    setError(null);
    try {
      const r = await fetch('/api/edit-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'videos', action: 'pause', assetId: video.assetId }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
      setVideos(vs => vs.map(v => v.assetId === video.assetId ? { ...v, active: false } : v));
    } catch (e) {
      setError(e.message);
    } finally {
      setRemovingId(null);
    }
  };

  const handleAddBack = async (video) => {
    if (atLimit) return;
    setResumingId(video.assetId);
    setError(null);
    try {
      const r = await fetch('/api/edit-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'videos', action: 'resume', assetId: video.assetId }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
      setVideos(vs => vs.map(v => v.assetId === video.assetId ? { ...v, active: true } : v));
    } catch (e) {
      setError(e.message);
    } finally {
      setResumingId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!videoId || atLimit) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/edit-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'videos', action: 'upload', youtubeUrl, assetName }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
      setResult(data);
      setYoutubeUrl('');
      setAssetName('');
      loadData(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => { setResult(null); setError(null); };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="font-mono text-[11px] text-muted">Loading Invokers UAC data…</div>
    </div>
  );
  if (loadError) return (
    <div className="flex items-center justify-center h-64">
      <div className="font-mono text-[11px] text-red max-w-md text-center">{loadError}</div>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">

      {/* Left — video library */}
      <div className="w-[300px] shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="font-mono text-[10px] text-text2 uppercase tracking-wider">
            Videos <span className="text-muted">({videos.length})</span>
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="font-mono text-[9px] text-purple border border-[rgba(168,85,247,0.25)] hover:border-purple rounded px-2 py-0.5 cursor-pointer disabled:opacity-40 transition-colors"
          >
            {refreshing ? '…' : '↻'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">

          {/* Active — view only */}
          {activeVideos.length > 0 && (
            <div className="mb-2">
              <div className="font-mono text-[8px] text-purple uppercase tracking-wider px-1 pt-1 pb-1.5">
                Active ({activeVideos.length})
              </div>
              <div className="space-y-1.5 opacity-50">
                {activeVideos.map(v => (
                  <div key={v.assetId} className="flex items-start gap-2 p-2 rounded border border-border bg-surface2">
                    {v.videoId && (
                      <img
                        src={`https://img.youtube.com/vi/${v.videoId}/default.jpg`}
                        alt=""
                        className="w-[56px] h-[32px] object-cover rounded shrink-0 mt-0.5"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] text-text truncate">{v.title || v.name || v.videoId}</div>
                      <span className={`font-mono text-[9px] ${PERF_COLORS[v.performanceLabel] || 'text-muted'}`}>
                        {v.performanceLabel || '–'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inactive — available to add back */}
          {inactiveVideos.length > 0 && (
            <div>
              <div className="font-mono text-[8px] text-muted uppercase tracking-wider px-1 pt-1 pb-1.5">
                Available ({inactiveVideos.length})
              </div>
              <div className="space-y-1.5">
                {inactiveVideos.map(v => (
                  <div key={v.assetId} className="flex items-start gap-2 p-2 rounded border border-border bg-surface2 hover:border-muted transition-colors">
                    {v.videoId && (
                      <img
                        src={`https://img.youtube.com/vi/${v.videoId}/default.jpg`}
                        alt=""
                        className="w-[56px] h-[32px] object-cover rounded shrink-0 mt-0.5"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] text-text truncate">{v.title || v.name || v.videoId}</div>
                      <span className={`font-mono text-[9px] ${PERF_COLORS[v.performanceLabel] || 'text-muted'}`}>
                        {v.performanceLabel || '–'}
                      </span>
                    </div>
                    <button
                      disabled={atLimit || resumingId === v.assetId}
                      onClick={() => handleAddBack(v)}
                      className="shrink-0 font-mono text-[9px] px-1.5 py-0.5 border border-green/40 text-green hover:border-green rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {resumingId === v.assetId ? '…' : '+ Add'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {videos.length === 0 && (
            <div className="font-mono text-[10px] text-muted pt-4 text-center">No video assets.</div>
          )}
        </div>
      </div>

      {/* Right — capacity + active list + upload form */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-0">

          {/* Campaign capacity + active video list */}
          <div className="border-b border-border p-5">
            <div className="font-mono text-[10px] text-text2 uppercase tracking-wider mb-3">
              Active Videos — Invokers UAC
            </div>
            <div className="mb-4">
              <CapacityBar count={activeVideos.length} limit={VIDEO_LIMIT} />
            </div>

            {atLimit && (
              <div className="font-mono text-[10px] text-red bg-red/5 border border-red/20 rounded px-3 py-2 mb-3">
                At {VIDEO_LIMIT}-video limit — remove a video before uploading.
              </div>
            )}
            {error && (
              <div className="font-mono text-[10px] text-red bg-surface2 border border-red/30 rounded px-3 py-2 mb-3">
                {error}
              </div>
            )}

            {activeVideos.length === 0 ? (
              <div className="font-mono text-[10px] text-muted">No active videos in this campaign.</div>
            ) : (
              <div className="bg-surface2 border border-border rounded px-3 py-1">
                {activeVideos.map(v => (
                  <div key={v.assetId} className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0">
                    {v.videoId && (
                      <img
                        src={`https://img.youtube.com/vi/${v.videoId}/default.jpg`}
                        alt=""
                        className="w-[56px] h-[32px] object-cover rounded shrink-0 bg-bg mt-0.5"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] text-text break-words leading-snug">{v.title || v.name || v.videoId}</div>
                      <div className="flex gap-3 mt-1 flex-wrap items-center">
                        {v.spend > 0 && (
                          <span className="font-mono text-[9px] text-text2">Cost: ${v.spend.toFixed(0)}</span>
                        )}
                        {v.cpi !== null && (
                          <span className="font-mono text-[9px] text-text2">CPI: ${v.cpi.toFixed(2)}</span>
                        )}
                        {v.cpaIaa !== null && (
                          <span className="font-mono text-[9px] text-text2">CPA IAA: ${v.cpaIaa.toFixed(2)}</span>
                        )}
                        <span className={`font-mono text-[9px] font-semibold ${PERF_COLORS[v.performanceLabel] || 'text-muted'}`}>
                          {v.performanceLabel || 'UNSPECIFIED'}
                        </span>
                        {v.videoId && (
                          <a
                            href={`https://www.youtube.com/watch?v=${v.videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[9px] text-purple hover:underline"
                          >
                            yt/{v.videoId}
                          </a>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(v)}
                      disabled={removingId === v.assetId}
                      className="shrink-0 font-mono text-[9px] text-red border border-red/30 hover:border-red rounded px-1.5 py-0.5 cursor-pointer disabled:opacity-40 transition-colors ml-1"
                    >
                      {removingId === v.assetId ? '…' : 'Remove'}
                    </button>
                  </div>
                ))}
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
                <div className="text-green font-mono text-[11px] font-semibold">✓ Uploaded and added to Invokers UAC</div>
                <button onClick={resetForm} className="font-mono text-[11px] text-purple underline cursor-pointer">
                  Upload another
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 max-w-[480px]">
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
                  className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted focus:border-[rgba(168,85,247,0.4)] outline-none"
                />
                {youtubeUrl && (
                  <div className={`font-mono text-[10px] mt-1 ${videoId ? 'text-green' : 'text-red'}`}>
                    {videoId ? `✓ ID: ${videoId}` : '✗ Could not parse video ID'}
                  </div>
                )}
                {videoId && (
                  <div className="mt-2 flex items-start gap-3 p-2 rounded border border-border bg-surface2">
                    <img
                      src={`https://img.youtube.com/vi/${videoId}/default.jpg`}
                      alt=""
                      className="w-[80px] h-[45px] object-cover rounded shrink-0"
                    />
                    <a
                      href={`https://www.youtube.com/watch?v=${videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-purple hover:underline mt-1"
                    >
                      yt/{videoId}
                    </a>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                  Asset Name <span className="text-muted normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={assetName}
                  onChange={e => setAssetName(e.target.value)}
                  placeholder={videoId ? `INV_${videoId}` : 'auto-generated'}
                  className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted focus:border-[rgba(168,85,247,0.4)] outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || atLimit || !videoId}
                className="w-full py-2.5 font-mono text-[11px] font-semibold bg-purple text-white rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {submitting ? 'Uploading…' : atLimit ? 'At limit — remove a video first' : 'Upload to Invokers UAC'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
