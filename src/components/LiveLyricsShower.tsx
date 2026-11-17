import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic2,
  RefreshCw,
  Loader2,
  Maximize2,
  Minimize2,
  Music2,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { type GlobalSearchTrack } from '../types/discoverPlayer';
import { safeApiFetch } from '../services/apiClient';

interface LiveLyricsShowerProps {
  activeTrack: GlobalSearchTrack | null;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  onSeek?: (timeSec: number) => void;
  karaokeMode?: boolean;
  onToggleKaraoke?: () => void;
}

interface SyncedLyricLine {
  timeSec: number;
  text: string;
}

interface LyricsApiResponse {
  synced: boolean;
  instrumental: boolean;
  source: string;
  matchedTrack: string;
  matchedArtist: string;
  durationSec: number;
  syncedLines: SyncedLyricLine[];
  plainLines: string[];
}

function parseLrcClient(lrcText: string): SyncedLyricLine[] {
  const lines: SyncedLyricLine[] = [];
  const tagRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for (const row of lrcText.split(/\r?\n/)) {
    const timestamps: number[] = [];
    let m: RegExpExecArray | null;
    tagRegex.lastIndex = 0;
    while ((m = tagRegex.exec(row)) !== null) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const fracRaw = m[3] || '0';
      timestamps.push(min * 60 + sec + Number(fracRaw) / Math.pow(10, fracRaw.length));
    }
    const cleanText = row.replace(tagRegex, '').trim();
    if (timestamps.length > 0 && cleanText) {
      for (const ts of timestamps) {
        lines.push({ timeSec: Number(ts.toFixed(2)), text: cleanText });
      }
    }
  }
  return lines.sort((a, b) => a.timeSec - b.timeSec);
}

function formatTs(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function LiveLyricsShower({
  activeTrack,
  isPlaying = false,
  currentTime = 0,
  duration = 0,
  onSeek,
  karaokeMode = false,
  onToggleKaraoke,
}: LiveLyricsShowerProps) {
  const [lyricsData, setLyricsData] = useState<LyricsApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [syncOffset, setSyncOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setSyncOffset(0);
    setFetchError(null);
    if (!activeTrack) {
      setLyricsData(null);
      return;
    }

    let cancelled = false;
    async function loadLyrics() {
      if (!activeTrack) return;
      setLoading(true);
      try {
        const res = await safeApiFetch<LyricsApiResponse>(
          `/api/discover/lyrics?title=${encodeURIComponent(activeTrack.title)}&artist=${encodeURIComponent(
            activeTrack.artist
          )}&duration=${Math.round(activeTrack.durationSec || 0)}`
        );

        if (res.ok && res.data && !cancelled) {
          setLyricsData(res.data);
          return;
        }

        // Direct CORS-enabled LRCLIB fallback when running as static GitHub Pages build
        const cleanTitle = activeTrack.title
          .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
          .replace(/\s+-\s+.*$/, '')
          .trim();
        const lrcRes = await fetch(
          `https://lrclib.net/api/search?track_name=${encodeURIComponent(
            cleanTitle || activeTrack.title
          )}&artist_name=${encodeURIComponent(activeTrack.artist)}`
        );
        if (!lrcRes.ok) {
          throw new Error('Lyrics database temporarily unreachable');
        }
        const rows = (await lrcRes.json()) as Array<{
          trackName?: string;
          artistName?: string;
          duration?: number;
          instrumental?: boolean;
          syncedLyrics?: string | null;
          plainLyrics?: string | null;
        }>;
        const best = rows.find((r) => r.syncedLyrics) || rows[0];
        if (!cancelled) {
          if (!best) {
            setLyricsData({
              synced: false,
              instrumental: false,
              source: 'lrclib',
              matchedTrack: activeTrack.title,
              matchedArtist: activeTrack.artist,
              durationSec: activeTrack.durationSec || 0,
              syncedLines: [],
              plainLines: [],
            });
          } else {
            const syncedLines = best.syncedLyrics ? parseLrcClient(best.syncedLyrics) : [];
            const plainLines = (best.plainLyrics || '')
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean);
            setLyricsData({
              synced: syncedLines.length > 0,
              instrumental: Boolean(best.instrumental) && syncedLines.length === 0 && plainLines.length === 0,
              source: 'lrclib',
              matchedTrack: best.trackName || activeTrack.title,
              matchedArtist: best.artistName || activeTrack.artist,
              durationSec: Math.round(best.duration || activeTrack.durationSec || 0),
              syncedLines,
              plainLines,
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : 'Could not fetch synchronized lyrics');
          setLyricsData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadLyrics();
    return () => {
      cancelled = true;
    };
  }, [activeTrack?.id, activeTrack?.title, activeTrack?.artist, activeTrack?.durationSec, reloadNonce]);

  const syncedLines = lyricsData?.syncedLines ?? [];
  const plainLines = lyricsData?.plainLines ?? [];

  const effectiveDuration = Math.max(1, duration || lyricsData?.durationSec || activeTrack?.durationSec || 30);

  // If no synced lines exist but we have plain lines, proportionally distribute them across the track duration
  const effectiveSyncedLines = useMemo(() => {
    if (syncedLines.length > 0) return syncedLines;
    if (plainLines.length === 0) return [];
    const dur = Math.max(30, effectiveDuration);
    return plainLines.map((text, idx) => ({
      timeSec: Number(((idx / Math.max(1, plainLines.length)) * dur).toFixed(2)),
      text,
    }));
  }, [syncedLines, plainLines, effectiveDuration]);

  const adjustedTime = currentTime + syncOffset;

  const activeLineIdx = useMemo(() => {
    if (effectiveSyncedLines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < effectiveSyncedLines.length; i++) {
      if (adjustedTime + 0.4 >= effectiveSyncedLines[i].timeSec) {
        idx = i;
      } else {
        break;
      }
    }
    // If playback just started or hasn't reached first lyric yet, highlight first line gently
    return idx >= 0 ? idx : 0;
  }, [adjustedTime, effectiveSyncedLines]);

  // Keep active lyric centered smoothly inside its own scroll container (Spotify/Boomplay feel)
  useEffect(() => {
    if (activeLineIdx < 0) return;
    const container = scrollBoxRef.current;
    const activeEl = lineRefs.current[activeLineIdx];
    if (!container || !activeEl) return;

    const targetTop =
      activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  }, [activeLineIdx]);

  return (
    <div className="rounded-xl bg-[#13161B] border border-[#232833] p-5 space-y-4 shadow-xl relative overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232833] pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
            <Mic2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Synchronized Lyrics Shower
              </h3>
              {loading ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-[10px] font-mono font-semibold text-amber-300">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  SYNCING LRC...
                </span>
              ) : lyricsData?.synced ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-[10px] font-mono font-semibold text-emerald-300">
                  <CheckCircle2 className="w-3 h-3" />
                  SYNCED LRC · LRCLIB
                </span>
              ) : plainLines.length > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/35 text-[10px] font-mono font-semibold text-cyan-300">
                  <FileText className="w-3 h-3" />
                  TEXT LYRICS (UNSYNCED)
                </span>
              ) : lyricsData?.instrumental ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/35 text-[10px] font-mono font-semibold text-purple-300">
                  INSTRUMENTAL
                </span>
              ) : null}
            </div>
            <p className="text-xs text-amber-400 truncate max-w-md font-medium mt-0.5">
              {activeTrack
                ? `${activeTrack.title} — ${activeTrack.artist}`
                : 'Play any track in Discover to view real-time synced lyrics'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {effectiveSyncedLines.length > 0 && (
            <div className="flex items-center gap-1.5 bg-[#0B0D10] px-3 py-1.5 rounded-lg border border-[#232833] text-xs font-mono text-slate-300 tabular-nums">
              <span className="text-slate-400">Sync Offset:</span>
              <button
                type="button"
                onClick={() => setSyncOffset((prev) => Number(Math.max(-5, prev - 0.1).toFixed(2)))}
                className="text-amber-400 hover:text-amber-200 font-bold px-1"
                title="Shift lyrics earlier by 100ms (-0.1s)"
              >
                -100ms
              </button>
              <button
                type="button"
                onClick={() => setSyncOffset((prev) => Number(Math.max(-5, prev - 0.5).toFixed(2)))}
                className="text-slate-400 hover:text-slate-200 px-1 text-[11px]"
                title="Shift lyrics earlier by 500ms (-0.5s)"
              >
                -0.5s
              </button>
              <span className="text-amber-300 min-w-[52px] text-center font-bold">
                {syncOffset === 0 ? '0ms' : syncOffset > 0 ? `+${Math.round(syncOffset * 1000)}ms` : `${Math.round(syncOffset * 1000)}ms`}
              </span>
              <button
                type="button"
                onClick={() => setSyncOffset((prev) => Number(Math.min(5, prev + 0.1).toFixed(2)))}
                className="text-amber-400 hover:text-amber-200 font-bold px-1"
                title="Shift lyrics later by 100ms (+0.1s)"
              >
                +100ms
              </button>
              <button
                type="button"
                onClick={() => setSyncOffset((prev) => Number(Math.min(5, prev + 0.5).toFixed(2)))}
                className="text-slate-400 hover:text-slate-200 px-1 text-[11px]"
                title="Shift lyrics later by 500ms (+0.5s)"
              >
                +0.5s
              </button>
              {syncOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setSyncOffset(0)}
                  className="text-xs text-rose-400 hover:text-rose-300 ml-1 font-sans px-1"
                  title="Reset offset to 0"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          {onToggleKaraoke && (
            <button
              type="button"
              onClick={onToggleKaraoke}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                karaokeMode
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-600/30'
                  : 'bg-[#0B0D10] hover:bg-[#1B2028] text-slate-300 border border-[#232833]'
              }`}
              title={karaokeMode ? 'Disable Karaoke Mode (Vocals Enabled)' : 'Enable Karaoke Mode (Hide Original Vocals)'}
            >
              <Mic2 className={`w-3.5 h-3.5 ${karaokeMode ? 'animate-pulse text-pink-300' : 'text-amber-400'}`} />
              <span>{karaokeMode ? 'Karaoke ON' : 'Karaoke Mode'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setSyncOffset(0);
              setReloadNonce((n) => n + 1);
            }}
            className="p-2 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] border border-[#232833] text-slate-300"
            title="Re-fetch synced lyrics"
            aria-label="Reload synced lyrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-2 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] border border-[#232833] text-slate-300"
            title={expanded ? 'Collapse lyrics panel' : 'Expand lyrics panel'}
            aria-label={expanded ? 'Collapse lyrics panel' : 'Expand lyrics panel'}
          >
            {expanded ? (
              <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
            )}
          </button>
        </div>
      </div>

      {karaokeMode && (
        <div className="p-2.5 rounded-lg bg-purple-950/50 border border-purple-700/60 text-xs text-purple-200 flex items-center gap-2">
          <Mic2 className="w-4 h-4 shrink-0 text-pink-400 animate-pulse" />
          <span>
            <strong>Karaoke Mode Active:</strong> Original vocals are muted / suppressed for "{activeTrack?.title || 'active track'}". Sing along into your microphone!
          </span>
        </div>
      )}

      {/* Synchronized Lyric Viewport */}
      <div
        ref={scrollBoxRef}
        className={`relative rounded-xl bg-[#0B0D10] border border-[#232833] px-4 py-6 overflow-y-auto scroll-smooth ${
          expanded ? 'h-96' : 'h-60'
        }`}
      >
        {!activeTrack ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-400 text-xs">
            <Music2 className="w-6 h-6 text-amber-400/70" />
            <p>Select any song card below and press Preview or Full Song to load live LRCLIB lyrics.</p>
          </div>
        ) : loading ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-400 text-xs">
            <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
            <p>Matching timestamped LRC lyrics for "{activeTrack.title}"...</p>
          </div>
        ) : fetchError ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-rose-300 text-xs">
            <p>{fetchError}</p>
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className="px-3 py-1.5 rounded-lg bg-[#1B2028] border border-[#2A313E] text-amber-300"
            >
              Retry Lyrics Lookup
            </button>
          </div>
        ) : effectiveSyncedLines.length > 0 ? (
          <div className="space-y-2.5 text-center py-8">
            {effectiveSyncedLines.map((line, idx) => {
              const isActive = idx === activeLineIdx;
              const isPast = activeLineIdx >= 0 && idx < activeLineIdx;
              return (
                <button
                  key={`${line.timeSec}_${idx}`}
                  ref={(el) => {
                    lineRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => onSeek?.(line.timeSec)}
                  className={`w-full text-center transition-all duration-300 py-2 px-4 rounded-xl flex items-center justify-center gap-2.5 ${
                    isActive
                      ? 'text-amber-200 font-display font-bold text-base sm:text-xl bg-amber-500/15 border border-amber-500/45 shadow-lg'
                      : isPast
                      ? 'text-slate-500 text-xs sm:text-sm hover:text-slate-300'
                      : 'text-slate-400 text-sm sm:text-base hover:text-slate-100 hover:bg-[#13161B]'
                  }`}
                  title={`Jump playback to ${formatTs(line.timeSec)}`}
                >
                  <span className="font-mono text-[10px] text-slate-500 tabular-nums shrink-0">
                    {formatTs(line.timeSec)}
                  </span>
                  <span>{line.text}</span>
                </button>
              );
            })}
          </div>
        ) : plainLines.length > 0 ? (
          <div className="space-y-2 text-center max-w-xl mx-auto">
            {plainLines.map((text, idx) => (
              <p key={idx} className="text-sm text-slate-300 leading-relaxed">
                {text}
              </p>
            ))}
          </div>
        ) : lyricsData?.instrumental ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-400 text-xs">
            <Music2 className="w-6 h-6 text-purple-400" />
            <p>Instrumental release — no vocal lyrics exist for "{activeTrack.title}".</p>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-400 text-xs">
            <p>
              No public LRCLIB lyrics entry was found for "{activeTrack.title}" by {activeTrack.artist}.
            </p>
            <p className="text-[11px] text-slate-500">
              Tip: Open the Full Song stream drawer to watch the official YouTube Lyrics Video when available.
            </p>
          </div>
        )}
      </div>

      {/* Footer Sync Telemetry */}
      <div className="flex items-center justify-between text-xs font-mono text-slate-400 tabular-nums">
        <span className="text-amber-400">
          {formatTs(currentTime)} / {formatTs(effectiveDuration)}
        </span>
        <div className="flex-1 mx-4 h-1.5 rounded-full bg-[#0B0D10] overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-150"
            style={{ width: `${Math.min(100, (currentTime / effectiveDuration) * 100)}%` }}
          />
        </div>
        <span>
          {!activeTrack
            ? 'Idle'
            : syncedLines.length > 0
            ? `${isPlaying ? 'Following Playback' : 'Paused'} · Tap any line to seek`
            : 'Audio Timecode Active'}
        </span>
      </div>
    </div>
  );
}
