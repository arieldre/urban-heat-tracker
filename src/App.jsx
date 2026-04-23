import { useState, useCallback, useEffect } from 'react';
import Header from './components/Header.jsx';
import CampaignSummary from './components/CampaignSummary.jsx';
import LiveTable from './components/LiveTable.jsx';
import HistoryTable from './components/HistoryTable.jsx';
import DescriptionsTable from './components/DescriptionsTable.jsx';
import CrossCampaignTab from './components/CrossCampaignTab.jsx';
import HeadToHead from './components/HeadToHead.jsx';
import UploadVideosTab from './components/UploadVideosTab.jsx';
import FBLiveTable from './components/FBLiveTable.jsx';
import FBHistoryTable from './components/FBHistoryTable.jsx';
import { useTrackerData } from './hooks/useTrackerData.js';
import { useFBData } from './hooks/useFBData.js';
import { CAMPAIGNS } from './config.js';

export default function App() {
  const [network, setNetwork] = useState('google');
  const [campaignId, setCampaignId] = useState(CAMPAIGNS[0].id);
  const [fbCampaignId, setFBCampaignId] = useState('all');
  const [activeTab, setActiveTab] = useState('live');
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('uh-theme') || 'dark');
  const [showH2H, setShowH2H] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState(null);

  const { data: googleData, loading: googleLoading, error: googleError, refresh: googleRefresh } = useTrackerData(campaignId);
  const { data: fbData, loading: fbLoading, error: fbError, refresh: fbRefresh } = useFBData(fbCampaignId);

  const data = network === 'facebook' ? fbData : googleData;
  const loading = network === 'facebook' ? fbLoading : googleLoading;
  const error = network === 'facebook' ? fbError : googleError;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('uh-theme', theme);
  }, [theme]);

  // Reset to live tab when switching networks if on a Google-only tab
  useEffect(() => {
    if (network === 'facebook' && (activeTab === 'descriptions' || activeTab === 'compare')) {
      setActiveTab('live');
    }
  }, [network, activeTab]);

  // FB campaign list comes from any FB data response (always included)
  const fbCampaigns = fbData?.campaigns || [];

  const live = data?.live || [];
  const history = data?.history || [];
  const descriptions = data?.descriptions || [];
  const descriptionsHistory = data?.descriptionsHistory || [];
  const tags = data?.tags || {};

  const stats = {
    live: live.filter(a => a.status === 'live' || a.status === 'ACTIVE').length,
    pending: live.filter(a => a.status === 'pending' || a.status === 'PAUSED').length,
    history: history.length,
  };

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const endpoint = network === 'facebook' ? '/api/fb-sync' : '/api/sync';
      const r = await fetch(endpoint);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (network === 'facebook') await fbRefresh();
      else await googleRefresh();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  }, [network, fbRefresh, googleRefresh]);

  const handleSnapshot = useCallback(async () => {
    try {
      const r = await fetch('/api/snapshot', { method: 'POST' });
      const json = await r.json();
      if (json.id) {
        const url = `${window.location.origin}?snapshot=${json.id}`;
        await navigator.clipboard.writeText(url);
        setSnapshotMsg('Link copied!');
        setTimeout(() => setSnapshotMsg(null), 2500);
      }
    } catch (e) {
      console.error('Snapshot failed:', e);
    }
  }, []);

  return (
    <>
      <Header
        network={network}
        onNetworkChange={setNetwork}
        selectedCampaign={campaignId}
        onCampaignChange={setCampaignId}
        fbCampaigns={fbCampaigns}
        selectedFBCampaign={fbCampaignId}
        onFBCampaignChange={setFBCampaignId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stats={stats}
        lastSyncedAt={data?.lastSyncedAt}
        onSync={handleSync}
        syncing={syncing}
        theme={theme}
        onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        onSnapshot={handleSnapshot}
        snapshotMsg={snapshotMsg}
        onH2H={() => setShowH2H(true)}
      />

      {data && activeTab === 'live' && network === 'google' && (
        <CampaignSummary assets={live} history={history} />
      )}

      <div className="flex-1 overflow-auto bg-bg">
        {loading && !data && (
          <div className="flex items-center justify-center h-full">
            <div className="font-mono text-sm text-muted">Loading...</div>
          </div>
        )}

        {error && !data && (
          <div className="flex items-center justify-center h-full">
            <div className="font-mono text-sm text-red">
              Error: {error}
              <button
                onClick={network === 'facebook' ? fbRefresh : googleRefresh}
                className="ml-3 text-accent2 underline cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Google Ads views */}
        {network === 'google' && data && activeTab === 'live' && (
          <LiveTable assets={live} tags={tags} />
        )}
        {network === 'google' && data && activeTab === 'history' && (
          <HistoryTable entries={history} tags={tags} />
        )}
        {network === 'google' && data && activeTab === 'descriptions' && (
          <DescriptionsTable assets={descriptions} historyAssets={descriptionsHistory} />
        )}
        {network === 'google' && activeTab === 'compare' && (
          <CrossCampaignTab />
        )}
        {network === 'google' && activeTab === 'upload' && (
          <UploadVideosTab />
        )}

        {/* Facebook views */}
        {network === 'facebook' && data && activeTab === 'live' && (
          <FBLiveTable assets={live} />
        )}
        {network === 'facebook' && data && activeTab === 'history' && (
          <FBHistoryTable entries={history} />
        )}

        {data && !loading && live.length === 0 && history.length === 0 && activeTab !== 'compare' && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center font-mono text-sm text-muted">
              <div className="mb-2">No data yet.</div>
              <div className="text-[10px]">Click Sync to seed initial data.</div>
            </div>
          </div>
        )}
      </div>

      {showH2H && googleData && network === 'google' && (
        <HeadToHead assets={live} onClose={() => setShowH2H(false)} />
      )}
    </>
  );
}
