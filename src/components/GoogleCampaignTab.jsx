import { useState, useEffect } from 'react';

const GEO_OPTIONS = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IN', name: 'India' },
  { code: 'PH', name: 'Philippines' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'SG', name: 'Singapore' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'IL', name: 'Israel' },
];

const APP_DEFAULTS = {
  uh:  { android: 'gg.oneupgames.ggclient',        ios: '' },
  inv: { android: 'hitzone.anima.spirit.guardians', ios: '6755186220' },
};

export default function GoogleCampaignTab({ game }) {
  const [platform, setPlatform] = useState('android');
  const [appId, setAppId] = useState(APP_DEFAULTS[game]?.android || '');
  const [campaignName, setCampaignName] = useState('');
  const [dailyBudget, setDailyBudget] = useState('');
  const [tcpa, setTcpa] = useState('');
  const [countries, setCountries] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setAppId(APP_DEFAULTS[game]?.[platform] || '');
  }, [game, platform]);

  const toggleCountry = (code) => {
    setCountries(cs => cs.includes(code) ? cs.filter(c => c !== code) : [...cs, code]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/upload-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-campaign', game, campaignName, appId, platform, dailyBudget, tcpa, countries }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const gameLabel = game === 'uh' ? 'Urban Heat' : 'Invokers';

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-[480px]">
        <div className="font-mono text-[10px] text-text2 uppercase tracking-wider border-b border-border pb-3 mb-5">
          {gameLabel} — New Google UAC Campaign
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="bg-surface2 border border-green/30 rounded p-4 space-y-2">
              <div className="font-mono text-[11px] text-green font-semibold">✓ Campaign created (PAUSED)</div>
              <div className="font-mono text-[10px] text-text2 space-y-1">
                <div><span className="text-muted">Name:</span> {result.name}</div>
                <div><span className="text-muted">Campaign ID:</span> {result.campaignId}</div>
                <div><span className="text-muted">Geo added:</span> {result.geoAdded || 0} countries</div>
              </div>
            </div>
            <div className="bg-surface2 border border-orange/20 rounded px-3 py-2 font-mono text-[10px] text-orange">
              Next: create an ad group + ad in Google Ads UI, then add videos via the Upload Video tab.
            </div>
            <button
              onClick={() => { setResult(null); setCampaignName(''); }}
              className="font-mono text-[10px] text-accent2 underline cursor-pointer"
            >
              Create another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Platform */}
            <div>
              <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-2">Platform</label>
              <div className="flex gap-2">
                {['android', 'ios'].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={`flex-1 py-2 font-mono text-[10px] rounded border cursor-pointer transition-colors ${
                      platform === p ? 'border-accent text-accent bg-surface2' : 'border-border text-text2 bg-surface2 hover:border-muted'
                    }`}
                  >
                    {p === 'android' ? 'Android (GP)' : 'iOS (App Store)'}
                  </button>
                ))}
              </div>
            </div>

            {/* App ID */}
            <div>
              <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">App ID</label>
              <input
                type="text"
                value={appId}
                onChange={e => setAppId(e.target.value)}
                required
                placeholder={platform === 'ios' ? 'Numeric App Store ID' : 'com.example.app'}
                className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted focus:border-accent2 outline-none"
              />
              {!appId && platform === 'ios' && game === 'uh' && (
                <div className="font-mono text-[9px] text-orange mt-1">UH iOS app ID not configured — enter manually</div>
              )}
            </div>

            {/* Campaign Name */}
            <div>
              <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">Campaign Name</label>
              <input
                type="text"
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                required
                placeholder={`${game === 'uh' ? 'UH' : 'INV'}_UAC_GP_US_tCPA_...`}
                className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded px-3 py-2 placeholder:text-muted focus:border-accent2 outline-none"
              />
            </div>

            {/* Budget + tCPA side by side */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">Daily Budget</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">$</span>
                  <input
                    type="number" min="1" step="1" value={dailyBudget}
                    onChange={e => setDailyBudget(e.target.value)} required
                    className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded pl-6 pr-3 py-2 focus:border-accent2 outline-none"
                  />
                </div>
              </div>
              <div className="flex-1">
                <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-1">Target CPA</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">$</span>
                  <input
                    type="number" min="0.01" step="0.01" value={tcpa}
                    onChange={e => setTcpa(e.target.value)} required
                    className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded pl-6 pr-3 py-2 focus:border-accent2 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Countries */}
            <div>
              <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-2">
                Countries <span className="text-muted normal-case">({countries.length} selected — blank = global)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {GEO_OPTIONS.map(({ code, name }) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleCountry(code)}
                    className={`font-mono text-[9px] px-2 py-1 rounded border cursor-pointer transition-colors ${
                      countries.includes(code)
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-text2 hover:border-muted'
                    }`}
                    title={name}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="font-mono text-[10px] text-red bg-surface2 border border-red/30 rounded px-3 py-2">{error}</div>}

            <button
              type="submit"
              disabled={submitting || !campaignName || !dailyBudget || !tcpa || !appId}
              className="w-full py-2.5 font-mono text-[11px] font-semibold bg-accent text-bg rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
            >
              {submitting ? 'Creating…' : 'Create Campaign (PAUSED)'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
