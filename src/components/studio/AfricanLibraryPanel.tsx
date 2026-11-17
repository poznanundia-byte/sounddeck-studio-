import { useMemo, useRef, useState } from 'react';
import { Search, Play, Square, Download, Plus, ShieldCheck, Music } from 'lucide-react';
import {
  AFRICAN_ASSET_CATEGORIES,
  AFRICAN_LIBRARY_GENRES,
  AFRICAN_SOUND_CATALOG,
  type AfricanAssetCategory,
  type AfricanLibraryGenre,
  type AfricanSoundAsset,
  renderAfricanLibraryItemBuffer,
} from '../../audio/africanSoundLibrary';
import { encodeAudioBufferToWavBlob, triggerFileDownload } from '../../audio/exportEncoders';
import { getAudioContext } from '../../audio/studioAudio';

interface AfricanLibraryPanelProps {
  onAddBufferToTimeline: (asset: AfricanSoundAsset, buffer: AudioBuffer) => void;
  onLoadMidiPattern: (asset: AfricanSoundAsset) => void;
}

export function AfricanLibraryPanel({
  onAddBufferToTimeline,
  onLoadMidiPattern,
}: AfricanLibraryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState<'all' | AfricanLibraryGenre>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | AfricanAssetCategory>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const activeSrcRef = useRef<AudioBufferSourceNode | null>(null);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return AFRICAN_SOUND_CATALOG.filter((item) => {
      if (genreFilter !== 'all' && item.genre !== genreFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (q) {
        const hay = `${item.title} ${item.genre} ${item.category} ${item.regionOrigin} ${item.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [searchQuery, genreFilter, categoryFilter]);

  const stopPreview = () => {
    try {
      activeSrcRef.current?.stop();
    } catch {
      // ignore
    }
    activeSrcRef.current = null;
    setPlayingId(null);
  };

  const handlePreview = async (item: AfricanSoundAsset) => {
    if (playingId === item.id) {
      stopPreview();
      return;
    }
    stopPreview();
    setBusyId(item.id);
    try {
      const buf = await renderAfricanLibraryItemBuffer(item, 44100);
      const ctx = getAudioContext();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => {
        setPlayingId((curr) => (curr === item.id ? null : curr));
      };
      activeSrcRef.current = src;
      src.start();
      setPlayingId(item.id);
    } finally {
      setBusyId(null);
    }
  };

  const handleDownloadAsset = async (item: AfricanSoundAsset) => {
    setBusyId(item.id);
    try {
      const buf = await renderAfricanLibraryItemBuffer(item, 44100);
      const blob = encodeAudioBufferToWavBlob(buf, 16);
      const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      triggerFileDownload(blob, `${slug}-${item.bpm}bpm.wav`);
    } finally {
      setBusyId(null);
    }
  };

  const handleAddToTimeline = async (item: AfricanSoundAsset) => {
    setBusyId(item.id);
    try {
      const buf = await renderAfricanLibraryItemBuffer(item, 44100);
      onAddBufferToTimeline(item, buf);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-purple-300">
              East, West, South &amp; Global Sound Vault
            </div>
            <h3 className="font-display text-xl font-bold text-slate-100 mt-0.5">
              African Music Production Center
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Original synthesized drums, bass, Kengele/Kayamba percussion, melodies &amp; MIDI patterns across 11 African and Urban genres. Zero uncleared commercial recordings.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-emerald-300 bg-emerald-950/35 border border-emerald-800/60 px-3 py-2 rounded-lg shrink-0">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>100% Original Procedural Synthesis · Royalty-Free</span>
          </div>
        </div>

        {/* Search & Genre / Category Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Kengele, 808, Amapiano, Drill..."
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-purple-500"
            />
          </div>

          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value as 'all' | AfricanLibraryGenre)}
            aria-label="Filter by genre"
            className="px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
          >
            <option value="all">All 11 Supported Genres</option>
            {AFRICAN_LIBRARY_GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | AfricanAssetCategory)}
            aria-label="Filter by sound category"
            className="px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
          >
            <option value="all">All Sound Categories</option>
            {AFRICAN_ASSET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {filteredAssets.map((item) => {
          const isPlaying = playingId === item.id;
          const isBusy = busyId === item.id;
          return (
            <div
              key={item.id}
              className="rounded-xl bg-[#0F1219] border border-slate-800/80 p-4 flex flex-col justify-between gap-3 hover:border-purple-500/40 transition-colors"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-display text-sm font-semibold text-slate-100">
                    {item.title}
                  </h4>
                  <span className="text-[10px] font-mono text-sky-400 shrink-0">
                    {item.bpm} BPM
                  </span>
                </div>
                <div className="text-[11px] font-mono text-purple-300">
                  {item.genre} · {item.category} · {item.musicalKey}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                <div className="text-[10px] text-slate-500">{item.licenseLabel}</div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => handlePreview(item)}
                  disabled={isBusy}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border whitespace-nowrap ${
                    isPlaying
                      ? 'bg-red-950/50 border-red-700 text-red-300'
                      : 'bg-[#090B10] hover:bg-[#151923] border-slate-800 text-slate-200'
                  }`}
                >
                  {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 text-sky-400" />}
                  <span>{isPlaying ? 'Stop' : 'Preview'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddToTimeline(item)}
                  disabled={isBusy}
                  className="px-2.5 py-1.5 rounded-lg bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Audio</span>
                </button>

                {(item.midiPattern || item.stepPatternPreset) && (
                  <button
                    type="button"
                    onClick={() => onLoadMidiPattern(item)}
                    className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-medium flex items-center gap-1 whitespace-nowrap"
                  >
                    <Music className="w-3 h-3" />
                    <span>Load MIDI</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDownloadAsset(item)}
                  disabled={isBusy}
                  title="Download .WAV"
                  className="ml-auto p-1.5 rounded-lg bg-[#090B10] hover:bg-[#151923] border border-slate-800 text-slate-300"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
