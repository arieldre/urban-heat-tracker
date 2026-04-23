import { useState, useEffect } from 'react';

const FIELD_TYPE_LABELS = {
  YOUTUBE_VIDEO:          'Landscape (16:9)',
  PORTRAIT_YOUTUBE_VIDEO: 'Portrait (9:16)',
  SQUARE_YOUTUBE_VIDEO:   'Square (1:1)',
};

export default function VideoUpload({ onClose }) {
  const [assetGroups, setAssetGroups]           = useState([]);
  const [loadingGroups, setLoadingGroups]       = useState(true);
  const [groupsError, setGroupsError]           = useState(null);

  const [youtubeUrl, setYoutubeUrl]             = useState('');
  const [assetGroupResourceName, setGroupRN]    = useState('');
  const [fieldType, setFieldType]               = useState('YOUTUBE_VIDEO');
  const [name, setName]                         = useState('');

  const [submitting, setSubmitting]             = useState(false);
  const [result, setResult]                     = useState(null);
  const [error, setError]                       = useState(null);

  useEffect(() => {
    fetch('/api/upload-video')
      .then(r => r.json())
      .then(d => {
        if (d.assetGroups) {
          setAssetGroups(d.assetGroups);
          if (d.assetGroups.length > 0) setGroupRN(d.assetGroups[0].resourceName);
        } else {
          setGroupsError('Failed to load asset groups.');
        }
      })
      .catch(() => setGroupsError('Network error loading asset groups.'))
      .finally(() => setLoadingGroups(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/upload-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl, assetGroupResourceName, fieldType, name }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setError(data.error || `HTTP ${r.status}`);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setYoutubeUrl('');
    setName('');
    setFieldType('YOUTUBE_VIDEO');
    if (assetGroups.length > 0) setGroupRN(assetGroups[0].resourceName);
  };

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.85)] z-50 flex items-center justify-center">
      <div className="bg-surface border border-border rounded-lg w-[90vw] max-w-[540px] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="font-mono text-[12px] font-semibold text-accent uppercase tracking-wider">
            Upload Video — IN Campaigns Only
          </div>
          <button onClick={onClose} className="font-mono text-[14px] text-muted hover:text-text cursor-pointer">
            &times;
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Success state */}
          {result && (
            <div className="space-y-3">
              <div className="text-green font-mono text-[11px] font-semibold uppercase tracking-wider">
                ✓ Asset uploaded successfully
              </div>
              <div className="bg-surface2 border border-border rounded p-3 font-mono text-[11px] space-y-1 text-text2">
                <div><span className="text-text">Video ID:</span> {result.videoId}</div>
                <div><span className="text-text">Asset name:</span> {result.assetName}</div>
                <div><span className="text-text">Campaign:</span> {result.campaign}</div>
                <div><span className="text-text">Group:</span> {result.group}</div>
                <div><span className="text-text">Orientation:</span> {FIELD_TYPE_LABELS[result.fieldType]}</div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={reset}
                  className="flex-1 py-2 font-mono text-[11px] bg-surface2 border border-border text-text hover:border-accent cursor-pointer rounded"
                >
                  Upload another
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2 font-mono text-[11px] bg-accent text-bg font-semibold cursor-pointer rounded"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Form state */}
          {!result && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {loadingGroups && (
                <div className="font-mono text-[11px] text-muted">Loading asset groups…</div>
              )}
              {groupsError && (
                <div className="font-mono text-[11px] text-red">{groupsError}</div>
              )}

              {!loadingGroups && !groupsError && (
                <>
                  {/* Asset group */}
                  <div>
                    <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                      Asset Group
                    </label>
                    <select
                      value={assetGroupResourceName}
                      onChange={e => setGroupRN(e.target.value)}
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

                  {/* YouTube URL */}
                  <div>
                    <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                      YouTube URL or Video ID
                    </label>
                    <input
                      type="text"
                      value={youtubeUrl}
                      onChange={e => setYoutubeUrl(e.target.value)}
                      placeholder="https://youtu.be/... or VIDEO_ID"
                      required
                      className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted"
                    />
                  </div>

                  {/* Orientation */}
                  <div>
                    <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                      Orientation
                    </label>
                    <div className="flex gap-2">
                      {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setFieldType(val)}
                          className={`flex-1 py-2 font-mono text-[10px] rounded border cursor-pointer transition-colors ${
                            fieldType === val
                              ? 'border-accent text-accent bg-surface2'
                              : 'border-border text-text2 bg-surface2 hover:border-text2'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Asset name (optional) */}
                  <div>
                    <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
                      Asset Name <span className="text-muted normal-case">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={`UH_<videoId>_${fieldType}`}
                      className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted"
                    />
                  </div>

                  {error && (
                    <div className="font-mono text-[11px] text-red bg-surface2 border border-red/30 rounded px-3 py-2">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !youtubeUrl || !assetGroupResourceName}
                    className="w-full py-2.5 font-mono text-[11px] font-semibold bg-accent text-bg rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
                  >
                    {submitting ? 'Uploading…' : 'Upload to Google Ads'}
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
