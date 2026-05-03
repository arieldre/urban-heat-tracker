import { useState, useEffect, useCallback } from 'react';
import FBVideoPreview from './FBVideoPreview.jsx';

const WANTED_DIMS = ['1080x1080', '1920x1080', '1080x1920'];
const DIM_LABELS = { '1080x1080': '1:1', '1920x1080': '16:9', '1080x1920': '9:16' };

function extractDim(title = '') {
  const m = title.match(/_(\d+x\d+)(?=[_\.]|$)/);
  return m ? m[1] : null;
}

function baseName(title = '') {
  return title.replace(/_\d+x\d+(?=[_\.]|$)/, '');
}

function cleanTitle(title = '') {
  return title.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').slice(0, 60);
}

function fmtDuration(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function InvokersFBUploadTab() {
  const [library, setLibrary] = useState([]);
  const [ads, setAds] = useState([]);
  const [adsets, setAdsets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [selected, setSelected] = useState(null);
  const [variants, setVariants] = useState([]);
  const [adsetId, setAdsetId] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const [pendingIds, setPendingIds] = useState(new Set());
  const [optimisticStatus, setOptimisticStatus] = useState(new Map());

  const loadData = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    Promise.all([
      fetch(`/api/fb-control?action=library&game=inv${isRefresh ? '&refresh=1' : ''}`).then(r => r.json()),
      fetch('/api/fb-control?action=live-ads&game=inv').then(r => r.json()),
      fetch('/api/fb-control?action=adsets&game=inv').then(r => r.json()),
    ]).then(([lib, liveAds, ads]) => {
      setLibrary(lib.videos || []);
      setAds(liveAds.ads || []);
      setAdsets(ads.adsets || []);
      if (ads.adsets?.length > 0) setAdsetId(prev => prev || ads.adsets[0].id);
      setOptimisticStatus(new Map());
    }).catch(e => setLoadError(e.message))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleControl = useCallback(async (ad) => {
    const currentStatus = optimisticStatus.get(ad.id) ?? ad.status;
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setPendingIds(s => new Set([...s, ad.id]));
    try {
      const r = await fetch('/api/fb-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adId: ad.id, status: newStatus, game: 'inv' }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
      setOptimisticStatus(m => new Map([...m, [ad.id, newStatus]]));
    } catch (e) {
      console.error('[inv-fb-upload-control]', e.message);
    } finally {
      setPendingIds(s => { const n = new Set(s); n.delete(ad.id); return n; });
    }
  }, [optimisticStatus]);

  const handleSelect = (v) => {
    setSelected(v);
    setResults(null);
    setSubmitError(null);
    const base = baseName(v.title || '');
    const vDim = extractDim(v.title || '');
    const found = WANTED_DIMS.map(dim => ({
      dim,
      // 1. find sibling with same base name and exact dimension
      video: library.find(lv => lv.id !== v.id && extractDim(lv.title) === dim && baseName(lv.title) === base)
        // 2. selected video matches this dim
        || (vDim === dim ? v : null)
        // 3. fallback: use selected video for any unmatched slot (ensures 3 ads always created)
        || v,
    }));
    setVariants(found);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selected || !adsetId) return;
    const toCreate = variants.filter(f => f.video);
    if (toCreate.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    setResults(null);
    const created = [];
    const errors = [];
    for (const { dim, video } of toCreate) {
      try {
        const r = await fetch('/api/fb-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create-ad', game: 'inv', videoId: video.id, videoTitle: video.title, adsetId, message }),
        });
        const data = await r.json();
        if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
        created.push({ dim, videoId: video.id, ...data });
      } catch (err) {
        errors.push({ dim, error: err.message });
      }
    }
    if (created.length > 0) {
      setResults({ created, errors });
    } else {
      setSubmitError(errors.map(e => `${e.dim}: ${e.error}`).join(' | '));
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setResults(null);
    setSelected(null);
    setVariants([]);
    setMessage('');
    setSubmitError(null);
  };

  // Build active video IDs set for left panel grouping
  const activeAdVideoIds = new Set(
    ads.filter(a => (optimisticStatus.get(a.id) ?? a.status) === 'ACTIVE' && a.videoId).map(a => a.videoId)
  );
  const activeLibrary = library.filter(v => activeAdVideoIds.has(v.id));
  const availableLibrary = library.filter(v => !activeAdVideoIds.has(v.id));

  const activeAds = ads.filter(a => (optimisticStatus.get(a.id) ?? a.status) === 'ACTIVE');
  const pausedAds = ads.filter(a => (optimisticStatus.get(a.id) ?? a.status) === 'PAUSED');

  if (loading) return <div className="p-6 font-mono text-[11px] text-muted">Loading video library…</div>;
  if (loadError) return <div className="p-6 font-mono text-[11px] text-red">{loadError}</div>;

  return (
    <div className="flex h-full overflow-hidden">

      {/* Left — video library */}
      <div className="w-[300px] shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="font-mono text-[10px] text-text2 uppercase tracking-wider">
            Videos <span className="text-muted">({library.length})</span>
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
          {activeLibrary.length > 0 && (
            <div className="mb-2">
              <div className="font-mono text-[8px] text-purple uppercase tracking-wider px-1 pt-1 pb-1.5">
                Active ({activeLibrary.length})
              </div>
              <div className="space-y-1.5 opacity-50">
                {activeLibrary.map(v => {
                  const dim = extractDim(v.title || '');
                  return (
                    <div key={v.id} className="flex items-start gap-2 p-2 rounded border border-border bg-surface2">
                      <FBVideoPreview videoId={v.id} picture={v.picture}>
                        <img src={v.picture} alt="" className="w-[56px] h-[32px] object-cover rounded shrink-0 mt-0.5" />
                      </FBVideoPreview>
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] text-text truncate">{cleanTitle(v.title)}</div>
                        <div className="font-mono text-[9px] text-muted">{dim ? (DIM_LABELS[dim] || dim) : fmtDuration(v.length)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available — selectable */}
          {availableLibrary.length > 0 && (
            <div>
              <div className="font-mono text-[8px] text-muted uppercase tracking-wider px-1 pt-1 pb-1.5">
                Available ({availableLibrary.length})
              </div>
              <div className="space-y-1.5">
                {availableLibrary.map(v => {
                  const isSelected = selected?.id === v.id || variants.some(f => f.video?.id === v.id);
                  const dim = extractDim(v.title || '');
                  return (
                    <div
                      key={v.id}
                      onClick={() => handleSelect(v)}
                      className={`flex items-start gap-2 p-2 rounded border bg-surface2 cursor-pointer transition-colors ${
                        isSelected ? 'border-purple ring-1 ring-[rgba(168,85,247,0.2)]' : 'border-border hover:border-muted'
                      }`}
                    >
                      <FBVideoPreview videoId={v.id} picture={v.picture}>
                        <img src={v.picture} alt="" className="w-[56px] h-[32px] object-cover rounded shrink-0 mt-0.5" />
                      </FBVideoPreview>
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] text-text truncate">{cleanTitle(v.title)}</div>
                        <div className="font-mono text-[9px] text-muted">{dim ? (DIM_LABELS[dim] || dim) : fmtDuration(v.length)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {library.length === 0 && (
            <div className="font-mono text-[10px] text-muted pt-4 text-center">No videos in library.</div>
          )}
        </div>
      </div>

      {/* Right — active ads + upload */}
      <div className="flex-1 overflow-y-auto">

        {/* Active ads section */}
        <div className="border-b border-border p-5">
          <div className="font-mono text-[10px] text-text2 uppercase tracking-wider mb-3">
            Active Ads ({activeAds.length})
          </div>

          {ads.length === 0 ? (
            <div className="font-mono text-[10px] text-muted">No active or paused ads.</div>
          ) : (
            <div className="bg-surface2 border border-border rounded px-3 py-1">
              {[...activeAds, ...pausedAds].map(ad => {
                const currentStatus = optimisticStatus.get(ad.id) ?? ad.status;
                const isActive = currentStatus === 'ACTIVE';
                const isPending = pendingIds.has(ad.id);
                return (
                  <div key={ad.id} className={`flex items-start gap-2 py-2 border-b border-border/50 last:border-0 ${!isActive ? 'opacity-40' : ''}`}>
                    {ad.thumbnailUrl && (
                      <FBVideoPreview videoId={ad.videoId} picture={ad.thumbnailUrl}>
                        <img
                          src={ad.thumbnailUrl}
                          alt=""
                          className="w-[56px] h-[32px] object-cover rounded shrink-0 bg-bg mt-0.5"
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      </FBVideoPreview>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] text-text break-words leading-snug">{ad.name}</div>
                      <div className="font-mono text-[9px] text-muted mt-0.5">{currentStatus}</div>
                    </div>
                    <button
                      onClick={() => handleControl(ad)}
                      disabled={isPending}
                      className={`shrink-0 font-mono text-[9px] px-1.5 py-0.5 border rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors ml-1 ${
                        isActive
                          ? 'border-orange/40 text-orange hover:border-orange'
                          : 'border-green/40 text-green hover:border-green'
                      }`}
                    >
                      {isPending ? '…' : isActive ? '⏸ Pause' : '▶ Resume'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upload form */}
        <div className="p-5">
          <div className="font-mono text-[10px] text-text2 uppercase tracking-wider mb-4">
            Upload New Creative
          </div>

          {results ? (
            <div className="space-y-3 max-w-[480px]">
              <div className="text-green font-mono text-[11px] font-semibold">
                ✓ {results.created.length} ad{results.created.length !== 1 ? 's' : ''} created (paused)
              </div>
              {results.errors.length > 0 && (
                <div className="bg-red/10 border border-red/30 rounded px-3 py-2 font-mono text-[10px] text-red">
                  ⚠ {results.errors.length} format{results.errors.length !== 1 ? 's' : ''} failed
                </div>
              )}
              <button
                onClick={resetForm}
                className="font-mono text-[11px] text-purple underline cursor-pointer"
              >
                Upload another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 max-w-[480px]">
              {selected ? (
                <div className="flex items-start gap-3 p-2.5 rounded border border-border bg-surface2">
                  <img src={selected.picture} alt="" className="w-[80px] h-[45px] object-cover rounded shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] text-text truncate mb-1">{cleanTitle(selected.title)}</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {variants.map(({ dim, video }) => (
                        <span
                          key={dim}
                          className={`font-mono text-[9px] px-2 py-0.5 rounded border ${
                            video ? 'border-green/50 text-green bg-green/5' : 'border-border text-muted'
                          }`}
                        >
                          {DIM_LABELS[dim] || dim} {video ? '✓' : '—'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="font-mono text-[10px] text-muted">← Select a video from the library</div>
              )}

              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">Adset</label>
                <select
                  value={adsetId}
                  onChange={e => setAdsetId(e.target.value)}
                  required
                  className="w-full bg-surface2 border border-border text-text font-mono text-[10px] rounded px-3 py-2 cursor-pointer focus:border-[rgba(168,85,247,0.4)] outline-none"
                >
                  {adsets.map(a => (
                    <option key={a.id} value={a.id}>
                      [{a.platform?.toUpperCase()}] {a.name.replace(/^INV_FB_/i, '').slice(0, 36)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                  Ad Copy <span className="text-muted normal-case">(optional)</span>
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Your ad copy…"
                  className="w-full bg-surface2 border border-border text-text font-mono text-[10px] rounded px-3 py-2 placeholder:text-muted resize-none focus:border-[rgba(168,85,247,0.4)] outline-none"
                />
              </div>

              {submitError && (
                <div className="font-mono text-[10px] text-red bg-surface2 border border-red/30 rounded px-3 py-2">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !selected || !adsetId || variants.filter(f => f.video).length === 0}
                className="w-full py-2.5 font-mono text-[11px] font-semibold bg-purple text-white rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {submitting
                  ? `Creating ${variants.filter(f => f.video).length} ad${variants.filter(f => f.video).length !== 1 ? 's' : ''}…`
                  : `Add to Campaign (${variants.filter(f => f.video).length || 1} format${(variants.filter(f => f.video).length || 1) !== 1 ? 's' : ''})`}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
