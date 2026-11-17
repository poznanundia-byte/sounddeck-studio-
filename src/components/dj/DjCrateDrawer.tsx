import { useEffect, useState } from 'react';
import { Disc3, FolderOpen, HardDrive, Music2, Search, Upload } from 'lucide-react';
import {
  CLUB_CRATE_TRACKS,
  getHarmonicRelation,
  type DeckId,
  type DjCrateTrack,
} from '../../audio/virtualDjEngine';
import type { OfflineLibraryTrack } from '../../types/discoverPlayer';

interface DjCrateDrawerProps {
  activeReferenceKey: string;
  loadingTrackId: string | null;
  onLoadCrateTrack: (deckId: DeckId, track: DjCrateTrack) => void;
  onUploadLocalFile: (deckId: DeckId, file: File) => void;
}

export function DjCrateDrawer({
  activeReferenceKey,
  loadingTrackId,
  onLoadCrateTrack,
  onUploadLocalFile,
}: DjCrateDrawerProps) {
  const [sourceTab, setSourceTab] = useState<'club' | 'offline'>('club');
  const [searchQuery, setSearchQuery] = useState('');
  const [offlineTracks, setOfflineTracks] = useState<DjCrateTrack[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('sounddeck_offline_library_songs');
      if (!raw) return;
      const parsed = JSON.parse(raw) as OfflineLibraryTrack[];
      if (Array.isArray(parsed)) {
        const mapped: DjCrateTrack[] = parsed.map((item, idx) => ({
          id: `offline-${item.id}`,
          offlineId: item.id,
          title: item.title,
          artist: item.artist,
          genre: item.genre || 'Offline Song',
          bpm: 118 + (idx % 12),
          camelotKey: `${((idx + 6) % 12) + 1}A`,
          durationSec: item.durationSec || 180,
          origin: 'offline',
          fallbackUrl: item.fullAudioUrl || item.previewUrl,
        }));
        setOfflineTracks(mapped);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const visibleList = (sourceTab === 'club' ? CLUB_CRATE_TRACKS : offlineTracks).filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.genre.toLowerCase().includes(q) ||
      t.camelotKey.toLowerCase().includes(q)
    );
  });

  return (
    <div className="rounded-xl bg-[#0f131a] border border-[#222834] p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-amber-400" />
          <h3 className="font-display text-sm font-semibold text-slate-100">
            DJ Track Crate &amp; Harmonic Matcher
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg bg-[#080a0f] border border-[#1d2432] p-0.5">
            <button
              type="button"
              onClick={() => setSourceTab('club')}
              className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                sourceTab === 'club'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Disc3 className="w-3.5 h-3.5" />
              <span>Club &amp; Afro ({CLUB_CRATE_TRACKS.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceTab('offline')}
              className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                sourceTab === 'offline'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Offline Library ({offlineTracks.length})</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter BPM, Key, Title..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-[#080a0f] border border-[#1d2432] text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 w-44"
            />
          </div>

          <label className="px-2.5 py-1.5 rounded-lg bg-[#141820] hover:bg-[#1e2432] text-slate-200 text-xs border border-[#293040] flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>Drop Local D1</span>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadLocalFile('A', file);
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {visibleList.length === 0 ? (
        <div className="p-6 rounded-lg bg-[#080a0f] border border-[#1a2130] text-center text-xs text-slate-400 space-y-1">
          <Music2 className="w-5 h-5 text-slate-500 mx-auto" />
          <p>
            {sourceTab === 'offline'
              ? 'No offline songs cached yet. Save full tracks in the Discover tab to spin them directly on Decks 1 & 2.'
              : 'No crate tracks match your filter.'}
          </p>
        </div>
      ) : (
        <div className="max-h-56 overflow-y-auto divide-y divide-[#181f2c] rounded-lg border border-[#1d2432] bg-[#080a0f]">
          {visibleList.map((track) => {
            const harmonic = getHarmonicRelation(activeReferenceKey, track.camelotKey);
            const isLoading = loadingTrackId === track.id;

            return (
              <div
                key={track.id}
                className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#101520] transition-colors"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      harmonic.tier === 'perfect'
                        ? 'bg-emerald-400'
                        : harmonic.tier === 'smooth'
                        ? 'bg-cyan-400'
                        : harmonic.tier === 'energy'
                        ? 'bg-amber-400'
                        : 'bg-slate-600'
                    }`}
                    title={harmonic.label}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-100 truncate">
                      {track.title}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {track.artist} · {track.genre}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono text-amber-300 tabular-nums">
                    {track.bpm} BPM
                  </span>
                  <span className="text-[11px] font-mono text-cyan-300 tabular-nums w-8 text-center">
                    {track.camelotKey}
                  </span>
                  <span className="hidden md:inline text-[10px] font-mono text-slate-400 w-32 truncate">
                    {harmonic.label}
                  </span>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => onLoadCrateTrack('A', track)}
                    className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 text-[11px] font-mono font-semibold transition-colors whitespace-nowrap"
                  >
                    {isLoading ? '...' : 'Load D1'}
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => onLoadCrateTrack('B', track)}
                    className="px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 border border-cyan-500/40 text-[11px] font-mono font-semibold transition-colors whitespace-nowrap"
                  >
                    {isLoading ? '...' : 'Load D2'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
