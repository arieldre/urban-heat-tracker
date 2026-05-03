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
import InvokersFBLiveTable from './components/InvokersFBLiveTable.jsx';
import InvokersGoogleTable from './components/InvokersGoogleTable.jsx';
import InvokersFBUploadTab from './components/InvokersFBUploadTab.jsx';
import InvokersGoogleUploadTab from './components/InvokersGoogleUploadTab.jsx';
import UHFBUploadTab from './components/UHFBUploadTab.jsx';
import InvokersGoogleBidTab from './components/InvokersGoogleBidTab.jsx';
import FBCampaignTab from './components/FBCampaignTab.jsx';
import GoogleCampaignTab from './components/GoogleCampaignTab.jsx';
import { useTrackerData } from './hooks/useTrackerData.js';
import { useFBData } from './hooks/useFBData.js';
import { useInvokersFBData } from './hooks/useInvokersFBData.js';
import { useInvokersGoogleData } from './hooks/useInvokersGoogleData.js';
import { CAMPAIGNS } from './config.js';

export default function App() {
  const [game, setGame] = useState('uh');
  const [network, setNetwork] = useState('google');
  const [campaignId, setCampaignId] = useState(CAMPAIGNS[0].id);
  const [fbCampaignId, setFBCampaignId] = useState('all');
  const [invCampaignId, setInvCampaignId] = useState('all');
  const [activeTab, setActiveTab] = useState('live');
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('uh-theme') || 'dark');
  const [showH2H, setShowH2H] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState(null);

  const { data: googleData, loading: googleLoading, error: googleError, refresh: googleRefresh } = useTrackerData(campaignId);
  const { data: fbData, loading: fbLoading, error: fbError, refresh: fbRefresh } = useFBData(fbCampaignId);
  const { data: invData, loading: invLoading, error: invError, refresh: invRefresh } = useInvokersFBData(invCampaignId);
  const { data: invGoogleData, loading: invGoogleLoading, error: invGoogleError, refresh: invGoogleRefresh } = useInvokersGoogleData();

  const isInvokers = game === 'inv';
  const isInvGoogle = isInvokers && network === 'google';
  const data = isInvGoogle ? null : isInvokers ? invData : (network === 'facebook' ? fbData : googleData);
  const loading = isInvGoogle ? invGoogleLoading : isInvokers ? invLoading : (network === 'facebook' ? fbLoading : googleLoading);
  const error = isInvGoogle ? invGoogleError : isInvokers ? invError : (network === 'facebook' ? fbError : googleError);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('uh-theme', theme);
  }, [theme]);

  // Reset to live tab when switching networks/games if on incompatible tab
  useEffect(() => {
    const validTabs = {
      uhGoogle:  ['live', 'history', 'descriptions', 'compare', 'upload', 'google-campaign'],
      uhFB:      ['live', 'history', 'uh-fb-upload', 'fb-campaign'],
      invGoogle: ['live', 'history', 'inv-google-upload', 'inv-google-bid', 'google-campaign'],
      invFB:     ['live', 'history', 'fb-upload', 'fb-campaign'],
    };
    const combo = isInvGoogle ? 'invGoogle' : isInvokers ? 'invFB' : network === 'facebook' ? 'uhFB' : 'uhGoogle';
    if (!validTabs[combo].includes(activeTab)) setActiveTab('live');
  }, [network, activeTab, isInvokers]);

  // Silent auto-sync every 30 min so spend stays current throughout the day
  useEffect(() => {
    const silentSync = async () => {
      try {
        await Promise.all([
          fetch('/api/sync').then(r => r.ok ? googleRefresh() : null),
          fetch('/api/fb-sync').then(r => r.ok ? fbRefresh() : null),
          fetch('/api/fb-sync?game=inv').then(r => r.ok ? invRefresh() : null),
        ]);
      } catch {}
    };
    const id = setInterval(silentSync, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [googleRefresh, fbRefresh, invRefresh]);

  const fbCampaigns = fbData?.campaigns || [];
  const invCampaigns = invData?.campaigns || [];

  const live = data?.live || [];
  const history = data?.history || [];
  const descriptions = data?.descriptions || [];
  const descriptionsHistory = data?.descriptionsHistory || [];
  const tags = data?.tags || {};

  const invLive = invData?.live || [];
  const invHistory = invData?.history || [];

  const invGoogleVideos = invGoogleData?.videos || [];

  const stats = {
    live: isInvGoogle
      ? invGoogleVideos.filter(v => v.active).length
      : isInvokers
        ? invLive.filter(a => a.status === 'ACTIVE').length
        : live.filter(a => a.status === 'live' || a.status === 'ACTIVE').length,
    pending: isInvGoogle
      ? invGoogleVideos.filter(v => !v.active).length
      : isInvokers
        ? invLive.filter(a => a.status === 'PAUSED').length
        : live.filter(a => a.status === 'pending' || a.status === 'PAUSED').length,
    history: isInvGoogle ? 0 : isInvokers ? invHistory.length : history.length,
  };

  const handleControlInvGoogleVideo = useCallback(async (assetId, action) => {
    const r = await fetch('/api/edit-descriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'videos', assetId, action }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      if (isInvGoogle) {
        await invGoogleRefresh();
      } else if (isInvokers) {
        const r = await fetch('/api/fb-sync?game=inv');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        await invRefresh();
      } else {
        const endpoint = network === 'facebook' ? '/api/fb-sync' : '/api/sync';
        const r = await fetch(endpoint);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (network === 'facebook') await fbRefresh();
        else await googleRefresh();
      }
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  }, [isInvGoogle, isInvokers, network, fbRefresh, googleRefresh, invRefresh, invGoogleRefresh]);

  const handleControlAd = useCallback(async (adId, status) => {
    const r = await fetch('/api/fb-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adId, status, ...(isInvokers && { game: 'inv' }) }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
  }, [isInvokers]);

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
        game={game}
        onGameChange={g => { setGame(g); setActiveTab('live'); }}
        network={network}
        onNetworkChange={setNetwork}
        selectedCampaign={campaignId}
        onCampaignChange={setCampaignId}
        fbCampaigns={fbCampaigns}
        selectedFBCampaign={fbCampaignId}
        onFBCampaignChange={setFBCampaignId}
        invCampaigns={invCampaigns}
        selectedInvCampaign={invCampaignId}
        onInvCampaignChange={setInvCampaignId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stats={stats}
        lastSyncedAt={isInvokers ? invData?.lastSyncedAt : data?.lastSyncedAt}
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

        {error && !data && !invGoogleData && (
          <div className="flex items-center justify-center h-full">
            <div className="font-mono text-sm text-red">
              Error: {error}
              <button
                onClick={isInvGoogle ? invGoogleRefresh : network === 'facebook' ? fbRefresh : googleRefresh}
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
          <DescriptionsTable
            assets={descriptions}
            historyAssets={descriptionsHistory}
            campaignId={campaignId}
            onMutated={googleRefresh}
          />
        )}
        {network === 'google' && activeTab === 'compare' && (
          <CrossCampaignTab />
        )}
        {network === 'google' && activeTab === 'upload' && (
          <UploadVideosTab />
        )}

        {/* Facebook views — Urban Heat */}
        {!isInvokers && network === 'facebook' && data && activeTab === 'live' && (
          <FBLiveTable assets={live} onControlAd={handleControlAd} />
        )}
        {!isInvokers && network === 'facebook' && data && activeTab === 'history' && (
          <FBHistoryTable entries={history} />
        )}

        {/* Invokers — Facebook views */}
        {isInvokers && !isInvGoogle && invData && activeTab === 'live' && (
          <InvokersFBLiveTable assets={invLive} onControlAd={handleControlAd} />
        )}
        {isInvokers && !isInvGoogle && invData && activeTab === 'history' && (
          <FBHistoryTable entries={invHistory} />
        )}
        {isInvokers && !isInvGoogle && activeTab === 'fb-upload' && (
          <InvokersFBUploadTab />
        )}

        {/* UH Facebook */}
        {!isInvokers && network === 'facebook' && activeTab === 'uh-fb-upload' && <UHFBUploadTab />}
        {!isInvokers && network === 'facebook' && activeTab === 'fb-campaign' && <FBCampaignTab game="uh" />}

        {/* UH Google */}
        {!isInvokers && network === 'google' && activeTab === 'google-campaign' && <GoogleCampaignTab game="uh" />}

        {/* Invokers — Google views */}
        {isInvGoogle && invGoogleData && activeTab === 'live' && (
          <InvokersGoogleTable videos={invGoogleVideos} onControlVideo={handleControlInvGoogleVideo} />
        )}
        {isInvGoogle && invGoogleData && activeTab === 'history' && (
          <InvokersGoogleTable videos={invGoogleVideos} onControlVideo={handleControlInvGoogleVideo} defaultActiveOnly={false} />
        )}
        {isInvGoogle && activeTab === 'inv-google-upload' && <InvokersGoogleUploadTab />}
        {isInvGoogle && activeTab === 'inv-google-bid' && <InvokersGoogleBidTab />}
        {isInvGoogle && activeTab === 'google-campaign' && <GoogleCampaignTab game="inv" />}

        {/* Invokers Facebook */}
        {isInvokers && !isInvGoogle && activeTab === 'fb-campaign' && <FBCampaignTab game="inv" />}

        {!isInvGoogle && data && !loading && live.length === 0 && history.length === 0 && activeTab !== 'compare' && (
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
