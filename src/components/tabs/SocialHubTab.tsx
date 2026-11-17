import { useEffect, useRef, useState } from 'react';
import { STUDIO_IMAGES } from '../../assets/studioAssets';
import { safeApiFetch } from '../../services/apiClient';
import {
  Share2,
  Copy,
  Check,
  Wand2,
  Save,
  Send,
  Play,
  Pause,
  Heart,
  MessageCircle,
  Bookmark,
  Disc3,
  CupSoda,
  Download,
  ChevronLeft,
  ChevronRight,
  Music2,
  CheckCheck,
  Plus,
  Users,
  Volume2,
  ThumbsUp,
  Radio,
  RefreshCw,
  Youtube,
} from 'lucide-react';
import { type User } from 'firebase/auth';
import {
  upsertPrivateInfo,
  saveSocialCampaign,
  upsertSocialSyncConfig,
  subscribeSocialSyncConfig,
  createSocialOmnichannelEvent,
  DEFAULT_SOCIAL_SYNC_CONFIG,
  type SocialSyncConfig,
  type CreatorPrivateInfo,
  type CreatorProfile,
  type SavedMusicProject,
  type SavedSocialCampaign,
  type CommunityActivityType,
} from '../../firebase';
import {
  getAudioContext,
  getStudioMasterNode,
  renderGrooveBuffer,
} from '../../audio/studioAudio';
import { EmbeddedSocialFeed, type FeedGrooveStyle } from './EmbeddedSocialFeed';
import { CommunityActivityFeed, type ActivityGrooveStyle } from './CommunityActivityFeed';
import { SocialSyncModal } from '../SocialSyncModal';
import { SocialStatsDashboard } from '../SocialStatsDashboard';
import { OmnichannelAdminDesk } from '../social/OmnichannelAdminDesk';

interface SocialHubTabProps {
  user: User | null;
  profile?: CreatorProfile | null;
  privateInfo: CreatorPrivateInfo | null;
  campaigns: SavedSocialCampaign[];
  projects?: SavedMusicProject[];
  creators?: CreatorProfile[];
  activeTrackTitle: string;
  studioBpm?: number;
  onOpenAuth: () => void;
  onPrivateInfoSaved: () => void;
  onSupportCreator?: (recipient?: string) => void;
}

type SocialPlatform = 'instagram' | 'tiktok' | 'whatsapp' | 'facebook' | 'youtube';
type GrooveStyle = 'afro' | 'house' | 'trap';
type IgFormat = 'reels' | 'story' | 'carousel';
type TikTokMode = 'original' | 'duet' | 'stitch';

interface InAppComment {
  id: string;
  author: string;
  text: string;
  time: string;
  likes: number;
  liked?: boolean;
}

interface WaMessage {
  id: string;
  sender: 'me' | 'fan';
  author: string;
  text: string;
  time: string;
  hasAudio?: boolean;
  audioTitle?: string;
  audioStyle?: GrooveStyle;
  hasSodaCard?: boolean;
  reactions: Record<string, number>;
}

interface PublishedDrop {
  id: string;
  platform: SocialPlatform | 'soundcloud';
  headline: string;
  caption: string;
  trackTitle: string;
  timestamp: string;
  likes: number;
  syncedViaAutoPublish?: boolean;
}

const PLATFORMS: {
  id: SocialPlatform;
  name: string;
  formatLabel: string;
  inAppTag: string;
}[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    formatLabel: 'Reels, Story Poll & Carousel',
    inAppTag: 'IG Live Studio',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    formatLabel: 'For-You Sound, Duet & Stitch',
    inAppTag: 'TikTok Sound Deck',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    formatLabel: 'Broadcast Drop & Fan Chat',
    inAppTag: 'WA Broadcast Room',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    formatLabel: 'Creator Video & Reactions',
    inAppTag: 'FB Creator Stage',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    formatLabel: 'Official Video, Shorts & Lyrics',
    inAppTag: 'YouTube Music Studio',
  },
];

const IG_SLIDES = [
  {
    badge: 'Slide 1 · Studio Session',
    overlay: 'Late night mixdown check',
    gradient: 'from-amber-500/25 via-slate-900/60 to-black/95',
  },
  {
    badge: 'Slide 2 · Master Bus',
    overlay: 'Analog punch & vocal pocket locked',
    gradient: 'from-emerald-500/20 via-slate-900/60 to-black/95',
  },
  {
    badge: 'Slide 3 · Drop Countdown',
    overlay: 'Pre-save & support on BuymeSoda',
    gradient: 'from-rose-500/25 via-slate-900/60 to-black/95',
  },
];

export function SocialHubTab({
  user,
  profile = null,
  privateInfo,
  campaigns,
  projects = [],
  creators = [],
  activeTrackTitle,
  studioBpm = 112,
  onOpenAuth,
  onPrivateInfoSaved,
  onSupportCreator,
}: SocialHubTabProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<SocialPlatform>('instagram');
  const [trackTitle, setTrackTitle] = useState(activeTrackTitle || 'Midnight Studio Loop');
  const [vibe, setVibe] = useState('Behind-the-scenes studio beat drop & vocal session');
  const [headline, setHeadline] = useState('New studio heat just landed');
  const [caption, setCaption] = useState(
    'Built this beat and vocal hook from scratch inside SoundDeck Studio. Drop a comment if you want the full release.'
  );
  const [audioStyle, setAudioStyle] = useState<GrooveStyle>('afro');

  // Connected handles state
  const [igHandle, setIgHandle] = useState(privateInfo?.instagramHandle || '');
  const [fbPage, setFbPage] = useState(privateInfo?.facebookPage || '');
  const [tiktokHandle, setTiktokHandle] = useState(privateInfo?.tiktokHandle || '');
  const [waNumber, setWaNumber] = useState(privateInfo?.whatsappNumber || '');
  const [ytChannel, setYtChannel] = useState(privateInfo?.youtubeChannel || '');

  // Live Web Audio playback engine for social frames & WhatsApp voice notes
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [eqBars, setEqBars] = useState<number[]>([22, 48, 36, 70, 52, 84, 44, 62, 34, 58, 40, 26]);
  const audioSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferCacheRef = useRef<Partial<Record<string, AudioBuffer>>>({});

  // Instagram in-app studio state
  const [igFormat, setIgFormat] = useState<IgFormat>('reels');
  const [igSlideIdx, setIgSlideIdx] = useState(0);
  const [igLiked, setIgLiked] = useState(false);
  const [igLikes, setIgLikes] = useState(1420);
  const [igSaved, setIgSaved] = useState(false);
  const [igShowComments, setIgShowComments] = useState(false);
  const [igPollQuestion, setIgPollQuestion] = useState('Drop this tonight or add another verse?');
  const [igPollOptA, setIgPollOptA] = useState('Drop Tonight');
  const [igPollOptB, setIgPollOptB] = useState('Add Verse');
  const [igVotesA, setIgVotesA] = useState(64);
  const [igVotesB, setIgVotesB] = useState(28);
  const [igUserVoted, setIgUserVoted] = useState<'A' | 'B' | null>(null);
  const [igShowMusicTag, setIgShowMusicTag] = useState(true);
  const [igShowSodaSticker, setIgShowSodaSticker] = useState(true);
  const [igComments, setIgComments] = useState<InAppComment[]>([
    { id: 'c1', author: '@djkhalid_live', text: 'That log drum pocket hits crazy.', time: '2m', likes: 14 },
    { id: 'c2', author: '@nora_vocals', text: 'Need the instrumental stems for a harmony stitch!', time: '1m', likes: 9 },
  ]);
  const [igCommentInput, setIgCommentInput] = useState('');

  // TikTok in-app studio state
  const [ttFeedTab, setTtFeedTab] = useState<'following' | 'foryou'>('foryou');
  const [ttMode, setTtMode] = useState<TikTokMode>('original');
  const [ttHookScript, setTtHookScript] = useState(
    'Wait for the 808 drop on bar 2\nTurn headphones up for the vocal chop\nDrop a fire emoji if we should release Friday'
  );
  const [ttActiveLineIdx, setTtActiveLineIdx] = useState(0);
  const [ttFollowing, setTtFollowing] = useState(false);
  const [ttLiked, setTtLiked] = useState(false);
  const [ttLikes, setTtLikes] = useState(8430);
  const [ttBookmarked, setTtBookmarked] = useState(false);
  const [ttBookmarks, setTtBookmarks] = useState(612);
  const [ttSoundUses, setTtSoundUses] = useState(318);
  const [ttShowComments, setTtShowComments] = useState(false);
  const [ttComments, setTtComments] = useState<InAppComment[]>([
    { id: 't1', author: '@choreo_mia', text: 'Using this sound for tonight rehearsal!', time: '5m', likes: 41 },
    { id: 't2', author: '@studio_jay', text: 'Cleanest transition on FYP today.', time: '2m', likes: 18 },
  ]);
  const [ttCommentInput, setTtCommentInput] = useState('');

  // WhatsApp in-app broadcast & fan room state
  const [waAudience, setWaAudience] = useState<'vip' | 'djpool' | 'direct'>('vip');
  const [waAttachAudio, setWaAttachAudio] = useState(true);
  const [waAttachSoda, setWaAttachSoda] = useState(true);
  const [waQuickInput, setWaQuickInput] = useState('');
  const [waMessages, setWaMessages] = useState<WaMessage[]>([
    {
      id: 'w1',
      sender: 'fan',
      author: 'Street Team VIP · Maya',
      text: 'Checking in for the early studio snippet tonight!',
      time: '20:41',
      reactions: { '🔥': 6, '🙌': 3 },
    },
    {
      id: 'w2',
      sender: 'me',
      author: 'Studio Owner',
      text: 'Preview bounce is ready inside SoundDeck. Listen to the 8-bar pocket below before it hits socials.',
      time: '20:43',
      hasAudio: true,
      audioTitle: 'Midnight Studio Loop (Demo)',
      audioStyle: 'afro',
      reactions: { '🔥': 14, '🎧': 9 },
    },
  ]);

  // Facebook in-app creator post state
  const [fbFormat, setFbFormat] = useState<'video' | 'live'>('video');
  const [fbReactions, setFbReactions] = useState({ like: 184, love: 92, fire: 67 });
  const [fbUserReacted, setFbUserReacted] = useState<'like' | 'love' | 'fire' | null>(null);

  // YouTube in-app studio state
  const [ytFormat, setYtFormat] = useState<'video' | 'shorts'>('video');
  const [ytLikes, setYtLikes] = useState(1940);
  const [ytLiked, setYtLiked] = useState(false);

  // Publishing / AI / Vault status
  const [publishedFeed, setPublishedFeed] = useState<PublishedDrop[]>([]);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [savingHandles, setSavingHandles] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [socialSyncOpen, setSocialSyncOpen] = useState(false);
  const [savingSyncConfig, setSavingSyncConfig] = useState(false);
  const [activityTrigger, setActivityTrigger] = useState<{
    nonce: number;
    activityType: CommunityActivityType;
    title: string;
    detail: string;
    trackTitle?: string;
    bpm?: number;
    grooveStyle?: ActivityGrooveStyle;
    milestoneTag?: string;
    platform?: string;
  } | null>(null);
  const [socialSyncConfig, setSocialSyncConfig] = useState<SocialSyncConfig>(() => {
    try {
      const cached = localStorage.getItem('sounddeck_social_sync_config');
      return cached ? { ...DEFAULT_SOCIAL_SYNC_CONFIG, ...JSON.parse(cached) } : DEFAULT_SOCIAL_SYNC_CONFIG;
    } catch {
      return DEFAULT_SOCIAL_SYNC_CONFIG;
    }
  });

  // Persist Social Sync preferences locally for offline availability
  useEffect(() => {
    try {
      localStorage.setItem('sounddeck_social_sync_config', JSON.stringify(socialSyncConfig));
    } catch {
      // ignore storage quota errors
    }
  }, [socialSyncConfig]);

  // Real-time Firestore sync for Social Sync config when authenticated
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeSocialSyncConfig(user.uid, (remoteConfig) => {
      if (remoteConfig) {
        setSocialSyncConfig(remoteConfig);
      }
    });
    return () => unsub();
  }, [user]);

  // Sync loaded privateInfo handles & activeTrackTitle from parent
  useEffect(() => {
    if (privateInfo) {
      if (privateInfo.instagramHandle) setIgHandle(privateInfo.instagramHandle);
      if (privateInfo.facebookPage) setFbPage(privateInfo.facebookPage);
      if (privateInfo.tiktokHandle) setTiktokHandle(privateInfo.tiktokHandle);
      if (privateInfo.whatsappNumber) setWaNumber(privateInfo.whatsappNumber);
      if (privateInfo.youtubeChannel) setYtChannel(privateInfo.youtubeChannel);
    }
  }, [privateInfo]);

  useEffect(() => {
    if (activeTrackTitle) {
      setTrackTitle(activeTrackTitle);
    }
  }, [activeTrackTitle]);

  const stopPreviewAudio = () => {
    if (audioSrcRef.current) {
      try {
        audioSrcRef.current.onended = null;
        audioSrcRef.current.stop();
        audioSrcRef.current.disconnect();
      } catch {
        // Ignore already stopped source
      }
      audioSrcRef.current = null;
    }
    setIsPlayingPreview(false);
    setPlayingMessageId(null);
    setAudioProgress(0);
  };

  useEffect(() => {
    return () => {
      if (audioSrcRef.current) {
        try {
          audioSrcRef.current.stop();
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  // Equalizer + progress + TikTok hook lyric ticker while playing
  useEffect(() => {
    if (!isPlayingPreview && !playingMessageId) {
      setEqBars([22, 48, 36, 70, 52, 84, 44, 62, 34, 58, 40, 26]);
      return;
    }

    const hookLines = ttHookScript
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const startMs = performance.now();
    const beatMs = Math.max(250, (60 / Math.max(60, studioBpm)) * 1000);

    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startMs;
      const loopDurMs = Math.max(3000, beatMs * 8);
      setAudioProgress(((elapsed % loopDurMs) / loopDurMs) * 100);
      setEqBars(
        Array.from({ length: 12 }, (_, idx) => {
          const wave = Math.sin(elapsed * 0.012 + idx * 0.65) * 0.5 + 0.5;
          return Math.round(18 + wave * 78);
        })
      );
      if (hookLines.length > 0) {
        const lineStep = Math.floor(elapsed / (beatMs * 2)) % hookLines.length;
        setTtActiveLineIdx(lineStep);
      }
    }, 85);

    return () => window.clearInterval(timer);
  }, [isPlayingPreview, playingMessageId, studioBpm, ttHookScript]);

  const playSocialGroove = async (style: GrooveStyle, messageId: string | null = null) => {
    if ((messageId && playingMessageId === messageId) || (!messageId && isPlayingPreview)) {
      stopPreviewAudio();
      return;
    }

    stopPreviewAudio();
    try {
      const ctx = getAudioContext();
      const masterDest = getStudioMasterNode(ctx);
      const cacheKey = `${style}_${studioBpm}`;
      let buffer = bufferCacheRef.current[cacheKey];
      if (!buffer) {
        buffer = await renderGrooveBuffer(style, studioBpm, 2);
        bufferCacheRef.current[cacheKey] = buffer;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = !messageId;
      const gain = ctx.createGain();
      gain.gain.value = 0.85;
      src.connect(gain).connect(masterDest);
      src.onended = () => {
        if (audioSrcRef.current === src) {
          setIsPlayingPreview(false);
          setPlayingMessageId(null);
          setAudioProgress(0);
          audioSrcRef.current = null;
        }
      };
      src.start(0);
      audioSrcRef.current = src;

      if (messageId) {
        setPlayingMessageId(messageId);
      } else {
        setIsPlayingPreview(true);
      }
    } catch {
      setErrorMsg('Audio context unavailable. Click anywhere in the studio first.');
    }
  };

  const openPlatformInApp = (platform: SocialPlatform) => {
    setSelectedPlatform(platform);
    setFeedback(`Opened ${PLATFORMS.find((p) => p.id === platform)?.inAppTag} live inside SoundDeck.`);
    const el = document.getElementById('social-live-stage');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleSaveChannels = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    setSavingHandles(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      await upsertPrivateInfo(user.uid, {
        instagramHandle: igHandle.trim(),
        facebookPage: fbPage.trim(),
        tiktokHandle: tiktokHandle.trim(),
        whatsappNumber: waNumber.trim(),
        youtubeChannel: ytChannel.trim(),
      });
      onPrivateInfoSaved();
      setFeedback('Social channels synced to your creator vault.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save social handles.');
    } finally {
      setSavingHandles(false);
    }
  };

  const handleSaveSocialSync = async (
    nextConfig: SocialSyncConfig,
    nextHandles: {
      instagramHandle: string;
      tiktokHandle: string;
      facebookPage: string;
      whatsappNumber: string;
      youtubeChannel: string;
    }
  ) => {
    setSavingSyncConfig(true);
    setErrorMsg(null);
    setSocialSyncConfig(nextConfig);
    setIgHandle(nextHandles.instagramHandle);
    setTiktokHandle(nextHandles.tiktokHandle);
    setFbPage(nextHandles.facebookPage);
    setWaNumber(nextHandles.whatsappNumber);
    setYtChannel(nextHandles.youtubeChannel);

    try {
      if (user) {
        await Promise.all([
          upsertSocialSyncConfig(user.uid, nextConfig),
          upsertPrivateInfo(user.uid, {
            instagramHandle: nextHandles.instagramHandle.trim(),
            tiktokHandle: nextHandles.tiktokHandle.trim(),
            facebookPage: nextHandles.facebookPage.trim(),
            whatsappNumber: nextHandles.whatsappNumber.trim(),
            youtubeChannel: nextHandles.youtubeChannel.trim(),
          }),
        ]);
        onPrivateInfoSaved();
        setFeedback('Social Sync auto-publishing settings saved & synced to cloud.');
      } else {
        setFeedback('Social Sync auto-publishing settings saved locally on this device.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save Social Sync settings.');
    } finally {
      setSavingSyncConfig(false);
    }
  };

  const handleGenerateAiCaption = async () => {
    setGeneratingCaption(true);
    setErrorMsg(null);
    try {
      const res = await safeApiFetch<{ headline?: string; caption?: string; error?: string }>(
        '/api/gemini/social-caption',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: selectedPlatform,
            trackTitle,
            vibe,
            creatorRole: 'artist & content creator',
          }),
        }
      );

      if (res.ok && res.data) {
        if (res.data.headline) setHeadline(res.data.headline);
        if (res.data.caption) setCaption(res.data.caption);
        setFeedback(`Generated tailored ${selectedPlatform} hook copy.`);
        return;
      }

      if (res.isStaticFallback) {
        const cleanTitle = trackTitle.trim() || 'Midnight Studio Loop';
        const cleanVibe = vibe.trim() || 'late-night studio groove';
        const generatedHeadline =
          selectedPlatform === 'tiktok'
            ? `Wait for the drop on "${cleanTitle}" (${studioBpm} BPM)`
            : selectedPlatform === 'instagram'
            ? `New studio cut: "${cleanTitle}" · ${cleanVibe}`
            : `Listen first: "${cleanTitle}" fresh out the studio`;
        const generatedCaption = `Cooked up "${cleanTitle}" at ${studioBpm} BPM (${cleanVibe}). Drop a 🔥 if you want the full stem pack or support on BuymeSoda! #SoundDeckStudio #NewMusic #${selectedPlatform}`;
        setHeadline(generatedHeadline);
        setCaption(generatedCaption);
        setFeedback(`Generated ${selectedPlatform} studio hook copy (offline/static studio templates).`);
        return;
      }

      throw new Error(res.error || 'Caption request failed');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate AI caption.');
    } finally {
      setGeneratingCaption(false);
    }
  };

  const handlePublishInApp = async () => {
    setErrorMsg(null);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (selectedPlatform === 'whatsapp') {
      const newMsg: WaMessage = {
        id: `wa_${Date.now()}`,
        sender: 'me',
        author: 'You · Studio Owner',
        text: `${headline}\n${caption}`,
        time: nowTime,
        hasAudio: waAttachAudio,
        audioTitle: `${trackTitle} (${studioBpm} BPM)`,
        audioStyle,
        hasSodaCard: waAttachSoda,
        reactions: { '🔥': 1 },
      };
      setWaMessages((prev) => [...prev, newMsg]);
      setFeedback(
        `Broadcast delivered in-app to ${
          waAudience === 'vip'
            ? 'Street Team VIP (48)'
            : waAudience === 'djpool'
            ? 'DJ Promo Pool (19)'
            : waNumber || '+1555-STUDIO'
        }.`
      );

      // Fan confirmation reply inside the live room
      window.setTimeout(() => {
        setWaMessages((prev) => [
          ...prev,
          {
            id: `wa_fan_${Date.now()}`,
            sender: 'fan',
            author: waAudience === 'djpool' ? 'DJ Rico · Club Vault' : 'VIP Fan · Elena',
            text:
              waAudience === 'djpool'
                ? `Got "${trackTitle}" at ${studioBpm} BPM! Spinning this on tonight's warm-up set.`
                : `Running this preview on repeat — just tapped the BuymeSoda card too!`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            reactions: { '🎧': 2 },
          },
        ]);
      }, 900);

      void safeApiFetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms: ['whatsapp'],
          eventType: 'message',
          title: headline,
          body: caption,
          authorName: profile?.displayName || user?.displayName || 'Studio Owner',
          authorHandle: waNumber || 'WhatsApp Broadcast',
          whatsappPhone: waNumber,
        }),
      });
    } else {
      const drop: PublishedDrop = {
        id: `drop_${Date.now()}`,
        platform: selectedPlatform,
        headline,
        caption,
        trackTitle,
        timestamp: nowTime,
        likes:
          selectedPlatform === 'tiktok'
            ? ttLikes
            : selectedPlatform === 'instagram'
            ? igLikes
            : selectedPlatform === 'youtube'
            ? ytLikes
            : fbReactions.like,
      };

      const syncedPlatforms: (SocialPlatform | 'soundcloud')[] = [];
      const shouldAutoSync = socialSyncConfig.autoPublishTracks || socialSyncConfig.autoPublishReels;
      if (shouldAutoSync) {
        if (socialSyncConfig.instagramEnabled && selectedPlatform !== 'instagram') syncedPlatforms.push('instagram');
        if (socialSyncConfig.tiktokEnabled && selectedPlatform !== 'tiktok') syncedPlatforms.push('tiktok');
        if (socialSyncConfig.youtubeEnabled && selectedPlatform !== 'youtube') syncedPlatforms.push('youtube');
        if (socialSyncConfig.soundcloudEnabled) syncedPlatforms.push('soundcloud');
        if (socialSyncConfig.facebookEnabled && selectedPlatform !== 'facebook') syncedPlatforms.push('facebook');
        if (socialSyncConfig.whatsappEnabled) syncedPlatforms.push('whatsapp');
      }

      const syncedDrops: PublishedDrop[] = syncedPlatforms.map((plat, idx) => ({
        id: `drop_sync_${Date.now()}_${idx}`,
        platform: plat,
        headline,
        caption: socialSyncConfig.includeSodaCard
          ? `${caption}\n☕ Support on BuymeSoda`
          : caption,
        trackTitle,
        timestamp: nowTime,
        likes:
          plat === 'tiktok'
            ? ttLikes
            : plat === 'instagram'
            ? igLikes
            : plat === 'youtube'
            ? ytLikes
            : fbReactions.like,
        syncedViaAutoPublish: true,
      }));

      setPublishedFeed((prev) => [drop, ...syncedDrops, ...prev].slice(0, 16));

      if (syncedPlatforms.includes('whatsapp')) {
        setWaMessages((prev) => [
          ...prev,
          {
            id: `wa_sync_${Date.now()}`,
            sender: 'me',
            author: 'Auto-Sync · Studio Owner',
            text: `${headline}\n${caption}`,
            time: nowTime,
            hasAudio: true,
            audioTitle: `${trackTitle} (${studioBpm} BPM)`,
            audioStyle,
            hasSodaCard: socialSyncConfig.includeSodaCard,
            reactions: { '🔥': 1 },
          },
        ]);
      }

      const targetPlatforms: SocialPlatform[] = Array.from(
        new Set([
          selectedPlatform,
          ...syncedPlatforms.filter((p): p is SocialPlatform => p !== 'soundcloud'),
        ])
      );

      // Push outbound publish into omnichannel bridge
      void safeApiFetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms: targetPlatforms,
          eventType:
            selectedPlatform === 'instagram' && igFormat === 'reels'
              ? 'reel'
              : selectedPlatform === 'tiktok'
              ? 'reel'
              : 'post',
          title: headline,
          body: caption,
          authorName: profile?.displayName || user?.displayName || 'SoundDeck Creator',
          authorHandle:
            selectedPlatform === 'tiktok'
              ? activeTtName
              : selectedPlatform === 'youtube'
              ? activeYtName
              : selectedPlatform === 'facebook'
              ? activeFbName
              : activeIgName,
          whatsappPhone: waNumber,
        }),
      });

      const primaryName = PLATFORMS.find((p) => p.id === selectedPlatform)?.name || selectedPlatform;
      if (syncedPlatforms.length > 0) {
        const extraNames = syncedPlatforms
          .map((p) => (p === 'soundcloud' ? 'SoundCloud' : PLATFORMS.find((x) => x.id === p)?.name || p))
          .join(', ');
        setFeedback(`Published to ${primaryName} and auto-synced to ${extraNames}!`);
      } else {
        setFeedback(`Published live to in-app ${primaryName} Feed.`);
      }

      setActivityTrigger({
        nonce: Date.now(),
        activityType: 'shared_track',
        title: headline.trim() || `Shared "${trackTitle}" on ${primaryName}`,
        detail: caption.trim() || `Published ${trackTitle} (${studioBpm} BPM) to ${primaryName}.`,
        trackTitle,
        bpm: studioBpm,
        grooveStyle: audioStyle,
        platform: primaryName,
      });

      if (user) {
        setSavingCampaign(true);
        try {
          await Promise.all([
            ...targetPlatforms.map((plat) =>
              saveSocialCampaign(user.uid, {
                platform: plat,
                headline: headline.slice(0, 140),
                caption: caption.slice(0, 2200),
                trackTitle: trackTitle.slice(0, 120),
              })
            ),
            ...targetPlatforms.map((plat) =>
              createSocialOmnichannelEvent(user.uid, {
                platform: plat,
                eventType: plat === 'whatsapp' ? 'message' : plat === 'tiktok' ? 'reel' : 'post',
                direction: 'outbound',
                authorName: profile?.displayName || user.displayName || 'Studio Creator',
                authorHandle:
                  plat === 'instagram'
                    ? activeIgName
                    : plat === 'tiktok'
                    ? activeTtName
                    : plat === 'youtube'
                    ? activeYtName
                    : plat === 'facebook'
                    ? activeFbName
                    : waNumber || 'WhatsApp VIP',
                title: headline.slice(0, 140),
                body: caption.slice(0, 2200),
                status: 'synced',
                isPublic: plat !== 'whatsapp',
              })
            ),
          ]);
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to sync drop to Firestore.');
        } finally {
          setSavingCampaign(false);
        }
      }
      return;
    }

    if (user) {
      setSavingCampaign(true);
      try {
        await Promise.all([
          saveSocialCampaign(user.uid, {
            platform: selectedPlatform,
            headline: headline.slice(0, 140),
            caption: caption.slice(0, 2200),
            trackTitle: trackTitle.slice(0, 120),
          }),
          createSocialOmnichannelEvent(user.uid, {
            platform: 'whatsapp',
            eventType: 'message',
            direction: 'outbound',
            authorName: profile?.displayName || user.displayName || 'Studio Owner',
            authorHandle: waNumber || 'WhatsApp VIP',
            title: headline.slice(0, 140),
            body: caption.slice(0, 2200),
            status: 'synced',
            isPublic: false,
          }),
        ]);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to sync drop to Firestore.');
      } finally {
        setSavingCampaign(false);
      }
    }
  };

  const handleSaveDraftOnly = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setSavingCampaign(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      await saveSocialCampaign(user.uid, {
        platform: selectedPlatform,
        headline: headline.slice(0, 140),
        caption: caption.slice(0, 2200),
        trackTitle: trackTitle.slice(0, 120),
      });
      setFeedback(`Saved ${selectedPlatform} draft to your Firestore queue.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save draft.');
    } finally {
      setSavingCampaign(false);
    }
  };

  const handleDownloadVisualCard = () => {
    const canvas = document.createElement('canvas');
    const isVertical = selectedPlatform === 'instagram' || selectedPlatform === 'tiktok';
    canvas.width = isVertical ? 720 : selectedPlatform === 'whatsapp' ? 800 : 1200;
    canvas.height = isVertical ? 1280 : selectedPlatform === 'whatsapp' ? 800 : 675;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dark studio background gradient
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0B0D10');
    grad.addColorStop(0.55, '#13161B');
    grad.addColorStop(1, '#1E1B14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle amber glow accent
    const glow = ctx.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.35,
      20,
      canvas.width * 0.5,
      canvas.height * 0.35,
      canvas.width * 0.65
    );
    glow.addColorStop(0, 'rgba(245, 158, 11, 0.24)');
    glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Platform & Handle header
    const activeHandle =
      selectedPlatform === 'instagram'
        ? igHandle || '@sounddeck.artist'
        : selectedPlatform === 'tiktok'
        ? tiktokHandle || '@sounddeck.tok'
        : selectedPlatform === 'whatsapp'
        ? waNumber || 'WhatsApp VIP Drop'
        : selectedPlatform === 'youtube'
        ? ytChannel || 'SoundDeck Studio TV'
        : fbPage || 'SoundDeck Creator Page';

    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 26px monospace';
    ctx.fillText(`${selectedPlatform.toUpperCase()} STUDIO · ${studioBpm} BPM`, 54, 88);

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '600 24px sans-serif';
    ctx.fillText(activeHandle, 54, 130);

    // Waveform bars
    const barCount = 28;
    const waveY = Math.round(canvas.height * 0.45);
    const barGap = (canvas.width - 108) / barCount;
    for (let i = 0; i < barCount; i++) {
      const amp = 35 + Math.abs(Math.sin(i * 0.6)) * 130;
      ctx.fillStyle = i % 3 === 0 ? '#F59E0B' : '#334155';
      ctx.fillRect(54 + i * barGap, waveY - amp / 2, Math.max(6, barGap * 0.55), amp);
    }

    // Track Title & Headline
    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`♫ ${trackTitle}`, 54, canvas.height - 230);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText(headline.slice(0, 38), 54, canvas.height - 165);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '24px sans-serif';
    ctx.fillText(caption.slice(0, 62), 54, canvas.height - 105);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sounddeck-${selectedPlatform}-card.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setFeedback(`Downloaded ${selectedPlatform} visual studio card (.png).`);
    }, 'image/png');
  };

  const handleCopyPost = async () => {
    const fullText = `${headline}\n\n${caption}`;
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: headline,
          text: caption,
          url: window.location.href,
        });
      } catch {
        // User dismissed share sheet
      }
    } else {
      await handleCopyPost();
      setFeedback('Caption copied to clipboard.');
    }
  };

  const handleIgVote = (option: 'A' | 'B') => {
    if (igUserVoted === option) return;
    if (option === 'A') {
      setIgVotesA((v) => v + 1);
      if (igUserVoted === 'B') setIgVotesB((v) => Math.max(0, v - 1));
    } else {
      setIgVotesB((v) => v + 1);
      if (igUserVoted === 'A') setIgVotesA((v) => Math.max(0, v - 1));
    }
    setIgUserVoted(option);
  };

  const handleAddIgComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!igCommentInput.trim()) return;
    setIgComments((prev) => [
      {
        id: `igc_${Date.now()}`,
        author: igHandle || '@creator.studio',
        text: igCommentInput.trim(),
        time: 'Now',
        likes: 1,
        liked: true,
      },
      ...prev,
    ]);
    setIgCommentInput('');
  };

  const handleAddTtComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ttCommentInput.trim()) return;
    setTtComments((prev) => [
      {
        id: `ttc_${Date.now()}`,
        author: tiktokHandle || '@creator.tok',
        text: ttCommentInput.trim(),
        time: 'Now',
        likes: 1,
        liked: true,
      },
      ...prev,
    ]);
    setTtCommentInput('');
  };

  const handleSendWaQuickMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waQuickInput.trim()) return;
    const text = waQuickInput.trim();
    setWaQuickInput('');
    setWaMessages((prev) => [
      ...prev,
      {
        id: `wa_q_${Date.now()}`,
        sender: 'me',
        author: 'You · Studio Owner',
        text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        reactions: {},
      },
    ]);
  };

  const handleToggleWaReaction = (msgId: string, emoji: string) => {
    setWaMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              reactions: {
                ...m.reactions,
                [emoji]: (m.reactions[emoji] || 0) + 1,
              },
            }
          : m
      )
    );
  };

  const totalPollVotes = Math.max(1, igVotesA + igVotesB);
  const pollPctA = Math.round((igVotesA / totalPollVotes) * 100);
  const pollPctB = 100 - pollPctA;
  const ttHookLines = ttHookScript
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const currentTtLine = ttHookLines[ttActiveLineIdx % Math.max(1, ttHookLines.length)] || headline;

  const activeIgName = igHandle.trim() || '@sounddeck.artist';
  const activeTtName = tiktokHandle.trim() || '@sounddeck.tok';
  const activeFbName = fbPage.trim() || 'SoundDeck Creator Page';
  const activeYtName = ytChannel.trim() || socialSyncConfig.youtubeChannel || 'SoundDeck Studio TV';
  const activeWaTarget =
    waAudience === 'vip'
      ? 'Street Team VIP (48)'
      : waAudience === 'djpool'
      ? 'DJ Promo Pool (19)'
      : waNumber.trim() || '+1555-STUDIO';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#232833] pb-5">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-100">
            Social Hub
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Omnichannel collaboration with Instagram, TikTok, WhatsApp, Facebook &amp; YouTube — posts, reels, messages, comments &amp; live calls synced two-way.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
          <span>{studioBpm} BPM Sync</span>
          <span className="text-[#232833]">|</span>
          <span>Active Track:</span>
          <span className="text-amber-400 truncate max-w-[200px]">{trackTitle}</span>
          <button
            type="button"
            onClick={() => setSocialSyncOpen(true)}
            className="ml-1 px-3 py-1.5 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-amber-300 border border-amber-500/40 font-sans text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>
              Social Sync (
              {
                [
                  socialSyncConfig.instagramEnabled,
                  socialSyncConfig.tiktokEnabled,
                  socialSyncConfig.youtubeEnabled,
                  socialSyncConfig.soundcloudEnabled,
                  socialSyncConfig.facebookEnabled,
                  socialSyncConfig.whatsappEnabled,
                ].filter(Boolean).length
              }{' '}
              Active)
            </span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/60 text-xs text-red-200">
          {errorMsg}
        </div>
      )}
      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-xs text-emerald-200">
          {feedback}
        </div>
      )}

      {/* Channel Connection Rack — clicking activates directly inside the app */}
      <form
        onSubmit={handleSaveChannels}
        className="rounded-xl bg-[#13161B] border border-[#232833] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-100">
              In-App Creator Channels
            </h3>
            <p className="text-xs text-slate-400">
              Select any channel card to launch its interactive studio below, or configure auto-publishing via Social Sync.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSocialSyncOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-slate-100 text-xs font-medium border border-[#2A313E] flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>Social Sync</span>
            </button>
            <button
              type="submit"
              disabled={savingHandles}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{user ? (savingHandles ? 'Saving...' : 'Save Connections') : 'Sign In to Sync'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div
            className={`p-3 rounded-lg bg-[#0B0D10] border space-y-2 transition-colors ${
              selectedPlatform === 'instagram' ? 'border-amber-500' : 'border-[#232833]'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-100">Instagram</span>
              <button
                type="button"
                onClick={() => openPlatformInApp('instagram')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  selectedPlatform === 'instagram'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-[#1B2028] text-amber-400 hover:bg-[#252B36]'
                }`}
              >
                {selectedPlatform === 'instagram' ? 'Live Inside App' : 'Open Studio'}
              </button>
            </div>
            <input
              type="text"
              value={igHandle}
              onChange={(e) => setIgHandle(e.target.value)}
              placeholder="@your.ig.handle"
              maxLength={80}
              className="w-full px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div
            className={`p-3 rounded-lg bg-[#0B0D10] border space-y-2 transition-colors ${
              selectedPlatform === 'tiktok' ? 'border-amber-500' : 'border-[#232833]'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-100">TikTok</span>
              <button
                type="button"
                onClick={() => openPlatformInApp('tiktok')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  selectedPlatform === 'tiktok'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-[#1B2028] text-amber-400 hover:bg-[#252B36]'
                }`}
              >
                {selectedPlatform === 'tiktok' ? 'Live Inside App' : 'Open Studio'}
              </button>
            </div>
            <input
              type="text"
              value={tiktokHandle}
              onChange={(e) => setTiktokHandle(e.target.value)}
              placeholder="@your.tiktok"
              maxLength={80}
              className="w-full px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div
            className={`p-3 rounded-lg bg-[#0B0D10] border space-y-2 transition-colors ${
              selectedPlatform === 'whatsapp' ? 'border-amber-500' : 'border-[#232833]'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-100">WhatsApp</span>
              <button
                type="button"
                onClick={() => openPlatformInApp('whatsapp')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  selectedPlatform === 'whatsapp'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-[#1B2028] text-amber-400 hover:bg-[#252B36]'
                }`}
              >
                {selectedPlatform === 'whatsapp' ? 'Live Inside App' : 'Open Studio'}
              </button>
            </div>
            <input
              type="text"
              value={waNumber}
              onChange={(e) => setWaNumber(e.target.value)}
              placeholder="+15550109988"
              maxLength={40}
              className="w-full px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
            />
          </div>

          <div
            className={`p-3 rounded-lg bg-[#0B0D10] border space-y-2 transition-colors ${
              selectedPlatform === 'facebook' ? 'border-amber-500' : 'border-[#232833]'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-100">Facebook</span>
              <button
                type="button"
                onClick={() => openPlatformInApp('facebook')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  selectedPlatform === 'facebook'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-[#1B2028] text-amber-400 hover:bg-[#252B36]'
                }`}
              >
                {selectedPlatform === 'facebook' ? 'Live Inside App' : 'Open Studio'}
              </button>
            </div>
            <input
              type="text"
              value={fbPage}
              onChange={(e) => setFbPage(e.target.value)}
              placeholder="facebook.com/yourpage"
              maxLength={120}
              className="w-full px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div
            className={`p-3 rounded-lg bg-[#0B0D10] border space-y-2 transition-colors ${
              selectedPlatform === 'youtube' ? 'border-amber-500' : 'border-[#232833]'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-100">YouTube</span>
              <button
                type="button"
                onClick={() => openPlatformInApp('youtube')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  selectedPlatform === 'youtube'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-[#1B2028] text-amber-400 hover:bg-[#252B36]'
                }`}
              >
                {selectedPlatform === 'youtube' ? 'Live Inside App' : 'Open Studio'}
              </button>
            </div>
            <input
              type="text"
              value={ytChannel}
              onChange={(e) => setYtChannel(e.target.value)}
              placeholder="youtube.com/@yourchannel"
              maxLength={120}
              className="w-full px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </form>

      {/* Two-Column Interactive Studio + Living Platform Simulator */}
      <div id="social-live-stage" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Composer & Platform-Specific Controls */}
        <div className="lg:col-span-6 rounded-xl bg-[#13161B] border border-[#232833] p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-base font-semibold text-slate-100">
                Studio Campaign &amp; Feature Controls
              </h3>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0D10] border border-[#232833]">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openPlatformInApp(p.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      selectedPlatform === p.id
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Sound / Song Title</label>
                <input
                  type="text"
                  value={trackTitle}
                  onChange={(e) => setTrackTitle(e.target.value)}
                  maxLength={120}
                  className="w-full px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Studio Beat Vibe</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#0B0D10] border border-[#232833]">
                  {(['afro', 'house', 'trap'] as GrooveStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setAudioStyle(style)}
                      className={`py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                        audioStyle === style
                          ? 'bg-[#1B2028] text-amber-400 border border-amber-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Content Angle / Vibe</label>
              <input
                type="text"
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                maxLength={140}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400">Hook Headline</label>
              <button
                type="button"
                onClick={handleGenerateAiCaption}
                disabled={generatingCaption}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-amber-400 text-xs font-medium border border-[#2A313E] transition-colors disabled:opacity-50"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>{generatingCaption ? 'Writing Hook...' : 'AI Write Hook'}</span>
              </button>
            </div>

            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={140}
              className="w-full px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {selectedPlatform === 'whatsapp' ? 'Broadcast Message Body' : 'Post Caption & Hashtags'}
              </label>
              <textarea
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={2200}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 leading-relaxed focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Platform-Specific Interactive Studio Options */}
            {selectedPlatform === 'instagram' && (
              <div className="p-3.5 rounded-lg bg-[#0B0D10] border border-[#232833] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-400">Instagram Interactive Stickers</span>
                  <div className="flex items-center gap-1">
                    {(['reels', 'story', 'carousel'] as IgFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setIgFormat(fmt)}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize ${
                          igFormat === fmt
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-[#13161B] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                {igFormat === 'story' && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={igPollQuestion}
                      onChange={(e) => setIgPollQuestion(e.target.value)}
                      placeholder="Story Poll Question"
                      className="w-full px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={igPollOptA}
                        onChange={(e) => setIgPollOptA(e.target.value)}
                        placeholder="Option A"
                        className="px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100"
                      />
                      <input
                        type="text"
                        value={igPollOptB}
                        onChange={(e) => setIgPollOptB(e.target.value)}
                        placeholder="Option B"
                        className="px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={igShowMusicTag}
                      onChange={(e) => setIgShowMusicTag(e.target.checked)}
                      className="accent-amber-500"
                    />
                    <span>Show Music Sticker</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={igShowSodaSticker}
                      onChange={(e) => setIgShowSodaSticker(e.target.checked)}
                      className="accent-amber-500"
                    />
                    <span>BuymeSoda Support Sticker</span>
                  </label>
                </div>
              </div>
            )}

            {selectedPlatform === 'tiktok' && (
              <div className="p-3.5 rounded-lg bg-[#0B0D10] border border-[#232833] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-400">TikTok Sound &amp; Remix Mode</span>
                  <div className="flex items-center gap-1">
                    {(['original', 'duet', 'stitch'] as TikTokMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTtMode(mode)}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize ${
                          ttMode === mode
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-[#13161B] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Beat-Synced On-Screen Text Hooks (one per line)
                  </label>
                  <textarea
                    rows={2}
                    value={ttHookScript}
                    onChange={(e) => setTtHookScript(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100"
                  />
                </div>
              </div>
            )}

            {selectedPlatform === 'whatsapp' && (
              <div className="p-3.5 rounded-lg bg-[#0B0D10] border border-[#232833] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-400">WhatsApp Broadcast Room</span>
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'vip', label: 'VIP Fans (48)' },
                      { id: 'djpool', label: 'DJ Pool (19)' },
                      { id: 'direct', label: 'Direct Line' },
                    ].map((aud) => (
                      <button
                        key={aud.id}
                        type="button"
                        onClick={() => setWaAudience(aud.id as 'vip' | 'djpool' | 'direct')}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                          waAudience === aud.id
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-[#13161B] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {aud.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-slate-300">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={waAttachAudio}
                      onChange={(e) => setWaAttachAudio(e.target.checked)}
                      className="accent-amber-500"
                    />
                    <span>Attach Playable Beat Drop</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={waAttachSoda}
                      onChange={(e) => setWaAttachSoda(e.target.checked)}
                      className="accent-amber-500"
                    />
                    <span>Include BuymeSoda Tip Card</span>
                  </label>
                </div>
              </div>
            )}

            {selectedPlatform === 'facebook' && (
              <div className="p-3.5 rounded-lg bg-[#0B0D10] border border-[#232833] flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400">Facebook Creator Format</span>
                <div className="flex items-center gap-1">
                  {(['video', 'live'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setFbFormat(fmt)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize ${
                        fbFormat === fmt
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'bg-[#13161B] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fmt === 'video' ? 'Studio Video' : 'Live Session'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedPlatform === 'youtube' && (
              <div className="p-3.5 rounded-lg bg-[#0B0D10] border border-[#232833] flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400">YouTube Studio Format</span>
                <div className="flex items-center gap-1">
                  {(['video', 'shorts'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setYtFormat(fmt)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize ${
                        ytFormat === fmt
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'bg-[#13161B] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fmt === 'video' ? 'Official Music Video' : 'YouTube Shorts'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#232833]">
            <button
              type="button"
              onClick={handlePublishInApp}
              disabled={savingCampaign}
              className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {selectedPlatform === 'instagram'
                  ? 'Publish to IG Studio Feed'
                  : selectedPlatform === 'tiktok'
                  ? 'Post to TikTok Sound Feed'
                  : selectedPlatform === 'whatsapp'
                  ? 'Send Broadcast in Chat'
                  : selectedPlatform === 'youtube'
                  ? 'Publish to YouTube Studio'
                  : 'Publish to Creator Page'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadVisualCard}
              className="px-3.5 py-2.5 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-slate-100 text-xs font-medium border border-[#2A313E] flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Export Card</span>
            </button>

            <button
              type="button"
              onClick={handleCopyPost}
              className="px-3.5 py-2.5 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-slate-100 text-xs font-medium border border-[#2A313E] flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Copy'}</span>
            </button>

            <button
              type="button"
              onClick={handleNativeShare}
              className="px-3.5 py-2.5 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-slate-100 text-xs font-medium border border-[#2A313E] flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            <button
              type="button"
              onClick={handleSaveDraftOnly}
              disabled={savingCampaign}
              className="px-3.5 py-2.5 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] text-slate-300 text-xs font-medium border border-[#232833] flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingCampaign ? 'Saving...' : 'Save Draft'}</span>
            </button>
          </div>
        </div>

        {/* Living In-App Platform Simulator Stage */}
        <div className="lg:col-span-6 rounded-xl bg-[#13161B] border border-[#232833] p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-100">
                {PLATFORMS.find((p) => p.id === selectedPlatform)?.inAppTag}
              </h3>
              <p className="text-xs text-slate-400">
                Interactive live experience inside SoundDeck — play audio, vote, react, and chat without leaving the app.
              </p>
            </div>
            <button
              type="button"
              onClick={() => playSocialGroove(audioStyle, null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                isPlayingPreview
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-[#1B2028] hover:bg-[#252B36] text-amber-400 border border-[#2A313E]'
              }`}
            >
              {isPlayingPreview ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlayingPreview ? 'Pause Audio' : 'Play Preview'}</span>
            </button>
          </div>

          {/* 1. INSTAGRAM IN-APP SIMULATOR */}
          {selectedPlatform === 'instagram' && (
            <div className="flex justify-center">
              <div className="w-full max-w-[340px] rounded-2xl overflow-hidden bg-[#0B0D10] border border-[#2A313E] shadow-xl flex flex-col">
                {/* IG Top Profile Header */}
                <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-[#1E232D] bg-[#101318]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-rose-500 p-[2px] shrink-0">
                      <div className="w-full h-full rounded-full bg-[#0B0D10] flex items-center justify-center text-[11px] font-bold text-amber-400">
                        IG
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-100 truncate">{activeIgName}</div>
                      <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                        <Music2 className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="truncate">{trackTitle} · {studioBpm} BPM</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#1B2028] text-amber-400">
                    {igFormat}
                  </span>
                </div>

                {/* IG Visual Media Frame */}
                <div
                  className={`relative bg-[#13161B] overflow-hidden flex flex-col justify-between p-4 ${
                    igFormat === 'carousel' ? 'aspect-square' : 'h-[360px]'
                  }`}
                >
                  <img
                    src={STUDIO_IMAGES.coverAfro}
                    alt="Instagram studio visual"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover opacity-70"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div
                    className={`absolute inset-0 bg-gradient-to-b ${
                      igFormat === 'carousel'
                        ? IG_SLIDES[igSlideIdx].gradient
                        : 'from-black/35 via-black/30 to-black/95'
                    }`}
                  />

                  {/* Top Story Progress / Carousel Controls */}
                  <div className="relative z-10 flex items-center justify-between gap-2">
                    {igFormat === 'story' ? (
                      <div className="w-full flex gap-1">
                        <div className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden">
                          <div
                            className="h-full bg-amber-400 transition-all duration-100"
                            style={{ width: `${Math.max(25, audioProgress)}%` }}
                          />
                        </div>
                        <div className="h-1 flex-1 rounded-full bg-white/25" />
                      </div>
                    ) : igFormat === 'carousel' ? (
                      <div className="w-full flex items-center justify-between">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/70 text-amber-300 border border-amber-500/30">
                          {IG_SLIDES[igSlideIdx].badge}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/70 text-slate-200">
                          {igSlideIdx + 1}/{IG_SLIDES.length}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/65 border border-white/10 text-[11px] text-slate-200">
                        <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>{isPlayingPreview ? 'Playing Reel Mix' : 'Tap Play to Preview'}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => playSocialGroove(audioStyle, null)}
                      aria-label={isPlayingPreview ? 'Pause Instagram audio' : 'Play Instagram audio'}
                      className="w-8 h-8 rounded-full bg-black/75 hover:bg-amber-500 text-white hover:text-slate-950 flex items-center justify-center border border-white/15 transition-colors shrink-0"
                    >
                      {isPlayingPreview ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                    </button>
                  </div>

                  {/* Center Interactive Stickers: Poll / Carousel Arrows / Music Tag */}
                  <div className="relative z-10 my-auto space-y-2.5">
                    {igFormat === 'carousel' && (
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setIgSlideIdx((i) => (i - 1 + IG_SLIDES.length) % IG_SLIDES.length)}
                          aria-label="Previous slide"
                          className="w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/15"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="px-3 py-1.5 rounded-lg bg-black/75 border border-white/10 text-xs font-medium text-white text-center max-w-[190px]">
                          {IG_SLIDES[igSlideIdx].overlay}
                        </div>
                        <button
                          type="button"
                          onClick={() => setIgSlideIdx((i) => (i + 1) % IG_SLIDES.length)}
                          aria-label="Next slide"
                          className="w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/15"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {igFormat === 'story' && (
                      <div className="rounded-xl bg-[#13161B]/95 border border-[#2A313E] p-3 space-y-2 shadow-lg">
                        <div className="text-xs font-semibold text-white text-center">{igPollQuestion}</div>
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            onClick={() => handleIgVote('A')}
                            className={`w-full relative overflow-hidden rounded-lg px-3 py-2 text-left text-xs font-medium border transition-colors ${
                              igUserVoted === 'A' ? 'border-amber-500 text-white' : 'border-[#2A313E] text-slate-200'
                            }`}
                          >
                            <div
                              className="absolute inset-y-0 left-0 bg-amber-500/25 transition-all"
                              style={{ width: `${pollPctA}%` }}
                            />
                            <div className="relative flex items-center justify-between">
                              <span>{igPollOptA}</span>
                              <span className="font-mono text-amber-300">{pollPctA}%</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleIgVote('B')}
                            className={`w-full relative overflow-hidden rounded-lg px-3 py-2 text-left text-xs font-medium border transition-colors ${
                              igUserVoted === 'B' ? 'border-amber-500 text-white' : 'border-[#2A313E] text-slate-200'
                            }`}
                          >
                            <div
                              className="absolute inset-y-0 left-0 bg-emerald-500/25 transition-all"
                              style={{ width: `${pollPctB}%` }}
                            />
                            <div className="relative flex items-center justify-between">
                              <span>{igPollOptB}</span>
                              <span className="font-mono text-emerald-300">{pollPctB}%</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    )}

                    {igShowMusicTag && (
                      <div className="mx-auto w-fit max-w-full px-3 py-1.5 rounded-lg bg-black/80 border border-white/15 flex items-center gap-2">
                        <Music2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-[11px] font-medium text-white truncate">{trackTitle}</span>
                        <div className="flex items-end gap-[2px] h-3 shrink-0">
                          {eqBars.slice(0, 5).map((h, i) => (
                            <span
                              key={i}
                              className="w-[2px] bg-amber-400 rounded-full transition-all duration-75"
                              style={{ height: `${Math.max(25, h)}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {igShowSodaSticker && (
                      <button
                        type="button"
                        onClick={() => onSupportCreator?.(activeIgName)}
                        className="mx-auto px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold flex items-center gap-1.5 transition-colors shadow"
                      >
                        <CupSoda className="w-3.5 h-3.5" />
                        <span>Support Artist · BuymeSoda</span>
                      </button>
                    )}
                  </div>

                  {/* Bottom IG Text & Audio Waveform */}
                  <div className="relative z-10 space-y-1.5">
                    <div className="text-sm font-semibold text-white leading-snug line-clamp-2">{headline}</div>
                    <div className="text-xs text-slate-300 line-clamp-2">{caption}</div>
                  </div>
                </div>

                {/* IG Interactive Action Bar */}
                <div className="px-3.5 py-2.5 flex items-center justify-between border-t border-[#1E232D] bg-[#101318]">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIgLiked((prev) => {
                          setIgLikes((n) => (prev ? n - 1 : n + 1));
                          return !prev;
                        });
                      }}
                      className="flex items-center gap-1.5 text-xs text-slate-200 hover:text-rose-400 transition-colors"
                    >
                      <Heart className={`w-4 h-4 ${igLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                      <span className="font-mono">{igLikes.toLocaleString()}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIgShowComments((v) => !v)}
                      className="flex items-center gap-1.5 text-xs text-slate-200 hover:text-amber-400 transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span className="font-mono">{igComments.length}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleNativeShare}
                      className="text-slate-200 hover:text-amber-400 transition-colors"
                      aria-label="Share Instagram card"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIgSaved((v) => !v)}
                    className="text-slate-200 hover:text-amber-400 transition-colors"
                    aria-label="Bookmark post"
                  >
                    <Bookmark className={`w-4 h-4 ${igSaved ? 'fill-amber-400 text-amber-400' : ''}`} />
                  </button>
                </div>

                {/* IG Live Comments Drawer */}
                {igShowComments && (
                  <div className="p-3 border-t border-[#1E232D] bg-[#0B0D10] space-y-2.5">
                    <div className="max-h-28 overflow-y-auto space-y-2 pr-1">
                      {igComments.map((c) => (
                        <div key={c.id} className="flex items-start justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-200 mr-1.5">{c.author}</span>
                            <span className="text-slate-400">{c.text}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setIgComments((prev) =>
                                prev.map((item) =>
                                  item.id === c.id
                                    ? {
                                        ...item,
                                        liked: !item.liked,
                                        likes: item.liked ? item.likes - 1 : item.likes + 1,
                                      }
                                    : item
                                )
                              )
                            }
                            className="text-[11px] text-slate-400 hover:text-rose-400 shrink-0 flex items-center gap-0.5"
                          >
                            <Heart className={`w-3 h-3 ${c.liked ? 'fill-rose-500 text-rose-500' : ''}`} />
                            <span>{c.likes}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={handleAddIgComment} className="flex gap-2">
                      <input
                        type="text"
                        value={igCommentInput}
                        onChange={(e) => setIgCommentInput(e.target.value)}
                        placeholder="Add creator comment..."
                        className="flex-1 px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded bg-amber-500 text-slate-950 text-xs font-semibold"
                      >
                        Post
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. TIKTOK IN-APP SIMULATOR */}
          {selectedPlatform === 'tiktok' && (
            <div className="flex justify-center">
              <div className="w-full max-w-[330px] rounded-2xl overflow-hidden bg-[#0B0D10] border border-[#2A313E] shadow-xl flex flex-col">
                <div className="relative h-[430px] bg-[#13161B] flex flex-col justify-between p-3.5 overflow-hidden">
                  {/* Split Screen Duet / Stitch or Full Video Stage */}
                  {ttMode === 'duet' ? (
                    <div className="absolute inset-0 grid grid-cols-2">
                      <div className="relative border-r border-white/15">
                        <img
                          src={STUDIO_IMAGES.coverAfro}
                          alt="Duet creator side"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover opacity-75"
                        />
                        <div className="absolute inset-0 bg-black/30" />
                      </div>
                      <div className="relative bg-gradient-to-br from-[#161B22] to-[#0B0D10] flex flex-col items-center justify-center p-2 text-center">
                        <div className="flex items-end gap-1 h-16 mb-2">
                          {eqBars.slice(0, 8).map((h, i) => (
                            <span
                              key={i}
                              className="w-1.5 rounded-full bg-amber-400 transition-all duration-75"
                              style={{ height: `${Math.max(15, h)}%` }}
                            />
                          ))}
                        </div>
                        <span className="text-[11px] font-mono text-amber-300">DUET STUDIO CAM</span>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={STUDIO_IMAGES.coverAfro}
                      alt="TikTok stage background"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover opacity-65"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/95 pointer-events-none" />

                  {/* Top For You / Following Switcher */}
                  <div className="relative z-10 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => playSocialGroove(audioStyle, null)}
                      className="px-2.5 py-1 rounded bg-black/65 border border-white/15 text-[11px] font-mono text-amber-400 flex items-center gap-1"
                    >
                      {isPlayingPreview ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      <span>{studioBpm} BPM</span>
                    </button>

                    <div className="flex items-center gap-3 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setTtFeedTab('following')}
                        className={ttFeedTab === 'following' ? 'text-white border-b-2 border-amber-400 pb-0.5' : 'text-slate-400'}
                      >
                        Following
                      </button>
                      <button
                        type="button"
                        onClick={() => setTtFeedTab('foryou')}
                        className={ttFeedTab === 'foryou' ? 'text-white border-b-2 border-amber-400 pb-0.5' : 'text-slate-400'}
                      >
                        For You
                      </button>
                    </div>

                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-black/65 text-slate-200 border border-white/10">
                      {ttMode}
                    </span>
                  </div>

                  {/* Center Timed Hook Caption + Stitch Tag */}
                  <div
                    onClick={() => playSocialGroove(audioStyle, null)}
                    className="relative z-10 my-auto pr-12 cursor-pointer space-y-3"
                  >
                    {ttMode === 'stitch' && (
                      <div className="w-fit px-2.5 py-1 rounded bg-amber-500 text-slate-950 text-[10px] font-bold uppercase">
                        Stitched 0:04 Studio Hook
                      </div>
                    )}
                    <div className="px-3 py-2 rounded-lg bg-black/75 border border-amber-500/40 text-sm font-bold text-white leading-snug shadow-lg">
                      {currentTtLine}
                    </div>
                    <div className="flex items-end gap-1 h-7">
                      {eqBars.map((h, idx) => (
                        <span
                          key={idx}
                          className="w-1 rounded-full bg-amber-400/90 transition-all duration-75"
                          style={{ height: `${Math.max(18, h)}%` }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Right Vertical Engagement Rail + Spinning Vinyl */}
                  <div className="absolute right-3 bottom-16 z-20 flex flex-col items-center gap-3.5">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-[#1B2028] border-2 border-white flex items-center justify-center text-xs font-bold text-amber-400">
                        TT
                      </div>
                      <button
                        type="button"
                        onClick={() => setTtFollowing((v) => !v)}
                        aria-label="Follow creator"
                        className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          ttFollowing ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
                        }`}
                      >
                        {ttFollowing ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setTtLiked((prev) => {
                          setTtLikes((n) => (prev ? n - 1 : n + 1));
                          return !prev;
                        });
                      }}
                      className="flex flex-col items-center text-white"
                    >
                      <Heart className={`w-6 h-6 ${ttLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                      <span className="text-[11px] font-mono mt-0.5">{ttLikes.toLocaleString()}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTtShowComments((v) => !v)}
                      className="flex flex-col items-center text-white"
                    >
                      <MessageCircle className="w-6 h-6" />
                      <span className="text-[11px] font-mono mt-0.5">{ttComments.length}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTtBookmarked((prev) => {
                          setTtBookmarks((n) => (prev ? n - 1 : n + 1));
                          return !prev;
                        });
                      }}
                      className="flex flex-col items-center text-white"
                    >
                      <Bookmark className={`w-6 h-6 ${ttBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
                      <span className="text-[11px] font-mono mt-0.5">{ttBookmarks}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTtSoundUses((n) => n + 1);
                        playSocialGroove(audioStyle, null);
                        setFeedback(`Added "${trackTitle}" to your in-app TikTok Sound Uses (${ttSoundUses + 1}).`);
                      }}
                      title="Use Sound & Spin Vinyl"
                      className="w-10 h-10 rounded-full bg-[#0B0D10] border-2 border-amber-400/70 flex items-center justify-center"
                    >
                      <Disc3
                        className={`w-6 h-6 text-amber-400 ${isPlayingPreview ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>

                  {/* Bottom Creator Metadata & Sound Bar */}
                  <div className="relative z-10 pr-14 space-y-1.5">
                    <div className="text-xs font-bold text-white">{activeTtName}</div>
                    <div className="text-xs text-slate-200 line-clamp-2">{headline} · {caption}</div>
                    <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-amber-300 font-mono">
                      <span className="truncate flex items-center gap-1">
                        <Music2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">Original Sound · {trackTitle}</span>
                      </span>
                      <span className="shrink-0 text-slate-300">{ttSoundUses} videos</span>
                    </div>
                  </div>
                </div>

                {/* TikTok Comments Drawer */}
                {ttShowComments && (
                  <div className="p-3 border-t border-[#1E232D] bg-[#0B0D10] space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                      <span>Comments ({ttComments.length})</span>
                      <button
                        type="button"
                        onClick={() => onSupportCreator?.(activeTtName)}
                        className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
                      >
                        <CupSoda className="w-3 h-3" />
                        <span>Gift a Soda</span>
                      </button>
                    </div>
                    <div className="max-h-28 overflow-y-auto space-y-2 pr-1">
                      {ttComments.map((c) => (
                        <div key={c.id} className="flex items-start justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-200 mr-1.5">{c.author}</span>
                            <span className="text-slate-400">{c.text}</span>
                          </div>
                          <span className="text-[11px] text-slate-500 shrink-0">{c.likes} ♥</span>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={handleAddTtComment} className="flex gap-2">
                      <input
                        type="text"
                        value={ttCommentInput}
                        onChange={(e) => setTtCommentInput(e.target.value)}
                        placeholder="Reply to TikTok fan..."
                        className="flex-1 px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded bg-amber-500 text-slate-950 text-xs font-semibold"
                      >
                        Send
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. WHATSAPP IN-APP BROADCAST & FAN CHAT SIMULATOR */}
          {selectedPlatform === 'whatsapp' && (
            <div className="rounded-xl overflow-hidden bg-[#0B141A] border border-[#232833] flex flex-col h-[450px]">
              {/* WhatsApp Header Bar */}
              <div className="px-4 py-3 bg-[#151E24] border-b border-[#232833] flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-emerald-600/25 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-100 truncate">{activeWaTarget}</div>
                    <div className="text-[11px] text-emerald-400 truncate">
                      In-App Creator Room · Instant Audio Broadcast
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0B141A] text-slate-300 border border-[#232833]">
                  E2E Room
                </span>
              </div>

              {/* Scrollable WhatsApp Messages Thread */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                {waMessages.map((msg) => {
                  const isMe = msg.sender === 'me';
                  const isMsgPlaying = playingMessageId === msg.id;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[86%] rounded-xl px-3.5 py-2.5 text-xs space-y-2 border ${
                          isMe
                            ? 'bg-[#073B32] border-emerald-700/50 text-slate-100 rounded-tr-none'
                            : 'bg-[#172128] border-[#26323D] text-slate-200 rounded-tl-none'
                        }`}
                      >
                        <div className="text-[10px] font-mono text-amber-300">{msg.author}</div>
                        <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

                        {/* Playable In-Chat Beat / Voice Note */}
                        {msg.hasAudio && (
                          <div className="p-2 rounded-lg bg-[#0B141A]/70 border border-white/10 flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => playSocialGroove(msg.audioStyle || audioStyle, msg.id)}
                              className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shrink-0"
                              aria-label={isMsgPlaying ? 'Pause audio note' : 'Play audio note'}
                            >
                              {isMsgPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                            </button>
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="text-[11px] font-medium text-slate-100 truncate">
                                {msg.audioTitle || trackTitle}
                              </div>
                              <div className="flex items-end gap-[2px] h-3">
                                {eqBars.map((h, i) => (
                                  <span
                                    key={i}
                                    className={`flex-1 rounded-full transition-all duration-75 ${
                                      isMsgPlaying ? 'bg-amber-400' : 'bg-slate-600'
                                    }`}
                                    style={{ height: isMsgPlaying ? `${Math.max(25, h)}%` : '35%' }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Embedded BuymeSoda Support Card inside WhatsApp */}
                        {msg.hasSodaCard && (
                          <div className="p-2.5 rounded-lg bg-[#13161B] border border-amber-500/40 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold text-amber-300">
                                BuymeSoda Creator Support
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                Fuel {trackTitle} stems &amp; studio time
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onSupportCreator?.(activeWaTarget)}
                              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold shrink-0"
                            >
                              Send Soda
                            </button>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-3 pt-0.5">
                          <div className="flex items-center gap-1">
                            {['🔥', '❤️', '🎧'].map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleToggleWaReaction(msg.id, emoji)}
                                className="px-1.5 py-0.5 rounded bg-black/30 hover:bg-black/50 text-[10px] text-slate-200 transition-colors"
                              >
                                {emoji} {msg.reactions[emoji] ? msg.reactions[emoji] : ''}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                            <span>{msg.time}</span>
                            {isMe && <CheckCheck className="w-3.5 h-3.5 text-sky-400" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Live Message Bar inside WhatsApp */}
              <form
                onSubmit={handleSendWaQuickMessage}
                className="p-2.5 bg-[#151E24] border-t border-[#232833] flex items-center gap-2"
              >
                <input
                  type="text"
                  value={waQuickInput}
                  onChange={(e) => setWaQuickInput(e.target.value)}
                  placeholder={`Message ${activeWaTarget}...`}
                  className="flex-1 px-3 py-2 rounded-lg bg-[#0B141A] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          )}

          {/* 4. FACEBOOK IN-APP CREATOR POST SIMULATOR */}
          {selectedPlatform === 'facebook' && (
            <div className="rounded-xl overflow-hidden bg-[#0B0D10] border border-[#2A313E] flex flex-col">
              <div className="p-3.5 flex items-center justify-between border-b border-[#232833] bg-[#101318]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xs font-bold text-amber-400">
                    FB
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-100">{activeFbName}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Radio className="w-3 h-3 text-amber-400" />
                      <span>{fbFormat === 'live' ? 'Live Creator Session' : 'Studio Video Drop'} · Just now</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSupportCreator?.(activeFbName)}
                  className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-[11px] font-semibold flex items-center gap-1"
                >
                  <CupSoda className="w-3 h-3" />
                  <span>BuymeSoda</span>
                </button>
              </div>

              <div className="p-3.5 text-xs text-slate-300 space-y-1">
                <div className="font-semibold text-slate-100">{headline}</div>
                <p className="text-slate-400 leading-relaxed">{caption}</p>
              </div>

              <div className="relative aspect-video bg-[#13161B] overflow-hidden flex items-end p-4">
                <img
                  src={STUDIO_IMAGES.coverAfro}
                  alt="Facebook creator video stage"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover opacity-70"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="relative z-10 w-full flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-mono text-amber-400">{trackTitle} · {studioBpm} BPM</div>
                    <div className="flex items-end gap-1 h-5 mt-1">
                      {eqBars.slice(0, 10).map((h, i) => (
                        <span
                          key={i}
                          className="w-1.5 rounded-full bg-amber-400 transition-all duration-75"
                          style={{ height: isPlayingPreview ? `${Math.max(20, h)}%` : '30%' }}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => playSocialGroove(audioStyle, null)}
                    className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    {isPlayingPreview ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPlayingPreview ? 'Pause' : 'Play Mix'}</span>
                  </button>
                </div>
              </div>

              <div className="px-3.5 py-2.5 border-t border-[#232833] flex items-center justify-between text-xs bg-[#101318]">
                <div className="flex items-center gap-2">
                  {(
                    [
                      { key: 'like', label: 'Like' },
                      { key: 'love', label: 'Love' },
                      { key: 'fire', label: 'Fire' },
                    ] as const
                  ).map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        setFbUserReacted(r.key);
                        setFbReactions((prev) => ({ ...prev, [r.key]: prev[r.key] + 1 }));
                      }}
                      className={`px-2.5 py-1 rounded flex items-center gap-1 transition-colors ${
                        fbUserReacted === r.key
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'bg-[#1B2028] text-slate-300 hover:text-amber-400'
                      }`}
                    >
                      <ThumbsUp className="w-3 h-3" />
                      <span>{r.label}</span>
                      <span className="font-mono text-[11px]">{fbReactions[r.key]}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="text-slate-400 hover:text-slate-100 flex items-center gap-1"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>
              </div>
            </div>
          )}

          {/* 5. YOUTUBE IN-APP STUDIO SIMULATOR */}
          {selectedPlatform === 'youtube' && (
            <div className="rounded-xl overflow-hidden bg-[#0B0D10] border border-[#2A313E] flex flex-col">
              <div className="p-3.5 flex items-center justify-between border-b border-[#232833] bg-[#101318]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                    <Youtube className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-100">{activeYtName}</div>
                    <div className="text-[11px] text-slate-400">
                      {ytFormat === 'shorts' ? 'YouTube Shorts Cut' : 'Official Music Video Premiere'} · {studioBpm} BPM
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSupportCreator?.(activeYtName)}
                  className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-[11px] font-semibold flex items-center gap-1"
                >
                  <CupSoda className="w-3 h-3" />
                  <span>BuymeSoda</span>
                </button>
              </div>

              <div className="relative aspect-video bg-[#13161B] overflow-hidden flex items-end p-4">
                <img
                  src={STUDIO_IMAGES.coverSynth}
                  alt="YouTube studio stage"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover opacity-70"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="relative z-10 w-full flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-rose-400">
                      YOUTUBE STUDIO · {ytFormat === 'shorts' ? 'SHORTS' : 'HD PREMIERE'}
                    </div>
                    <div className="text-sm font-semibold text-white truncate">{headline}</div>
                    <div className="flex items-end gap-1 h-4 mt-1">
                      {eqBars.slice(0, 10).map((h, i) => (
                        <span
                          key={i}
                          className="w-1.5 rounded-full bg-rose-400 transition-all duration-75"
                          style={{ height: isPlayingPreview ? `${Math.max(20, h)}%` : '30%' }}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => playSocialGroove(audioStyle, null)}
                    className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    {isPlayingPreview ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPlayingPreview ? 'Pause' : 'Play Mix'}</span>
                  </button>
                </div>
              </div>

              <div className="p-3.5 text-xs text-slate-300 space-y-2 border-t border-[#232833] bg-[#101318]">
                <p className="text-slate-400 line-clamp-2">{caption}</p>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setYtLiked((prev) => {
                        setYtLikes((n) => (prev ? n - 1 : n + 1));
                        return !prev;
                      });
                    }}
                    className={`px-3 py-1 rounded flex items-center gap-1.5 text-xs transition-colors ${
                      ytLiked
                        ? 'bg-rose-500 text-white font-semibold'
                        : 'bg-[#1B2028] text-slate-300 hover:text-rose-400'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span className="font-mono">{ytLikes.toLocaleString()}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="text-slate-400 hover:text-slate-100 flex items-center gap-1"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share Video</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Two-Way Omnichannel Inbox, Call Console & Admin Monitor */}
      <OmnichannelAdminDesk
        user={user}
        whatsappPhone={waNumber}
        handles={{
          instagram: activeIgName,
          tiktok: activeTtName,
          whatsapp: waNumber || 'WhatsApp VIP',
          facebook: activeFbName,
          youtube: activeYtName,
        }}
        onNotify={(msg) => setFeedback(msg)}
      />

      {/* Live Community Activity Feed: Interactions, Shared Tracks & Project Milestones */}
      <CommunityActivityFeed
        user={user}
        profile={profile}
        projects={projects}
        creators={creators}
        activeTrackTitle={trackTitle}
        studioBpm={studioBpm}
        playingItemId={playingMessageId}
        onToggleAudio={(itemId, style) => playSocialGroove(style, itemId)}
        onLoadTrackIntoStudio={({ trackTitle: nextTitle, headline: nextHeadline, caption: nextCaption }) => {
          setTrackTitle(nextTitle);
          setHeadline(nextHeadline);
          setCaption(nextCaption);
          const el = document.getElementById('social-live-stage');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }}
        onSupportCreator={onSupportCreator}
        onOpenAuth={onOpenAuth}
        externalPostedTrigger={activityTrigger}
      />

      {/* Social Reach, Engagement & Follower Growth Stats Dashboard */}
      <SocialStatsDashboard
        user={user}
        privateInfo={privateInfo}
        socialSyncConfig={socialSyncConfig}
        activeTrackTitle={trackTitle}
      />

      {/* Dynamic Embedded Social Feed (Instagram, TikTok, YouTube, Facebook & WhatsApp) */}
      <EmbeddedSocialFeed
        igHandle={activeIgName}
        tiktokHandle={activeTtName}
        waNumber={waNumber.trim() || 'Street Team VIP'}
        fbPage={activeFbName}
        ytChannel={activeYtName}
        trackTitle={trackTitle}
        studioBpm={studioBpm}
        campaigns={campaigns}
        playingItemId={playingMessageId}
        onToggleAudio={(itemId: string, style: FeedGrooveStyle) => playSocialGroove(style, itemId)}
        onLoadIntoStudio={(item) => {
          setSelectedPlatform(item.platform);
          setHeadline(item.headline);
          setCaption(item.caption);
          setTrackTitle(item.trackTitle);
          const el = document.getElementById('social-live-stage');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }}
        onTwoWayReply={(platform, itemTitle, replyText) => {
          setFeedback(`Two-way reply synced to ${platform.toUpperCase()}.`);
          if (user) {
            void createSocialOmnichannelEvent(user.uid, {
              platform,
              eventType: platform === 'whatsapp' ? 'message' : 'comment',
              direction: 'outbound',
              authorName: profile?.displayName || user.displayName || 'Studio Creator',
              authorHandle:
                platform === 'youtube'
                  ? activeYtName
                  : platform === 'facebook'
                  ? activeFbName
                  : platform === 'tiktok'
                  ? activeTtName
                  : activeIgName,
              title: `Reply on: ${itemTitle}`,
              body: replyText,
              status: 'synced',
              isPublic: platform !== 'whatsapp',
            });
          }
        }}
        onSupportCreator={onSupportCreator}
      />

      {/* Live In-App Social Feed & Saved Campaigns */}
      <div className="rounded-xl bg-[#13161B] border border-[#232833] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-100">
              In-App Published Drops &amp; Saved Campaigns ({publishedFeed.length + campaigns.length})
            </h3>
            <p className="text-xs text-slate-400">
              Click any card to reload it directly into the live Instagram, TikTok, WhatsApp, or Facebook studio above.
            </p>
          </div>
        </div>

        {publishedFeed.length === 0 && campaigns.length === 0 ? (
          <p className="text-xs text-slate-500">
            No drops published yet. Hit &ldquo;Publish to IG Studio Feed&rdquo;, &ldquo;Post to TikTok Sound Feed&rdquo;, or &ldquo;Send Broadcast in Chat&rdquo; to see your drops come alive here.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {publishedFeed.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.platform !== 'soundcloud') {
                    setSelectedPlatform(item.platform);
                  }
                  setHeadline(item.headline);
                  setCaption(item.caption);
                  setTrackTitle(item.trackTitle);
                }}
                className="text-left p-3.5 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] border border-amber-500/30 transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-amber-400 uppercase">
                    {item.platform} · {item.syncedViaAutoPublish ? 'Auto-Synced' : 'Live'}
                  </span>
                  <span className="text-slate-400">{item.timestamp}</span>
                </div>
                <div className="text-xs font-semibold text-slate-100 truncate">{item.headline}</div>
                <div className="text-[11px] text-slate-400 line-clamp-2">{item.caption}</div>
                <div className="text-[11px] font-mono text-emerald-400 pt-1">
                  ♫ {item.trackTitle} · {item.likes.toLocaleString()} reactions
                </div>
              </button>
            ))}

            {campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedPlatform(c.platform);
                  setHeadline(c.headline);
                  setCaption(c.caption);
                  if (c.trackTitle) setTrackTitle(c.trackTitle);
                }}
                className="text-left p-3.5 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] border border-[#232833] transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span className="uppercase text-amber-400">{c.platform}</span>
                  <span className="truncate max-w-[140px]">{c.trackTitle || 'Session'}</span>
                </div>
                <div className="text-xs font-medium text-slate-100 truncate">{c.headline}</div>
                <div className="text-[11px] text-slate-400 line-clamp-2">{c.caption}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <SocialSyncModal
        isOpen={socialSyncOpen}
        onClose={() => setSocialSyncOpen(false)}
        isSignedIn={Boolean(user)}
        config={socialSyncConfig}
        handles={{
          instagramHandle: igHandle,
          tiktokHandle: tiktokHandle,
          facebookPage: fbPage,
          whatsappNumber: waNumber,
          youtubeChannel: ytChannel,
        }}
        saving={savingSyncConfig}
        onSave={handleSaveSocialSync}
        onOpenAuth={onOpenAuth}
      />
    </div>
  );
}
