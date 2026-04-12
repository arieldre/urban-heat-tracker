import Badge from './Badge.jsx';

function TextSection({ title, assets, showStatus }) {
  if (!assets.length) return null;
  const sorted = [...assets].sort((a, b) => b.spend - a.spend);

  return (
    <div className="mb-6">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text2 px-4 py-2 bg-surface border-b border-border sticky top-[37px] z-[5]">
        {title}
        <span className="ml-2 text-muted">{assets.length}</span>
      </div>
      {sorted.map((asset, i) => (
        <tr key={asset.key || asset.id || i}>
          <td className="text-[13px] max-w-[600px] whitespace-normal" style={{ padding: '10px 16px' }}>
            {asset.text || '--'}
          </td>
          <td><Badge label={asset.performanceLabel} /></td>
          {showStatus && (
            <td className="font-mono text-[10px] text-muted">
              {asset.lastSeenAt ? `Last: ${asset.lastSeenAt}` : ''}
            </td>
          )}
          <td className="font-mono text-[11px] text-text2">
            {asset.spend > 0 ? `$${asset.spend.toFixed(2)}` : '\u2013'}
          </td>
          <td className="font-mono text-[11px] text-text2">
            {asset.conversions > 0 ? Math.round(asset.conversions) : '\u2013'}
          </td>
          <td className="font-mono text-[11px] text-text2">
            {asset.impressions > 0 ? asset.impressions.toLocaleString() : '\u2013'}
          </td>
        </tr>
      ))}
    </div>
  );
}

export default function DescriptionsTable({ assets, historyAssets }) {
  const liveHeadlines = (assets || []).filter(a => a.fieldType === 'HEADLINE' || a.fieldType === 'LONG_HEADLINE');
  const liveDescriptions = (assets || []).filter(a => a.fieldType === 'DESCRIPTION');
  const histHeadlines = (historyAssets || []).filter(a => a.fieldType === 'HEADLINE' || a.fieldType === 'LONG_HEADLINE');
  const histDescriptions = (historyAssets || []).filter(a => a.fieldType === 'DESCRIPTION');

  const hasAnything = liveHeadlines.length || liveDescriptions.length || histHeadlines.length || histDescriptions.length;

  return (
    <div className="overflow-auto h-full">
      <table>
        <thead>
          <tr>
            <th>Text</th>
            <th>Performance</th>
            <th>Status</th>
            <th>Spend</th>
            <th>Conv</th>
            <th>Impressions</th>
          </tr>
        </thead>
        <tbody>
          {/* Live Headlines */}
          {liveHeadlines.length > 0 && (
            <>
              <tr><td colSpan={6} className="bg-surface2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent border-b border-border">
                Headlines — Live <span className="text-muted ml-1">({liveHeadlines.length})</span>
              </td></tr>
              {[...liveHeadlines].sort((a, b) => b.spend - a.spend).map((asset, i) => (
                <TextRow key={asset.key || `lh-${i}`} asset={asset} status="live" />
              ))}
            </>
          )}

          {/* Live Descriptions */}
          {liveDescriptions.length > 0 && (
            <>
              <tr><td colSpan={6} className="bg-surface2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent border-b border-border">
                Descriptions — Live <span className="text-muted ml-1">({liveDescriptions.length})</span>
              </td></tr>
              {[...liveDescriptions].sort((a, b) => b.spend - a.spend).map((asset, i) => (
                <TextRow key={asset.key || `ld-${i}`} asset={asset} status="live" />
              ))}
            </>
          )}

          {/* History Headlines */}
          {histHeadlines.length > 0 && (
            <>
              <tr><td colSpan={6} className="bg-surface2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-orange border-b border-border">
                Headlines — History <span className="text-muted ml-1">({histHeadlines.length})</span>
              </td></tr>
              {[...histHeadlines].sort((a, b) => b.spend - a.spend).map((asset, i) => (
                <TextRow key={asset.key || `hh-${i}`} asset={asset} status="history" />
              ))}
            </>
          )}

          {/* History Descriptions */}
          {histDescriptions.length > 0 && (
            <>
              <tr><td colSpan={6} className="bg-surface2 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-orange border-b border-border">
                Descriptions — History <span className="text-muted ml-1">({histDescriptions.length})</span>
              </td></tr>
              {[...histDescriptions].sort((a, b) => b.spend - a.spend).map((asset, i) => (
                <TextRow key={asset.key || `hd-${i}`} asset={asset} status="history" />
              ))}
            </>
          )}

          {!hasAnything && (
            <tr>
              <td colSpan={6} className="text-center text-muted font-mono text-[11px] py-8">
                No text assets found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TextRow({ asset, status }) {
  return (
    <tr className={status === 'history' ? 'opacity-60' : ''}>
      <td className="text-[13px] max-w-[600px] whitespace-normal" style={{ padding: '10px 16px' }}>
        {asset.text || '--'}
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
        {asset.spend > 0 ? `$${asset.spend.toFixed(2)}` : '\u2013'}
      </td>
      <td className="font-mono text-[11px] text-text2">
        {asset.conversions > 0 ? Math.round(asset.conversions) : '\u2013'}
      </td>
      <td className="font-mono text-[11px] text-text2">
        {asset.impressions > 0 ? asset.impressions.toLocaleString() : '\u2013'}
      </td>
    </tr>
  );
}
