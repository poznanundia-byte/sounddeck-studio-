import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  CupSoda,
  UserCircle2,
  Music,
  Disc3,
  Box,
  Clock4,
  Smartphone,
  Tablet,
  Laptop,
  Monitor,
  Users,
  SlidersHorizontal,
  Compass,
  HardDrive,
  Search,
} from 'lucide-react';
import {
  auth,
  getCreatorProfile,
  getPrivateInfo,
  getLocalProfileBackup,
  resolveGoogleRedirectSignIn,
  subscribeUserProjects,
  subscribeUserCampaigns,
  subscribePublicCreators,
  subscribeMySodaSupports,
  subscribeUserPadAssignments,
  savePadSampleAssignment,
  removePadSampleAssignment,
  type CreatorProfile,
  type CreatorPrivateInfo,
  type SavedMusicProject,
  type SavedSocialCampaign,
  type SodaSupportRecord,
  type PadSampleAssignment,
} from './firebase';
import {
  type DrumPadId,
  type BeatSignature,
  BEAT_SIGNATURE_CONFIG,
  getAudioContext,
  getStudioMasterNode,
  triggerMetronomeClick,
  renderDiscoverSampleSlice,
  renderGrooveBuffer,
  audioBufferToWavBlob,
  sliceAudioBuffer,
  encodeAudioBufferSliceToBase64Wav,
  decodeBase64WavToBuffer,
} from './audio/studioAudio';
import { DISCOVER_CATALOG_TRACKS, type DiscoverCatalogTrack } from './audio/discoverCatalog';
import { getOfflineAudioBlob } from './audio/offlineLibraryDb';
import {
  type GlobalSearchTrack,
  type YoutubeMatchItem,
  type PersistentPlayerState,
  type RepeatMode,
} from './types/discoverPlayer';
import { AuthModal } from './components/AuthModal';
import { BuyMeSodaModal } from './components/BuyMeSodaModal';
import {
  PWAInstallButton,
  PWAInstallBanner,
  triggerAppLauncherDownload,
  cacheStudioOfflineAssets,
} from './components/PWAInstallButton';
import { DeviceInstallerModal } from './components/DeviceInstallerModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { MusicCreationTab } from './components/tabs/MusicCreationTab';
import { OfflineLibraryTab } from './components/tabs/OfflineLibraryTab';
import { StudioChatBot } from './components/StudioChatBot';
import { PersistentAudioPlayer } from './components/PersistentAudioPlayer';
import { preloadRecaptchaScript } from './services/recaptchaSecurity';
import { checkBackendAvailability, safeApiFetch } from './services/apiClient';
import { STUDIO_IMAGES, resolvePublicAsset } from './assets/studioAssets';
import { StudioCommandPalette } from './components/StudioCommandPalette';
import { useDeviceProfile } from './hooks/useDeviceProfile';
import { usePWAInstall } from './hooks/usePWAInstall';

const SocialHubTab = lazy(() =>
  import('./components/tabs/SocialHubTab').then((m) => ({ default: m.SocialHubTab }))
);
const DawTab = lazy(() =>
  import('./components/tabs/DawTab').then((m) => ({ default: m.DawTab }))
);
const VirtualDjTab = lazy(() =>
  import('./components/tabs/VirtualDjTab').then((m) => ({ default: m.VirtualDjTab }))
);
const DiscoverTab = lazy(() =>
  import('./components/tabs/DiscoverTab').then((m) => ({ default: m.DiscoverTab }))
);
const StudioStage3D = lazy(() =>
  import('./components/StudioStage3D').then((m) => ({ default: m.StudioStage3D }))
);

type TabId = 'social' | 'creation' | 'daw' | 'vdj' | 'discover' | 'offline';

const TABS: { id: TabId; label: string }[] = [
  { id: 'social', label: 'Social Hub' },
  { id: 'creation', label: 'Music Creation' },
  { id: 'daw', label: 'DAW' },
  { id: 'vdj', label: 'Virtual DJ' },
  { id: 'discover', label: 'Discover' },
  { id: 'offline', label: 'Offline Library' },
];

const HERO_IMG = STUDIO_IMAGES.heroBackdrop;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('creation');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sodaModalOpen, setSodaModalOpen] = useState(false);
  const [sodaRecipient, setSodaRecipient] = useState<{
    handle: string;
    name: string;
    role: 'artist' | 'creator' | 'dj' | 'owner';
  }>({
    handle: 'sounddeck-owner',
    name: 'Webapp Owner',
    role: 'owner',
  });

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<CreatorPrivateInfo | null>(null);
  const [projects, setProjects] = useState<SavedMusicProject[]>([]);
  const [campaigns, setCampaigns] = useState<SavedSocialCampaign[]>([]);
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [mySodaSupports, setMySodaSupports] = useState<SodaSupportRecord[]>([]);
  const [padAssignments, setPadAssignments] = useState<PadSampleAssignment[]>([]);
  const [padSampleBuffers, setPadSampleBuffers] = useState<Partial<Record<DrumPadId, AudioBuffer>>>({});
  const [discoverCustomSamples, setDiscoverCustomSamples] = useState<
    { id: string; title: string; buffer: AudioBuffer }[]
  >([]);
  const [activeTrackTitle, setActiveTrackTitle] = useState('Midnight Studio Loop');
  const [studioBpm, setStudioBpm] = useState(112);
  const [stage3DOpen, setStage3DOpen] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [beatSignature, setBeatSignature] = useState<BeatSignature>('4/4');
  const [metronomeBeat, setMetronomeBeat] = useState(0);
  const [metronomePulse, setMetronomePulse] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [tapFlash, setTapFlash] = useState(false);
  const [persistentPlayer, setPersistentPlayer] = useState<PersistentPlayerState | null>(null);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [shuffleOn, setShuffleOn] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(30);
  const [playerIsPlaying, setPlayerIsPlaying] = useState(false);
  const [seekRequest, setSeekRequest] = useState<{ timeSec: number; nonce: number } | null>(null);
  const [karaokeMode, setKaraokeMode] = useState(false);

  const deviceProfile = useDeviceProfile();
  const pwaInstall = usePWAInstall();
  const [deviceInstallerOpen, setDeviceInstallerOpen] = useState(false);
  const [deviceInstallerView, setDeviceInstallerView] = useState<'about' | 'wireless' | 'adaptive'>('about');
  const [incomingPairCode, setIncomingPairCode] = useState<string | null>(null);
  const [downloadedNotice, setDownloadedNotice] = useState<string | null>(null);
  const isMobileAppLayout = deviceProfile.layoutMode === 'mobile-app';
  const studioBpmRef = useRef(112);
  const tapTimestampsRef = useRef<number[]>([]);
  const tapResetTimerRef = useRef<number | null>(null);
  const catalogBlobUrlRef = useRef<string | null>(null);
  const offlineBlobUrlRef = useRef<string | null>(null);
  const persistentPlayerRef = useRef<PersistentPlayerState | null>(null);
  const repeatModeRef = useRef<RepeatMode>('off');
  const shuffleOnRef = useRef<boolean>(false);
  const playNonceCounterRef = useRef(1);
  studioBpmRef.current = studioBpm;
  persistentPlayerRef.current = persistentPlayer;
  repeatModeRef.current = repeatMode;
  shuffleOnRef.current = shuffleOn;

  useEffect(() => {
    return () => {
      if (catalogBlobUrlRef.current) {
        URL.revokeObjectURL(catalogBlobUrlRef.current);
      }
      if (offlineBlobUrlRef.current) {
        URL.revokeObjectURL(offlineBlobUrlRef.current);
      }
    };
  }, []);

  type QueueContextArg = {
    queue: GlobalSearchTrack[];
    queueIndex: number;
    queueLabel?: string;
    playNonce?: number;
  };

  const hydrateYoutubeVersionsForTrack = async (track: GlobalSearchTrack) => {
    try {
      const q = `${track.artist} ${track.title}`.trim();
      const res = await safeApiFetch<{ versions?: YoutubeMatchItem[] }>(
        `/api/discover/full-track?q=${encodeURIComponent(q)}`
      );
      const versions = res.ok && res.data?.versions ? res.data.versions : [];
      if (versions.length > 0) {
        setPersistentPlayer((prev) =>
          prev && prev.track.id === track.id
            ? {
                ...prev,
                youtubeVersions: versions,
                activeYoutubeVideoId: prev.activeYoutubeVideoId || versions[0]?.videoId || null,
                loadingFullStream: false,
              }
            : prev
        );
      } else {
        setPersistentPlayer((prev) =>
          prev && prev.track.id === track.id ? { ...prev, loadingFullStream: false } : prev
        );
      }
    } catch {
      setPersistentPlayer((prev) =>
        prev && prev.track.id === track.id ? { ...prev, loadingFullStream: false } : prev
      );
    }
  };

  const resolveAndPlayFullStream = async (
    track: GlobalSearchTrack,
    cachedVersions?: YoutubeMatchItem[],
    queueContext?: QueueContextArg
  ) => {
    const queueFields = queueContext
      ? {
          queue: queueContext.queue,
          queueIndex: queueContext.queueIndex,
          queueLabel: queueContext.queueLabel,
          playNonce: queueContext.playNonce ?? playNonceCounterRef.current,
        }
      : { playNonce: playNonceCounterRef.current };

    const scPermalink = track.soundcloudPermalink || null;

    if (track.source === 'soundcloud' && scPermalink) {
      setPersistentPlayer({
        track,
        mode: 'full',
        youtubeVersions: cachedVersions || [],
        activeYoutubeVideoId: track.youtubeVideoId || cachedVersions?.[0]?.videoId || null,
        activeSoundCloudPermalink: scPermalink,
        activeStreamProvider: 'soundcloud',
        loadingFullStream: Boolean(track.soundcloudTrackId),
        ...queueFields,
      });

      if (!cachedVersions?.length) {
        void hydrateYoutubeVersionsForTrack(track);
      }

      if (track.soundcloudTrackId) {
        try {
          const res = await safeApiFetch<{ streamUrl?: string | null }>(
            `/api/discover/soundcloud-stream?trackId=${encodeURIComponent(
              String(track.soundcloudTrackId)
            )}`
          );
          const streamUrl = res.ok ? res.data?.streamUrl : null;
          setPersistentPlayer((prev) => {
            if (!prev || prev.track.id !== track.id) return prev;
            if (streamUrl) {
              return {
                ...prev,
                track: { ...prev.track, fullAudioUrl: streamUrl },
                activeSoundCloudPermalink: scPermalink,
                loadingFullStream: false,
              };
            }
            return { ...prev, loadingFullStream: false };
          });
        } catch {
          setPersistentPlayer((prev) =>
            prev && prev.track.id === track.id ? { ...prev, loadingFullStream: false } : prev
          );
        }
      }
      return;
    }

    if (track.youtubeVideoId) {
      setPersistentPlayer({
        track,
        mode: 'full',
        youtubeVersions: cachedVersions || [],
        activeYoutubeVideoId: track.youtubeVideoId,
        activeSoundCloudPermalink: scPermalink,
        activeStreamProvider: 'youtube',
        loadingFullStream: false,
        ...queueFields,
      });
      if (!cachedVersions?.length) {
        void hydrateYoutubeVersionsForTrack(track);
      }
      return;
    }

    setPersistentPlayer({
      track,
      mode: 'full',
      youtubeVersions: cachedVersions || [],
      activeYoutubeVideoId: cachedVersions?.[0]?.videoId || null,
      activeSoundCloudPermalink: scPermalink,
      activeStreamProvider: cachedVersions?.[0]?.videoId ? 'youtube' : scPermalink ? 'soundcloud' : 'youtube',
      loadingFullStream: true,
      ...queueFields,
    });

    await hydrateYoutubeVersionsForTrack(track);
  };

  const handlePlayDiscoverTrack = async (
    rawTrack: GlobalSearchTrack,
    requestedMode: 'preview' | 'full',
    cachedVersions?: YoutubeMatchItem[],
    queueContext?: QueueContextArg
  ) => {
    const nextNonce = queueContext?.playNonce ?? ++playNonceCounterRef.current;
    let track = rawTrack;

    // Prefer cached offline IndexedDB audio Blob when playing from Offline Library, offline, or without URL
    const isOfflineNow = typeof navigator !== 'undefined' && !navigator.onLine;
    if (
      queueContext?.queueLabel === 'Offline Library' ||
      isOfflineNow ||
      (!track.fullAudioUrl && !track.previewUrl && !track.youtubeVideoId && !track.soundcloudPermalink)
    ) {
      const cachedBlob = await getOfflineAudioBlob(track.id);
      if (cachedBlob) {
        if (offlineBlobUrlRef.current) {
          URL.revokeObjectURL(offlineBlobUrlRef.current);
        }
        const blobUrl = URL.createObjectURL(cachedBlob);
        offlineBlobUrlRef.current = blobUrl;
        track = {
          ...track,
          fullAudioUrl: blobUrl,
          previewUrl: blobUrl,
          youtubeVideoId: undefined,
          soundcloudPermalink: undefined,
        };
      }
    }

    const effectiveMode: 'preview' | 'full' =
      requestedMode === 'preview' && !track.previewUrl && !track.fullAudioUrl
        ? 'full'
        : requestedMode;

    const queueFields = queueContext
      ? {
          queue: queueContext.queue,
          queueIndex: queueContext.queueIndex,
          queueLabel: queueContext.queueLabel,
          playNonce: nextNonce,
        }
      : { playNonce: nextNonce };

    if (effectiveMode === 'preview' || track.fullAudioUrl) {
      setPersistentPlayer({
        track,
        mode: effectiveMode,
        youtubeVersions: cachedVersions || [],
        activeYoutubeVideoId: track.youtubeVideoId || cachedVersions?.[0]?.videoId || null,
        activeSoundCloudPermalink: track.soundcloudPermalink || null,
        activeStreamProvider: 'audio',
        loadingFullStream: false,
        ...queueFields,
      });
      if (effectiveMode === 'full' && track.source !== 'catalog' && !cachedVersions?.length) {
        void hydrateYoutubeVersionsForTrack(track);
      }
      return;
    }

    resolveAndPlayFullStream(track, cachedVersions, {
      queue: queueContext?.queue || [track],
      queueIndex: queueContext?.queueIndex ?? 0,
      queueLabel: queueContext?.queueLabel,
      playNonce: nextNonce,
    });
  };

  const handlePlayCatalogTrack = async (
    catalogTrack: DiscoverCatalogTrack,
    queueContext?: QueueContextArg
  ) => {
    const nextNonce = queueContext?.playNonce ?? ++playNonceCounterRef.current;
    const buf = await renderGrooveBuffer(catalogTrack.grooveStyle, catalogTrack.bpm, 4);
    const wavBlob = audioBufferToWavBlob(buf);
    if (catalogBlobUrlRef.current) {
      URL.revokeObjectURL(catalogBlobUrlRef.current);
    }
    const blobUrl = URL.createObjectURL(wavBlob);
    catalogBlobUrlRef.current = blobUrl;

    const syntheticTrack: GlobalSearchTrack = {
      id: catalogTrack.id,
      title: catalogTrack.title,
      artist: catalogTrack.artist,
      album: `${catalogTrack.genre} · ${catalogTrack.bpm} BPM`,
      genre: catalogTrack.genre,
      durationSec: Math.round(buf.duration),
      coverUrl: catalogTrack.coverUrl,
      previewUrl: blobUrl,
      source: 'catalog',
      score: 100,
    };

    const defaultCatalogQueue: GlobalSearchTrack[] = DISCOVER_CATALOG_TRACKS.map((c) => ({
      id: c.id,
      title: c.title,
      artist: c.artist,
      album: `${c.genre} · ${c.bpm} BPM`,
      genre: c.genre,
      durationSec: 16,
      coverUrl: c.coverUrl,
      previewUrl: c.id === catalogTrack.id ? blobUrl : '',
      source: 'catalog',
      score: 100,
    }));
    const defaultIndex = DISCOVER_CATALOG_TRACKS.findIndex((c) => c.id === catalogTrack.id);

    setPersistentPlayer({
      track: syntheticTrack,
      mode: 'preview',
      youtubeVersions: [],
      activeYoutubeVideoId: null,
      loadingFullStream: false,
      queue: queueContext?.queue || defaultCatalogQueue,
      queueIndex: queueContext?.queueIndex ?? (defaultIndex >= 0 ? defaultIndex : 0),
      queueLabel: queueContext?.queueLabel || 'Creator Releases',
      playNonce: nextNonce,
    });
  };

  const playQueueTrackAtIndex = (nextIndex: number) => {
    const current = persistentPlayerRef.current;
    if (!current?.queue || nextIndex < 0 || nextIndex >= current.queue.length) return;
    const target = current.queue[nextIndex];
    const nextNonce = ++playNonceCounterRef.current;
    const queueCtx: QueueContextArg = {
      queue: current.queue,
      queueIndex: nextIndex,
      queueLabel: current.queueLabel,
      playNonce: nextNonce,
    };

    if (target.source === 'catalog') {
      const cat = DISCOVER_CATALOG_TRACKS.find((c) => c.id === target.id);
      if (cat) {
        handlePlayCatalogTrack(cat, queueCtx);
        return;
      }
    }

    handlePlayDiscoverTrack(
      target,
      current.queueLabel === 'Offline Library' ? 'full' : current.mode,
      undefined,
      queueCtx
    );
  };

  const handleNextTrack = (isAutoAdvance = false) => {
    const current = persistentPlayerRef.current;
    if (!current) return;
    const queue = current.queue || [];
    const currentIndex = current.queueIndex ?? 0;
    const activeRepeat = repeatModeRef.current;
    const isShuffle = shuffleOnRef.current;

    if (isAutoAdvance && activeRepeat === 'one') {
      const replayNonce = ++playNonceCounterRef.current;
      setPersistentPlayer((prev) => (prev ? { ...prev, playNonce: replayNonce } : prev));
      return;
    }

    if (queue.length === 0) return;

    if (queue.length === 1) {
      if (activeRepeat === 'all' || activeRepeat === 'one') {
        const replayNonce = ++playNonceCounterRef.current;
        setPersistentPlayer((prev) => (prev ? { ...prev, playNonce: replayNonce } : prev));
      }
      return;
    }

    let nextIdx: number | null = null;
    if (isShuffle) {
      const candidates = queue
        .map((_, idx) => idx)
        .filter((idx) => idx !== currentIndex);
      if (candidates.length > 0) {
        nextIdx = candidates[Math.floor(Math.random() * candidates.length)];
      }
    } else if (currentIndex + 1 < queue.length) {
      nextIdx = currentIndex + 1;
    } else if (activeRepeat === 'all') {
      nextIdx = 0;
    }

    if (nextIdx !== null) {
      playQueueTrackAtIndex(nextIdx);
    }
  };

  const handlePreviousTrack = () => {
    const current = persistentPlayerRef.current;
    if (!current?.queue || current.queue.length === 0) return;
    const currentIndex = current.queueIndex ?? 0;
    if (currentIndex > 0) {
      playQueueTrackAtIndex(currentIndex - 1);
    } else if (repeatModeRef.current === 'all') {
      playQueueTrackAtIndex(current.queue.length - 1);
    } else {
      const replayNonce = ++playNonceCounterRef.current;
      setPersistentPlayer((prev) => (prev ? { ...prev, playNonce: replayNonce } : prev));
    }
  };

  const handleTapTempo = () => {
    const now = performance.now();
    const prevTaps = tapTimestampsRef.current;
    const isFreshSequence = prevTaps.length > 0 && now - prevTaps[prevTaps.length - 1] > 2000;
    const nextTaps = isFreshSequence ? [now] : [...prevTaps, now].slice(-4);
    tapTimestampsRef.current = nextTaps;
    setTapCount(nextTaps.length);

    if (nextTaps.length >= 2) {
      const totalElapsedMs = nextTaps[nextTaps.length - 1] - nextTaps[0];
      const avgIntervalMs = totalElapsedMs / (nextTaps.length - 1);
      if (avgIntervalMs > 0) {
        const computedBpm = Math.round(60000 / avgIntervalMs);
        const clampedBpm = Math.max(40, Math.min(240, computedBpm));
        setStudioBpm(clampedBpm);
      }
    }

    setTapFlash(true);
    window.setTimeout(() => setTapFlash(false), 110);

    if (tapResetTimerRef.current) {
      window.clearTimeout(tapResetTimerRef.current);
    }
    tapResetTimerRef.current = window.setTimeout(() => {
      tapTimestampsRef.current = [];
      setTapCount(0);
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (tapResetTimerRef.current) {
        window.clearTimeout(tapResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!metronomeOn) {
      setMetronomeBeat(0);
      setMetronomePulse(false);
      return;
    }

    const { beatsPerMeasure, subdivisionFactor } = BEAT_SIGNATURE_CONFIG[beatSignature];
    const ctx = getAudioContext();
    const masterDest = getStudioMasterNode(ctx);
    let nextNoteTime = ctx.currentTime + 0.04;
    let beatIndex = 0;
    const lookaheadMs = 25;
    const scheduleAheadSec = 0.1;
    const uiTimers: number[] = [];

    const scheduler = window.setInterval(() => {
      const currentBpm = Math.max(40, Math.min(240, studioBpmRef.current || 112));
      const secondsPerBeat = (60 / currentBpm) * subdivisionFactor;

      while (nextNoteTime < ctx.currentTime + scheduleAheadSec) {
        const beatInBar = beatIndex % beatsPerMeasure;
        const isFirstBeat = beatInBar === 0;
        triggerMetronomeClick(ctx, masterDest, nextNoteTime, isFirstBeat, 0.55);

        const delayMs = Math.max(0, (nextNoteTime - ctx.currentTime) * 1000);
        const capturedBeat = beatInBar + 1;
        const pulseMs = Math.min(130, Math.max(55, Math.round(secondsPerBeat * 320)));
        const tId = window.setTimeout(() => {
          setMetronomeBeat(capturedBeat);
          setMetronomePulse(true);
          const offId = window.setTimeout(() => {
            setMetronomePulse(false);
          }, pulseMs);
          uiTimers.push(offId);
        }, delayMs);
        uiTimers.push(tId);

        nextNoteTime += secondsPerBeat;
        beatIndex += 1;
      }
    }, lookaheadMs);

    return () => {
      window.clearInterval(scheduler);
      uiTimers.forEach((id) => window.clearTimeout(id));
    };
  }, [metronomeOn, beatSignature]);

  const refreshProfileData = async (uid: string) => {
    try {
      const [prof, priv] = await Promise.all([getCreatorProfile(uid), getPrivateInfo(uid)]);
      setProfile(prof ?? getLocalProfileBackup(uid));
      setPrivateInfo(priv);
    } catch {
      const fallback = getLocalProfileBackup(uid);
      if (fallback) setProfile(fallback);
    }
  };

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        refreshProfileData(currentUser.uid);
      } else {
        setProfile(null);
        setPrivateInfo(null);
        setProjects([]);
        setCampaigns([]);
        setCreators([]);
        setMySodaSupports([]);
        setPadAssignments([]);
        setPadSampleBuffers({});
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    preloadRecaptchaScript();
    void checkBackendAvailability();
    void resolveGoogleRedirectSignIn().then((redirectUser) => {
      if (redirectUser) {
        refreshProfileData(redirectUser.uid);
      }
    });
  }, []);

  // Global Ctrl+K / Cmd+K Command Palette shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Auto-connect if launched via online wireless pairing QR/link (?pair=SDXXXX)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const pairParam = params.get('pair')?.trim().toUpperCase();
    if (!pairParam) return;

    setIncomingPairCode(pairParam);
    setDeviceInstallerView('about');
    setDeviceInstallerOpen(true);

    void safeApiFetch(`/api/device-pair/${encodeURIComponent(pairParam)}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: deviceProfile.deviceCategory,
        osName: deviceProfile.osName,
        browserName: deviceProfile.browserName,
        viewport: deviceProfile.viewportLabel,
      }),
    });
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    const unsubProj = subscribeUserProjects(user.uid, setProjects);
    const unsubCamp = subscribeUserCampaigns(user.uid, setCampaigns);
    const unsubCreators = subscribePublicCreators(setCreators);
    const unsubSoda = subscribeMySodaSupports(user.uid, setMySodaSupports);
    const unsubPads = subscribeUserPadAssignments(user.uid, setPadAssignments);
    return () => {
      unsubProj();
      unsubCamp();
      unsubCreators();
      unsubSoda();
      unsubPads();
    };
  }, [authReady, user]);

  // Hydrate AudioBuffers whenever Firestore padAssignments sync
  useEffect(() => {
    let cancelled = false;
    async function hydrateBuffers() {
      const nextMap: Partial<Record<DrumPadId, AudioBuffer>> = {};
      const ctx = getAudioContext();
      await Promise.all(
        padAssignments.map(async (item) => {
          try {
            if (item.sourceType === 'custom_audio' && item.audioBase64) {
              nextMap[item.padId as DrumPadId] = await decodeBase64WavToBuffer(ctx, item.audioBase64);
            } else {
              nextMap[item.padId as DrumPadId] = await renderDiscoverSampleSlice(
                item.grooveStyle,
                item.bpm,
                item.sliceStartSec,
                item.sliceDurationSec
              );
            }
          } catch {
            // Skip malformed buffer without crashing hydration
          }
        })
      );
      if (!cancelled) {
        setPadSampleBuffers(nextMap);
      }
    }
    hydrateBuffers();
    return () => {
      cancelled = true;
    };
  }, [padAssignments]);

  const handleAssignSampleToPad = async (params: {
    padId: DrumPadId;
    sampleName: string;
    sourceType: 'catalog' | 'custom_audio';
    sourceTrackId: string;
    grooveStyle: 'afro' | 'house' | 'trap';
    bpm: number;
    sliceStartSec: number;
    sliceDurationSec: number;
    rawBuffer?: AudioBuffer;
  }): Promise<{ savedToCloud: boolean }> => {
    let hydratedBuffer: AudioBuffer;
    let audioBase64: string | undefined;

    if (params.sourceType === 'custom_audio' && params.rawBuffer) {
      hydratedBuffer = await sliceAudioBuffer(
        params.rawBuffer,
        params.sliceStartSec,
        params.sliceDurationSec
      );
      audioBase64 = await encodeAudioBufferSliceToBase64Wav(
        params.rawBuffer,
        params.sliceStartSec,
        Math.min(1.8, params.sliceDurationSec)
      );
    } else {
      hydratedBuffer = await renderDiscoverSampleSlice(
        params.grooveStyle,
        params.bpm,
        params.sliceStartSec,
        params.sliceDurationSec
      );
    }

    setPadSampleBuffers((prev) => ({ ...prev, [params.padId]: hydratedBuffer }));

    if (user) {
      await savePadSampleAssignment(user.uid, {
        padId: params.padId,
        sampleName: params.sampleName,
        sourceType: params.sourceType,
        sourceTrackId: params.sourceTrackId,
        grooveStyle: params.grooveStyle,
        bpm: params.bpm,
        sliceStartSec: params.sliceStartSec,
        sliceDurationSec: params.sliceDurationSec,
        audioBase64,
      });
      return { savedToCloud: true };
    }

    // Session-local assignment when signed out
    setPadAssignments((prev) => {
      const filtered = prev.filter((a) => a.padId !== params.padId);
      return [
        {
          id: `local_${params.padId}`,
          ownerId: 'local',
          padId: params.padId,
          sampleName: params.sampleName,
          sourceType: params.sourceType,
          sourceTrackId: params.sourceTrackId,
          grooveStyle: params.grooveStyle,
          bpm: params.bpm,
          sliceStartSec: params.sliceStartSec,
          sliceDurationSec: params.sliceDurationSec,
          audioBase64,
        },
        ...filtered,
      ];
    });
    return { savedToCloud: false };
  };

  const handleRemovePadAssignment = async (padId: DrumPadId) => {
    setPadSampleBuffers((prev) => {
      const copy = { ...prev };
      delete copy[padId];
      return copy;
    });
    if (user) {
      await removePadSampleAssignment(user.uid, padId);
    } else {
      setPadAssignments((prev) => prev.filter((a) => a.padId !== padId));
    }
  };

  const openSodaSupport = (recipient?: {
    handle: string;
    name: string;
    role: 'artist' | 'creator' | 'dj' | 'owner';
  }) => {
    if (recipient) {
      setSodaRecipient(recipient);
    } else {
      setSodaRecipient({
        handle: 'sounddeck-owner',
        name: 'Webapp Owner',
        role: 'owner',
      });
    }
    setSodaModalOpen(true);
  };

  const openDeviceInstaller = (initialView: 'about' | 'wireless' | 'adaptive' = 'about') => {
    setDeviceInstallerView(initialView);
    setDeviceInstallerOpen(true);
  };

  const handleDownloadOfflinePackage = async () => {
    triggerAppLauncherDownload(deviceProfile.deviceCategory);
    await cacheStudioOfflineAssets();
    setDownloadedNotice(
      `SoundDeck Studio installed for ${deviceProfile.deviceCategory} with offline cache ready.`
    );
  };

  const ActiveDeviceIcon =
    deviceProfile.deviceCategory === 'phone'
      ? Smartphone
      : deviceProfile.deviceCategory === 'tablet'
      ? Tablet
      : deviceProfile.deviceCategory === 'laptop'
      ? Laptop
      : Monitor;

  const mobileTabs: { id: TabId; shortLabel: string; icon: typeof Music }[] = [
    { id: 'social', shortLabel: 'Social', icon: Users },
    { id: 'creation', shortLabel: 'Create', icon: Music },
    { id: 'daw', shortLabel: 'DAW', icon: SlidersHorizontal },
    { id: 'vdj', shortLabel: 'DJ', icon: Disc3 },
    { id: 'discover', shortLabel: 'Discover', icon: Compass },
    { id: 'offline', shortLabel: 'Offline', icon: HardDrive },
  ];

  return (
    <div
      data-device-class={deviceProfile.deviceCategory}
      data-device-layout={deviceProfile.layoutMode}
      className="min-h-screen bg-[#0B0D10] text-slate-100 flex flex-col"
    >
      {isMobileAppLayout ? (
        /* PHONE & TABLET: Native Mobile App Compact Top App Bar (56px sticky header) */
        <header className="sticky top-0 z-30 h-14 bg-[#0B0D10]/95 backdrop-blur-md border-b border-[#232833]">
          <div className="h-full max-w-5xl mx-auto px-3 sm:px-5 flex items-center justify-between gap-2">
            <a
              href="#music-page"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('creation');
              }}
              className="flex items-center gap-2 font-display text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 min-h-[44px]"
            >
              <img
                src={resolvePublicAsset('app-logo.png')}
                alt="SoundDeck Studio logo"
                className="w-8 h-8 rounded-lg object-cover border border-purple-500/40"
              />
              <span>SoundDeck</span>
            </a>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                aria-label="Open Studio Quick Commands"
                className="min-h-[40px] min-w-[40px] px-2 rounded-xl bg-[#13161B] hover:bg-[#1B2028] border border-[#232833] text-slate-300 flex items-center justify-center transition-colors"
              >
                <Search className="w-4 h-4 text-amber-400" />
              </button>
              <button
                type="button"
                onClick={() => setMetronomeOn((prev) => !prev)}
                aria-pressed={metronomeOn}
                aria-label={`Toggle metronome at ${studioBpm} BPM`}
                className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors tabular-nums ${
                  metronomeOn
                    ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                    : 'bg-[#13161B] border-[#232833] text-slate-300'
                }`}
              >
                <Clock4 className="w-3.5 h-3.5 text-amber-400" />
                <span>{studioBpm}</span>
              </button>

              <button
                type="button"
                onClick={() => openDeviceInstaller('about')}
                aria-label="Open wireless device installer and layout settings"
                className="min-h-[40px] px-2.5 rounded-xl bg-[#13161B] hover:bg-[#1B2028] border border-[#232833] text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <ActiveDeviceIcon className="w-3.5 h-3.5 text-amber-400" />
                <span className="capitalize">
                  {pwaInstall.isInstalled ? deviceProfile.deviceCategory : 'Install'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                aria-label={user ? 'Studio Profile' : 'Sign In'}
                className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <UserCircle2 className="w-4 h-4" />
                {deviceProfile.deviceCategory === 'tablet' && (
                  <span className="whitespace-nowrap">
                    {user ? profile?.displayName || 'Profile' : 'Sign In'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>
      ) : (
        /* DESKTOP & LAPTOP: Full 3-Zone Top Bar Contract (Preserved as-is) */
        <header className="sticky top-0 z-30 bg-[#0B0D10]/95 backdrop-blur-md border-b border-[#232833]">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 xl:gap-8">
            {/* Zone 1: Brand logo & wordmark */}
            <a
              href="#music-page"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('creation');
              }}
              className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
            >
              <img
                src={resolvePublicAsset('app-logo.png')}
                alt="SoundDeck Studio logo"
                className="w-8 h-8 rounded-lg object-cover border border-purple-500/40 shadow-sm"
              />
              <span>SoundDeck Studio</span>
            </a>

            {/* Zone 2: Concise single-line workspace tabs */}
            <nav className="hidden lg:flex items-center gap-4 xl:gap-6" aria-label="Music studio workspaces">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'border-amber-500 text-amber-400'
                        : 'border-transparent text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            {/* Zone 3: Global Metronome + Beat Signature + Tap Tempo + Primary Account CTA */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center rounded-lg border border-[#232833] bg-[#13161B] shrink-0">
                <button
                  type="button"
                  onClick={() => setMetronomeOn((prev) => !prev)}
                  aria-pressed={metronomeOn}
                  aria-label={`Toggle global metronome at ${studioBpm} BPM in ${beatSignature}`}
                  className={`px-2.5 sm:px-3 py-2 rounded-l-lg text-xs font-medium border flex items-center gap-1.5 transition-all duration-100 ease-out motion-reduce:transform-none whitespace-nowrap shrink-0 tabular-nums ${
                    metronomeOn
                      ? metronomePulse
                        ? metronomeBeat === 1
                          ? 'scale-110 bg-amber-500/30 border-amber-300 text-amber-100 shadow-[0_0_16px_rgba(245,158,11,0.38)]'
                          : 'scale-105 bg-amber-500/25 border-amber-400 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.22)]'
                        : 'scale-100 bg-amber-500/15 border-amber-500/50 text-amber-300'
                      : 'scale-100 bg-[#13161B] hover:bg-[#1B2028] border-transparent text-slate-300'
                  }`}
                >
                  <Clock4
                    className={`w-3.5 h-3.5 transition-transform duration-100 ${
                      metronomeOn
                        ? metronomePulse
                          ? 'text-amber-200 scale-115'
                          : 'text-amber-400 scale-100'
                        : 'text-slate-400 scale-100'
                    }`}
                  />
                  <span>
                    {metronomeOn
                      ? `Click ${metronomeBeat || 1}/${BEAT_SIGNATURE_CONFIG[beatSignature].beatsPerMeasure}`
                      : 'Click'}
                  </span>
                  <span className="font-mono text-[11px] opacity-80">{studioBpm} BPM</span>
                </button>

                <select
                  value={beatSignature}
                  onChange={(e) => setBeatSignature(e.target.value as BeatSignature)}
                  aria-label="Beat signature"
                  title="Change metronome beat signature"
                  className="px-2 py-2 bg-[#0F1217] hover:bg-[#1B2028] border-l border-[#232833] text-[11px] font-mono font-semibold text-amber-300 focus:outline-none focus:bg-[#1B2028] cursor-pointer shrink-0 tabular-nums"
                >
                  {(Object.keys(BEAT_SIGNATURE_CONFIG) as BeatSignature[]).map((sig) => (
                    <option key={sig} value={sig} className="bg-[#13161B] text-slate-100">
                      {sig}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleTapTempo}
                  aria-label="Tap tempo to set studio BPM from last 4 clicks"
                  title="Tap at a steady pace to set BPM from the last 4 clicks"
                  className={`px-2.5 py-2 rounded-r-lg border-l border-[#232833] text-[11px] font-mono font-semibold transition-all duration-100 whitespace-nowrap shrink-0 tabular-nums ${
                    tapFlash
                      ? 'bg-amber-500 text-slate-950 scale-95'
                      : tapCount > 0
                      ? 'bg-[#1B2028] text-amber-300 hover:bg-[#252B36]'
                      : 'bg-[#0F1217] text-slate-400 hover:text-slate-100 hover:bg-[#1B2028]'
                  }`}
                >
                  {tapCount > 0 ? `Tap ${tapCount}/4` : 'Tap'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <UserCircle2 className="w-4 h-4" />
                <span>
                  {user
                    ? profile?.displayName || user.displayName || 'Studio Profile'
                    : 'Register / Sign In'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                title="Open Quick Command Palette (Ctrl+K)"
                aria-label="Open Quick Command Palette"
                className="px-2.5 py-2 rounded-lg bg-[#13161B] hover:bg-[#1B2028] border border-[#232833] text-xs text-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Search className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xl:inline font-mono text-[11px] text-slate-400">⌘K</span>
              </button>

              <PWAInstallButton
                deviceProfile={deviceProfile}
                onOpenInstaller={() => openDeviceInstaller('about')}
              />
            </div>
          </div>

          {/* Narrow desktop fallback tab bar */}
          <nav
            className="lg:hidden flex items-center gap-2 px-4 py-2 border-t border-[#232833] overflow-x-auto"
            aria-label="Compact desktop navigation"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 bg-[#13161B]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>
      )}

      {/* Main Music Page Workspace */}
      <main
        id="music-page"
        className={`flex-1 w-full mx-auto ${
          isMobileAppLayout
            ? deviceProfile.deviceCategory === 'phone'
              ? 'px-3 pt-3 pb-28 space-y-4'
              : 'max-w-5xl px-5 pt-4 pb-28 space-y-5'
            : 'max-w-[1440px] px-4 sm:px-6 py-6 space-y-6'
        }`}
      >
        <PWAInstallBanner
          deviceProfile={deviceProfile}
          onOpenInstaller={(v) => openDeviceInstaller(v || 'about')}
        />

        {isMobileAppLayout ? (
          /* PHONE & TABLET: Touch-First Mobile App Hero Card */
          <section className="rounded-2xl overflow-hidden border border-[#232833] bg-[#13161B]">
            <div
              className={
                deviceProfile.deviceCategory === 'tablet'
                  ? 'grid grid-cols-12 items-stretch'
                  : 'flex flex-col'
              }
            >
              <div
                className={
                  deviceProfile.deviceCategory === 'tablet'
                    ? 'col-span-7 p-5 flex flex-col justify-between space-y-4'
                    : 'p-4 space-y-3.5'
                }
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-amber-400">
                    <span className="truncate">
                      {deviceProfile.deviceCategory === 'tablet'
                        ? 'TABLET APP STUDIO'
                        : 'MOBILE APP STUDIO'}{' '}
                      · {studioBpm} BPM
                    </span>
                    <button
                      type="button"
                      onClick={handleTapTempo}
                      className="px-2 py-0.5 rounded bg-[#0B0D10] border border-[#232833] text-amber-300 shrink-0"
                    >
                      {tapCount > 0 ? `Tap ${tapCount}/4` : 'Tap BPM'}
                    </button>
                  </div>
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-100 leading-tight">
                    {activeTrackTitle}
                  </h1>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openSodaSupport()}
                    className="min-h-[44px] px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <CupSoda className="w-4 h-4 shrink-0" />
                    <span>BuymeSoda</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('vdj')}
                    className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[#1B2028] hover:bg-[#252B36] text-slate-100 text-xs font-medium border border-[#2A313E] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Disc3 className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>DJ Console</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('creation')}
                    className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[#0B0D10] hover:bg-[#1B2028] text-slate-200 text-xs font-medium border border-[#232833] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Music className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Beat Pads</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage3DOpen(true)}
                    className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[#1B2028] hover:bg-[#252B36] text-amber-300 text-xs font-semibold border border-amber-500/40 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Box className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>3D Stage</span>
                  </button>
                </div>
              </div>

              {deviceProfile.deviceCategory === 'tablet' && (
                <div className="col-span-5 relative min-h-[180px] bg-[#0B0D10]">
                  <img
                    src={HERO_IMG}
                    alt="SoundDeck Studio mastering console"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover absolute inset-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#13161B] via-[#13161B]/35 to-transparent" />
                </div>
              )}
            </div>
          </section>
        ) : (
          /* DESKTOP & LAPTOP: Full Studio Hero & BuymeSoda Support Strip (Preserved as-is) */
          <section className="relative rounded-xl overflow-hidden border border-[#232833] bg-[#13161B]">
            <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-5">
                <div className="space-y-2">
                  <div className="text-xs font-mono text-amber-400">
                    {profile?.role ? `${profile.role.toUpperCase()} WORKSPACE` : 'MUSIC PAGE'} · 5 INTEGRATED STUDIOS
                  </div>
                  <h1 className="font-display text-2xl sm:text-4xl font-bold text-slate-100 leading-tight max-w-xl">
                    Produce, Remix, Spin, and Share Your Sound
                  </h1>
                  <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
                    Built for artists, content creators, and DJs — craft AI lyrics and beats, mix in the DAW and Virtual DJ booth, connect Social Hub &amp; Discover, and support creators via BuymeSoda.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openSodaSupport()}
                    className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <CupSoda className="w-4 h-4" />
                    <span>Support on BuymeSoda</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('vdj')}
                    className="px-4 py-2.5 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-slate-100 text-xs font-medium border border-[#2A313E] flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Disc3 className="w-4 h-4 text-amber-400" />
                    <span>Open DJ Console</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('creation')}
                    className="px-4 py-2.5 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] text-slate-300 text-xs font-medium border border-[#232833] flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Music className="w-4 h-4 text-amber-400" />
                    <span>AI Lyrics &amp; Beat Pads</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage3DOpen(true)}
                    className="px-4 py-2.5 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-amber-300 text-xs font-semibold border border-amber-500/40 flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Box className="w-4 h-4 text-amber-400" />
                    <span>3D Mastering Stage</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openDeviceInstaller('wireless')}
                    className="px-4 py-2.5 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] text-slate-200 text-xs font-medium border border-[#232833] flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <ActiveDeviceIcon className="w-4 h-4 text-amber-400" />
                    <span>Wireless App Install</span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 relative min-h-[220px] bg-[#0B0D10]">
                <img
                  src={HERO_IMG}
                  alt="SoundDeck Studio mastering console"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover lg:absolute lg:inset-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#13161B] via-[#13161B]/35 to-transparent lg:block hidden" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#13161B] via-transparent to-transparent lg:hidden" />
              </div>
            </div>
          </section>
        )}

        {/* Active Workspace Tab Viewport */}
        <section aria-live="polite">
          <Suspense
            fallback={
              <div className="rounded-xl bg-[#13161B] border border-[#232833] p-8 text-center text-sm text-slate-400">
                Loading studio workspace...
              </div>
            }
          >
            {activeTab === 'social' && (
              <SocialHubTab
                user={user}
                profile={profile}
                privateInfo={privateInfo}
                campaigns={campaigns}
                projects={projects}
                creators={creators}
                activeTrackTitle={activeTrackTitle}
                studioBpm={studioBpm}
                onOpenAuth={() => setAuthModalOpen(true)}
                onPrivateInfoSaved={() => user && refreshProfileData(user.uid)}
                onSupportCreator={(recipientName) =>
                  openSodaSupport(
                    recipientName
                      ? {
                          handle: recipientName,
                          name: recipientName,
                          role: profile?.role || 'creator',
                        }
                      : undefined
                  )
                }
              />
            )}

            {activeTab === 'creation' && (
              <MusicCreationTab
                user={user}
                projects={projects}
                padAssignments={padAssignments}
                padSampleBuffers={padSampleBuffers}
                discoverCustomSamples={discoverCustomSamples}
                onAssignSampleToPad={handleAssignSampleToPad}
                onRemovePadAssignment={handleRemovePadAssignment}
                onOpenAuth={() => setAuthModalOpen(true)}
                onActiveTrackChange={(t) => setActiveTrackTitle(t)}
                initialBpm={studioBpm}
                onBpmChange={(nextBpm) => setStudioBpm(nextBpm)}
                onOpen3DStage={() => setStage3DOpen(true)}
              />
            )}

            {activeTab === 'daw' && (
              <DawTab initialBpm={studioBpm} initialBeatSignature={beatSignature} />
            )}

            {activeTab === 'vdj' && <VirtualDjTab userRole={profile?.role} />}

            {activeTab === 'discover' && (
              <DiscoverTab
                user={user}
                padAssignments={padAssignments}
                persistentPlayer={persistentPlayer}
                onPlayGlobalTrack={handlePlayDiscoverTrack}
                onPlayCatalogTrack={handlePlayCatalogTrack}
                onAssignSampleToPad={handleAssignSampleToPad}
                onRegisterCustomSample={(sample) =>
                  setDiscoverCustomSamples((prev) => [
                    sample,
                    ...prev.filter((s) => s.id !== sample.id),
                  ])
                }
                onNavigateToCreation={() => setActiveTab('creation')}
                onOpenOfflineLibrary={() => setActiveTab('offline')}
                onOpenAuth={() => setAuthModalOpen(true)}
                onSupportCreator={(recipient) => openSodaSupport(recipient)}
                currentTime={playerCurrentTime}
                duration={playerDuration}
                isPlaying={playerIsPlaying}
                onSeekToTime={(timeSec) => setSeekRequest({ timeSec, nonce: Date.now() })}
                karaokeMode={karaokeMode}
                onToggleKaraoke={() => setKaraokeMode((v) => !v)}
              />
            )}

            {activeTab === 'offline' && (
              <OfflineLibraryTab
                persistentPlayer={persistentPlayer}
                onPlayOfflineQueue={(queue, startIndex) =>
                  handlePlayDiscoverTrack(queue[startIndex], 'full', undefined, {
                    queue,
                    queueIndex: startIndex,
                    queueLabel: 'Offline Library',
                  })
                }
                onAssignSampleToPad={handleAssignSampleToPad}
                onNavigateToDiscover={() => setActiveTab('discover')}
                onNavigateToCreation={() => setActiveTab('creation')}
              />
            )}
          </Suspense>
        </section>

        {/* BuymeSoda Community & Owner Support Ledger */}
        <section className="rounded-xl bg-[#13161B] border border-[#232833] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
              <CupSoda className="w-4 h-4 text-amber-400" />
              <span>BuymeSoda Creator &amp; Webapp Owner Support</span>
            </h3>
            <p className="text-xs text-slate-400">
              {mySodaSupports.length > 0
                ? `You have logged ${mySodaSupports.length} soda support pledge${mySodaSupports.length > 1 ? 's' : ''} in SoundDeck Studio.`
                : 'Tip your favorite artists, content creators, DJs, or buy the webapp owner a soda to keep the studio growing.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {creators.slice(0, 2).map((c) =>
              c.buyMeSodaHandle ? (
                <button
                  key={c.uid}
                  type="button"
                  onClick={() =>
                    openSodaSupport({
                      handle: c.buyMeSodaHandle!,
                      name: c.displayName,
                      role: c.role,
                    })
                  }
                  className="px-3.5 py-2 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] text-slate-200 text-xs border border-[#232833] transition-colors whitespace-nowrap"
                >
                  Tip {c.displayName}
                </button>
              ) : null
            )}
            <button
              type="button"
              onClick={() => openSodaSupport()}
              className="px-4 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold border border-amber-500/40 whitespace-nowrap"
            >
              Buy Owner a Soda
            </button>
          </div>
        </section>
      </main>

      {!isMobileAppLayout && (
        <footer
          className={`border-t border-[#232833] bg-[#0B0D10] mt-10 ${
            persistentPlayer ? 'pb-24' : ''
          }`}
        >
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <span>SoundDeck Studio · Built for Artists, Content Creators, and DJs</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => openDeviceInstaller('adaptive')}
                className="hover:text-amber-400 transition-colors"
              >
                Device Layout ({deviceProfile.deviceCategory})
              </button>
              <button
                type="button"
                onClick={() => openSodaSupport()}
                className="hover:text-amber-400 transition-colors"
              >
                BuymeSoda Support
              </button>
              <a
                href="https://www.audacityteam.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-300 transition-colors"
              >
                Audacity
              </a>
              <a
                href="https://www.virtualdj.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-300 transition-colors"
              >
                VirtualDJ
              </a>
            </div>
          </div>
        </footer>
      )}

      {/* PHONE & TABLET: Fixed Bottom Native App Tab Bar (Natural Thumb Zone) */}
      {isMobileAppLayout && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 h-16 pb-[env(safe-area-inset-bottom)] bg-[#0B0D10]/95 backdrop-blur-md border-t border-[#232833]"
          aria-label="Mobile app bottom navigation"
        >
          <div className="grid grid-cols-6 h-full max-w-2xl mx-auto">
            {mobileTabs.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
                    isActive ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-amber-400"
                    />
                  )}
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium tracking-tight whitespace-nowrap">
                    {item.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        user={user}
        profile={profile}
        privateInfo={privateInfo}
        onProfileSaved={() => user && refreshProfileData(user.uid)}
      />

      <BuyMeSodaModal
        isOpen={sodaModalOpen}
        onClose={() => setSodaModalOpen(false)}
        user={user}
        creators={creators}
        initialRecipient={sodaRecipient}
        onOpenAuth={() => {
          setSodaModalOpen(false);
          setAuthModalOpen(true);
        }}
      />

      <DeviceInstallerModal
        isOpen={deviceInstallerOpen}
        onClose={() => setDeviceInstallerOpen(false)}
        deviceProfile={deviceProfile}
        canTriggerNativeInstall={pwaInstall.isInstallable}
        installing={pwaInstall.installing}
        isIOS={pwaInstall.isIOS}
        isInIframe={pwaInstall.isInIframe}
        onNativeInstall={pwaInstall.install}
        onDownloadAppShortcut={handleDownloadOfflinePackage}
        downloadedNotice={downloadedNotice}
        initialPairCode={incomingPairCode}
        initialView={deviceInstallerView}
      />

      {stage3DOpen && (
        <Suspense fallback={null}>
          <StudioStage3D
            isOpen={stage3DOpen}
            onClose={() => setStage3DOpen(false)}
            activeTrackTitle={activeTrackTitle}
            bpm={studioBpm}
          />
        </Suspense>
      )}

      <PersistentAudioPlayer
        playerState={persistentPlayer}
        activeTab={activeTab}
        repeatMode={repeatMode}
        shuffleOn={shuffleOn}
        isMobileAppLayout={isMobileAppLayout}
        karaokeMode={karaokeMode}
        onSwitchMode={(nextMode) => {
          if (!persistentPlayer) return;
          handlePlayDiscoverTrack(
            persistentPlayer.track,
            nextMode,
            persistentPlayer.youtubeVersions,
            persistentPlayer.queue
              ? {
                  queue: persistentPlayer.queue,
                  queueIndex: persistentPlayer.queueIndex ?? 0,
                  queueLabel: persistentPlayer.queueLabel,
                }
              : undefined
          );
        }}
        onSwitchStreamProvider={(provider) =>
          setPersistentPlayer((prev) =>
            prev ? { ...prev, activeStreamProvider: provider } : prev
          )
        }
        onSelectYoutubeVersion={(videoId) =>
          setPersistentPlayer((prev) =>
            prev ? { ...prev, activeYoutubeVideoId: videoId, activeStreamProvider: 'youtube' } : prev
          )
        }
        seekRequest={seekRequest}
        onToggleRepeat={() =>
          setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'))
        }
        onToggleShuffle={() => setShuffleOn((prev) => !prev)}
        onPrevious={handlePreviousTrack}
        onNext={() => handleNextTrack(false)}
        onEnded={() => handleNextTrack(true)}
        onSelectQueueIndex={(idx) => playQueueTrackAtIndex(idx)}
        onOpenDiscover={() => setActiveTab('discover')}
        onClose={() => setPersistentPlayer(null)}
        onTimeUpdate={(t, d, p) => {
          setPlayerCurrentTime(t);
          setPlayerDuration(d);
          setPlayerIsPlaying(p);
        }}
      />

      <StudioChatBot
        activeTab={activeTab}
        bpm={studioBpm}
        beatSignature={beatSignature}
        activeTrackTitle={activeTrackTitle}
        projectCount={projects.length}
        creatorName={profile?.displayName || user?.displayName || undefined}
        creatorRole={profile?.role}
        nowPlayingTitle={persistentPlayer?.track?.title}
        onApplyBpm={(nextBpm) => setStudioBpm(nextBpm)}
        onNavigateTab={(tab) => setActiveTab(tab)}
        hidden={stage3DOpen}
        hasFloatingPlayer={Boolean(persistentPlayer)}
        isMobileAppLayout={isMobileAppLayout}
      />
      <StudioCommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        activeTab={activeTab}
        studioBpm={studioBpm}
        metronomeOn={metronomeOn}
        onSelectTab={(tab) => setActiveTab(tab)}
        onSetBpm={(nextBpm) => setStudioBpm(nextBpm)}
        onToggleMetronome={() => setMetronomeOn((prev) => !prev)}
        onOpenStage3D={() => setStage3DOpen(true)}
        onOpenInstaller={() => openDeviceInstaller('about')}
        onOpenAuth={() => setAuthModalOpen(true)}
      />
      <OfflineIndicator isMobileAppLayout={isMobileAppLayout} />
    </div>
  );
}
