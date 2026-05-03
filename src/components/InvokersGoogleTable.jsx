import { useState, useCallback } from 'react';

const PERF_CONFIG = {
  BEST:        { text: 'BEST',     cls: 'text-green font-semibold' },
  GOOD:        { text: 'GOOD',     cls: 'text-text2' },
  LOW:         { text: 'LOW',      cls: 'text-orange' },
  LEARNING:    { text: 'LEARNING', cls: 'text-muted' },
  PENDING:     { text: 'PENDING',  cls: 'text-muted' },
  UNSPECIFIED: { text: '–',        cls: 'text-muted' },
};

const PERF_ORDER = { BEST: 0, GOOD: 1, LOW: 2, LEARNING: 3, PENDING: 4, UNSPECIFIED: 5 };

const ORIENTATION = {
  YOUTUBE_VIDEO:          '16:9',
  PORTRAIT_YOUTUBE_VIDEO: '9:16',
  SQUARE_YOUTUBE_VIDEO:   '1:1',
};

export default function InvokersGoogleTable({ videos, onControlVideo, defaultActiveOnly = true }) {
  const [pendingIds, setPendingIds]       = useState(new Set());
  const [optimistic, setOptimistic]       = useState(new Map());
  const [search, setSearch]               = useState('');
  const [activeOnly, setActiveOnly]       = useState(defaultActiveOnly);

  const handleControl = useCallback(async (video) => {
    const isActive = optimistic.has(video.assetId) ? optimistic.get(video.assetId) : video.active;
    const action   = isActive ? 'pause' : 'resume';
    setPendingIds(s => new Set([...s, video.assetId]));
    try {
      await onControlVideo(video.assetId, action);
      setOptimistic(m => new Map([...m, [video.assetId, !isActive]]));
    } catch (e) {
      console.error('[inv-google-control]', e.message);
    } finally {
      setPendingIds(s => { const n = new Set(s); n.delete(video.assetId); return n; });
    }
  }, [onControlVideo, optimistic]);

  const filtered = videos
    .filter(v => {
      const isActive = optimistic.has(v.assetId) ? optimistic.get(v.assetId) : v.active;
      if (activeOnly && !isActive) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return v.name.toLowerCase().includes(q) || v.title.toLowerCase().includes(q) || v.videoId.includes(q);
    })
    .sort((a, b) => (PERF_ORDER[a.performanceLabel] ?? 5) - (PERF_ORDER[b.performanceLabel] ?? 5));

  return (
    <div className="overflow-auto h-full">
      <div className="sticky top-0 z-20 bg-bg border-b border-border px-4 py-2 flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search videos..."
          className="bg-surface2 border border-border rounded px-3 py-1 text-[11px] font-mono text-text outline-none focus:border-[rgba(168,85,247,0.4)] placeholder:text-muted w-[240px]"
        />
        <button
          onClick={() => setActiveOnly(v => !v)}
          className={`font-mono text-[10px] font-semibold px-2.5 py-1 rounded border cursor-pointer transition-all whitespace-nowrap ${
            activeOnly
              ? 'bg-purple text-white border-purple'
              : 'bg-transparent text-text2 border-border hover:text-text hover:border-muted'
          }`}
        >
          {activeOnly ? 'Active' : 'All'}
        </button>
        <div className="ml-auto font-mono text-[10px] text-muted">
          {filtered.length} videos
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Video</th>
            <th>Orient.</th>
            <th>Performance</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(video => {
            const isPending = pendingIds.has(video.assetId);
            const isActive  = optimistic.has(video.assetId) ? optimistic.get(video.assetId) : video.active;
            const perf      = PERF_CONFIG[video.performanceLabel] || PERF_CONFIG.UNSPECIFIED;

            return (
              <tr key={video.assetId} className={!isActive ? 'opacity-40' : ''}>
                <td className="flex items-center gap-3">
                  {video.videoId && (
                    <img
                      src={`https://img.youtube.com/vi/${video.videoId}/default.jpg`}
                      alt=""
                      className="w-[64px] h-[36px] rounded object-cover shrink-0"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-medium text-text truncate max-w-[300px]">
                      {video.title || video.name}
                    </div>
                    {video.videoId && (
                      <a
                        href={`https://www.youtube.com/watch?v=${video.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] text-purple hover:underline"
                      >
                        yt/{video.videoId}
                      </a>
                    )}
                  </div>
                </td>

                <td className="font-mono text-[10px] text-muted">
                  {ORIENTATION[video.fieldType] || '–'}
                </td>

                <td className={`font-mono text-[11px] ${perf.cls}`}>
                  {perf.text}
                </td>

                <td>
                  <button
                    disabled={isPending || !onControlVideo}
                    onClick={() => handleControl(video)}
                    className={`font-mono text-[9px] px-2 py-0.5 rounded border cursor-pointer transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                      isActive
                        ? 'border-orange text-orange hover:bg-orange hover:text-white'
                        : 'border-green text-green hover:bg-green hover:text-white'
                    }`}
                  >
                    {isPending ? '...' : isActive ? '⏸ Remove' : '▶ Add Back'}
                  </button>
                </td>
              </tr>
            );
          })}

          {filtered.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center font-mono text-[11px] text-muted py-12">
                {videos.length === 0 ? 'No data — load to populate.' : 'No videos match filter.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
