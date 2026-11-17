import { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  FolderOpen,
  Copy,
  Trash2,
  Edit3,
  Check,
  X,
  Music,
  Mic,
  Disc,
  Sparkles,
  Library,
  Users,
  Sliders,
} from 'lucide-react';
import type { SavedMusicProject, SavedVocalPresetRecord } from '../../firebase';
import type { ProjectCategory, StudioWorkspaceView } from '../../types/studioPro';
import { AFRICAN_LIBRARY_GENRES } from '../../audio/africanSoundLibrary';
import { BUILTIN_VOCAL_PRESETS } from '../../audio/vocalIntelligence';

interface StudioDashboardProps {
  displayName: string;
  isSignedIn: boolean;
  projects: SavedMusicProject[];
  vocalPresets: SavedVocalPresetRecord[];
  activeProjectId: string | null;
  onCreateProject: (params: {
    title: string;
    category: ProjectCategory;
    genre: string;
    bpm: number;
    musicalKey: string;
    timeSignature: string;
  }) => Promise<void>;
  onOpenProject: (project: SavedMusicProject) => void;
  onRenameProject: (projectId: string, newTitle: string) => Promise<void>;
  onDuplicateProject: (project: SavedMusicProject) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onNavigateView: (view: StudioWorkspaceView) => void;
  onOpenAuth: () => void;
}

export function StudioDashboard({
  displayName,
  isSignedIn,
  projects,
  vocalPresets,
  activeProjectId,
  onCreateProject,
  onOpenProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onNavigateView,
  onOpenAuth,
}: StudioDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProjectCategory>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'title' | 'bpm'>('recent');

  // New project composer state
  const [newTitle, setNewTitle] = useState('Midnight Nairobi Groove');
  const [newCategory, setNewCategory] = useState<ProjectCategory>('song');
  const [newGenre, setNewGenre] = useState('Gengetone');
  const [newBpm, setNewBpm] = useState(106);
  const [newKey, setNewKey] = useState('A minor');
  const [newSig, setNewSig] = useState('4/4');
  const [creating, setCreating] = useState(false);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects
      .filter((p) => {
        const cat = p.category || 'song';
        if (categoryFilter !== 'all' && cat !== categoryFilter) return false;
        if (q) {
          const hay = `${p.title} ${p.genre} ${p.musicalKey || ''} ${p.lyrics || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        if (sortBy === 'bpm') return b.bpm - a.bpm;
        return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
      });
  }, [projects, searchQuery, categoryFilter, sortBy]);

  const counts = useMemo(() => {
    const c = { all: projects.length, beat: 0, recording: 0, song: 0 };
    projects.forEach((p) => {
      const cat = p.category || 'song';
      if (cat in c) c[cat] += 1;
    });
    return c;
  }, [projects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await onCreateProject({
        title: newTitle.trim() || 'Untitled Studio Session',
        category: newCategory,
        genre: newGenre,
        bpm: newBpm,
        musicalKey: newKey,
        timeSignature: newSig,
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome & Create New Project Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-5 rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-2">
            <div className="text-[11px] font-mono tracking-wider uppercase text-sky-400">
              Production Command Center
            </div>
            <h3 className="font-display text-2xl font-bold text-slate-100">
              Welcome back, {displayName}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Manage beats, vocal recordings, full songs, African sound packs, DSP chains, mastering telemetry, and live collaborations in one workspace.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigateView('daw')}
              className="p-3 rounded-lg bg-[#151923] hover:bg-[#1C2230] border border-slate-800 text-left transition-colors"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
                <Sliders className="w-3.5 h-3.5" />
                <span>Multitrack DAW</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Timeline, Piano Roll &amp; FX</div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateView('african_library')}
              className="p-3 rounded-lg bg-[#151923] hover:bg-[#1C2230] border border-slate-800 text-left transition-colors"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
                <Library className="w-3.5 h-3.5" />
                <span>Sound Library</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">11 African &amp; Urban Genres</div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateView('assistant_collab')}
              className="p-3 rounded-lg bg-[#151923] hover:bg-[#1C2230] border border-slate-800 text-left transition-colors"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Music Assistant</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">EN · Kiswahili · Sheng</div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateView('assistant_collab')}
              className="p-3 rounded-lg bg-[#151923] hover:bg-[#1C2230] border border-slate-800 text-left transition-colors"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
                <Users className="w-3.5 h-3.5" />
                <span>Collaboration</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Roles, Comments &amp; Rights</div>
            </button>
          </div>
        </div>

        {/* Create New Project Form */}
        <form
          onSubmit={handleCreate}
          className="xl:col-span-7 rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <h4 className="font-display text-base font-semibold text-slate-100">
                Create New Studio Project
              </h4>
              <p className="text-[11px] text-slate-400">
                Initializes a multitrack session saved to your cloud workspace
              </p>
            </div>
            {!isSignedIn && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 text-xs font-medium whitespace-nowrap"
              >
                Sign In for Cloud Sync
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">Project Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                placeholder="e.g. Kilimani Midnight Session"
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as ProjectCategory)}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-purple-500"
              >
                <option value="song">Full Song</option>
                <option value="beat">My Beat</option>
                <option value="recording">Vocal Recording</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Genre</label>
              <select
                value={newGenre}
                onChange={(e) => setNewGenre(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {AFRICAN_LIBRARY_GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Tempo (BPM)</label>
              <input
                type="number"
                min={40}
                max={240}
                value={newBpm}
                onChange={(e) => setNewBpm(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500 tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Musical Key</label>
              <select
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option>A minor</option>
                <option>C major</option>
                <option>C minor</option>
                <option>D minor</option>
                <option>F minor</option>
                <option>G major</option>
                <option>G minor</option>
                <option>E minor</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Time Signature</label>
              <select
                value={newSig}
                onChange={(e) => setNewSig(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="4/4">4/4</option>
                <option value="3/4">3/4</option>
                <option value="6/8">6/8</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-white text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'Initializing Session...' : 'Create & Open in DAW'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Saved Projects Browser (Search, Filter, Sort, Open, Rename, Duplicate, Delete) */}
      <div className="rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Recent Projects (${counts.all})`, icon: FolderOpen },
                { id: 'beat', label: `My Beats (${counts.beat})`, icon: Disc },
                { id: 'recording', label: `My Recordings (${counts.recording})`, icon: Mic },
                { id: 'song', label: `My Songs (${counts.song})`, icon: Music },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = categoryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-purple-600/25 text-purple-200 border border-purple-500/40'
                      : 'bg-[#090B10] text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, genre, key, lyrics..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'recent' | 'title' | 'bpm')}
              aria-label="Sort projects"
              className="px-3 py-1.5 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-sky-500"
            >
              <option value="recent">Sort: Most Recent</option>
              <option value="title">Sort: Title A-Z</option>
              <option value="bpm">Sort: Tempo BPM</option>
            </select>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-slate-800 rounded-xl space-y-2">
            <p className="text-xs text-slate-400">
              {isSignedIn
                ? 'No matching projects yet. Use "Create New Studio Project" above to start producing.'
                : 'Sign in to sync and reopen projects across devices, or create a session above.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredProjects.map((proj) => {
              const isCurrent = proj.id === activeProjectId;
              const isRenaming = renamingId === proj.id;
              return (
                <div
                  key={proj.id}
                  className={`p-4 rounded-xl border transition-colors flex flex-col justify-between gap-3 ${
                    isCurrent
                      ? 'bg-[#151927] border-purple-500/60'
                      : 'bg-[#090B10] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1.5">
                    {isRenaming ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          className="flex-1 px-2 py-1 rounded bg-[#151923] border border-sky-500 text-xs text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await onRenameProject(proj.id, renameText);
                            setRenamingId(null);
                          }}
                          className="p-1.5 rounded bg-sky-500/20 text-sky-300"
                          aria-label="Confirm rename"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          className="p-1.5 rounded bg-slate-800 text-slate-400"
                          aria-label="Cancel rename"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="font-display text-sm font-semibold text-slate-100 truncate">
                          {proj.title}
                        </h5>
                        <span className="text-[10px] font-mono uppercase text-sky-400 shrink-0">
                          {proj.category || 'song'}
                        </span>
                      </div>
                    )}

                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {proj.genre} · {proj.bpm} BPM · {proj.musicalKey || 'A minor'} ·{' '}
                      {proj.timeSignature || '4/4'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => onOpenProject(proj)}
                      className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/40 text-purple-200 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>{isCurrent ? 'Active in DAW' : 'Open'}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(proj.id);
                          setRenameText(proj.title);
                        }}
                        title="Rename project"
                        className="p-1.5 rounded-lg bg-[#151923] hover:bg-slate-800 text-slate-400 hover:text-slate-100"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateProject(proj)}
                        title="Duplicate project"
                        className="p-1.5 rounded-lg bg-[#151923] hover:bg-slate-800 text-slate-400 hover:text-sky-300"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteProject(proj.id)}
                        title="Delete project"
                        className="p-1.5 rounded-lg bg-[#151923] hover:bg-red-950/60 text-slate-400 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Saved Presets Overview */}
      <div className="rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-display text-sm font-semibold text-slate-100">
              Saved Studio &amp; Vocal Presets
            </h4>
            <p className="text-[11px] text-slate-400">
              {vocalPresets.length} custom Firestore presets · {BUILTIN_VOCAL_PRESETS.length} factory studio chains ready
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateView('vocal_stems')}
            className="px-3 py-1.5 rounded-lg bg-[#151923] hover:bg-[#1C2230] border border-slate-800 text-xs text-sky-300 whitespace-nowrap"
          >
            Manage Presets
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {BUILTIN_VOCAL_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-1"
            >
              <div className="text-xs font-semibold text-slate-200">{preset.name}</div>
              <div className="text-[11px] text-slate-500 line-clamp-2">{preset.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
