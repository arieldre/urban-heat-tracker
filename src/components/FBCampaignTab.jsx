import { useState, useEffect } from 'react';

export default function FBCampaignTab({ game }) {
  const [adsets, setAdsets] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Campaign creation
  const [campName, setCampName] = useState('');
  const [campBudget, setCampBudget] = useState('');
  const [creatingCamp, setCreatingCamp] = useState(false);
  const [campResult, setCampResult] = useState(null);
  const [campError, setCampError] = useState(null);

  // Adset creation
  const [sourceAdsetId, setSourceAdsetId] = useState('');
  const [targetCampId, setTargetCampId] = useState('');
  const [adsetName, setAdsetName] = useState('');
  const [adsetBudget, setAdsetBudget] = useState('');
  const [creatingAdset, setCreatingAdset] = useState(false);
  const [adsetResult, setAdsetResult] = useState(null);
  const [adsetError, setAdsetError] = useState(null);

  useEffect(() => {
    setDataLoading(true);
    Promise.all([
      fetch(`/api/fb-control?action=adsets&game=${game}`).then(r => r.json()),
      fetch(`/api/fb-control?action=campaigns&game=${game}`).then(r => r.json()),
    ]).then(([ad, ca]) => {
      const adsetList = ad.adsets || [];
      const campList = ca.campaigns || [];
      setAdsets(adsetList);
      setCampaigns(campList);
      if (adsetList.length > 0) setSourceAdsetId(adsetList[0].id);
      if (campList.length > 0) setTargetCampId(campList[0].id);
    }).finally(() => setDataLoading(false));
  }, [game]);

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    setCreatingCamp(true);
    setCampError(null);
    setCampResult(null);
    try {
      const r = await fetch('/api/fb-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-campaign', game, name: campName, ...(campBudget && { dailyBudget: campBudget }) }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
      setCampResult(data);
      const newCamp = { id: data.campaignId, name: data.name, status: 'PAUSED' };
      setCampaigns(cs => [newCamp, ...cs]);
      setTargetCampId(data.campaignId);
      setCampName('');
      setCampBudget('');
    } catch (e) {
      setCampError(e.message);
    } finally {
      setCreatingCamp(false);
    }
  };

  const handleCreateAdset = async (e) => {
    e.preventDefault();
    setCreatingAdset(true);
    setAdsetError(null);
    setAdsetResult(null);
    try {
      const r = await fetch('/api/fb-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-adset', game, campaignId: targetCampId, sourceAdsetId, name: adsetName, dailyBudget: adsetBudget }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
      setAdsetResult(data);
      setAdsetName('');
      setAdsetBudget('');
    } catch (e) {
      setAdsetError(e.message);
    } finally {
      setCreatingAdset(false);
    }
  };

  const gameLabel = game === 'uh' ? 'Urban Heat' : 'Invokers';

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left — Create Campaign */}
      <div className="w-[320px] shrink-0 border-r border-border flex flex-col overflow-y-auto p-5">
        <div className="font-mono text-[10px] text-text2 uppercase tracking-wider border-b border-border pb-3 mb-4">
          {gameLabel} — New Campaign
        </div>

        <form onSubmit={handleCreateCampaign} className="space-y-4">
          <div>
            <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">Campaign Name</label>
            <input
              type="text"
              value={campName}
              onChange={e => setCampName(e.target.value)}
              required
              placeholder={`${game === 'uh' ? 'UH' : 'INV'}_FB_GP_US_...`}
              className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted focus:border-accent2 outline-none"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">
              Daily Budget (optional CBO) <span className="text-muted normal-case">($)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">$</span>
              <input
                type="number"
                min="1"
                step="1"
                value={campBudget}
                onChange={e => setCampBudget(e.target.value)}
                placeholder="Leave blank = set per-adset"
                className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded pl-6 pr-3 py-2 placeholder:text-muted focus:border-accent2 outline-none"
              />
            </div>
            <div className="font-mono text-[9px] text-muted mt-1">CBO = campaign distributes budget across adsets</div>
          </div>

          {campError && <div className="font-mono text-[10px] text-red bg-surface2 border border-red/30 rounded px-3 py-2">{campError}</div>}
          {campResult && (
            <div className="bg-surface2 border border-green/30 rounded p-3 space-y-1">
              <div className="font-mono text-[11px] text-green font-semibold">✓ Campaign created (PAUSED)</div>
              <div className="font-mono text-[10px] text-text2">ID: {campResult.campaignId}</div>
              <div className="font-mono text-[10px] text-text2">Name: {campResult.name}</div>
            </div>
          )}

          <button
            type="submit"
            disabled={creatingCamp || !campName}
            className="w-full py-2.5 font-mono text-[11px] font-semibold bg-accent text-bg rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
          >
            {creatingCamp ? 'Creating…' : 'Create Campaign (PAUSED)'}
          </button>
        </form>
      </div>

      {/* Right — Create Adset (clone) */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-[460px]">
          <div className="font-mono text-[10px] text-text2 uppercase tracking-wider border-b border-border pb-3 mb-4">
            {gameLabel} — New Adset (Clone)
          </div>

          {dataLoading ? (
            <div className="font-mono text-[11px] text-muted">Loading adsets and campaigns…</div>
          ) : (
            <form onSubmit={handleCreateAdset} className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">Clone from Adset</label>
                <select
                  value={sourceAdsetId}
                  onChange={e => setSourceAdsetId(e.target.value)}
                  required
                  className="w-full bg-surface2 border border-border text-text font-mono text-[10px] rounded px-3 py-2 cursor-pointer"
                >
                  {adsets.map(a => (
                    <option key={a.id} value={a.id}>[{a.platform?.toUpperCase()}] {a.name.slice(0, 50)}</option>
                  ))}
                </select>
                <div className="font-mono text-[9px] text-muted mt-1">Targeting + optimization cloned from this adset</div>
              </div>

              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">Attach to Campaign</label>
                <select
                  value={targetCampId}
                  onChange={e => setTargetCampId(e.target.value)}
                  required
                  className="w-full bg-surface2 border border-border text-text font-mono text-[10px] rounded px-3 py-2 cursor-pointer"
                >
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>[{c.status}] {c.name?.slice(0, 50)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">Adset Name</label>
                <input
                  type="text"
                  value={adsetName}
                  onChange={e => setAdsetName(e.target.value)}
                  required
                  placeholder={`${game === 'uh' ? 'UH' : 'INV'}_FB_GP_US_...`}
                  className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted focus:border-accent2 outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">Daily Budget ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={adsetBudget}
                    onChange={e => setAdsetBudget(e.target.value)}
                    required
                    className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded pl-6 pr-3 py-2 focus:border-accent2 outline-none"
                  />
                </div>
              </div>

              {adsetError && <div className="font-mono text-[10px] text-red bg-surface2 border border-red/30 rounded px-3 py-2">{adsetError}</div>}
              {adsetResult && (
                <div className="bg-surface2 border border-green/30 rounded p-3 space-y-1">
                  <div className="font-mono text-[11px] text-green font-semibold">✓ Adset created (PAUSED)</div>
                  <div className="font-mono text-[10px] text-text2">ID: {adsetResult.adsetId}</div>
                  <div className="font-mono text-[10px] text-text2">Name: {adsetResult.name}</div>
                  <div className="font-mono text-[9px] text-muted mt-1">→ Add creatives via Upload Creative tab</div>
                </div>
              )}

              <button
                type="submit"
                disabled={creatingAdset || !sourceAdsetId || !targetCampId || !adsetName || !adsetBudget || campaigns.length === 0}
                className="w-full py-2.5 font-mono text-[11px] font-semibold bg-accent text-bg rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
              >
                {creatingAdset ? 'Creating…' : 'Create Adset (PAUSED)'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
