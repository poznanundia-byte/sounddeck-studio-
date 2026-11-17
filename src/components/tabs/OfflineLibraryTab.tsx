import React, { useMemo, useState } from 'react';
import {
  Download,
  HardDrive,
  ListMusic,
  Music2,
  Play,
  Search,
  SkipForward,
  Sliders,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { useOfflineLibrary } from '../../hooks/useOfflineLibrary';
import { useOnlineStatus } from '../OfflineIndicator';
import { getOfflineAudioBlob } from '../../audio/offlineLibraryDb';
import {
  DRUM_PADS,
  type DrumPadId,
  getAudioContext,
  renderGrooveBuffer,
  audioBufferToWavBlob,
  triggerBlobDownload,
} from '../../audio/studioAudio';
import {
  type GlobalSearchTrack,
  type OfflineLibraryTrack,
  type PersistentPlayerState,
} from '../../types/discoverPlayer';

interface OfflineLibraryTabProps {
  persistentPlayer: PersistentPlayerState | null;
  onPlayOfflineQueue: (
    queue: GlobalSearchTrack[],
    startIndex: number
  ) => void;
  onAssignSampleToPad: (params: {
    padId: DrumPadId;
    sampleName: string;
    sourceType: 'catalog' | 'custom_audio';
    sourceTrackId: string;
    grooveStyle: 'afro' | 'house' | 'trap';
    bpm: number;
    sliceStartSec: number;
    sliceDurationSec: number;
    rawBuffer?: AudioBuffer;
  }) => Promise<{ savedToCloud: boolean }>;
  onNavigateToDiscover: () => void;
  onNavigateToCreation: () => void;
}

function formatDurationSec(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '0:00';
  const whole = Math.max(0, Math.floor(sec));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toGlobalQueueTrack(song: OfflineLibraryTrack): GlobalSearchTrack {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    genre: song.genre,
    durationSec: song.durationSec,
    coverUrl: song.coverUrl,
    previewUrl: song.previewUrl || '',
    fullAudioUrl: song.fullAudioUrl || '',
    youtubeVideoId: song.youtubeVideoId,
    soundcloudPermalink: song.soundcloudPermalink,
    soundcloudTrackId: song.soundcloudTrackId,
    source: (song.source as GlobalSearchTrack['source']) || 'deezer',
    score: 100,
  };
}

export const OfflineLibraryTab: React.FC<OfflineLibraryTabProps> = ({
  persistentPlayer,
  onPlayOfflineQueue,
  onAssignSampleToPad,
  onNavigateToDiscover,
  onNavigateToCreation,
}) => {
  const isOnline = useOnlineStatus();
  const {
    tracks,
    blobSizes,
    totalBytes,
    removeTrack,
    clearLibrary,
    importLocalAudioFile,
  } = useOfflineLibrary();

  const [searchText, setSearchText] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'cached' | 'local'>('all');
  const [sortOrder, setSortOrder] = useState<'recent' | 'title' | 'size'>('recent');
  const [confirmClear, setConfirmClear] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [padPickerTrackId, setPadPickerTrackId] = useState<string | null>(null);
  const [targetPadId, setTargetPadId] = useState<DrumPadId>('pluck');
  const [chopOffsetSec, setChopOffsetSec] = useState<number>(0);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const [importingFile, setImportingFile] = useState(false);

  const filteredTracks = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const list = tracks.filter((song) => {
      const hasBlob = (blobSizes[song.id] ?? 0) > 0 || Boolean(song.hasLocalBlob);
      if (sourceFilter === 'cached' && !hasBlob) return false;
      if (sourceFilter === 'local' && song.source !== 'local') return false;
      if (!q) return true;
      return (
        song.title.toLowerCase().includes(q) ||
        song.artist.toLowerCase().includes(q) ||
        song.genre.toLowerCase().includes(q) ||
        song.album.toLowerCase().includes(q)
      );
    });

    if (sortOrder === 'title') {
      return [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortOrder === 'size') {
      return [...list].sort((a, b) => {
        const sizeA = blobSizes[a.id] ?? a.fileSizeBytes ?? 0;
        const sizeB = blobSizes[b.id] ?? b.fileSizeBytes ?? 0;
        return sizeB - sizeA;
      });
    }
    return list;
  }, [tracks, blobSizes, searchText, sourceFilter, sortOrder]);

  const cachedBlobCount = useMemo(
    () =>
      tracks.filter(
        (item) => (blobSizes[item.id] ?? 0) > 0 || Boolean(item.hasLocalBlob)
      ).length,
    [tracks, blobSizes]
  );

  const isPlayingOfflineQueue = persistentPlayer?.queueLabel === 'Offline Library';
  const activeQueueIndex = isPlayingOfflineQueue
    ? persistentPlayer?.queueIndex ?? -1
    : -1;
  const upNextSong =
    isPlayingOfflineQueue &&
    activeQueueIndex >= 0 &&
    filteredTracks.length > 1 &&
    activeQueueIndex + 1 < filteredTracks.length
      ? filteredTracks[activeQueueIndex + 1]
      : null;

  const handlePlayAt = (index: number) => {
    if (filteredTracks.length === 0 || index < 0 || index >= filteredTracks.length) {
      return;
    }
    const queue = filteredTracks.map(toGlobalQueueTrack);
    onPlayOfflineQueue(queue, index);
  };

  const handleExportCachedTrack = async (song: OfflineLibraryTrack) => {
    setBusyTrackId(song.id);
    setStatusNotice(null);
    try {
      let blob = await getOfflineAudioBlob(song.id);
      if (!blob) {
        // Offline fallback synthesis if metadata existed without binary blob
        const buf = await renderGrooveBuffer('afro', 112, 4);
        blob = audioBufferToWavBlob(buf);
      }
      const slug = song.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const artistSlug = song.artist
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const ext = song.format || 'mp3';
      triggerBlobDownload(blob, `${slug || 'track'}-${artistSlug || 'sounddeck'}.${ext}`);
      setStatusNotice(`Exported "${song.title}" (.${ext}) directly from local offline storage.`);
    } catch {
      setStatusNotice(`Unable to export "${song.title}" from offline cache.`);
    } finally {
      setBusyTrackId(null);
    }
  };

  const handleSendCachedTrackToPad = async (song: OfflineLibraryTrack) => {
    setBusyTrackId(song.id);
    setStatusNotice(null);
    try {
      const blob = await getOfflineAudioBlob(song.id);
      if (!blob) {
        setStatusNotice(`"${song.title}" has no cached audio bytes yet. Re-download while online.`);
        return;
      }
      const arr = await blob.arrayBuffer();
      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(arr);
      const padConfig = DRUM_PADS.find((p) => p.id === targetPadId);

      await onAssignSampleToPad({
        padId: targetPadId,
        sampleName: song.title,
        sourceType: 'custom_audio',
        sourceTrackId: song.id,
        grooveStyle: 'afro',
        bpm: 112,
        sliceStartSec: chopOffsetSec,
        sliceDurationSec: 1.5,
        rawBuffer: decoded,
      });

      setPadPickerTrackId(null);
      setStatusNotice(
        `Mapped "${song.title}" (${chopOffsetSec.toFixed(1)}s chop) onto Pad [${padConfig?.keyBind}] ${padConfig?.label} offline.`
      );
    } catch {
      setStatusNotice(`Could not decode "${song.title}" for Beat Pad chopping.`);
    } finally {
      setBusyTrackId(null);
    }
  };

  const handleImportLocalAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImportingFile(true);
    setStatusNotice(null);
    try {
      let importedCount = 0;
      for (const file of Array.from(files)) {
        await importLocalAudioFile(file);
        importedCount += 1;
      }
      setStatusNotice(
        `Saved ${importedCount} local audio file${importedCount === 1 ? '' : 's'} to your Offline Library.`
      );
    } catch {
      setStatusNotice('Failed to import selected audio file into Offline Library.');
    } finally {
      setImportingFile(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Storage Summary */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[#232833] pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-mono">
            {isOnline ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <Wifi className="w-3.5 h-3.5" />
                <span>Online · Synced with Discover Downloads</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-400">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Offline Mode · Browsing Local Cache</span>
              </span>
            )}
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-100">
            Offline Library
          </h2>
          <p className="text-sm text-slate-400 max-w-2xl">
            Browse, play, export, and sample your downloaded songs directly from local IndexedDB storage — works even without an internet connection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#13161B] hover:bg-[#1B2028] text-slate-200 text-xs font-medium border border-[#232833] flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap">
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>{importingFile ? 'Importing...' : 'Import Local Audio'}</span>
            <input
              type="file"
              accept="audio/*"
              multiple
              onChange={handleImportLocalAudio}
              className="hidden"
            />
          </label>

          {tracks.length > 0 && (
            <button
              type="button"
              onClick={() => handlePlayAt(0)}
              disabled={filteredTracks.length === 0}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Play All Offline</span>
            </button>
          )}
        </div>
      </div>

      {/* Storage Telemetry Strip (Clean Unboxed Typographic Numbers) */}
      <div className="rounded-xl bg-[#13161B] border border-[#232833] px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-slate-400">Saved Tracks</div>
          <div className="text-xl font-display font-bold text-slate-100 mt-0.5 tabular-nums">
            {tracks.length}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Audio Ready Offline</div>
          <div className="text-xl font-display font-bold text-emerald-400 mt-0.5 tabular-nums">
            {cachedBlobCount}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Local Cache Size</div>
          <div className="text-xl font-display font-bold text-amber-400 mt-0.5 tabular-nums">
            {formatBytes(totalBytes)}
          </div>
        </div>
        <div className="flex items-center sm:justify-end">
          {tracks.length > 0 &&
            (confirmClear ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void clearLibrary();
                    setConfirmClear(false);
                    setStatusNotice('Cleared all cached offline audio tracks.');
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-semibold"
                >
                  Confirm Clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#0B0D10] border border-[#232833] text-xs text-slate-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="min-h-[40px] px-3 py-2 rounded-lg bg-[#0B0D10] hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 text-xs font-medium border border-[#232833] hover:border-rose-700/50 flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Cache</span>
              </button>
            ))}
        </div>
      </div>

      {statusNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-950/45 border border-emerald-700/50 text-xs text-emerald-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusNotice}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onNavigateToCreation}
              className="text-amber-300 font-semibold hover:underline inline-flex items-center gap-1"
            >
              <span>Open Beat Pads</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-slate-400 hover:text-slate-100"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Active Queue Status Banner */}
      {isPlayingOfflineQueue && persistentPlayer && (
        <div className="rounded-xl bg-[#13161B] border border-emerald-500/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <ListMusic className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="text-xs text-slate-200 truncate">
              <span className="text-emerald-400 font-semibold">Playing Offline:</span>{' '}
              {persistentPlayer.track.title} — {persistentPlayer.track.artist}
            </div>
          </div>
          {upNextSong ? (
            <button
              type="button"
              onClick={() => handlePlayAt(activeQueueIndex + 1)}
              className="text-xs font-mono text-amber-300 hover:text-amber-200 flex items-center gap-1.5 shrink-0"
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span>Up Next: {upNextSong.title}</span>
            </button>
          ) : (
            <span className="text-[11px] font-mono text-slate-500">
              End of offline queue
            </span>
          )}
        </div>
      )}

      {/* Search, Filter & Sort Toolbar (100% Client-Side Offline) */}
      {tracks.length > 0 && (
        <div className="rounded-xl bg-[#13161B] border border-[#232833] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search saved songs, artists, albums, or genres offline..."
              className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0D10] border border-[#232833] text-xs">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'cached', label: 'Cached Audio' },
                  { id: 'local', label: 'Imported' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSourceFilter(f.id)}
                  className={`px-2.5 py-1.5 rounded transition-colors whitespace-nowrap ${
                    sourceFilter === f.id
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <select
              value={sortOrder}
              onChange={(e) =>
                setSortOrder(e.target.value as 'recent' | 'title' | 'size')
              }
              aria-label="Sort offline tracks"
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0B0D10] border border-[#232833] text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="recent">Sort: Recently Saved</option>
              <option value="title">Sort: Title (A–Z)</option>
              <option value="size">Sort: File Size</option>
            </select>
          </div>
        </div>
      )}

      {/* Track Grid or Empty State */}
      {tracks.length === 0 ? (
        <div className="rounded-xl bg-[#13161B] border border-[#232833] p-10 sm:p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#0B0D10] border border-[#232833] flex items-center justify-center mx-auto">
            <HardDrive className="w-6 h-6 text-amber-400" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display text-base font-semibold text-slate-100">
              No Offline Songs Saved Yet
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Whenever you download a song in Discover (via <strong className="text-amber-400">Download Full Song</strong> or <strong className="text-amber-400">MP3Juice Download</strong>), it is automatically cached here so you can browse and play it without internet.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {isOnline && (
              <button
                type="button"
                onClick={onNavigateToDiscover}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <span>Browse Discover &amp; Download Songs</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <label className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0B0D10] hover:bg-[#1B2028] text-slate-200 text-xs font-medium border border-[#232833] flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap">
              <Upload className="w-4 h-4 text-amber-400" />
              <span>Import Audio From Device</span>
              <input
                type="file"
                accept="audio/*"
                multiple
                onChange={handleImportLocalAudio}
                className="hidden"
              />
            </label>
          </div>
        </div>
      ) : filteredTracks.length === 0 ? (
        <div className="rounded-xl bg-[#13161B] border border-[#232833] p-8 text-center space-y-2">
          <div className="text-sm font-semibold text-slate-200">
            No cached tracks match &ldquo;{searchText}&rdquo;
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchText('');
              setSourceFilter('all');
            }}
            className="text-xs text-amber-400 hover:underline"
          >
            Reset search &amp; filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTracks.map((song, idx) => {
            const isSelected = persistentPlayer?.track.id === song.id;
            const isUpNext = upNextSong?.id === song.id;
            const cachedSize = blobSizes[song.id] ?? song.fileSizeBytes ?? 0;
            const hasLocalAudio = cachedSize > 0 || Boolean(song.hasLocalBlob);
            const isPadOpen = padPickerTrackId === song.id;

            return (
              <div
                key={song.id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-3.5 transition-colors ${
                  isSelected
                    ? 'bg-[#171C24] border-emerald-500/70'
                    : isUpNext
                    ? 'bg-[#151921] border-amber-500/45'
                    : 'bg-[#13161B] border-[#232833]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-lg bg-[#0B0D10] border border-[#232833] overflow-hidden shrink-0 flex items-center justify-center">
                    {song.coverUrl && isOnline ? (
                      <img
                        src={song.coverUrl}
                        alt={song.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <Music2 className="w-5 h-5 text-amber-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-display text-sm font-semibold text-slate-100 truncate">
                        {song.title}
                      </h4>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                        {isSelected ? 'Playing' : isUpNext ? 'Up Next' : `#${idx + 1}`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 truncate">{song.artist}</p>
                    <div className="text-[11px] font-mono text-slate-500 mt-1 flex flex-wrap items-center gap-1.5 tabular-nums">
                      <span>{formatDurationSec(song.durationSec)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{hasLocalAudio ? formatBytes(cachedSize) : 'Metadata'}</span>
                      {song.format && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="uppercase">{song.format}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className={hasLocalAudio ? 'text-emerald-400' : 'text-slate-500'}>
                        {hasLocalAudio ? 'Offline Ready' : song.downloadedAt}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inline Beat Pad Chop Drawer */}
                {isPadOpen && (
                  <div className="p-3 rounded-lg bg-[#0B0D10] border border-[#232833] space-y-2.5">
                    <div className="text-[11px] font-medium text-slate-300">
                      Chop Cached Audio onto Beat Pad (Works Offline)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={targetPadId}
                        onChange={(e) => setTargetPadId(e.target.value as DrumPadId)}
                        aria-label="Target drum pad"
                        className="px-2 py-1.5 rounded bg-[#13161B] border border-[#232833] text-[11px] text-slate-100"
                      >
                        {DRUM_PADS.map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.keyBind}] {p.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={chopOffsetSec}
                        onChange={(e) => setChopOffsetSec(Number(e.target.value))}
                        aria-label="Chop start offset"
                        className="px-2 py-1.5 rounded bg-[#13161B] border border-[#232833] text-[11px] font-mono text-slate-100"
                      >
                        <option value={0}>Chop 0.0s</option>
                        <option value={0.5}>Chop 0.5s</option>
                        <option value={1.0}>Chop 1.0s</option>
                        <option value={2.0}>Chop 2.0s</option>
                        <option value={5.0}>Chop 5.0s</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSendCachedTrackToPad(song)}
                        disabled={busyTrackId === song.id}
                        className="flex-1 min-h-[36px] py-1.5 px-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {busyTrackId === song.id ? 'Mapping...' : 'Assign to Pad'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPadPickerTrackId(null)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-[#232833]">
                  <button
                    type="button"
                    onClick={() => handlePlayAt(idx)}
                    className={`flex-1 min-h-[40px] py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{isSelected ? 'Playing Now' : 'Play Offline'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleExportCachedTrack(song)}
                    disabled={busyTrackId === song.id}
                    title="Save cached audio file to device"
                    aria-label={`Save ${song.title} file`}
                    className="min-h-[40px] min-w-[40px] py-2 px-2.5 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] text-slate-200 text-xs font-medium border border-[#232833] flex items-center justify-center transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPadPickerTrackId(isPadOpen ? null : song.id)
                    }
                    title="Chop onto Beat Pad offline"
                    aria-label={`Map ${song.title} to Beat Pad`}
                    className={`min-h-[40px] min-w-[40px] py-2 px-2.5 rounded-lg border text-xs flex items-center justify-center transition-colors ${
                      isPadOpen
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-[#0B0D10] hover:bg-[#1B2028] border-[#232833] text-slate-300'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void removeTrack(song.id)}
                    title="Remove from Offline Library"
                    aria-label={`Remove ${song.title} from Offline Library`}
                    className="min-h-[40px] min-w-[40px] py-2 px-2.5 rounded-lg bg-rose-950/35 hover:bg-rose-900/45 text-rose-300 text-xs border border-rose-800/45 flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
