import { useState } from 'react';
import Badge from './Badge.jsx';

const IN_CAMPAIGN_IDS = ['22784768376', '22879160345'];

const FIELD_LIMITS = {
  HEADLINE:    { maxLen: 30, label: 'Headline' },
  DESCRIPTION: { maxLen: 90, label: 'Description' },
};

function AddTextForm({ campaignId, onMutated }) {
  const [fieldType, setFieldType] = useState('HEADLINE');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const maxLen = FIELD_LIMITS[fieldType].maxLen;

  const handleAdd = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/edit-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', campaignId, fieldType, text: text.trim() }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      setText('');
      await onMutated?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3 border-b border-border bg-surface flex flex-wrap items-center gap-2">
      <select
        value={fieldType}
        onChange={e => setFieldType(e.target.value)}
        disabled={busy}
        className="font-mono text-[11px] bg-surface2 border border-border rounded px-2 py-1 text-text"
      >
        <option value="HEADLINE">Headline (max 30)</option>
        <option value="DESCRIPTION">Description (max 90)</option>
      </select>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !busy && handleAdd()}
        maxLength={maxLen}
        placeholder={`New ${FIELD_LIMITS[fieldType].label.toLowerCase()}…`}
        disabled={busy}
        className="font-mono text-[12px] bg-surface2 border border-border rounded px-2 py-1 text-text flex-1 min-w-[200px] max-w-[400px]"
      />
      <span className="font-mono text-[10px] text-muted">{text.length}/{maxLen}</span>
      <button
        onClick={handleAdd}
        disabled={busy || !text.trim()}
        className="font-mono text-[11px] px-3 py-1 rounded bg-accent text-bg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
      >
        {busy ? 'Adding…' : 'Add'}
      </button>
      {err && <span className="font-mono text-[10px] text-red">{err}</span>}
    </div>
  );
}

export default function DescriptionsTable({ assets, historyAssets, campaignId, onMutated }) {
  const isInCampaign = IN_CAMPAIGN_IDS.includes(campaignId);

  const liveHeadlines    = (assets || []).filter(a => a.fieldType === 'HEADLINE' || a.fieldType === 'LONG_HEADLINE');
  const liveDescriptions = (assets || []).filter(a => a.fieldType === 'DESCRIPTION');
  const histHeadlines    = (historyAssets || []).filter(a => a.fieldType === 'HEADLINE' || a.fieldType === 'LONG_HEADLINE');
  const histDescriptions = (historyAssets || []).filter(a => a.fieldType === 'DESCRIPTION');

  const hasAnything = liveHeadlines.length || liveDescriptions.length || histHeadlines.length || histDescriptions.length;

  return (
    <div className="overflow-auto h-full flex flex-col">
      {isInCampaign && <AddTextForm campaignId={campaignId} onMutated={onMutated} />}
      <div className="flex-1 overflow-auto">
        <table>
          <thead>
            <tr>
              <th>Text</th>
              <th>Performance</th>
              <th>Status</th>
              <th>Spend</th>
              <th>Conv</th>
              <th>Impressions</th>
              {isInCampaign && <th></th>}
            </tr>
          </thead>
          <tbody>
            {liveHeadlines.length > 0 && (
              <>
                <tr><td colSpan={isInCampaign ? 7 : 6} className="bg-surface2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent border-b border-border">
                  Headlines — Live <span className="text-muted ml-1">({liveHeadlines.length})</span>
                </td></tr>
                {[...liveHeadlines].sort((a, b) => b.spend - a.spend).map((asset, i) => (
                  <TextRow
                    key={asset.key || `lh-${i}`}
                    asset={asset}
                    status="live"
                    isInCampaign={isInCampaign}
                    campaignId={campaignId}
                    onMutated={onMutated}
                    mutateFieldType={asset.fieldType === 'LONG_HEADLINE' ? null : 'HEADLINE'}
                  />
                ))}
              </>
            )}

            {liveDescriptions.length > 0 && (
              <>
                <tr><td colSpan={isInCampaign ? 7 : 6} className="bg-surface2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent border-b border-border">
                  Descriptions — Live <span className="text-muted ml-1">({liveDescriptions.length})</span>
                </td></tr>
                {[...liveDescriptions].sort((a, b) => b.spend - a.spend).map((asset, i) => (
                  <TextRow
                    key={asset.key || `ld-${i}`}
                    asset={asset}
                    status="live"
                    isInCampaign={isInCampaign}
                    campaignId={campaignId}
                    onMutated={onMutated}
                    mutateFieldType="DESCRIPTION"
                  />
                ))}
              </>
            )}

            {histHeadlines.length > 0 && (
              <>
                <tr><td colSpan={isInCampaign ? 7 : 6} className="bg-surface2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-orange border-b border-border">
                  Headlines — History <span className="text-muted ml-1">({histHeadlines.length})</span>
                </td></tr>
                {[...histHeadlines].sort((a, b) => b.spend - a.spend).map((asset, i) => (
                  <TextRow key={asset.key || `hh-${i}`} asset={asset} status="history" isInCampaign={false} />
                ))}
              </>
            )}

            {histDescriptions.length > 0 && (
              <>
                <tr><td colSpan={isInCampaign ? 7 : 6} className="bg-surface2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-orange border-b border-border">
                  Descriptions — History <span className="text-muted ml-1">({histDescriptions.length})</span>
                </td></tr>
                {[...histDescriptions].sort((a, b) => b.spend - a.spend).map((asset, i) => (
                  <TextRow key={asset.key || `hd-${i}`} asset={asset} status="history" isInCampaign={false} />
                ))}
              </>
            )}

            {!hasAnything && (
              <tr>
                <td colSpan={isInCampaign ? 7 : 6} className="text-center text-muted font-mono text-[11px] py-8">
                  No text assets found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TextRow({ asset, status, isInCampaign, campaignId, onMutated, mutateFieldType }) {
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState(null);

  const handleRemove = async () => {
    if (!confirm(`Remove "${asset.text}" from this campaign?`)) return;
    setRemoving(true);
    setErr(null);
    try {
      const r = await fetch('/api/edit-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', campaignId, fieldType: mutateFieldType, text: asset.text }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      await onMutated?.();
    } catch (e) {
      setErr(e.message);
      setRemoving(false);
    }
  };

  return (
    <tr className={status === 'history' ? 'opacity-60' : ''}>
      <td className="text-[13px] max-w-[600px] whitespace-normal" style={{ padding: '10px 16px' }}>
        {asset.text || '--'}
        {err && <span className="block font-mono text-[10px] text-red mt-1">{err}</span>}
      </td>
      <td><Badge label={asset.performanceLabel} /></td>
      <td>
        {status === 'history' ? (
          <span className="font-mono text-[10px] text-orange">
            Stopped {asset.lastSeenAt || '?'}
          </span>
        ) : (
          <Badge label="live" />
        )}
      </td>
      <td className="font-mono text-[11px] text-text2">
        {asset.spend > 0 ? `$${asset.spend.toFixed(2)}` : '–'}
      </td>
      <td className="font-mono text-[11px] text-text2">
        {asset.conversions > 0 ? Math.round(asset.conversions) : '–'}
      </td>
      <td className="font-mono text-[11px] text-text2">
        {asset.impressions > 0 ? asset.impressions.toLocaleString() : '–'}
      </td>
      {isInCampaign && (
        <td style={{ padding: '4px 8px' }}>
          {mutateFieldType ? (
            <button
              onClick={handleRemove}
              disabled={removing}
              title="Remove from campaign"
              className="font-mono text-[10px] text-red opacity-60 hover:opacity-100 cursor-pointer disabled:opacity-30"
            >
              {removing ? '…' : '✕'}
            </button>
          ) : (
            <span className="font-mono text-[10px] text-muted" title="LONG_HEADLINE not directly mutable on APP_AD">—</span>
          )}
        </td>
      )}
    </tr>
  );
}
