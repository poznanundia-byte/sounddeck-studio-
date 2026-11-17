import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Sliders,
  Library,
  Mic,
  Activity,
  Users,
  Save,
  PanelRight,
  PanelBottom,
  Box,
  GripVertical,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  saveMusicProject,
  updateMusicProject,
  duplicateMusicProject,
  removeMusicProject,
  subscribeUserVocalPresets,
  subscribeUserExportLogs,
  uploadStudioAudioBlob,
  type SavedMusicProject,
  type PadSampleAssignment,
  type SavedVocalPresetRecord,
  type StudioExportLogRecord,
} from '../../firebase';
import { type DrumPadId, getAudioContext } from '../../audio/studioAudio';
import { getGenreKit, type GenreKitId } from '../../audio/genreKits';
import {
  createDefaultMasterChain,
  createDefaultProEffects,
  ensureStudioGateWorkletLoaded,
} from '../../audio/proChannelStrip';
import type { AfricanSoundAsset } from '../../audio/africanSoundLibrary';
import type {
  CollabRoleAssignment,
  InstrumentId,
  MasterChainState,
  MidiNote,
  ProjectCategory,
  ProjectVersionSnapshot,
  SampleRightsLedgerItem,
  StudioTrack,
  StudioWorkspaceView,
  TimelineClip,
  TrackCommentItem,
} from '../../types/studioPro';
import { StudioDashboard } from '../studio/StudioDashboard';
import { StudioTimelineDaw } from '../studio/StudioTimelineDaw';
import { AfricanLibraryPanel } from '../studio/AfricanLibraryPanel';
import { VocalIntelligencePanel, type VocalTakeItem } from '../studio/VocalIntelligencePanel';
import { StemSeparationPanel } from '../studio/StemSeparationPanel';
import { MasteringAndExportPanel } from '../studio/MasteringAndExportPanel';
import { AiProducerAssistant } from '../studio/AiProducerAssistant';
import { CollabRightsPanel } from '../studio/CollabRightsPanel';

interface MusicCreationTabProps {
  user: User | null;
  projects: SavedMusicProject[];
  padAssignments: PadSampleAssignment[];
  padSampleBuffers: Partial<Record<DrumPadId, AudioBuffer>>;
  discoverCustomSamples: { id: string; title: string; buffer: AudioBuffer }[];
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
  onRemovePadAssignment: (padId: DrumPadId) => Promise<void>;
  onOpenAuth: () => void;
  onActiveTrackChange: (title: string) => void;
  initialBpm?: number;
  onBpmChange?: (bpm: number) => void;
  onOpen3DStage?: () => void;
}

interface StudioHistorySnapshot {
  tracks: StudioTrack[];
  midiNotes: MidiNote[];
  pattern: Record<string, boolean[]>;
  bpm: number;
  musicalKey: string;
  timeSignature: '4/4' | '3/4' | '6/8';
  masterChain: MasterChainState;
}

const TRACK_COLORS: Record<StudioTrack['kind'], string> = {
  drums: '#A855F7',
  instrument: '#38BDF8',
  vocal: '#EC4899',
  audio: '#10B981',
};

function createInitialStudioTracks(): StudioTrack[] {
  return [
    {
      id: 'trk_drums',
      name: 'Drums & Percussion',
      kind: 'drums',
      color: TRACK_COLORS.drums,
      muted: false,
      solo: false,
      armed: false,
      volumeGain: 0.9,
      pan: 0,
      effects: createDefaultProEffects(),
      automation: [],
      clips: [],
    },
    {
      id: 'trk_inst',
      name: 'Synth & 808s',
      kind: 'instrument',
      instrument: 'rhodes_ep',
      color: TRACK_COLORS.instrument,
      muted: false,
      solo: false,
      armed: false,
      volumeGain: 0.85,
      pan: 0,
      effects: createDefaultProEffects(),
      automation: [],
      clips: [],
    },
    {
      id: 'trk_vocal',
      name: 'Lead Vocal',
      kind: 'vocal',
      color: TRACK_COLORS.vocal,
      muted: false,
      solo: false,
      armed: true,
      volumeGain: 0.95,
      pan: 0,
      effects: createDefaultProEffects(),
      automation: [],
      clips: [],
    },
    {
      id: 'trk_audio',
      name: 'Audio / African Loops',
      kind: 'audio',
      color: TRACK_COLORS.audio,
      muted: false,
      solo: false,
      armed: false,
      volumeGain: 0.85,
      pan: 0,
      effects: createDefaultProEffects(),
      automation: [],
      clips: [],
    },
  ];
}

export function MusicCreationTab({
  user,
  projects,
  padAssignments,
  padSampleBuffers,
  discoverCustomSamples,
  onAssignSampleToPad,
  onRemovePadAssignment,
  onOpenAuth,
  onActiveTrackChange,
  initialBpm,
  onBpmChange,
  onOpen3DStage,
}: MusicCreationTabProps) {
  const [workspaceView, setWorkspaceView] = useState<StudioWorkspaceView>('daw');
  const [aiSplitOpen, setAiSplitOpen] = useState(false);
  const [aiSplitWidthPx, setAiSplitWidthPx] = useState(380);
  const [showBottomRack, setShowBottomRack] = useState(true);

  // Active Project Metadata
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState('Midnight Studio Session');
  const [projectCategory, setProjectCategory] = useState<ProjectCategory>('song');
  const [genre, setGenre] = useState('Gengetone');
  const [bpm, setBpm] = useState(initialBpm ?? 106);
  const [musicalKey, setMusicalKey] = useState('A minor');
  const [timeSignature, setTimeSignature] = useState<'4/4' | '3/4' | '6/8'>('4/4');
  const [lyrics, setLyrics] = useState('');

  // DAW Engine State
  const [tracks, setTracks] = useState<StudioTrack[]>(() => createInitialStudioTracks());
  const [midiNotes, setMidiNotes] = useState<MidiNote[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentId>('rhodes_ep');
  const [kitPreset, setKitPreset] = useState<GenreKitId>('gengetone');
  const [pattern, setPattern] = useState<Record<string, boolean[]>>(() => getGenreKit('gengetone').pattern);
  const [masterChain, setMasterChain] = useState<MasterChainState>(() => createDefaultMasterChain());

  // Undo / Redo Stacks
  const [historyPast, setHistoryPast] = useState<StudioHistorySnapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<StudioHistorySnapshot[]>([]);

  // Firestore Collections
  const [vocalPresets, setVocalPresets] = useState<SavedVocalPresetRecord[]>([]);
  const [exportLogs, setExportLogs] = useState<StudioExportLogRecord[]>([]);

  // Collaboration & Version History State
  const [collaborators, setCollaborators] = useState<CollabRoleAssignment[]>([]);
  const [comments, setComments] = useState<TrackCommentItem[]>([]);
  const [versions, setVersions] = useState<ProjectVersionSnapshot[]>([]);

  const [savingProject, setSavingProject] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof initialBpm === 'number') {
      setBpm((prev) => (prev !== initialBpm ? initialBpm : prev));
    }
  }, [initialBpm]);

  useEffect(() => {
    onBpmChange?.(bpm);
  }, [bpm, onBpmChange]);

  useEffect(() => {
    onActiveTrackChange(projectTitle);
  }, [projectTitle, onActiveTrackChange]);

  useEffect(() => {
    // Warm up AudioWorklet module on mount when user interacts
    const ctx = getAudioContext();
    ensureStudioGateWorkletLoaded(ctx).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setVocalPresets([]);
      setExportLogs([]);
      return;
    }
    const unsubPresets = subscribeUserVocalPresets(user.uid, setVocalPresets);
    const unsubLogs = subscribeUserExportLogs(user.uid, setExportLogs);
    return () => {
      unsubPresets();
      unsubLogs();
    };
  }, [user?.uid]);

  // Helper to capture Undo snapshot before state changes
  const captureSnapshot = (): StudioHistorySnapshot => ({
    tracks: tracks.map((t) => ({
      ...t,
      clips: [...t.clips],
      automation: [...t.automation],
    })),
    midiNotes: [...midiNotes],
    pattern: { ...pattern },
    bpm,
    musicalKey,
    timeSignature,
    masterChain: { ...masterChain },
  });

  const pushHistory = () => {
    setHistoryPast((prev) => [...prev.slice(-24), captureSnapshot()]);
    setHistoryFuture([]);
  };

  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const prev = historyPast[historyPast.length - 1];
    setHistoryFuture((f) => [captureSnapshot(), ...f.slice(0, 24)]);
    setHistoryPast((p) => p.slice(0, -1));
    setTracks(prev.tracks);
    setMidiNotes(prev.midiNotes);
    setPattern(prev.pattern);
    setBpm(prev.bpm);
    setMusicalKey(prev.musicalKey);
    setTimeSignature(prev.timeSignature);
    setMasterChain(prev.masterChain);
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryPast((p) => [...p.slice(-24), captureSnapshot()]);
    setHistoryFuture((f) => f.slice(1));
    setTracks(next.tracks);
    setMidiNotes(next.midiNotes);
    setPattern(next.pattern);
    setBpm(next.bpm);
    setMusicalKey(next.musicalKey);
    setTimeSignature(next.timeSignature);
    setMasterChain(next.masterChain);
  };

  const handleUpdateTracks = (nextTracks: StudioTrack[], recordHistory = true) => {
    if (recordHistory) pushHistory();
    setTracks(nextTracks);
  };

  const handleAddTrack = (kind: StudioTrack['kind']) => {
    pushHistory();
    const labelMap: Record<StudioTrack['kind'], string> = {
      drums: 'Drums Layer',
      instrument: 'Instrument Track',
      vocal: 'Vocal Track',
      audio: 'Audio Track',
    };
    const newTrack: StudioTrack = {
      id: `trk_${Date.now()}`,
      name: `${labelMap[kind]} ${tracks.length + 1}`,
      kind,
      instrument: kind === 'instrument' ? selectedInstrument : undefined,
      color: TRACK_COLORS[kind],
      muted: false,
      solo: false,
      armed: kind === 'vocal',
      volumeGain: 0.9,
      pan: 0,
      effects: createDefaultProEffects(),
      automation: [],
      clips: [],
    };
    setTracks((prev) => [...prev, newTrack]);
    setStatusMessage(`Added "${newTrack.name}".`);
  };

  const insertClipIntoTrack = (
    targetKindOrId: StudioTrack['kind'] | string,
    buffer: AudioBuffer,
    clipName: string,
    licenseType: TimelineClip['licenseType'],
    licenseNote: string,
    startAtSec?: number,
    storageUrl?: string
  ) => {
    pushHistory();
    setTracks((prev) => {
      let targetIdx = prev.findIndex(
        (t) => t.id === targetKindOrId || t.kind === targetKindOrId
      );
      const nextTracks = [...prev];
      if (targetIdx === -1) {
        const kind: StudioTrack['kind'] =
          targetKindOrId === 'vocal' ||
          targetKindOrId === 'instrument' ||
          targetKindOrId === 'drums'
            ? targetKindOrId
            : 'audio';
        const created: StudioTrack = {
          id: `trk_${Date.now()}`,
          name:
            kind === 'vocal'
              ? 'Vocal Layer'
              : kind === 'instrument'
              ? 'Synth Layer'
              : 'Audio Track',
          kind,
          color: TRACK_COLORS[kind],
          muted: false,
          solo: false,
          armed: kind === 'vocal',
          volumeGain: 0.9,
          pan: 0,
          effects: createDefaultProEffects(),
          automation: [],
          clips: [],
        };
        nextTracks.push(created);
        targetIdx = nextTracks.length - 1;
      }

      const targetTrack = nextTracks[targetIdx];
      const autoStart =
        typeof startAtSec === 'number'
          ? Math.max(0, startAtSec)
          : targetTrack.clips.reduce(
              (maxEnd, c) => Math.max(maxEnd, c.startSec + c.durationSec),
              0
            );

      const clip: TimelineClip = {
        id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        trackId: targetTrack.id,
        name: clipName,
        startSec: Number(autoStart.toFixed(2)),
        offsetInSourceSec: 0,
        durationSec: Number(buffer.duration.toFixed(2)),
        sourceDurationSec: Number(buffer.duration.toFixed(2)),
        buffer,
        color: targetTrack.color,
        licenseType,
        licenseNote,
        storageUrl,
      };

      nextTracks[targetIdx] = {
        ...targetTrack,
        clips: [...targetTrack.clips, clip],
      };
      return nextTracks;
    });
  };

  const handleDropFilesToTrack = async (trackId: string, files: FileList) => {
    setErrorMsg(null);
    const ctx = getAudioContext();
    for (const file of Array.from(files)) {
      try {
        const ab = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab);
        let storageUrl: string | undefined;
        if (user) {
          const uploaded = await uploadStudioAudioBlob(user.uid, file.name, file);
          storageUrl = uploaded?.downloadUrl;
        }
        insertClipIntoTrack(
          trackId,
          decoded,
          file.name.replace(/\.[^/.]+$/, '').slice(0, 48),
          'imported_external_check_clearance',
          'External user upload — verify copyright/master clearance prior to commercial release.',
          undefined,
          storageUrl
        );
        setStatusMessage(`Imported "${file.name}" onto timeline track.`);
      } catch {
        setErrorMsg(`Unable to decode "${file.name}". Please use a standard WAV or MP3 file.`);
      }
    }
  };

  // Rights & License Provenance Ledger derived live from all timeline clips + custom pad samples
  const rightsLedger: SampleRightsLedgerItem[] = useMemo(() => {
    const items: SampleRightsLedgerItem[] = [];
    const seen = new Set<string>();
    tracks.forEach((tr) => {
      tr.clips.forEach((cl) => {
        const key = `${cl.name}_${cl.licenseType}`;
        if (seen.has(key)) return;
        seen.add(key);
        const isOriginalSynth =
          cl.licenseType === 'original_synth' || cl.licenseType === 'african_library_original';
        const isUserRec = cl.licenseType === 'user_recording';
        items.push({
          id: cl.id,
          sourceName: cl.name,
          category: tr.name,
          licenseStatus: isUserRec
            ? 'original_user'
            : isOriginalSynth
            ? 'original_studio_synth'
            : 'external_requires_clearance',
          attribution: cl.licenseNote,
          verifiedRoyaltyFree: isOriginalSynth || isUserRec,
        });
      });
    });

    discoverCustomSamples.forEach((s) => {
      items.push({
        id: s.id,
        sourceName: `Pad Sample: ${s.title}`,
        category: 'Custom Sampler',
        licenseStatus: 'external_requires_clearance',
        attribution: 'Uploaded user sample — verify clearance if distributing commercially.',
        verifiedRoyaltyFree: false,
      });
    });

    return items;
  }, [tracks, discoverCustomSamples]);

  // Serialize Studio Project State cleanly for Firestore & JSON Backup
  const buildSerializableProjectJson = () =>
    JSON.stringify({
      version: 2,
      projectTitle,
      category: projectCategory,
      genre,
      bpm,
      musicalKey,
      timeSignature,
      kitPreset,
      pattern,
      midiNotes,
      selectedInstrument,
      masterChain,
      trackConfigs: tracks.map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        color: t.color,
        volumeGain: t.volumeGain,
        pan: t.pan,
        effects: t.effects,
        automation: t.automation,
        clipRefs: t.clips.map((c) => ({
          name: c.name,
          startSec: c.startSec,
          durationSec: c.durationSec,
          licenseType: c.licenseType,
          storageUrl: c.storageUrl,
        })),
      })),
      collaborators,
      comments,
      versions,
      rightsLedger,
    });

  const handleSaveActiveProject = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setSavingProject(true);
    setErrorMsg(null);
    setStatusMessage(null);
    try {
      const studioStateJson = buildSerializableProjectJson();
      if (activeProjectId) {
        await updateMusicProject(activeProjectId, {
          title: projectTitle,
          category: projectCategory,
          genre,
          bpm,
          musicalKey,
          timeSignature,
          lyrics,
          kitName: kitPreset,
          studioStateJson,
        });
        setStatusMessage(`Updated cloud project "${projectTitle}".`);
      } else {
        const newId = await saveMusicProject(user.uid, {
          title: projectTitle,
          category: projectCategory,
          genre,
          bpm,
          musicalKey,
          timeSignature,
          lyrics,
          kitName: kitPreset,
          studioStateJson,
        });
        setActiveProjectId(newId);
        setStatusMessage(`Saved new project "${projectTitle}" to Firestore.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save project.');
    } finally {
      setSavingProject(false);
    }
  };

  const handleCreateProject = async (params: {
    title: string;
    category: ProjectCategory;
    genre: string;
    bpm: number;
    musicalKey: string;
    timeSignature: string;
  }) => {
    setErrorMsg(null);
    setProjectTitle(params.title);
    setProjectCategory(params.category);
    setGenre(params.genre);
    setBpm(params.bpm);
    setMusicalKey(params.musicalKey);
    setTimeSignature((params.timeSignature as '4/4' | '3/4' | '6/8') || '4/4');
    setTracks(createInitialStudioTracks());
    setMidiNotes([]);
    setLyrics('');
    setCollaborators([]);
    setComments([]);
    setVersions([]);

    if (user) {
      const newId = await saveMusicProject(user.uid, {
        title: params.title,
        category: params.category,
        genre: params.genre,
        bpm: params.bpm,
        musicalKey: params.musicalKey,
        timeSignature: params.timeSignature,
        kitName: kitPreset,
        studioStateJson: buildSerializableProjectJson(),
      });
      setActiveProjectId(newId);
      setStatusMessage(`Created "${params.title}" in Cloud Studio.`);
    } else {
      setActiveProjectId(null);
      setStatusMessage(`Opened local session "${params.title}" (Sign in anytime to save to cloud).`);
    }
    setWorkspaceView('daw');
  };

  const handleOpenProject = async (proj: SavedMusicProject) => {
    setActiveProjectId(proj.id);
    setProjectTitle(proj.title);
    setProjectCategory(proj.category || 'song');
    setGenre(proj.genre);
    setBpm(proj.bpm);
    setMusicalKey(proj.musicalKey || 'A minor');
    setTimeSignature((proj.timeSignature as '4/4' | '3/4' | '6/8') || '4/4');
    setLyrics(proj.lyrics || '');

    if (proj.studioStateJson) {
      try {
        const parsed = JSON.parse(proj.studioStateJson) as {
          kitPreset?: GenreKitId;
          pattern?: Record<string, boolean[]>;
          midiNotes?: MidiNote[];
          selectedInstrument?: InstrumentId;
          masterChain?: MasterChainState;
          collaborators?: CollabRoleAssignment[];
          comments?: TrackCommentItem[];
          versions?: ProjectVersionSnapshot[];
          trackConfigs?: Array<{
            id: string;
            name: string;
            kind: StudioTrack['kind'];
            color: string;
            volumeGain: number;
            pan: number;
            effects: StudioTrack['effects'];
            automation: StudioTrack['automation'];
            clipRefs?: Array<{
              name: string;
              startSec: number;
              durationSec: number;
              licenseType: TimelineClip['licenseType'];
              storageUrl?: string;
            }>;
          }>;
        };

        if (parsed.kitPreset) setKitPreset(parsed.kitPreset);
        if (parsed.pattern) setPattern(parsed.pattern);
        if (parsed.midiNotes) setMidiNotes(parsed.midiNotes);
        if (parsed.selectedInstrument) setSelectedInstrument(parsed.selectedInstrument);
        if (parsed.masterChain) setMasterChain(parsed.masterChain);
        if (parsed.collaborators) setCollaborators(parsed.collaborators);
        if (parsed.comments) setComments(parsed.comments);
        if (parsed.versions) setVersions(parsed.versions);

        if (parsed.trackConfigs && parsed.trackConfigs.length > 0) {
          const ctx = getAudioContext();
          const hydratedTracks: StudioTrack[] = await Promise.all(
            parsed.trackConfigs.map(async (tc) => {
              const clips: TimelineClip[] = [];
              for (const ref of tc.clipRefs || []) {
                if (ref.storageUrl) {
                  try {
                    const resp = await fetch(ref.storageUrl);
                    const ab = await resp.arrayBuffer();
                    const buf = await ctx.decodeAudioData(ab);
                    clips.push({
                      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                      trackId: tc.id,
                      name: ref.name,
                      startSec: ref.startSec,
                      offsetInSourceSec: 0,
                      durationSec: Math.min(ref.durationSec, buf.duration),
                      sourceDurationSec: buf.duration,
                      buffer: buf,
                      color: tc.color,
                      licenseType: ref.licenseType,
                      licenseNote: 'Restored from Firebase Cloud Storage.',
                      storageUrl: ref.storageUrl,
                    });
                  } catch {
                    // skip unreachable audio ref cleanly
                  }
                }
              }
              return {
                id: tc.id,
                name: tc.name,
                kind: tc.kind,
                color: tc.color,
                muted: false,
                solo: false,
                armed: tc.kind === 'vocal',
                volumeGain: tc.volumeGain,
                pan: tc.pan,
                effects: tc.effects,
                automation: tc.automation || [],
                clips,
              };
            })
          );
          setTracks(hydratedTracks);
        }
      } catch {
        // Fallback to default tracks if malformed JSON
        setTracks(createInitialStudioTracks());
      }
    }
    setWorkspaceView('daw');
    setStatusMessage(`Loaded project "${proj.title}".`);
  };

  // Horizontal AI Split Pane Drag Resize
  const startResizeAiSplit = (e: React.PointerEvent) => {
    const startX = e.clientX;
    const startW = aiSplitWidthPx;
    const onMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX;
      setAiSplitWidthPx(Math.max(290, Math.min(540, startW + delta)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const NAV_ITEMS: { id: StudioWorkspaceView; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'daw', label: 'Multitrack DAW', icon: Sliders },
    { id: 'african_library', label: 'African Sound Library', icon: Library },
    { id: 'vocal_stems', label: 'Vocal & Stems', icon: Mic },
    { id: 'mastering', label: 'Mastering & Export', icon: Activity },
    { id: 'assistant_collab', label: 'AI & Collab', icon: Users },
  ];

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Top Studio Command Strip */}
      <div className="rounded-xl bg-[#0D1017] border border-slate-800/90 p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              aria-label="Project title"
              className="font-display text-lg font-bold text-slate-100 bg-transparent border-b border-transparent hover:border-slate-700 focus:border-purple-500 focus:outline-none px-1 py-0.5 max-w-xs truncate"
            />
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {genre} · {bpm} BPM · {musicalKey} · {timeSignature}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {workspaceView === 'daw' && (
              <button
                type="button"
                onClick={() => setShowBottomRack((s) => !s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 whitespace-nowrap ${
                  showBottomRack
                    ? 'bg-[#151A28] border-sky-500/40 text-sky-300'
                    : 'bg-[#090B10] border-slate-800 text-slate-400'
                }`}
              >
                <PanelBottom className="w-3.5 h-3.5" />
                <span>Production Rack</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setAiSplitOpen((o) => !o)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 whitespace-nowrap ${
                aiSplitOpen
                  ? 'bg-purple-600/25 border-purple-500/50 text-purple-200'
                  : 'bg-[#090B10] hover:bg-[#151923] border-slate-800 text-slate-300'
              }`}
            >
              <PanelRight className="w-3.5 h-3.5" />
              <span>Dock AI Assistant</span>
            </button>

            {onOpen3DStage && (
              <button
                type="button"
                onClick={onOpen3DStage}
                className="px-3 py-1.5 rounded-lg bg-[#090B10] hover:bg-[#151923] border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Box className="w-3.5 h-3.5 text-sky-400" />
                <span>3D Stage</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveActiveProject}
              disabled={savingProject}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {user
                  ? savingProject
                    ? 'Saving...'
                    : activeProjectId
                    ? 'Save Session'
                    : 'Save to Cloud'
                  : 'Sign In to Save'}
              </span>
            </button>
          </div>
        </div>

        {/* Workspace Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-800/70">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = workspaceView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setWorkspaceView(item.id)}
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-gradient-to-r from-purple-600/25 to-sky-500/20 border border-purple-500/50 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#151923]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-sky-400' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200">
          {errorMsg}
        </div>
      )}
      {statusMessage && (
        <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-700/60 text-xs text-sky-200">
          {statusMessage}
        </div>
      )}

      {/* Main Studio Body + Optional Resizable Docked AI Split */}
      <div className="flex flex-col xl:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 w-full">
          {workspaceView === 'dashboard' && (
            <StudioDashboard
              displayName={user?.displayName || 'Producer'}
              isSignedIn={Boolean(user)}
              projects={projects}
              vocalPresets={vocalPresets}
              activeProjectId={activeProjectId}
              onCreateProject={handleCreateProject}
              onOpenProject={handleOpenProject}
              onRenameProject={async (id, nextTitle) => {
                await updateMusicProject(id, { title: nextTitle });
                if (id === activeProjectId) setProjectTitle(nextTitle);
              }}
              onDuplicateProject={async (proj) => {
                if (!user) {
                  onOpenAuth();
                  return;
                }
                await duplicateMusicProject(user.uid, proj);
                setStatusMessage(`Duplicated "${proj.title}".`);
              }}
              onDeleteProject={async (id) => {
                await removeMusicProject(id);
                if (id === activeProjectId) setActiveProjectId(null);
              }}
              onNavigateView={setWorkspaceView}
              onOpenAuth={onOpenAuth}
            />
          )}

          {workspaceView === 'daw' && (
            <StudioTimelineDaw
              bpm={bpm}
              timeSignature={timeSignature}
              tracks={tracks}
              masterChain={masterChain}
              midiNotes={midiNotes}
              selectedInstrument={selectedInstrument}
              kitPreset={kitPreset}
              pattern={pattern}
              padAssignments={padAssignments}
              padSampleBuffers={padSampleBuffers}
              discoverCustomSamples={discoverCustomSamples}
              canUndo={historyPast.length > 0}
              canRedo={historyFuture.length > 0}
              showBottomRack={showBottomRack}
              onChangeBpm={setBpm}
              onChangeTimeSignature={setTimeSignature}
              onChangeTracks={handleUpdateTracks}
              onChangeMidiNotes={(next) => {
                pushHistory();
                setMidiNotes(next);
              }}
              onSelectInstrument={setSelectedInstrument}
              onSelectKitPreset={setKitPreset}
              onChangePattern={setPattern}
              onAssignSampleToPad={onAssignSampleToPad}
              onRemovePadAssignment={onRemovePadAssignment}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onAddTrack={handleAddTrack}
              onDropFilesToTrack={handleDropFilesToTrack}
              onBounceAudioToTrack={(kind, buf, clipName, licenseType = 'original_synth') => {
                insertClipIntoTrack(
                  kind,
                  buf,
                  clipName,
                  licenseType,
                  licenseType === 'user_recording'
                    ? 'Original user studio vocal recording.'
                    : 'Original SoundDeck Web Audio / Tone.js synthesized audio.'
                );
              }}
              onStatusMessage={(m) => {
                setErrorMsg(null);
                setStatusMessage(m);
              }}
              onErrorMessage={(m) => setErrorMsg(m)}
            />
          )}

          {workspaceView === 'african_library' && (
            <AfricanLibraryPanel
              onAddBufferToTimeline={(asset: AfricanSoundAsset, buf: AudioBuffer) => {
                insertClipIntoTrack(
                  'audio',
                  buf,
                  `${asset.title} (${asset.genre})`,
                  'african_library_original',
                  `${asset.licenseLabel} — ${asset.regionOrigin}`
                );
                setStatusMessage(`Added "${asset.title}" to Audio track on Multitrack Timeline.`);
              }}
              onLoadMidiPattern={(asset: AfricanSoundAsset) => {
                pushHistory();
                if (asset.midiPattern) {
                  setMidiNotes(
                    asset.midiPattern.map((n, idx) => ({
                      id: `afr_midi_${idx}_${Date.now()}`,
                      pitch: n.pitch,
                      startStep: n.startStep,
                      durationSteps: n.durationSteps,
                      velocity: 0.82,
                      instrument: selectedInstrument,
                    }))
                  );
                  setBpm(asset.bpm);
                  setMusicalKey(asset.musicalKey);
                  setWorkspaceView('daw');
                  setStatusMessage(`Loaded "${asset.title}" MIDI pattern into Piano Roll (${asset.bpm} BPM).`);
                } else if (asset.stepPatternPreset) {
                  setPattern(asset.stepPatternPreset);
                  setBpm(asset.bpm);
                  setWorkspaceView('daw');
                  setStatusMessage(`Loaded "${asset.title}" drum groove into Step Sequencer (${asset.bpm} BPM).`);
                }
              }}
            />
          )}

          {workspaceView === 'vocal_stems' && (
            <div className="space-y-6">
              <VocalIntelligencePanel
                user={user}
                bpm={bpm}
                genre={genre}
                vocalPresets={vocalPresets}
                onAddVocalToTimeline={(take: VocalTakeItem) => {
                  insertClipIntoTrack(
                    'vocal',
                    take.buffer,
                    take.label,
                    'user_recording',
                    'Original creator vocal take recorded/edited in SoundDeck Vocal Booth.',
                    take.punchInSec,
                    take.storageUrl
                  );
                  setWorkspaceView('daw');
                  setStatusMessage(`Placed "${take.label}" onto Lead Vocal track at ${take.punchInSec}s.`);
                }}
                onOpenAuth={onOpenAuth}
              />

              <StemSeparationPanel
                onImportSeparatedStems={(stems) => {
                  stems.forEach((st) => {
                    const targetKind: StudioTrack['kind'] = st.label
                      .toLowerCase()
                      .includes('vocal')
                      ? 'vocal'
                      : st.label.toLowerCase().includes('drum')
                      ? 'drums'
                      : 'audio';
                    insertClipIntoTrack(
                      targetKind,
                      st.buffer,
                      `Stem: ${st.label}`,
                      'imported_external_check_clearance',
                      'Separated stem from uploaded audio — confirm rights clearance before publishing.'
                    );
                  });
                  setWorkspaceView('daw');
                  setStatusMessage(`Imported ${stems.length} separated stems onto DAW tracks.`);
                }}
              />
            </div>
          )}

          {workspaceView === 'mastering' && (
            <MasteringAndExportPanel
              user={user}
              projectTitle={projectTitle}
              genre={genre}
              bpm={bpm}
              musicalKey={musicalKey}
              lyrics={lyrics}
              tracks={tracks}
              masterChain={masterChain}
              exportLogs={exportLogs}
              onChangeMasterChain={setMasterChain}
              onBuildBackupJson={buildSerializableProjectJson}
            />
          )}

          {workspaceView === 'assistant_collab' && (
            <div className="space-y-6">
              <AiProducerAssistant
                projectTitle={projectTitle}
                genre={genre}
                bpm={bpm}
                musicalKey={musicalKey}
                trackNames={tracks.map((t) => t.name)}
                hasVocals={tracks.some((t) => t.kind === 'vocal' && t.clips.length > 0)}
                existingLyrics={lyrics}
                onApplyTempoAndKey={(nextBpm, nextKey) => {
                  pushHistory();
                  setBpm(nextBpm);
                  setMusicalKey(nextKey);
                  setStatusMessage(`Applied AI recommendation: ${nextBpm} BPM · ${nextKey}.`);
                }}
                onApplyLyrics={(nextLyrics) => {
                  setLyrics(nextLyrics);
                  setStatusMessage('Saved edited lyrics draft to active project.');
                }}
                onInsertChordsToPianoRoll={(notes) => {
                  pushHistory();
                  setMidiNotes(notes);
                  setWorkspaceView('daw');
                  setStatusMessage(`Inserted ${notes.length} AI chord MIDI notes into Piano Roll.`);
                }}
                onImportLyriaAudio={async (audioDataUrl, title) => {
                  const res = await fetch(audioDataUrl);
                  const ab = await res.arrayBuffer();
                  const ctx = getAudioContext();
                  const decoded = await ctx.decodeAudioData(ab);
                  insertClipIntoTrack(
                    'audio',
                    decoded,
                    title,
                    'original_synth',
                    'Generated via Google Lyria AI Music model inside SoundDeck Studio.'
                  );
                  setWorkspaceView('daw');
                  setStatusMessage(`Imported Lyria audio clip "${title}" to timeline.`);
                }}
              />

              <CollabRightsPanel
                user={user}
                projectTitle={projectTitle}
                bpm={bpm}
                musicalKey={musicalKey}
                lyrics={lyrics}
                trackNames={tracks.map((t) => t.name)}
                collaborators={collaborators}
                comments={comments}
                versions={versions}
                rightsLedger={rightsLedger}
                onChangeCollaborators={setCollaborators}
                onChangeComments={setComments}
                onChangeVersions={setVersions}
                onRestoreVersion={(snap) => {
                  pushHistory();
                  setBpm(snap.bpm);
                  setMusicalKey(snap.musicalKey);
                  setLyrics(snap.lyrics);
                  setStatusMessage(`Restored checkpoint "${snap.label}" (${snap.bpm} BPM · ${snap.musicalKey}).`);
                }}
                onOpenAuth={onOpenAuth}
              />
            </div>
          )}
        </div>

        {/* Resizable Horizontal Docked AI Assistant Split Panel */}
        {aiSplitOpen && workspaceView !== 'assistant_collab' && (
          <div className="hidden xl:flex items-stretch shrink-0">
            <div
              onPointerDown={startResizeAiSplit}
              className="w-2.5 cursor-ew-resize flex items-center justify-center hover:bg-purple-500/20 rounded transition-colors"
              title="Drag horizontally to resize AI Assistant panel"
            >
              <GripVertical className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div
              style={{ width: `${aiSplitWidthPx}px` }}
              className="max-h-[820px] overflow-y-auto pl-1"
            >
              <AiProducerAssistant
                projectTitle={projectTitle}
                genre={genre}
                bpm={bpm}
                musicalKey={musicalKey}
                trackNames={tracks.map((t) => t.name)}
                hasVocals={tracks.some((t) => t.kind === 'vocal' && t.clips.length > 0)}
                existingLyrics={lyrics}
                onApplyTempoAndKey={(nextBpm, nextKey) => {
                  pushHistory();
                  setBpm(nextBpm);
                  setMusicalKey(nextKey);
                  setStatusMessage(`Applied AI recommendation: ${nextBpm} BPM · ${nextKey}.`);
                }}
                onApplyLyrics={(nextLyrics) => {
                  setLyrics(nextLyrics);
                  setStatusMessage('Saved edited lyrics draft to active project.');
                }}
                onInsertChordsToPianoRoll={(notes) => {
                  pushHistory();
                  setMidiNotes(notes);
                  setStatusMessage(`Loaded ${notes.length} AI chord notes into Piano Roll.`);
                }}
                onImportLyriaAudio={async (audioDataUrl, title) => {
                  const res = await fetch(audioDataUrl);
                  const ab = await res.arrayBuffer();
                  const ctx = getAudioContext();
                  const decoded = await ctx.decodeAudioData(ab);
                  insertClipIntoTrack(
                    'audio',
                    decoded,
                    title,
                    'original_synth',
                    'Generated via Google Lyria AI Music model inside SoundDeck Studio.'
                  );
                  setStatusMessage(`Imported Lyria clip "${title}" to timeline.`);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
