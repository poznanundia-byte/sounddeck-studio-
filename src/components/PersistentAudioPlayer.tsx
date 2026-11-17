import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  Volume2,
  VolumeX,
  X,
  Disc3,
  Radio,
  Tv,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { attachMediaElementToAnalyser } from '../audio/studioAudio';
import { getCachedBackendAvailability, resolveApiUrl } from '../services/apiClient';
import { type PersistentPlayerState, type RepeatMode } from '../types/discoverPlayer';

interface PersistentAudioPlayerProps {
  playerState: PersistentPlayerState | null;
  activeTab: string;
  repeatMode: RepeatMode;
  shuffleOn: boolean;
  onSwitchMode: (mode: 'preview' | 'full') => void;
  onSwitchStreamProvider?: (provider: 'audio' | 'youtube' | 'soundcloud') => void;
  onSelectYoutubeVersion: (videoId: string) => void;
  seekRequest?: { timeSec: number; nonce: number } | null;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onEnded: () => void;
  onSelectQueueIndex?: (index: number) => void;
  onOpenDiscover: () => void;
  onClose: () => void;
  onTimeUpdate?: (currentTime: number, duration: number, isPlaying: boolean) => void;
  isMobileAppLayout?: boolean;
  karaokeMode?: boolean;
}

function formatSec(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '0:00';
  const whole = Math.max(0, Math.floor(sec));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function PersistentAudioPlayer({
  playerState,
  activeTab,
  repeatMode,
  shuffleOn,
  onSwitchMode,
  onSwitchStreamProvider,
  onSelectYoutubeVersion,
  seekRequest,
  onToggleRepeat,
  onToggleShuffle,
  onPrevious,
  onNext,
  onEnded,
  onSelectQueueIndex,
  onOpenDiscover,
  onClose,
  onTimeUpdate,
  isMobileAppLayout = false,
  karaokeMode = false,
}: PersistentAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioNextRef = useRef<HTMLAudioElement | null>(null);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const scIframeRef = useRef<HTMLIFrameElement | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [videoExpanded, setVideoExpanded] = useState(false);
  const [ytCategoryFilter, setYtCategoryFilter] = useState<'all' | 'music_video' | 'lyrics_video'>('all');
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [crossfading, setCrossfading] = useState(false);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [pitchShift, setPitchShift] = useState(0);
  const [showPitchModal, setShowPitchModal] = useState(false);

  const playNonce = playerState?.playNonce ?? 0;
  const track = playerState?.track ?? null;
  const mode = playerState?.mode ?? 'preview';
  const activeYoutubeVideoId = playerState?.activeYoutubeVideoId ?? null;
  const activeSoundCloudPermalink =
    playerState?.activeSoundCloudPermalink || track?.soundcloudPermalink || null;
  const youtubeVersions = playerState?.youtubeVersions ?? [];
  const loadingFullStream = playerState?.loadingFullStream ?? false;
  const queue = playerState?.queue ?? [];
  const queueIndex = playerState?.queueIndex ?? 0;
  const queueLabel = playerState?.queueLabel;

  const instanceKey = `${track?.id ?? ''}::${playNonce}::${mode}`;
  const firedEndedKeyRef = useRef<string | null>(null);
  const instanceKeyRef = useRef(instanceKey);
  instanceKeyRef.current = instanceKey;

  const triggerEndedOnce = useCallback(() => {
    const key = instanceKeyRef.current;
    if (!key || firedEndedKeyRef.current === key) return;
    firedEndedKeyRef.current = key;
    onEndedRef.current();
  }, []);

  useEffect(() => {
    firedEndedKeyRef.current = null;
  }, [instanceKey]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = playbackSpeed * Math.pow(2, pitchShift / 12);
    if ('preservesPitch' in el) {
      (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = pitchShift === 0;
    }
  }, [playbackSpeed, pitchShift]);

  useEffect(() => {
    if (onTimeUpdate) {
      onTimeUpdate(isScrubbing ? scrubTime : currentTime, duration, isPlaying);
    }
  }, [currentTime, duration, isPlaying, isScrubbing, scrubTime, onTimeUpdate]);

  const effectiveProvider: 'audio' | 'youtube' | 'soundcloud' = (() => {
    if (!track || mode === 'preview') return 'audio';
    const requested = playerState?.activeStreamProvider;
    if (requested === 'youtube' && (activeYoutubeVideoId || youtubeVersions.length > 0)) return 'youtube';
    if (requested === 'soundcloud' && activeSoundCloudPermalink) return 'soundcloud';
    if (requested === 'audio' && track.fullAudioUrl) return 'audio';
    if (track.fullAudioUrl) return 'audio';
    if (activeSoundCloudPermalink && !activeYoutubeVideoId) return 'soundcloud';
    if (activeYoutubeVideoId) return 'youtube';
    if (activeSoundCloudPermalink) return 'soundcloud';
    return 'audio';
  })();

  const isSoundCloudWidgetMode = Boolean(
    track && mode === 'full' && effectiveProvider === 'soundcloud' && activeSoundCloudPermalink
  );
  const isYoutubeFullMode = Boolean(
    track && mode === 'full' && effectiveProvider === 'youtube' && activeYoutubeVideoId
  );
  const isNativeAudioMode = Boolean(
    track &&
      effectiveProvider === 'audio' &&
      (mode === 'preview' || Boolean(track.fullAudioUrl) || track.source === 'catalog')
  );

  const sendScCommand = useCallback((method: string, value?: unknown) => {
    const win = scIframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify(value !== undefined ? { method, value } : { method }),
      '*'
    );
  }, []);

  const sendYtCommand = useCallback((func: string, args: unknown[] = []) => {
    const win = ytIframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({
        event: 'command',
        func,
        args,
      }),
      '*'
    );
  }, []);

  // Load & play native HTML5 <audio> with seamless crossfade when approaching track end
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    if (!track || !isNativeAudioMode) {
      el.pause();
      if (audioNextRef.current) audioNextRef.current.pause();
      return;
    }

    const rawUrl =
      mode === 'full' && track.fullAudioUrl ? track.fullAudioUrl : track.previewUrl;
    if (!rawUrl) {
      el.pause();
      setIsPlaying(false);
      return;
    }

    const isLocalBlob = rawUrl.startsWith('blob:') || rawUrl.startsWith('data:');
    const useDirectUrl = isLocalBlob || getCachedBackendAvailability() === false;
    const resolvedSrc = useDirectUrl
      ? rawUrl
      : resolveApiUrl(`/api/discover/preview-proxy?url=${encodeURIComponent(rawUrl)}`);

    setCurrentTime(0);
    setDuration(
      mode === 'full' && track.durationSec > 0 ? track.durationSec : 30
    );
    setCrossfading(false);

    // If audioNext was running a crossfade, swap roles or reset
    if (audioNextRef.current) {
      audioNextRef.current.pause();
      audioNextRef.current.currentTime = 0;
    }

    if (el.src !== `${window.location.origin}${resolvedSrc}` && el.src !== resolvedSrc) {
      el.src = resolvedSrc;
    } else {
      try {
        el.currentTime = 0;
      } catch {
        // ignore seek error before metadata
      }
    }

    el.volume = muted ? 0 : volume;
    if (!isLocalBlob) {
      attachMediaElementToAnalyser(el);
    }

    el.play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        if (!isLocalBlob && el.src !== rawUrl) {
          el.src = rawUrl;
          el.play()
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
        } else {
          setIsPlaying(false);
        }
      });
  }, [track?.id, track?.previewUrl, track?.fullAudioUrl, track?.source, mode, isNativeAudioMode, playNonce]);

  // Keep native audio, YouTube & SoundCloud volume/mute synced
  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.volume = muted ? 0 : volume;
    }
    if (isYoutubeFullMode && activeYoutubeVideoId) {
      sendYtCommand(muted ? 'mute' : 'unMute');
      sendYtCommand('setVolume', [Math.round((muted ? 0 : volume) * 100)]);
    }
    if (isSoundCloudWidgetMode && activeSoundCloudPermalink) {
      sendScCommand('setVolume', Math.round((muted ? 0 : volume) * 100));
    }
  }, [
    volume,
    muted,
    isYoutubeFullMode,
    activeYoutubeVideoId,
    isSoundCloudWidgetMode,
    activeSoundCloudPermalink,
    sendYtCommand,
    sendScCommand,
  ]);

  // Replay YouTube or SoundCloud stream from 0 when playNonce increments on same track (Repeat One)
  useEffect(() => {
    if (!playNonce) return;
    if (isYoutubeFullMode && activeYoutubeVideoId) {
      setCurrentTime(0);
      sendYtCommand('seekTo', [0, true]);
      sendYtCommand('playVideo');
      setIsPlaying(true);
    } else if (isSoundCloudWidgetMode && activeSoundCloudPermalink) {
      setCurrentTime(0);
      sendScCommand('seekTo', 0);
      sendScCommand('play');
      setIsPlaying(true);
    }
  }, [playNonce, isYoutubeFullMode, activeYoutubeVideoId, isSoundCloudWidgetMode, activeSoundCloudPermalink, sendYtCommand, sendScCommand]);

  // Listen to SoundCloud Widget postMessage events
  useEffect(() => {
    if (!isSoundCloudWidgetMode || !activeSoundCloudPermalink) return;
    setCurrentTime(0);
    setDuration(track?.durationSec && track.durationSec > 0 ? track.durationSec : 180);
    setIsPlaying(true);

    const onScMessage = (e: MessageEvent) => {
      if (typeof e.origin === 'string' && !e.origin.includes('soundcloud.com')) return;
      if (typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data) as {
          method?: string;
          value?: { currentPosition?: number } | number;
        };
        if (msg.method === 'playProgress' && typeof msg.value === 'object' && msg.value) {
          if (typeof msg.value.currentPosition === 'number' && !isScrubbing) {
            setCurrentTime(msg.value.currentPosition / 1000);
          }
        } else if (msg.method === 'getDuration' && typeof msg.value === 'number' && msg.value > 0) {
          setDuration(msg.value / 1000);
        } else if (msg.method === 'play') {
          setIsPlaying(true);
        } else if (msg.method === 'pause') {
          setIsPlaying(false);
        } else if (msg.method === 'finish') {
          setIsPlaying(false);
          triggerEndedOnce();
        }
      } catch {
        // ignore non-JSON widget messages
      }
    };

    window.addEventListener('message', onScMessage);
    return () => window.removeEventListener('message', onScMessage);
  }, [isSoundCloudWidgetMode, activeSoundCloudPermalink, track?.durationSec, isScrubbing, triggerEndedOnce]);

  // Listen to YouTube IFrame API postMessage events for real-time timecode, duration & play state
  useEffect(() => {
    if (!isYoutubeFullMode || !activeYoutubeVideoId) return;

    setCurrentTime(0);
    setDuration(track?.durationSec && track.durationSec > 0 ? track.durationSec : 180);
    setIsPlaying(true);

    const onMessage = (e: MessageEvent) => {
      if (
        typeof e.origin === 'string' &&
        !e.origin.includes('youtube.com') &&
        !e.origin.includes('youtube-nocookie.com')
      ) {
        return;
      }
      if (typeof e.data !== 'string') return;
      try {
        const parsed = JSON.parse(e.data) as {
          event?: string;
          info?: {
            currentTime?: number;
            duration?: number;
            playerState?: number;
          };
        };
        if (parsed.event === 'infoDelivery' && parsed.info) {
          if (typeof parsed.info.currentTime === 'number' && !isScrubbing) {
            setCurrentTime(parsed.info.currentTime);
          }
          if (typeof parsed.info.duration === 'number' && parsed.info.duration > 0) {
            setDuration(parsed.info.duration);
          }
          if (typeof parsed.info.playerState === 'number') {
            if (parsed.info.playerState === 1) {
              setIsPlaying(true);
            } else if (parsed.info.playerState === 2) {
              setIsPlaying(false);
            } else if (parsed.info.playerState === 0) {
              setIsPlaying(false);
              triggerEndedOnce();
            }
          }
        }
      } catch {
        // Ignore non-JSON iframe messages
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isYoutubeFullMode, activeYoutubeVideoId, track?.durationSec, isScrubbing, triggerEndedOnce]);

  const handleTogglePlayPause = () => {
    if (!track) return;
    if (isNativeAudioMode) {
      const el = audioRef.current;
      if (!el) return;
      if (isPlaying) {
        el.pause();
        setIsPlaying(false);
      } else {
        if (!track.previewUrl.startsWith('blob:')) {
          attachMediaElementToAnalyser(el);
        }
        el.play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    } else if (isYoutubeFullMode) {
      if (isPlaying) {
        sendYtCommand('pauseVideo');
        setIsPlaying(false);
      } else {
        sendYtCommand('playVideo');
        setIsPlaying(true);
      }
    } else if (isSoundCloudWidgetMode) {
      if (isPlaying) {
        sendScCommand('pause');
        setIsPlaying(false);
      } else {
        sendScCommand('play');
        setIsPlaying(true);
      }
    }
  };

  const commitSeek = useCallback((targetSec: number) => {
    setCurrentTime(targetSec);
    if (isNativeAudioMode && audioRef.current) {
      audioRef.current.currentTime = targetSec;
    } else if (isYoutubeFullMode) {
      sendYtCommand('seekTo', [targetSec, true]);
    } else if (isSoundCloudWidgetMode) {
      sendScCommand('seekTo', Math.round(targetSec * 1000));
    }
  }, [isNativeAudioMode, isYoutubeFullMode, isSoundCloudWidgetMode, sendYtCommand, sendScCommand]);

  useEffect(() => {
    if (!seekRequest) return;
    commitSeek(seekRequest.timeSec);
  }, [seekRequest?.nonce, seekRequest?.timeSec, commitSeek]);

  if (!playerState || !track) {
    return (
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        className="hidden"
      />
    );
  }

  const displayedTime = isScrubbing ? scrubTime : currentTime;
  const maxDuration = Math.max(1, duration);
  const canSwitchPreview = Boolean(track.previewUrl || track.fullAudioUrl);
  const hasQueue = queue.length > 1;
  const nextTrack =
    queue.length > 1 && queueIndex + 1 < queue.length
      ? queue[queueIndex + 1]
      : repeatMode === 'all' && queue.length > 1
      ? queue[0]
      : null;
  const canGoNext =
    queue.length > 1 && (shuffleOn || repeatMode !== 'off' || queueIndex + 1 < queue.length);

  const handlePreviousClick = () => {
    if (displayedTime > 3 || (!hasQueue && repeatMode !== 'all')) {
      commitSeek(0);
      return;
    }
    onPrevious();
  };

  return (
    <>
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          const dur = el.duration;
          const cur = el.currentTime;
          if (!isScrubbing) setCurrentTime(cur);

          // Trigger crossfade 4 seconds before track end if queue has next track
          const hasQueueNext = queue.length > 1 && (queueIndex + 1 < queue.length || repeatMode === 'all');
          if (
            isNativeAudioMode &&
            hasQueueNext &&
            !crossfading &&
            dur > 6 &&
            cur >= dur - 4 &&
            dur - cur > 0.2
          ) {
            setCrossfading(true);
            // Fade out current audio element over 3.5 seconds
            const startVol = muted ? 0 : volume;
            const steps = 20;
            const stepMs = 175;
            let currentStep = 0;
            const fadeInterval = window.setInterval(() => {
              currentStep++;
              const ratio = 1 - currentStep / steps;
              if (audioRef.current) {
                audioRef.current.volume = Math.max(0, startVol * ratio);
              }
              if (currentStep >= steps) {
                window.clearInterval(fadeInterval);
                if (audioRef.current) audioRef.current.pause();
                triggerEndedOnce();
              }
            }, stepMs);
          }
        }}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) {
            setDuration(e.currentTarget.duration);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          if (!crossfading) {
            setIsPlaying(false);
            triggerEndedOnce();
          }
        }}
        className="hidden"
      />

      <audio
        ref={audioNextRef}
        crossOrigin="anonymous"
        className="hidden"
      />

      <div
        className={`fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1rem)] sm:w-[calc(100%-1.5rem)] max-w-[1220px] transition-all ${
          isMobileAppLayout ? 'bottom-[74px]' : 'bottom-3'
        }`}
      >
        {/* Expandable Up Next Queue Drawer (Spotify / Boomplay Style) */}
        {queueExpanded && queue.length > 0 && (
          <div className="mb-2 rounded-xl bg-[#13161B]/95 backdrop-blur-md border border-[#2A313E] shadow-2xl p-3 space-y-2 max-h-[260px] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#232833] pb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                <ListMusic className="w-4 h-4 text-amber-400" />
                <span>{queueLabel || 'Play Queue'} ({queueIndex + 1} / {queue.length})</span>
                {shuffleOn && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                    SHUFFLE
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setQueueExpanded(false)}
                className="text-xs text-slate-400 hover:text-slate-100 flex items-center gap-1"
              >
                <span>Close</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              {queue.map((qTrack, idx) => {
                const isCurrent = idx === queueIndex;
                const isNext = !isCurrent && nextTrack?.id === qTrack.id && idx === (queueIndex + 1) % queue.length;
                return (
                  <button
                    key={`${qTrack.id}_${idx}`}
                    type="button"
                    onClick={() => onSelectQueueIndex?.(idx)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-3 transition-colors ${
                      isCurrent
                        ? 'bg-[#1B2028] border-amber-500/50 text-amber-300'
                        : 'bg-[#0B0D10] border-[#232833] text-slate-300 hover:border-amber-500/30 hover:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-[10px] text-slate-500 w-5 shrink-0 tabular-nums">
                        {isCurrent ? '▶' : `${idx + 1}.`}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{qTrack.title}</div>
                        <div className="text-[11px] text-slate-400 truncate">{qTrack.artist}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {isCurrent ? 'NOW PLAYING' : isNext ? 'UP NEXT' : formatSec(qTrack.durationSec)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Persistent Expandable Omnichannel Stream Drawer (YouTube Music Video + Music Lyrics Video & SoundCloud Song) */}
        {mode === 'full' &&
          (activeYoutubeVideoId || youtubeVersions.length > 0 || activeSoundCloudPermalink) && (
            <div
              className={
                videoExpanded
                  ? 'mb-2 rounded-xl bg-[#13161B] border border-[#2A313E] shadow-2xl p-3 space-y-2.5'
                  : 'w-0 h-0 overflow-hidden opacity-0 pointer-events-none absolute'
              }
            >
              {videoExpanded && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232833] pb-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(activeYoutubeVideoId || youtubeVersions.length > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          onSwitchStreamProvider?.('youtube');
                          if (!activeYoutubeVideoId && youtubeVersions[0]) {
                            onSelectYoutubeVersion(youtubeVersions[0].videoId);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          effectiveProvider === 'youtube'
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-[#0B0D10] text-slate-300 border border-[#232833] hover:text-white'
                        }`}
                      >
                        Full Song · YouTube (Video &amp; Lyrics)
                      </button>
                    )}

                    {activeSoundCloudPermalink && (
                      <button
                        type="button"
                        onClick={() => onSwitchStreamProvider?.('soundcloud')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          effectiveProvider === 'soundcloud'
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-[#0B0D10] text-slate-300 border border-[#232833] hover:text-white'
                        }`}
                      >
                        SoundCloud Song
                      </button>
                    )}

                    {track.fullAudioUrl && (
                      <button
                        type="button"
                        onClick={() => onSwitchStreamProvider?.('audio')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          effectiveProvider === 'audio'
                            ? 'bg-cyan-400 text-slate-950'
                            : 'bg-[#0B0D10] text-slate-300 border border-[#232833] hover:text-white'
                        }`}
                      >
                        Direct Full Audio
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setVideoExpanded(false)}
                    className="text-xs text-slate-400 hover:text-slate-100 flex items-center gap-1 ml-auto"
                  >
                    <span>Minimize</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Active YouTube Full Song Stream (Music Video & Music Lyrics Video Selector) */}
              {(isYoutubeFullMode || (videoExpanded && effectiveProvider === 'youtube')) &&
                (activeYoutubeVideoId || youtubeVersions[0]?.videoId) && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-6 aspect-video rounded-lg overflow-hidden bg-black border border-[#232833]">
                      <iframe
                        ref={ytIframeRef}
                        key={activeYoutubeVideoId || youtubeVersions[0]?.videoId}
                        title={`${track.title} persistent stream`}
                        src={`https://www.youtube.com/embed/${
                          activeYoutubeVideoId || youtubeVersions[0]?.videoId
                        }?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(
                          window.location.origin
                        )}`}
                        onLoad={() => {
                          ytIframeRef.current?.contentWindow?.postMessage(
                            JSON.stringify({ event: 'listening', id: 1 }),
                            '*'
                          );
                          sendYtCommand(muted ? 'mute' : 'unMute');
                          sendYtCommand('setVolume', [Math.round((muted ? 0 : volume) * 100)]);
                        }}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>

                    {videoExpanded && (
                      <div className="md:col-span-6 flex flex-col gap-2 max-h-[220px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-mono text-slate-400 uppercase">
                            YouTube · Music Video &amp; Lyrics
                          </span>
                          <div className="flex items-center gap-1 bg-[#0B0D10] p-0.5 rounded border border-[#232833] text-[10px] font-mono">
                            {(
                              [
                                { id: 'all', label: 'All' },
                                { id: 'music_video', label: 'Music Video' },
                                { id: 'lyrics_video', label: 'Music Lyrics' },
                              ] as const
                            ).map((tab) => (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => setYtCategoryFilter(tab.id)}
                                className={`px-2 py-0.5 rounded transition-colors ${
                                  ytCategoryFilter === tab.id
                                    ? 'bg-emerald-500 text-slate-950 font-bold'
                                    : 'text-slate-400 hover:text-slate-100'
                                }`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5 overflow-y-auto pr-1">
                          {youtubeVersions
                            .filter((ver) => {
                              if (ytCategoryFilter === 'all') return true;
                              if (ver.category) return ver.category === ytCategoryFilter;
                              const isLyric = /lyric/i.test(ver.title);
                              return ytCategoryFilter === 'lyrics_video' ? isLyric : !isLyric;
                            })
                            .map((ver) => {
                              const selected =
                                ver.videoId === (activeYoutubeVideoId || youtubeVersions[0]?.videoId);
                              const isLyrics =
                                ver.category === 'lyrics_video' || /lyric/i.test(ver.title);
                              return (
                                <button
                                  key={ver.videoId}
                                  type="button"
                                  onClick={() => {
                                    onSwitchStreamProvider?.('youtube');
                                    onSelectYoutubeVersion(ver.videoId);
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 rounded border text-xs transition-colors ${
                                    selected
                                      ? 'bg-[#1B2028] border-emerald-500/50 text-emerald-200'
                                      : 'bg-[#0B0D10] border-[#232833] text-slate-300 hover:border-amber-500/40'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium truncate">{ver.title}</span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono shrink-0 ${
                                        isLyrics
                                          ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                          : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                      }`}
                                    >
                                      {isLyrics ? 'LYRICS' : 'VIDEO'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-500 flex justify-between mt-0.5">
                                    <span className="truncate">{ver.channel}</span>
                                    <span>{ver.durationLabel}</span>
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* Active SoundCloud Widget Stream */}
              {isSoundCloudWidgetMode && activeSoundCloudPermalink && (
                <iframe
                  ref={scIframeRef}
                  key={activeSoundCloudPermalink}
                  title={`${track.title} SoundCloud stream`}
                  height={166}
                  allow="autoplay"
                  src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(
                    activeSoundCloudPermalink
                  )}&color=%23f59e0b&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false`}
                  onLoad={() => {
                    sendScCommand('addEventListener', 'playProgress');
                    sendScCommand('addEventListener', 'play');
                    sendScCommand('addEventListener', 'pause');
                    sendScCommand('addEventListener', 'finish');
                    sendScCommand('getDuration');
                    sendScCommand('setVolume', Math.round((muted ? 0 : volume) * 100));
                  }}
                  className="w-full rounded-lg border border-[#232833] bg-[#0B0D10]"
                />
              )}
            </div>
          )}

        {/* Floating Bottom Console Player Bar */}
        <div className="rounded-xl bg-[#13161B]/95 backdrop-blur-md border border-[#2A313E] shadow-2xl px-3.5 py-2.5 flex flex-col md:flex-row md:items-center gap-3">
          {/* Left: Cover Art & Track Info */}
          <div className="flex items-center gap-3 min-w-0 md:w-[270px] shrink-0">
            <div className="w-11 h-11 rounded-lg bg-[#0B0D10] border border-[#232833] overflow-hidden shrink-0 flex items-center justify-center">
              {track.coverUrl ? (
                <img
                  src={track.coverUrl}
                  alt={track.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Disc3 className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-display font-bold text-slate-100 truncate">
                  {track.title}
                </span>
                {activeTab !== 'discover' && (
                  <button
                    type="button"
                    onClick={onOpenDiscover}
                    title="Return to Discover tab"
                    className="text-[10px] font-mono text-amber-400 hover:underline shrink-0 flex items-center gap-0.5"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                <span>{track.artist}</span>
                <span>·</span>
                <span className={mode === 'full' ? 'text-emerald-400' : 'text-amber-400'}>
                  {isSoundCloudWidgetMode
                    ? 'SoundCloud'
                    : mode === 'full'
                    ? 'Full Song'
                    : '30s Preview'}
                </span>
                {karaokeMode && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/25 text-purple-300 text-[9px] font-mono font-bold shrink-0">
                    🎤 KARAOKE
                  </span>
                )}
                {nextTrack && (
                  <span className="text-slate-500 truncate"> · Up Next: {nextTrack.title}</span>
                )}
              </div>
            </div>
          </div>

          {/* Center: Shuffle / Prev / Play / Next / Repeat + Scrub Bar + Mode Toggle */}
          <div className="flex-1 flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onToggleShuffle}
                disabled={!hasQueue}
                title={shuffleOn ? 'Shuffle On' : 'Shuffle Off'}
                aria-label="Toggle shuffle"
                className={`p-1.5 rounded-full transition-colors disabled:opacity-30 ${
                  shuffleOn
                    ? 'text-emerald-400 bg-emerald-500/15'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#1B2028]'
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handlePreviousClick}
                title="Previous track (or restart if > 3s)"
                aria-label="Previous track"
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#1B2028] transition-colors"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleTogglePlayPause}
                disabled={loadingFullStream}
                aria-label={isPlaying ? 'Pause floating player' : 'Play floating player'}
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 disabled:opacity-50 ${
                  mode === 'full'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                {loadingFullStream ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={onNext}
                disabled={!canGoNext}
                title="Next song in queue"
                aria-label="Next track"
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#1B2028] transition-colors disabled:opacity-30"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onToggleRepeat}
                title={
                  repeatMode === 'one'
                    ? 'Repeat Current Song (On)'
                    : repeatMode === 'all'
                    ? 'Repeat Queue (All)'
                    : 'Repeat Off'
                }
                aria-label={`Repeat mode: ${repeatMode}`}
                className={`p-1.5 rounded-full transition-colors ${
                  repeatMode !== 'off'
                    ? 'text-amber-400 bg-amber-500/15'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#1B2028]'
                }`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-3.5 h-3.5" />
                ) : (
                  <Repeat className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="flex-1 flex items-center gap-2.5 min-w-0">
              <span className="font-mono text-[11px] text-slate-400 tabular-nums w-10 text-right shrink-0">
                {formatSec(displayedTime)}
              </span>
              <input
                type="range"
                min={0}
                max={maxDuration}
                step={0.2}
                value={Math.min(displayedTime, maxDuration)}
                onPointerDown={() => setIsScrubbing(true)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setScrubTime(val);
                  if (!isScrubbing) {
                    commitSeek(val);
                  } else if (isNativeAudioMode && audioRef.current) {
                    audioRef.current.currentTime = val;
                    setCurrentTime(val);
                  }
                }}
                onPointerUp={(e) => {
                  const val = Number((e.currentTarget as HTMLInputElement).value);
                  setIsScrubbing(false);
                  commitSeek(val);
                }}
                onKeyUp={(e) => {
                  const val = Number((e.currentTarget as HTMLInputElement).value);
                  setIsScrubbing(false);
                  commitSeek(val);
                }}
                aria-label="Scrub track position"
                className="studio-slider flex-1 min-w-0"
              />
              <span className="font-mono text-[11px] text-slate-400 tabular-nums w-10 shrink-0">
                {formatSec(maxDuration)}
              </span>
            </div>

            {track.source !== 'catalog' && (
              <div className="hidden sm:flex items-center rounded-lg bg-[#0B0D10] border border-[#232833] p-0.5 text-[11px] shrink-0">
                <button
                  type="button"
                  onClick={() => onSwitchMode('preview')}
                  disabled={!canSwitchPreview}
                  className={`px-2 py-1 rounded transition-colors disabled:opacity-35 ${
                    mode === 'preview'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchMode('full')}
                  className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                    mode === 'full'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <Radio className="w-3 h-3" />
                  <span>Full</span>
                </button>
              </div>
            )}
          </div>

          {/* Right: Volume + Video Drawer Toggle + Dismiss */}
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute player' : 'Mute player'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1B2028] transition-colors"
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                if (v > 0 && muted) setMuted(false);
              }}
              aria-label="Player volume"
              className="studio-slider w-16 hidden sm:block"
            />

            {/* Speed & Pitch Control Modal/Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPitchModal((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-semibold flex items-center gap-1 transition-colors ${
                  playbackSpeed !== 1.0 || pitchShift !== 0
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-[#0B0D10] border-[#232833] text-slate-300 hover:text-white'
                }`}
                title="Playback Speed & Pitch Shift"
              >
                <span>{playbackSpeed}x</span>
                {pitchShift !== 0 && <span>({pitchShift > 0 ? `+${pitchShift}` : pitchShift}st)</span>}
              </button>

              {showPitchModal && (
                <div className="absolute bottom-full right-0 mb-3 w-64 rounded-xl bg-[#13161B] border border-[#2A313E] p-4 shadow-2xl space-y-4 z-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-400">Speed &amp; Pitch Control</span>
                    <button
                      type="button"
                      onClick={() => setShowPitchModal(false)}
                      className="text-slate-400 hover:text-slate-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Playback Speed Slider (0.5x to 2x) */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Speed</span>
                      <span className="text-amber-400">{playbackSpeed.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                      className="studio-slider w-full"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-slate-500">
                      <button type="button" onClick={() => setPlaybackSpeed(0.5)} className="hover:text-amber-300">0.5x</button>
                      <button type="button" onClick={() => setPlaybackSpeed(1.0)} className="hover:text-amber-300">1.0x</button>
                      <button type="button" onClick={() => setPlaybackSpeed(1.5)} className="hover:text-amber-300">1.5x</button>
                      <button type="button" onClick={() => setPlaybackSpeed(2.0)} className="hover:text-amber-300">2.0x</button>
                    </div>
                  </div>

                  {/* Pitch Shift Slider (-12 to +12 semitones) */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>Pitch Shift</span>
                      <span className="text-amber-400">{pitchShift > 0 ? `+${pitchShift} st` : `${pitchShift} st`}</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={pitchShift}
                      onChange={(e) => setPitchShift(Number(e.target.value))}
                      className="studio-slider w-full"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-slate-500">
                      <button type="button" onClick={() => setPitchShift(-12)} className="hover:text-amber-300">-12</button>
                      <button type="button" onClick={() => setPitchShift(0)} className="hover:text-amber-300">0</button>
                      <button type="button" onClick={() => setPitchShift(12)} className="hover:text-amber-300">+12</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {queue.length > 1 && (
              <button
                type="button"
                onClick={() => setQueueExpanded((v) => !v)}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1 transition-colors ${
                  queueExpanded
                    ? 'bg-[#1B2028] border-amber-500/50 text-amber-300'
                    : 'bg-[#0B0D10] border-[#232833] text-slate-300 hover:text-white'
                }`}
                title="View Up Next queue"
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{queueIndex + 1}/{queue.length}</span>
              </button>
            )}

            {mode === 'full' &&
              (activeYoutubeVideoId ||
                youtubeVersions.length > 0 ||
                activeSoundCloudPermalink) && (
              <button
                type="button"
                onClick={() => setVideoExpanded((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition-colors ${
                  videoExpanded
                    ? 'bg-[#1B2028] border-emerald-500/50 text-emerald-300'
                    : 'bg-[#0B0D10] border-[#232833] text-slate-300 hover:text-white'
                }`}
                title="Show or hide Stream Drawer (SoundCloud & YouTube Video / Lyrics)"
              >
                <Tv className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Stream</span>
                {videoExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronUp className="w-3 h-3" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (audioRef.current) audioRef.current.pause();
                setIsPlaying(false);
                setVideoExpanded(false);
                onClose();
              }}
              aria-label="Close persistent audio player"
              title="Stop & close player"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-[#1B2028] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
