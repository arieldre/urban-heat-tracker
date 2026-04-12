import { useState, useEffect, useMemo } from 'react';
import Badge from './Badge.jsx';
import { CAMPAIGNS } from '../config.js';

export default function CrossCampaignTab() {
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/tracker-all')
      .then(r => r.json())
      .then(d => { setAllData(d.campaigns); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Find creatives that appear in 2+ campaigns (by youtubeId)
  const overlaps = useMemo(() => {
    if (!allData) return [];
    const byYtId = {};
    for (const camp of allData) {
      for (const asset of camp.live) {
        if (!asset.youtubeId) continue;
        if (!byYtId[asset.youtubeId]) byYtId[asset.youtubeId] = { youtubeId: asset.youtubeId, name: asset.name, url: asset.url, campaigns: [] };
        byYtId[asset.youtubeId].campaigns.push({
          campaignId: camp.campaignId,
          campaignName: camp.campaignName,
          shortLabel: CAMPAIGNS.find(c => c.id === camp.campaignId)?.shortLabel || camp.campaignName,
          cpa: asset.cpa,
          spend: asset.spend,
          conversions: asset.conversions,
          impressions: asset.impressions,
          performanceLabel: asset.performanceLabel,
          orientation: asset.orientation,
        });
      }
    }
    return Object.values(byYtId)
      .filter(o => o.campaigns.length >= 2)
      .sort((a, b) => {
        const aSpend = a.campaigns.reduce((s, c) => s + c.spend, 0);
        const bSpend = b.campaigns.reduce((s, c) => s + c.spend, 0);
        return bSpend - aSpend;
      });
  }, [allData]);

  // Campaign-level summary comparison
  const campSummaries = useMemo(() => {
    if (!allData) return [];
    return allData.map(camp => {
      const live = camp.live.filter(a => a.status === 'live');
      const totalSpend = live.reduce((s, a) => s + a.spend, 0);
      const totalConv = live.reduce((s, a) => s + a.conversions, 0);
      const totalImpr = live.reduce((s, a) => s + a.impressions, 0);
      const avgCpa = totalConv > 0 ? totalSpend / totalConv : null;
      const label = CAMPAIGNS.find(c => c.id === camp.campaignId)?.shortLabel || camp.campaignName;
      return { ...camp, label, totalSpend, totalConv, totalImpr, avgCpa, liveCount: live.length, historyCount: camp.history.length };
    });
  }, [allData]);

  if (loading) return <div className="flex items-center justify-center h-full font-mono text-sm text-muted">Loading all campaigns...</div>;

  return (
    <div className="overflow-auto h-full p-5">
      {/* Campaign comparison cards */}
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted mb-3">Campaign Overview</div>
      <div className="grid grid-cols-4 gap-3 mb-8">
        {campSummaries.map(c => (
          <div key={c.campaignId} className="bg-surface border border-border rounded-lg p-4">
            <div className="font-mono text-[11px] font-semibold text-text mb-3">{c.label}</div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-muted">Spend</span>
                <span className="font-mono text-[12px] text-text font-medium">${c.totalSpend.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-muted">Avg CPA</span>
                <span className="font-mono text-[12px] text-green font-semibold">{c.avgCpa ? `$${c.avgCpa.toFixed(3)}` : '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-muted">Conversions</span>
                <span className="font-mono text-[12px] text-accent2">{c.totalConv.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-muted">Live / History</span>
                <span className="font-mono text-[11px] text-text2">{c.liveCount} / {c.historyCount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Cross-campaign overlaps */}
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted mb-3">
        Shared Creatives <span className="text-accent ml-1">({overlaps.length} videos in 2+ campaigns)</span>
      </div>

      {overlaps.length === 0 ? (
        <div className="font-mono text-[11px] text-muted py-8 text-center">No shared creatives found across campaigns.</div>
      ) : (
        <div className="space-y-3">
          {overlaps.map(o => (
            <div key={o.youtubeId} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                {o.youtubeId && (
                  <img src={`https://img.youtube.com/vi/${o.youtubeId}/default.jpg`} alt="" className="w-[60px] h-[45px] rounded object-cover shrink-0" />
                )}
                <div>
                  <div className="font-mono text-[11px] font-medium text-text">{o.name || o.youtubeId}</div>
                  {o.url && (
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-accent2 hover:underline">
                      youtu.be/{o.youtubeId}
                    </a>
                  )}
                </div>
                <div className="ml-auto font-mono text-[10px] text-muted">{o.campaigns.length} campaigns</div>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${o.campaigns.length}, 1fr)` }}>
                {o.campaigns.map(c => {
                  const bestCpa = Math.min(...o.campaigns.filter(x => x.cpa).map(x => x.cpa));
                  const isBest = c.cpa === bestCpa && c.cpa !== null;
                  return (
                    <div key={c.campaignId} className={`rounded-md p-3 border ${isBest ? 'bg-[rgba(71,255,176,0.05)] border-[rgba(71,255,176,0.2)]' : 'bg-surface2 border-border'}`}>
                      <div className="font-mono text-[10px] font-semibold text-text2 mb-2">
                        {c.shortLabel}
                        {isBest && <span className="text-green ml-1">{'\u2605'} best</span>}
                      </div>
                      <div className="flex justify-between mb-1">
                        <span className="font-mono text-[9px] text-muted">CPA</span>
                        <span className={`font-mono text-[11px] font-semibold ${isBest ? 'text-green' : 'text-text'}`}>
                          {c.cpa ? `$${c.cpa.toFixed(3)}` : '--'}
                        </span>
                      </div>
                      <div className="flex justify-between mb-1">
                        <span className="font-mono text-[9px] text-muted">Spend</span>
                        <span className="font-mono text-[11px] text-text2">${c.spend.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between mb-1">
                        <span className="font-mono text-[9px] text-muted">Conv</span>
                        <span className="font-mono text-[11px] text-text2">{Math.round(c.conversions)}</span>
                      </div>
                      <div className="mt-2"><Badge label={c.performanceLabel} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
