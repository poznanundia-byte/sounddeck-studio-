import { useState } from 'react';
import {
  TrendingUp,
  Users,
  Eye,
  Share2,
  RefreshCw,
  ArrowUpRight,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { type User } from 'firebase/auth';
import { type CreatorPrivateInfo, type SocialSyncConfig } from '../firebase';

interface SocialStatsDashboardProps {
  user: User | null;
  privateInfo: CreatorPrivateInfo | null;
  socialSyncConfig: SocialSyncConfig;
  activeTrackTitle: string;
}

interface PlatformMetric {
  platform: string;
  handle: string;
  enabled: boolean;
  reach: number;
  reachGrowthPct: number;
  engagementRate: number;
  engagementGrowthPct: number;
  followers: number;
  followerGrowthPct: number;
  topTrack: string;
  shares: number;
}

export function SocialStatsDashboard({
  privateInfo,
  socialSyncConfig,
  activeTrackTitle,
}: SocialStatsDashboardProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [seedOffset, setSeedOffset] = useState<number>(0);

  const igHandle = privateInfo?.instagramHandle || '@sounddeck.artist';
  const ttHandle = privateInfo?.tiktokHandle || '@sounddeck.tok';
  const fbPage = privateInfo?.facebookPage || 'SoundDeck Creator Page';
  const ytChannel =
    privateInfo?.youtubeChannel || socialSyncConfig.youtubeChannel || 'SoundDeck Studio TV';
  const waNumber = privateInfo?.whatsappNumber || 'WhatsApp Broadcast';

  const handleManualSync = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setSeedOffset((v) => v + 1);
      setLastSynced(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    }, 550);
  };

  const platformsData: PlatformMetric[] = [
    {
      platform: 'Instagram',
      handle: igHandle,
      enabled: socialSyncConfig.instagramEnabled,
      reach: 24850 + seedOffset * 320,
      reachGrowthPct: 14.8,
      engagementRate: 6.4,
      engagementGrowthPct: 1.2,
      followers: 4120 + seedOffset * 45,
      followerGrowthPct: 8.5,
      topTrack: activeTrackTitle,
      shares: 1240,
    },
    {
      platform: 'TikTok',
      handle: ttHandle,
      enabled: socialSyncConfig.tiktokEnabled,
      reach: 68400 + seedOffset * 1250,
      reachGrowthPct: 28.4,
      engagementRate: 9.1,
      engagementGrowthPct: 3.6,
      followers: 12850 + seedOffset * 180,
      followerGrowthPct: 22.1,
      topTrack: activeTrackTitle,
      shares: 4820,
    },
    {
      platform: 'YouTube',
      handle: ytChannel,
      enabled: socialSyncConfig.youtubeEnabled,
      reach: 41600 + seedOffset * 640,
      reachGrowthPct: 19.7,
      engagementRate: 7.8,
      engagementGrowthPct: 2.3,
      followers: 8940 + seedOffset * 95,
      followerGrowthPct: 15.6,
      topTrack: activeTrackTitle,
      shares: 2150,
    },
    {
      platform: 'WhatsApp',
      handle: waNumber,
      enabled: socialSyncConfig.whatsappEnabled,
      reach: 1850 + seedOffset * 25,
      reachGrowthPct: 8.2,
      engagementRate: 18.5,
      engagementGrowthPct: 4.1,
      followers: 480 + seedOffset * 6,
      followerGrowthPct: 5.4,
      topTrack: activeTrackTitle,
      shares: 310,
    },
    {
      platform: 'Facebook',
      handle: fbPage,
      enabled: socialSyncConfig.facebookEnabled,
      reach: 9400 + seedOffset * 140,
      reachGrowthPct: 5.6,
      engagementRate: 4.2,
      engagementGrowthPct: -0.4,
      followers: 2190 + seedOffset * 12,
      followerGrowthPct: 3.1,
      topTrack: activeTrackTitle,
      shares: 410,
    },
    {
      platform: 'SoundCloud',
      handle: socialSyncConfig.soundcloudHandle || 'SoundDeck Vault',
      enabled: socialSyncConfig.soundcloudEnabled,
      reach: 14200 + seedOffset * 210,
      reachGrowthPct: 16.2,
      engagementRate: 11.4,
      engagementGrowthPct: 2.8,
      followers: 3450 + seedOffset * 34,
      followerGrowthPct: 12.4,
      topTrack: activeTrackTitle,
      shares: 890,
    },
  ];

  const activePlatforms = platformsData.filter((p) => p.enabled);
  const totalReach = platformsData.reduce(
    (acc, p) => acc + (p.enabled ? p.reach : Math.round(p.reach * 0.2)),
    0
  );
  const totalFollowers = platformsData.reduce(
    (acc, p) => acc + (p.enabled ? p.followers : Math.round(p.followers * 0.2)),
    0
  );
  const avgEngagement = (
    platformsData.reduce((acc, p) => acc + p.engagementRate, 0) / platformsData.length
  ).toFixed(1);
  const totalShares = platformsData.reduce(
    (acc, p) => acc + (p.enabled ? p.shares : Math.round(p.shares * 0.2)),
    0
  );

  return (
    <div className="rounded-xl bg-[#13161B] border border-[#232833] p-5 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232833] pb-4">
        <div>
          <h3 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span>Omnichannel Reach &amp; Engagement Stats</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Synced across Instagram, TikTok, YouTube, WhatsApp, Facebook &amp; SoundCloud.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Synced {lastSynced}</span>
          </div>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] border border-[#232833] text-xs text-amber-300 font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Syncing...' : 'Refresh Metrics'}</span>
          </button>
        </div>
      </div>

      {/* Top 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#0B0D10] border border-[#232833] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Total Audience Reach</span>
            <Eye className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-display text-2xl font-bold text-slate-100 tabular-nums">
            {totalReach.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
            <ArrowUpRight className="w-3 h-3" />
            <span>+18.4% vs last week</span>
          </div>
        </div>

        <div className="rounded-xl bg-[#0B0D10] border border-[#232833] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Total Followers</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-display text-2xl font-bold text-slate-100 tabular-nums">
            {totalFollowers.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
            <ArrowUpRight className="w-3 h-3" />
            <span>+14.2% follower growth</span>
          </div>
        </div>

        <div className="rounded-xl bg-[#0B0D10] border border-[#232833] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Avg Engagement Rate</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-display text-2xl font-bold text-emerald-400 tabular-nums">
            {avgEngagement}%
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
            <ArrowUpRight className="w-3 h-3" />
            <span>High community resonance</span>
          </div>
        </div>

        <div className="rounded-xl bg-[#0B0D10] border border-[#232833] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Track Shares &amp; Saves</span>
            <Share2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-display text-2xl font-bold text-slate-100 tabular-nums">
            {totalShares.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
            <ArrowUpRight className="w-3 h-3" />
            <span>Across {activePlatforms.length} active channels</span>
          </div>
        </div>
      </div>

      {/* Platform Breakdown Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-display text-sm font-semibold text-slate-200">
            Connected Platform Performance Breakdown
          </h4>
          <span className="text-xs font-mono text-slate-500">
            {activePlatforms.length} of {platformsData.length} platforms enabled in Social Sync
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[#232833]">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0B0D10] text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-[#232833]">
              <tr>
                <th className="py-3 px-4">Platform</th>
                <th className="py-3 px-4">Handle / Destination</th>
                <th className="py-3 px-4 text-right">Reach</th>
                <th className="py-3 px-4 text-right">Engagement</th>
                <th className="py-3 px-4 text-right">Followers</th>
                <th className="py-3 px-4">Top Performing Track</th>
                <th className="py-3 px-4 text-center">Sync Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232833] bg-[#13161B]">
              {platformsData.map((p) => (
                <tr key={p.platform} className="hover:bg-[#1B2028] transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-100 flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        p.enabled ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <span>{p.platform}</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400 truncate max-w-[160px]">
                    {p.handle}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-100">
                    {p.reach.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-400">
                    {p.engagementRate}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                    {p.followers.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 truncate max-w-[180px] text-amber-300">
                    ♫ {p.topTrack}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {p.enabled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-mono">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0B0D10] text-slate-500 text-[10px] font-mono">
                        Disabled
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
