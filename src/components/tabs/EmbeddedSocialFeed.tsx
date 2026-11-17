import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  Play,
  Pause,
  Heart,
  MessageCircle,
  Send,
  Link2,
  Plus,
  CupSoda,
  CheckCheck,
  Code2,
  Music2,
  Volume2,
  Youtube,
  Share2,
} from 'lucide-react';
import { STUDIO_IMAGES } from '../../assets/studioAssets';
import { safeApiFetch } from '../../services/apiClient';
import { type SavedSocialCampaign } from '../../firebase';

export type FeedPlatform = 'instagram' | 'tiktok' | 'whatsapp' | 'facebook' | 'youtube';
export type FeedFilter = 'all' | FeedPlatform;
export type FeedGrooveStyle = 'afro' | 'house' | 'trap';

export interface DynamicFeedItem {
  id: string;
  platform: FeedPlatform;
  author: string;
  displayName: string;
  title: string;
  caption: string;
  permalink: string;
  embedId: string;
  embedKind?: 'p' | 'reel' | 'tv';
  thumbnailUrl?: string;
  grooveStyle: FeedGrooveStyle;
  fetchedLive: boolean;
  publishedAt: string;
  metrics: {
    likes: number;
    comments: number;
    shares: number;
  };
  likedByMe?: boolean;
  localReplies?: { id: string; author: string; text: string; time: string }[];
}

interface EmbeddedSocialFeedProps {
  igHandle: string;
  tiktokHandle: string;
  waNumber: string;
  fbPage?: string;
  ytChannel?: string;
  trackTitle: string;
  studioBpm: number;
  campaigns: SavedSocialCampaign[];
  playingItemId: string | null;
  onToggleAudio: (itemId: string, style: FeedGrooveStyle) => void;
  onLoadIntoStudio: (item: {
    platform: FeedPlatform;
    headline: string;
    caption: string;
    trackTitle: string;
  }) => void;
  onTwoWayReply?: (platform: FeedPlatform, itemTitle: string, replyText: string) => void;
  onSupportCreator?: (recipient?: string) => void;
}

declare global {
  interface Window {
    instgrm?: {
      Embeds?: {
        process: () => void;
      };
    };
    tiktokEmbed?: {
      lib?: {
        render: (elements?: HTMLElement[]) => void;
      };
    };
  }
}

export function EmbeddedSocialFeed({
  igHandle,
  tiktokHandle,
  waNumber,
  fbPage = 'SoundDeck Studio Page',
  ytChannel = 'SoundDeck Studio TV',
  trackTitle,
  studioBpm,
  campaigns,
  playingItemId,
  onToggleAudio,
  onLoadIntoStudio,
  onTwoWayReply,
  onSupportCreator,
}: EmbeddedSocialFeedProps) {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [feedItems, setFeedItems] = useState<DynamicFeedItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  const [sdkModeById, setSdkModeById] = useState<Record<string, 'sdk' | 'interactive'>>({});
  const [igSdkReady, setIgSdkReady] = useState(false);
  const [ttSdkReady, setTtSdkReady] = useState(false);

  const [customUrl, setCustomUrl] = useState('');
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const existingIg = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.instagram.com/embed.js"]'
    );
    if (!existingIg) {
      const igScript = document.createElement('script');
      igScript.src = 'https://www.instagram.com/embed.js';
      igScript.async = true;
      igScript.onload = () => {
        setIgSdkReady(true);
        window.instgrm?.Embeds?.process();
      };
      document.body.appendChild(igScript);
    } else {
      setIgSdkReady(true);
      window.instgrm?.Embeds?.process();
    }

    const existingTt = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.tiktok.com/embed.js"]'
    );
    if (!existingTt) {
      const ttScript = document.createElement('script');
      ttScript.src = 'https://www.tiktok.com/embed.js';
      ttScript.async = true;
      ttScript.onload = () => {
        setTtSdkReady(true);
      };
      document.body.appendChild(ttScript);
    } else {
      setTtSdkReady(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.instgrm?.Embeds?.process();
      } catch {
        // Ignore
      }
      try {
        window.tiktokEmbed?.lib?.render();
      } catch {
        // Ignore
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [feedItems, sdkModeById, filter, igSdkReady, ttSdkReady]);

  const fetchDynamicFeed = useCallback(async () => {
    setLoadingFeed(true);
    setFeedError(null);
    try {
      const params = new URLSearchParams({
        igHandle: igHandle.trim() || '@sounddeck.artist',
        tiktokHandle: tiktokHandle.trim() || '@sounddeck.tok',
        fbPage: fbPage.trim() || 'SoundDeck Studio Page',
        ytChannel: ytChannel.trim() || 'SoundDeck Studio TV',
        waNumber: waNumber.trim() || 'Street Team VIP',
        trackTitle: trackTitle.trim() || 'Midnight Studio Loop',
      });
      const res = await safeApiFetch<{ items?: DynamicFeedItem[]; syncedAt?: string }>(
        `/api/social/feed?${params.toString()}`
      );
      if (res.ok && res.data) {
        setFeedItems((prev) => {
          const customInjected = prev.filter((p) => p.id.startsWith('custom_'));
          const nextList: DynamicFeedItem[] = Array.isArray(res.data?.items) ? res.data.items : [];
          return [...customInjected, ...nextList];
        });
        setSyncedAt(res.data.syncedAt || new Date().toISOString());
        return;
      }

      if (res.isStaticFallback) {
        const cleanTrack = trackTitle.trim() || 'Midnight Studio Loop';
        const fallbackItems: DynamicFeedItem[] = [
          {
            id: 'static_ig_1',
            platform: 'instagram',
            author: igHandle.trim() || '@sounddeck.artist',
            displayName: 'Instagram Reel Preview',
            title: `${cleanTrack} · Live Session Teaser`,
            caption: `Fresh studio chop at ${studioBpm} BPM — swipe to audition the groove!`,
            permalink: 'https://www.instagram.com/',
            embedId: '',
            grooveStyle: 'afro',
            fetchedLive: false,
            publishedAt: 'Just now',
            metrics: { likes: 128, comments: 14, shares: 9 },
          },
          {
            id: 'static_tt_1',
            platform: 'tiktok',
            author: tiktokHandle.trim() || '@sounddeck.tok',
            displayName: 'TikTok Beat Challenge',
            title: `Duet this ${cleanTrack} loop`,
            caption: `Chopped live inside SoundDeck Studio · ${studioBpm} BPM`,
            permalink: 'https://www.tiktok.com/',
            embedId: '',
            grooveStyle: 'house',
            fetchedLive: false,
            publishedAt: '12m ago',
            metrics: { likes: 342, comments: 29, shares: 18 },
          },
          {
            id: 'static_yt_1',
            platform: 'youtube',
            author: ytChannel.trim() || 'SoundDeck Studio TV',
            displayName: 'YouTube Music & Shorts',
            title: `${cleanTrack} · Studio Video`,
            caption: `Synced live with YouTube Studio (${studioBpm} BPM).`,
            permalink: 'https://www.youtube.com/',
            embedId: '',
            grooveStyle: 'trap',
            fetchedLive: false,
            publishedAt: '18m ago',
            metrics: { likes: 512, comments: 41, shares: 24 },
          },
          {
            id: 'static_fb_1',
            platform: 'facebook',
            author: fbPage.trim() || 'SoundDeck Studio Page',
            displayName: 'Facebook Creator Page',
            title: `Studio Release · ${cleanTrack}`,
            caption: `Live Messenger & Reel sync active at ${studioBpm} BPM.`,
            permalink: 'https://www.facebook.com/',
            embedId: '',
            grooveStyle: 'house',
            fetchedLive: false,
            publishedAt: '25m ago',
            metrics: { likes: 210, comments: 19, shares: 11 },
          },
        ];
        setFeedItems((prev) => {
          const customInjected = prev.filter((p) => p.id.startsWith('custom_'));
          return [...customInjected, ...fallbackItems];
        });
        setSyncedAt(new Date().toISOString());
        return;
      }

      throw new Error(res.error || 'Could not sync social feeds.');
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : 'Unable to fetch social feeds.');
    } finally {
      setLoadingFeed(false);
    }
  }, [igHandle, tiktokHandle, fbPage, ytChannel, waNumber, trackTitle, studioBpm]);

  useEffect(() => {
    fetchDynamicFeed();
  }, [fetchDynamicFeed]);

  const handleEmbedCustomUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    setResolvingUrl(true);
    setUrlError(null);
    try {
      const res = await safeApiFetch<{
        platform?: FeedPlatform;
        url?: string;
        authorName?: string;
        title?: string;
        embedId?: string;
        embedKind?: 'p' | 'reel' | 'tv';
        thumbnailUrl?: string;
        embedHtml?: string;
      }>(`/api/social/oembed?url=${encodeURIComponent(customUrl.trim())}`);

      const cleanUrl = customUrl.trim();
      const lowerUrl = cleanUrl.toLowerCase();
      const detectedPlatform: FeedPlatform = lowerUrl.includes('tiktok')
        ? 'tiktok'
        : lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')
        ? 'youtube'
        : lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')
        ? 'facebook'
        : lowerUrl.includes('wa.me') || lowerUrl.includes('whatsapp')
        ? 'whatsapp'
        : 'instagram';

      const data =
        res.ok && res.data
          ? res.data
          : res.isStaticFallback
          ? {
              platform: detectedPlatform,
              url: cleanUrl,
              authorName: '@creator',
              title: `Linked ${detectedPlatform.toUpperCase()} Studio Post`,
            }
          : null;

      if (!data) throw new Error(res.error || 'Failed to resolve post URL.');

      const resolvedPlatform: FeedPlatform = data.platform || detectedPlatform;
      const newItem: DynamicFeedItem = {
        id: `custom_${Date.now()}`,
        platform: resolvedPlatform,
        author: data.authorName || '@creator',
        displayName:
          resolvedPlatform === 'tiktok'
            ? 'Embedded TikTok Post'
            : resolvedPlatform === 'youtube'
            ? 'Embedded YouTube Video'
            : resolvedPlatform === 'facebook'
            ? 'Embedded Facebook Post'
            : resolvedPlatform === 'whatsapp'
            ? 'WhatsApp Studio Link'
            : 'Embedded Instagram Post',
        title: data.title || 'Live Embedded Post',
        caption: data.title || 'Loaded live inside SoundDeck Social Feed.',
        permalink: data.url || cleanUrl,
        embedId: data.embedId || '',
        embedKind: data.embedKind || 'p',
        thumbnailUrl: data.thumbnailUrl || '',
        grooveStyle: resolvedPlatform === 'tiktok' ? 'house' : 'afro',
        fetchedLive: Boolean(res.ok),
        publishedAt: 'Embedded now',
        metrics: { likes: 128, comments: 14, shares: 9 },
      };

      setFeedItems((prev) => [newItem, ...prev]);
      setSdkModeById((prev) => ({ ...prev, [newItem.id]: 'sdk' }));
      setCustomUrl('');
      if (filter !== 'all' && filter !== resolvedPlatform) {
        setFilter(resolvedPlatform);
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Could not embed URL.');
    } finally {
      setResolvingUrl(false);
    }
  };

  const handleLikeFeedItem = (id: string) => {
    setFeedItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextLiked = !item.likedByMe;
        return {
          ...item,
          likedByMe: nextLiked,
          metrics: {
            ...item.metrics,
            likes: nextLiked ? item.metrics.likes + 1 : Math.max(0, item.metrics.likes - 1),
          },
        };
      })
    );
  };

  const handleSubmitInlineReply = (e: React.FormEvent, item: DynamicFeedItem) => {
    e.preventDefault();
    const text = (replyDrafts[item.id] || '').trim();
    if (!text) return;

    setFeedItems((prev) =>
      prev.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              metrics: { ...entry.metrics, comments: entry.metrics.comments + 1 },
              localReplies: [
                ...(entry.localReplies || []),
                {
                  id: `rep_${Date.now()}`,
                  author:
                    entry.platform === 'whatsapp'
                      ? 'You · Studio'
                      : igHandle || '@studio.creator',
                  text,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              ],
            }
          : entry
      )
    );
    setReplyDrafts((prev) => ({ ...prev, [item.id]: '' }));

    // Trigger two-way omnichannel publish & Firestore log
    void safeApiFetch('/api/social/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platforms: [item.platform],
        eventType: item.platform === 'whatsapp' ? 'message' : 'comment',
        title: `Reply on: ${item.title}`,
        body: text,
        authorName: 'SoundDeck Creator',
        authorHandle:
          item.platform === 'tiktok'
            ? tiktokHandle
            : item.platform === 'youtube'
            ? ytChannel
            : item.platform === 'facebook'
            ? fbPage
            : item.platform === 'whatsapp'
            ? waNumber
            : igHandle,
        whatsappPhone: waNumber,
      }),
    });
    onTwoWayReply?.(item.platform, item.title, text);
  };

  const campaignFeedItems: DynamicFeedItem[] = campaigns
    .filter(
      (c): c is SavedSocialCampaign & { platform: FeedPlatform } =>
        c.platform === 'instagram' ||
        c.platform === 'tiktok' ||
        c.platform === 'whatsapp' ||
        c.platform === 'facebook' ||
        c.platform === 'youtube'
    )
    .slice(0, 4)
    .map((c) => ({
      id: `fs_${c.id}`,
      platform: c.platform,
      author:
        c.platform === 'instagram'
          ? igHandle || '@sounddeck.artist'
          : c.platform === 'tiktok'
          ? tiktokHandle || '@sounddeck.tok'
          : c.platform === 'youtube'
          ? ytChannel || 'SoundDeck Studio TV'
          : c.platform === 'facebook'
          ? fbPage || 'SoundDeck Studio Page'
          : waNumber || 'WhatsApp VIP',
      displayName: 'Synced Studio Campaign',
      title: c.headline,
      caption: c.caption,
      permalink: '',
      embedId: c.id,
      grooveStyle: c.platform === 'tiktok' ? 'trap' : 'afro',
      fetchedLive: true,
      publishedAt: 'Vault Synced',
      metrics: { likes: 24, comments: 4, shares: 3 },
    }));

  const combinedItems = [...campaignFeedItems, ...feedItems];
  const visibleItems =
    filter === 'all'
      ? combinedItems
      : combinedItems.filter((item) => item.platform === filter);

  return (
    <section
      aria-labelledby="dynamic-social-feed-heading"
      className="rounded-xl bg-[#13161B] border border-[#232833] p-5 space-y-5"
    >
      {/* Top Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#232833] pb-4">
        <div>
          <h3
            id="dynamic-social-feed-heading"
            className="font-display text-lg font-semibold text-slate-100"
          >
            Dynamic Embedded Omnichannel Feed
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Live posts, reels, and videos from Instagram, TikTok, YouTube, Facebook &amp; WhatsApp rendered right inside SoundDeck
            {syncedAt
              ? ` · Synced ${new Date(syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#0B0D10] border border-[#232833]">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'instagram', label: 'Instagram' },
                { id: 'tiktok', label: 'TikTok' },
                { id: 'youtube', label: 'YouTube' },
                { id: 'facebook', label: 'Facebook' },
                { id: 'whatsapp', label: 'WhatsApp' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filter === tab.id
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={fetchDynamicFeed}
            disabled={loadingFeed}
            className="px-3.5 py-2 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-slate-100 text-xs font-medium border border-[#2A313E] flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${loadingFeed ? 'animate-spin' : ''}`} />
            <span>{loadingFeed ? 'Syncing...' : 'Refresh Feed'}</span>
          </button>
        </div>
      </div>

      {/* Live Post URL Embed Bar */}
      <form
        onSubmit={handleEmbedCustomUrl}
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 rounded-lg bg-[#0B0D10] border border-[#232833]"
      >
        <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
          <Link2 className="w-4 h-4 text-amber-400" />
          <span className="font-medium text-slate-200">Embed Live URL:</span>
        </div>
        <input
          type="url"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          placeholder="Paste Instagram, TikTok, YouTube, or Facebook URL to embed inside SoundDeck..."
          className="flex-1 px-3 py-2 rounded-md bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={resolvingUrl || !customUrl.trim()}
          className="px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{resolvingUrl ? 'Embedding...' : 'Embed in Feed'}</span>
        </button>
      </form>

      {urlError && (
        <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-800/60 text-xs text-red-200">
          {urlError}
        </div>
      )}
      {feedError && (
        <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-800/60 text-xs text-red-200">
          {feedError}
        </div>
      )}

      {/* Feed Grid */}
      {loadingFeed && feedItems.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((slot) => (
            <div
              key={slot}
              className="h-80 rounded-xl bg-[#0B0D10] border border-[#232833] p-4 flex flex-col justify-between"
            >
              <div className="h-4 w-32 rounded bg-[#1B2028]" />
              <div className="h-40 w-full rounded-lg bg-[#13161B]" />
              <div className="h-8 w-full rounded bg-[#1B2028]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleItems.map((item) => {
            const hasRealExternalEmbed = Boolean(item.permalink && item.embedId);
            const defaultToSdk =
              (item.id.startsWith('custom_') || item.platform === 'youtube') &&
              hasRealExternalEmbed;
            const activeMode = sdkModeById[item.id] || (defaultToSdk ? 'sdk' : 'interactive');
            const isPlaying = playingItemId === item.id;

            return (
              <article
                key={item.id}
                className="rounded-xl bg-[#0B0D10] border border-[#232833] overflow-hidden flex flex-col justify-between"
              >
                {/* Card Header */}
                <div className="px-4 py-3 border-b border-[#1E232D] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                      <span className="text-amber-400 uppercase font-semibold">{item.platform}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{item.publishedAt}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-100 truncate mt-0.5">
                      {item.author}
                    </div>
                  </div>

                  {hasRealExternalEmbed ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSdkModeById((prev) => ({
                          ...prev,
                          [item.id]: activeMode === 'sdk' ? 'interactive' : 'sdk',
                        }))
                      }
                      className={`px-2.5 py-1 rounded text-[11px] font-medium border flex items-center gap-1 transition-colors shrink-0 ${
                        activeMode === 'sdk'
                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold'
                          : 'bg-[#13161B] hover:bg-[#1B2028] text-slate-300 border-[#232833]'
                      }`}
                    >
                      <Code2 className="w-3 h-3" />
                      <span>{activeMode === 'sdk' ? 'Studio Card' : 'Live Embed'}</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-mono text-emerald-400 shrink-0">
                      Two-Way Widget
                    </span>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  {activeMode === 'sdk' && item.platform === 'instagram' && item.embedId ? (
                    <div className="space-y-2">
                      <div className="w-full h-[320px] rounded-lg overflow-hidden bg-white border border-[#232833]">
                        <iframe
                          title={item.title}
                          src={`https://www.instagram.com/${item.embedKind || 'p'}/${item.embedId}/embed/captioned/`}
                          className="w-full h-full border-0"
                          loading="lazy"
                          allow="autoplay; encrypted-media"
                        />
                      </div>
                    </div>
                  ) : activeMode === 'sdk' && item.platform === 'tiktok' && item.embedId ? (
                    <div className="space-y-2">
                      <div className="w-full h-[340px] rounded-lg overflow-hidden bg-[#13161B] border border-[#232833]">
                        <iframe
                          title={item.title}
                          src={`https://www.tiktok.com/embed/v2/${item.embedId}`}
                          className="w-full h-full border-0"
                          loading="lazy"
                          allow="autoplay; encrypted-media; fullscreen"
                        />
                      </div>
                    </div>
                  ) : activeMode === 'sdk' && item.platform === 'youtube' && item.embedId ? (
                    <div className="space-y-2">
                      <div className="w-full aspect-video rounded-lg overflow-hidden bg-black border border-[#232833]">
                        <iframe
                          title={item.title}
                          src={`https://www.youtube.com/embed/${item.embedId}?rel=0&modestbranding=1`}
                          className="w-full h-full border-0"
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2">{item.title}</p>
                    </div>
                  ) : (
                    <>
                      {item.platform === 'whatsapp' ? (
                        <div className="rounded-lg bg-[#0B141A] border border-emerald-800/40 p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400">
                            <span>{item.displayName}</span>
                            <CheckCheck className="w-3.5 h-3.5" />
                          </div>
                          <div className="text-xs font-semibold text-slate-100">{item.title}</div>
                          <p className="text-xs text-slate-300 leading-relaxed">{item.caption}</p>
                          <div className="p-2 rounded bg-[#151E24] flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => onToggleAudio(item.id, item.grooveStyle)}
                              className="px-2.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-semibold flex items-center gap-1 shrink-0"
                            >
                              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                              <span>{isPlaying ? 'Pause Drop' : 'Play Drop'}</span>
                            </button>
                            <span className="text-[11px] font-mono text-slate-300 truncate">
                              {studioBpm} BPM · {item.grooveStyle}
                            </span>
                          </div>
                        </div>
                      ) : item.platform === 'facebook' ? (
                        <div className="space-y-2.5">
                          <div className="rounded-lg bg-[#111926] border border-sky-800/40 p-3 space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-mono text-sky-400">
                              <span className="flex items-center gap-1">
                                <Share2 className="w-3 h-3" />
                                <span>{item.displayName}</span>
                              </span>
                              <span>Live Page Sync</span>
                            </div>
                            <div className="relative h-32 rounded-lg overflow-hidden bg-[#13161B] border border-[#232833] flex items-end p-2.5">
                              <img
                                src={item.thumbnailUrl || STUDIO_IMAGES.coverClub}
                                alt={item.title}
                                referrerPolicy="no-referrer"
                                className="absolute inset-0 w-full h-full object-cover opacity-75"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                              <div className="relative z-10 w-full flex items-end justify-between gap-2">
                                <div className="text-xs font-semibold text-white line-clamp-2">
                                  {item.title}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onToggleAudio(item.id, item.grooveStyle)}
                                  className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shrink-0"
                                >
                                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                                </button>
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                            {item.caption}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <div className="relative h-44 rounded-lg overflow-hidden bg-[#13161B] border border-[#232833] flex items-end p-3">
                            <img
                              src={
                                item.thumbnailUrl ||
                                (item.platform === 'tiktok'
                                  ? STUDIO_IMAGES.heroBackdrop
                                  : item.platform === 'youtube'
                                  ? STUDIO_IMAGES.coverSynth
                                  : STUDIO_IMAGES.coverAfro)
                              }
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="absolute inset-0 w-full h-full object-cover opacity-75"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
                            <div className="relative z-10 w-full flex items-end justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[11px] font-mono text-amber-400 flex items-center gap-1">
                                  {item.platform === 'youtube' && <Youtube className="w-3 h-3 text-rose-400" />}
                                  <span>{item.displayName}</span>
                                </div>
                                <div className="text-xs font-semibold text-white line-clamp-2">
                                  {item.title}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => onToggleAudio(item.id, item.grooveStyle)}
                                aria-label={isPlaying ? 'Pause track preview' : 'Play track preview'}
                                className={`w-9 h-9 rounded-full flex items-center justify-center border shrink-0 transition-colors ${
                                  isPlaying
                                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                                    : 'bg-black/75 hover:bg-amber-500 text-white hover:text-slate-950 border-white/20'
                                }`}
                              >
                                {isPlaying ? (
                                  <Pause className="w-4 h-4" />
                                ) : (
                                  <Play className="w-4 h-4 ml-0.5" />
                                )}
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                            {item.caption}
                          </p>
                        </div>
                      )}

                      {/* Inline Replies */}
                      {item.localReplies && item.localReplies.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-[#1E232D]">
                          {item.localReplies.slice(-2).map((rep) => (
                            <div
                              key={rep.id}
                              className="text-[11px] text-slate-300 flex items-baseline justify-between gap-2"
                            >
                              <span className="truncate">
                                <strong className="text-amber-400 mr-1">{rep.author}:</strong>
                                {rep.text}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                {rep.time}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Inline Quick Reply Form (Two-Way Sync) */}
                  <form
                    onSubmit={(e) => handleSubmitInlineReply(e, item)}
                    className="flex items-center gap-1.5 pt-1"
                  >
                    <input
                      type="text"
                      value={replyDrafts[item.id] || ''}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      placeholder={
                        item.platform === 'whatsapp'
                          ? 'Reply in WhatsApp widget...'
                          : `Two-way reply to ${item.platform}...`
                      }
                      className="flex-1 px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      aria-label="Send reply"
                      className="px-2.5 py-1.5 rounded bg-[#1B2028] hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-[#2A313E] transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>

                {/* Card Footer Metrics */}
                <div className="px-4 py-2.5 bg-[#101318] border-t border-[#1E232D] flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3 tabular-nums">
                    <button
                      type="button"
                      onClick={() => handleLikeFeedItem(item.id)}
                      className="flex items-center gap-1 text-slate-300 hover:text-rose-400 transition-colors"
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          item.likedByMe ? 'fill-rose-500 text-rose-500' : ''
                        }`}
                      />
                      <span className="font-mono text-[11px]">{item.metrics.likes.toLocaleString()}</span>
                    </button>

                    <span className="flex items-center gap-1 text-slate-400">
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span className="font-mono text-[11px]">{item.metrics.comments}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => onToggleAudio(item.id, item.grooveStyle)}
                      className={`flex items-center gap-1 transition-colors ${
                        isPlaying ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Play audio groove"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSupportCreator?.(item.author)}
                      className="p-1.5 rounded bg-[#1B2028] hover:bg-amber-500/20 text-amber-400 border border-[#2A313E]"
                      title="Support on BuymeSoda"
                      aria-label="Support on BuymeSoda"
                    >
                      <CupSoda className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onLoadIntoStudio({
                          platform: item.platform,
                          headline: item.title,
                          caption: item.caption,
                          trackTitle: item.title,
                        })
                      }
                      className="px-2.5 py-1 rounded bg-[#1B2028] hover:bg-[#252B36] text-slate-200 text-[11px] font-medium border border-[#2A313E] flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      <Music2 className="w-3 h-3 text-amber-400" />
                      <span>Remix in Studio</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
