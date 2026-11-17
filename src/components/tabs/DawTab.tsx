import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Repeat,
  Circle,
  Scissors,
  Copy,
  ClipboardPaste,
  Trash2,
  VolumeX,
  Volume2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MousePointer,
  MoveHorizontal,
  Search,
  Download,
  Upload,
  Plus,
  X,
  Sliders,
  ChevronDown,
  Keyboard,
  Activity,
  Sparkles,
  Wand2,
  Mic2,
  Check,
  Music,
} from 'lucide-react';
import { LiveRegionWaveform } from './LiveRegionWaveform';
import {
  getAudioContext,
  getStudioMasterNode,
  getStudioAnalyser,
  renderGrooveBuffer,
  triggerSynthPad,
  audioBufferToWavBlob,
  triggerBlobDownload,
  triggerMetronomeClick,
  BEAT_SIGNATURE_CONFIG,
  type DrumPadId,
  type BeatSignature,
} from '../../audio/studioAudio';
import {
  cloneAudioBuffer,
  extractBufferRange,
  deleteBufferRange,
  trimBufferToRange,
  insertBufferAtSec,
  silenceBufferRange,
  applyFadeRange,
  applyReverseRange,
  applyInvertRange,
  applyNormalizeOrAmplify,
  applyEchoToRange,
  applyEqToRange,
  generateSynthesizedClip,
  mixdownMultitrackToBuffer,
  runVocalMasteringPipeline,
  type VocalPolishOptions,
} from '../../audio/dawDsp';

import { DawEffectRack } from './DawEffectRack';
import {
  createDefaultTrackEffects,
  createTrackEffectChain,
  updateTrackEffectChain,
  bakeEffectRackIntoBuffer,
  type TrackEffectsState,
  type TrackEffectChainInstance,
} from '../../audio/effectRackNodes';

interface DawTabProps {
  initialBpm?: number;
  initialBeatSignature?: BeatSignature;
}

interface DawTrack {
  id: string;
  name: string;
  buffer: AudioBuffer | null;
  offsetSec: number;
  gainDb: number;
  pan: number; // -1..1
  muted: boolean;
  solo: boolean;
  rate: number; // 0.6..1.6
  viewMode: 'waveform' | 'spectrogram';
  effects: TrackEffectsState;
}

function cloneTrackEffects(fx?: TrackEffectsState): TrackEffectsState {
  if (!fx) return createDefaultTrackEffects();
  return {
    bypassAll: fx.bypassAll,
    compressor: { ...fx.compressor },
    delay: { ...fx.delay },
    reverb: { ...fx.reverb },
  };
}

type ToolMode = 'select' | 'shift' | 'zoom';
type MenuId =
  | 'file'
  | 'edit'
  | 'select'
  | 'view'
  | 'transport'
  | 'tracks'
  | 'generate'
  | 'effect'
  | 'audacity'
  | null;

interface HistorySnapshot {
  tracks: DawTrack[];
  selectedTrackId: string;
}

const MEME_SFX_PRESETS: { id: DrumPadId; label: string }[] = [
  { id: 'airhorn', label: 'Club Airhorn' },
  { id: 'scratch', label: 'Vinyl Rewind' },
  { id: 'kick808', label: '808 Boom' },
  { id: 'brass', label: 'Dramatic Brass' },
];

function formatTimecode(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const remSec = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);
  return `${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function DawTab({ initialBpm = 112, initialBeatSignature = '4/4' }: DawTabProps) {
  const [tracks, setTracks] = useState<DawTrack[]>([
    {
      id: 'trk_1',
      name: 'Track 1 · Song / Remix Stem',
      buffer: null,
      offsetSec: 0,
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      rate: 1.0,
      viewMode: 'waveform',
      effects: createDefaultTrackEffects(),
    },
    {
      id: 'trk_2',
      name: 'Track 2 · Vocal / Meme Overdub',
      buffer: null,
      offsetSec: 0,
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      rate: 1.0,
      viewMode: 'waveform',
      effects: createDefaultTrackEffects(),
    },
  ]);
  const [selectedTrackId, setSelectedTrackId] = useState<string>('trk_1');

  // Wavacity workspace state
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [pxPerSec, setPxPerSec] = useState<number>(80);
  const [projectRate, setProjectRate] = useState<44100 | 48000>(44100);
  const [snapMode, setSnapMode] = useState<'off' | '0.1s' | '0.5s'>('off');

  // Selection & transport state
  const [playheadSec, setPlayheadSec] = useState<number>(0);
  const [selectionStart, setSelectionStart] = useState<number>(0);
  const [selectionEnd, setSelectionEnd] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [loopSelection, setLoopSelection] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [meterLevelPct, setMeterLevelPct] = useState<number>(0);
  const [meterPeakDb, setMeterPeakDb] = useState<number>(-60);

  // Undo / Redo & Clipboard
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);
  const [clipboardBuffer, setClipboardBuffer] = useState<AudioBuffer | null>(null);

  const [renderingWav, setRenderingWav] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showLiveVisualizer, setShowLiveVisualizer] = useState(true);
  const [showEffectRack, setShowEffectRack] = useState(true);
  const [compReductionDb, setCompReductionDb] = useState<number>(0);
  const [bakingEffects, setBakingEffects] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav');
  const [includeMetronome, setIncludeMetronome] = useState(false);
  const [exportBpm, setExportBpm] = useState<number>(initialBpm);
  const [exportBeatSignature, setExportBeatSignature] = useState<BeatSignature>(initialBeatSignature);

  // AI Vocal Studio Polish & Auto-Alignment State
  const [autoPolishOnRecord, setAutoPolishOnRecord] = useState(true);
  const [showVocalPolishModal, setShowVocalPolishModal] = useState(false);
  const [targetVocalTrackId, setTargetVocalTrackId] = useState<string>('trk_1');
  const [isPolishingVocal, setIsPolishingVocal] = useState(false);
  const [vocalPolishSettings, setVocalPolishSettings] = useState<VocalPolishOptions>({
    denoise: true,
    denoiseThresholdDb: -40,
    clarifyHoarseVoice: true,
    autoTune: true,
    scale: 'A minor', // Key of "Time" by Toxic Lyrikali
    tuneSpeed: 0.85,
    beatAlign: true,
    bpm: initialBpm || 112,
    normalizeVolume: true,
  });

  const [playbackAnalyser, setPlaybackAnalyser] = useState<AnalyserNode | null>(null);
  const [recordAnalyser, setRecordAnalyser] = useState<AnalyserNode | null>(null);
  const [playTiming, setPlayTiming] = useState<{ startWallMs: number; startSec: number }>({
    startWallMs: 0,
    startSec: 0,
  });
  const [recStartWallMs, setRecStartWallMs] = useState<number>(0);
  const [statusMsg, setStatusMsg] = useState<string>(
    'Wavacity Web DAW ready — load an audio file, generate a stem, or record mic to start editing.'
  );

  // Refs for real-time playback, drag tracking, and file picking
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const activeEffectChainsRef = useRef<Record<string, TrackEffectChainInstance>>({});
  const playbackTimerRef = useRef<number | null>(null);
  const playStartWallRef = useRef<number>(0);
  const playOffsetRef = useRef<number>(0);
  const dawAnalyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetUploadTrackRef = useRef<string>('trk_1');
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineWrapRef = useRef<HTMLDivElement | null>(null);
  const effectRackRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  // Pointer drag tracking on timeline
  const dragStateRef = useRef<{
    active: boolean;
    trackId: string;
    startX: number;
    anchorSec: number;
    origOffsetSec: number;
  } | null>(null);

  const projectDurationSec = Math.max(
    10,
    ...tracks.map((t) => (t.buffer ? t.offsetSec + t.buffer.duration / Math.max(0.25, t.rate) : 0))
  );
  const timelineWidthPx = Math.max(680, Math.round((projectDurationSec + 2) * pxPerSec));

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) || tracks[0];

  const snapTime = useCallback(
    (sec: number) => {
      const clamped = Math.max(0, sec);
      if (snapMode === '0.1s') return Math.round(clamped * 10) / 10;
      if (snapMode === '0.5s') return Math.round(clamped * 2) / 2;
      return clamped;
    },
    [snapMode]
  );

  const pushUndoSnapshot = useCallback(
    (currentTracks: DawTrack[], currentSelectedId: string) => {
      const ctx = getAudioContext();
      const cloned = currentTracks.map((t) => ({
        ...t,
        buffer: t.buffer ? cloneAudioBuffer(ctx, t.buffer) : null,
        effects: cloneTrackEffects(t.effects),
      }));
      setUndoStack((prev) => [...prev.slice(-19), { tracks: cloned, selectedTrackId: currentSelectedId }]);
      setRedoStack([]);
    },
    []
  );

  // Close dropdown menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Stop playback helper
  const stopPlayback = useCallback((resetCursor = false) => {
    if (playbackTimerRef.current) {
      window.clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    activeSourcesRef.current.forEach((src) => {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // Already stopped
      }
    });
    activeSourcesRef.current = [];
    Object.values(activeEffectChainsRef.current).forEach((chain) => {
      chain.disconnect();
    });
    activeEffectChainsRef.current = {};
    setIsPlaying(false);
    setIsPaused(false);
    setMeterLevelPct(0);
    setMeterPeakDb(-60);
    setCompReductionDb(0);
    if (resetCursor) {
      setPlayheadSec(selectionStart);
    }
  }, [selectionStart]);

  useEffect(() => {
    return () => {
      stopPlayback(false);
      micSourceRef.current?.disconnect();
      micSourceRef.current = null;
    };
  }, [stopPlayback]);

  // Real-time Effect Rack parameter modulation during playback
  useEffect(() => {
    if (!isPlaying) return;
    const ctx = getAudioContext();
    tracks.forEach((track) => {
      const chain = activeEffectChainsRef.current[track.id];
      if (chain) {
        updateTrackEffectChain(ctx, chain, track.effects);
      }
    });
  }, [tracks, isPlaying]);

  // Live L/R Output dB Meter & Compressor Gain Reduction loop while playing
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    const freqBins = new Uint8Array(64);
    const updateMeter = () => {
      const analyser = getStudioAnalyser();
      if (analyser) {
        analyser.getByteTimeDomainData(freqBins);
        let maxAmp = 0;
        for (let i = 0; i < freqBins.length; i++) {
          const sample = Math.abs((freqBins[i] - 128) / 128);
          if (sample > maxAmp) maxAmp = sample;
        }
        const pct = Math.min(100, Math.round(maxAmp * 115));
        const db = maxAmp > 0.001 ? Math.max(-54, Math.round(20 * Math.log10(maxAmp))) : -60;
        setMeterLevelPct(pct);
        setMeterPeakDb(db);
      }
      const activeChain = activeEffectChainsRef.current[selectedTrackId];
      if (activeChain) {
        setCompReductionDb(activeChain.compressorNode.reduction || 0);
      } else {
        setCompReductionDb(0);
      }
      rafId = requestAnimationFrame(updateMeter);
    };
    rafId = requestAnimationFrame(updateMeter);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, selectedTrackId]);

  // Render waveforms & spectrograms per track
  useEffect(() => {
    tracks.forEach((track) => {
      const canvas = canvasRefs.current[track.id];
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Lane background
      const isSelectedTrack = track.id === selectedTrackId;
      ctx.fillStyle = isSelectedTrack ? '#0E1218' : '#0B0D10';
      ctx.fillRect(0, 0, w, h);

      // Subtle vertical time grid lines every 1s
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
      ctx.lineWidth = 1;
      for (let s = 1; s * pxPerSec < w; s++) {
        const gx = Math.round(s * pxPerSec) + 0.5;
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }

      // Zero crossing center line
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (track.buffer) {
        const clipStartX = Math.max(0, Math.round(track.offsetSec * pxPerSec));
        const clipDurationSec = track.buffer.duration / Math.max(0.25, track.rate);
        const clipWidthPx = Math.max(4, Math.round(clipDurationSec * pxPerSec));
        const data = track.buffer.getChannelData(0);

        // Clip region subtle backdrop
        ctx.fillStyle = track.muted ? 'rgba(71, 85, 105, 0.12)' : 'rgba(56, 189, 248, 0.06)';
        ctx.fillRect(clipStartX, 2, clipWidthPx, h - 4);
        ctx.strokeStyle = isSelectedTrack ? 'rgba(245, 158, 11, 0.45)' : 'rgba(56, 189, 248, 0.25)';
        ctx.strokeRect(clipStartX + 0.5, 2.5, Math.max(2, clipWidthPx - 1), h - 5);

        if (track.viewMode === 'spectrogram') {
          // Real time-frequency energy band heatmap (zero-crossing rate + RMS energy stripes)
          const colStep = 4;
          const bands = 16;
          const bandH = h / bands;
          for (let x = 0; x < clipWidthPx && clipStartX + x < w; x += colStep) {
            const sampleCenter = Math.floor((x / clipWidthPx) * data.length);
            const win = Math.min(512, Math.max(64, Math.floor(data.length / Math.max(1, clipWidthPx))));
            let rms = 0;
            let zc = 0;
            let prev = 0;
            for (let k = 0; k < win && sampleCenter + k < data.length; k++) {
              const v = data[sampleCenter + k];
              rms += v * v;
              if ((v >= 0 && prev < 0) || (v < 0 && prev >= 0)) zc++;
              prev = v;
            }
            rms = Math.sqrt(rms / win);
            const centroidBand = Math.min(bands - 1, Math.floor((zc / win) * bands * 2.2));
            for (let b = 0; b < bands; b++) {
              const dist = Math.abs(b - centroidBand);
              const energy = Math.min(1, rms * 3.8 * Math.exp(-dist * 0.35));
              if (energy < 0.04) continue;
              const hue = Math.round(220 - energy * 185); // Blue -> Amber -> Orange-Red
              ctx.fillStyle = `hsla(${hue}, 90%, ${Math.round(28 + energy * 38)}%, ${0.35 + energy * 0.65})`;
              ctx.fillRect(clipStartX + x, h - (b + 1) * bandH, colStep, bandH - 0.5);
            }
          }
        } else {
          // Authentic Audacity/Wavacity dual-layer Waveform (peak outer + RMS core)
          const samplesPerPx = Math.max(1, Math.floor(data.length / clipWidthPx));
          const yMid = h / 2;

          // Outer Peak envelope
          ctx.strokeStyle = track.muted ? '#475569' : '#38BDF8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let x = 0; x < clipWidthPx && clipStartX + x < w; x++) {
            const idx = Math.floor((x / clipWidthPx) * data.length);
            let min = 0;
            let max = 0;
            for (let k = 0; k < samplesPerPx && idx + k < data.length; k++) {
              const v = data[idx + k];
              if (v < min) min = v;
              if (v > max) max = v;
            }
            const gainLin = Math.pow(10, track.gainDb / 20);
            const yTop = yMid - Math.min(1, max * gainLin) * (h * 0.44);
            const yBot = yMid - Math.max(-1, min * gainLin) * (h * 0.44);
            ctx.moveTo(clipStartX + x + 0.5, yTop);
            ctx.lineTo(clipStartX + x + 0.5, yBot);
          }
          ctx.stroke();

          // Inner RMS highlight envelope
          ctx.strokeStyle = track.muted ? '#64748B' : '#F59E0B';
          ctx.beginPath();
          for (let x = 0; x < clipWidthPx && clipStartX + x < w; x++) {
            const idx = Math.floor((x / clipWidthPx) * data.length);
            let sumSq = 0;
            let count = 0;
            for (let k = 0; k < samplesPerPx && idx + k < data.length; k++) {
              sumSq += data[idx + k] * data[idx + k];
              count++;
            }
            const rms = Math.sqrt(sumSq / Math.max(1, count));
            const gainLin = Math.pow(10, track.gainDb / 20);
            const amp = Math.min(1, rms * gainLin) * (h * 0.44);
            ctx.moveTo(clipStartX + x + 0.5, yMid - amp);
            ctx.lineTo(clipStartX + x + 0.5, yMid + amp);
          }
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#475569';
        ctx.font = '11px JetBrains Mono, monospace';
        ctx.fillText('Empty Track — Load Audio, Generate Tone/Loop, or Record', 14, h / 2 - 8);
      }

      // Highlight active time range selection across track
      if (selectionEnd > selectionStart) {
        const sx = Math.round(selectionStart * pxPerSec);
        const ex = Math.round(selectionEnd * pxPerSec);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.fillRect(sx, 0, Math.max(2, ex - sx), h);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + 0.5, 0);
        ctx.lineTo(sx + 0.5, h);
        ctx.moveTo(ex + 0.5, 0);
        ctx.lineTo(ex + 0.5, h);
        ctx.stroke();
      }

      // Playhead line
      const px = Math.round(playheadSec * pxPerSec);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px + 0.5, 0);
      ctx.lineTo(px + 0.5, h);
      ctx.stroke();
    });
  }, [tracks, selectedTrackId, pxPerSec, timelineWidthPx, selectionStart, selectionEnd, playheadSec]);

  // Transport Play / Pause
  const handlePlay = useCallback(
    (forceLoop = false) => {
      if (isPlaying) {
        stopPlayback(false);
        setIsPaused(true);
        return;
      }

      const anySolo = tracks.some((t) => t.solo);
      const playable = tracks.filter((t) => t.buffer && !t.muted && (!anySolo || t.solo));
      if (playable.length === 0) {
        setStatusMsg('Load, generate, or unmute at least one audio track before playing.');
        return;
      }

      const ctx = getAudioContext();
      const masterDest = getStudioMasterNode(ctx);
      if (!dawAnalyserRef.current || dawAnalyserRef.current.context !== ctx) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.65;
        analyser.connect(masterDest);
        dawAnalyserRef.current = analyser;
      }
      setPlaybackAnalyser(dawAnalyserRef.current);

      const hasSelection = selectionEnd - selectionStart > 0.05;
      const startAt = hasSelection ? selectionStart : playheadSec >= projectDurationSec - 0.1 ? 0 : playheadSec;
      const stopAt = hasSelection ? selectionEnd : projectDurationSec;
      const shouldLoop = (forceLoop || loopSelection) && hasSelection;

      const sources: AudioBufferSourceNode[] = [];
      const effectChains: Record<string, TrackEffectChainInstance> = {};
      const baseAudioTime = ctx.currentTime + 0.03;

      playable.forEach((track) => {
        if (!track.buffer) return;
        const trackDur = track.buffer.duration / Math.max(0.25, track.rate);
        const clipStart = track.offsetSec;
        const clipEnd = track.offsetSec + trackDur;

        if (clipEnd <= startAt || clipStart >= stopAt) return;

        const src = ctx.createBufferSource();
        src.buffer = track.buffer;
        src.playbackRate.value = track.rate;

        const gainNode = ctx.createGain();
        gainNode.gain.value = Math.pow(10, track.gainDb / 20);
        const panNode = ctx.createStereoPanner();
        panNode.pan.value = Math.max(-1, Math.min(1, track.pan));

        const chain = createTrackEffectChain(ctx, track.effects);
        effectChains[track.id] = chain;

        src.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(chain.input);
        chain.output.connect(dawAnalyserRef.current!);

        const delayFromPlayStart = Math.max(0, clipStart - startAt);
        const offsetInsideClipSec = Math.max(0, (startAt - clipStart) * track.rate);
        const maxPlayDur = Math.max(0.02, stopAt - Math.max(startAt, clipStart));

        src.start(baseAudioTime + delayFromPlayStart, offsetInsideClipSec, maxPlayDur * track.rate);
        sources.push(src);
      });

      activeEffectChainsRef.current = effectChains;

      if (sources.length === 0) {
        setStatusMsg('No audio overlaps the current cursor or selection range.');
        return;
      }

      activeSourcesRef.current = sources;
      playStartWallRef.current = performance.now();
      playOffsetRef.current = startAt;
      setPlayTiming({ startWallMs: playStartWallRef.current, startSec: startAt });
      setIsPlaying(true);
      setIsPaused(false);

      playbackTimerRef.current = window.setInterval(() => {
        const elapsed = (performance.now() - playStartWallRef.current) / 1000;
        const currentPos = playOffsetRef.current + elapsed;
        if (currentPos >= stopAt) {
          if (shouldLoop) {
            stopPlayback(false);
            window.setTimeout(() => handlePlay(true), 25);
          } else {
            stopPlayback(false);
            setPlayheadSec(startAt);
          }
        } else {
          setPlayheadSec(currentPos);
        }
      }, 30);
    },
    [isPlaying, tracks, selectionStart, selectionEnd, playheadSec, projectDurationSec, loopSelection, stopPlayback]
  );

  const shortcutActionsRef = useRef<{
    isPlaying: boolean;
    stopPlayback: (resetCursor?: boolean) => void;
    handlePlay: (forceLoop?: boolean) => void;
    handleToggleRecord: () => void;
    handleDeleteSelection: () => void;
    handleUndo: () => void;
    handleRedo: () => void;
    handleCopy: () => void;
    handleCut: () => void;
    handlePaste: () => void;
    handleSilenceSelection: () => void;
    handleTrimToSelection: () => void;
    selectAllTimeline: () => void;
    jumpToStart: () => void;
    jumpToEnd: () => void;
    toggleLoop: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    setTool: (mode: ToolMode) => void;
    closeOverlays: () => void;
  }>(null!);

  // Undo & Redo
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prevSnap = undoStack[undoStack.length - 1];
    const ctx = getAudioContext();
    setRedoStack((r) => [
      ...r,
      {
        tracks: tracks.map((t) => ({
          ...t,
          buffer: t.buffer ? cloneAudioBuffer(ctx, t.buffer) : null,
          effects: cloneTrackEffects(t.effects),
        })),
        selectedTrackId,
      },
    ]);
    setTracks(prevSnap.tracks);
    setSelectedTrackId(prevSnap.selectedTrackId);
    setUndoStack((u) => u.slice(0, -1));
    setStatusMsg('Undid last DAW edit.');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextSnap = redoStack[redoStack.length - 1];
    const ctx = getAudioContext();
    setUndoStack((u) => [
      ...u,
      {
        tracks: tracks.map((t) => ({
          ...t,
          buffer: t.buffer ? cloneAudioBuffer(ctx, t.buffer) : null,
          effects: cloneTrackEffects(t.effects),
        })),
        selectedTrackId,
      },
    ]);
    setTracks(nextSnap.tracks);
    setSelectedTrackId(nextSnap.selectedTrackId);
    setRedoStack((r) => r.slice(0, -1));
    setStatusMsg('Redid DAW edit.');
  };

  const handleUpdateTrackEffects = useCallback(
    (trackId: string, updater: (prev: TrackEffectsState) => TrackEffectsState) => {
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId ? { ...t, effects: updater(t.effects) } : t
        )
      );
    },
    []
  );

  const handleBakeTrackEffects = async (trackId: string) => {
    const trk = tracks.find((t) => t.id === trackId);
    if (!trk || !trk.buffer) {
      setStatusMsg('Load or record audio on this track before baking the Effect Rack.');
      return;
    }
    setBakingEffects(true);
    try {
      pushUndoSnapshot(tracks, selectedTrackId);
      const baked = await bakeEffectRackIntoBuffer(trk.buffer, trk.effects);
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? {
                ...t,
                buffer: baked,
                effects: createDefaultTrackEffects(),
              }
            : t
        )
      );
      setStatusMsg(`Baked real-time Effect Rack DSP directly into "${trk.name}".`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to bake track effects.');
    } finally {
      setBakingEffects(false);
    }
  };

  // Resolve active edit window in track-local seconds
  const getLocalEditBounds = (track: DawTrack): [number, number] | null => {
    if (!track.buffer) return null;
    const dur = track.buffer.duration;
    if (selectionEnd - selectionStart > 0.03) {
      const localStart = Math.max(0, (selectionStart - track.offsetSec) * track.rate);
      const localEnd = Math.min(dur, (selectionEnd - track.offsetSec) * track.rate);
      if (localEnd - localStart > 0.02) return [localStart, localEnd];
      return null;
    }
    return [0, dur];
  };

  // Apply Edit / Effect operations onto selectedTrack
  const runTrackOperation = async (
    label: string,
    op: (track: DawTrack, startSec: number, endSec: number, ctx: AudioContext) => Promise<AudioBuffer | null> | AudioBuffer | null
  ) => {
    if (!selectedTrack || !selectedTrack.buffer) {
      setStatusMsg('Select a track with loaded audio before running this operation.');
      return;
    }
    const bounds = getLocalEditBounds(selectedTrack);
    if (!bounds) {
      setStatusMsg('Selection range does not overlap the selected track clip.');
      return;
    }
    const ctx = getAudioContext();
    pushUndoSnapshot(tracks, selectedTrackId);
    const updatedBuf = await op(selectedTrack, bounds[0], bounds[1], ctx);
    setTracks((prev) =>
      prev.map((t) => (t.id === selectedTrack.id ? { ...t, buffer: updatedBuf } : t))
    );
    setStatusMsg(`${label} applied to ${selectedTrack.name}.`);
  };

  const handleCopy = () => {
    if (!selectedTrack?.buffer) {
      setStatusMsg('No audio in selected track to copy.');
      return;
    }
    const bounds = getLocalEditBounds(selectedTrack);
    if (!bounds) {
      setStatusMsg('Select an overlapping region first.');
      return;
    }
    const ctx = getAudioContext();
    setClipboardBuffer(extractBufferRange(ctx, selectedTrack.buffer, bounds[0], bounds[1]));
    setStatusMsg(`Copied ${(bounds[1] - bounds[0]).toFixed(2)}s to DAW clipboard.`);
  };

  const handleCut = async () => {
    if (!selectedTrack?.buffer) return;
    const bounds = getLocalEditBounds(selectedTrack);
    if (!bounds) {
      setStatusMsg('Select a region to cut.');
      return;
    }
    const ctx = getAudioContext();
    setClipboardBuffer(extractBufferRange(ctx, selectedTrack.buffer, bounds[0], bounds[1]));
    await runTrackOperation('Cut Selection', (trk, s0, s1, c) =>
      deleteBufferRange(c, trk.buffer!, s0, s1)
    );
    setSelectionEnd(selectionStart);
  };

  const handlePaste = () => {
    if (!clipboardBuffer || !selectedTrack) {
      setStatusMsg('Clipboard is empty — Copy or Cut a selection first.');
      return;
    }
    const ctx = getAudioContext();
    pushUndoSnapshot(tracks, selectedTrackId);
    const localCursor = Math.max(0, (playheadSec - selectedTrack.offsetSec) * selectedTrack.rate);
    const pasted = insertBufferAtSec(ctx, selectedTrack.buffer, clipboardBuffer, localCursor);
    setTracks((prev) =>
      prev.map((t) => (t.id === selectedTrack.id ? { ...t, buffer: pasted } : t))
    );
    setStatusMsg(`Pasted ${clipboardBuffer.duration.toFixed(2)}s at ${formatTimecode(playheadSec)}.`);
  };

  const handleDeleteSelection = async () => {
    if (selectionEnd - selectionStart <= 0.02) {
      setStatusMsg('Drag across a waveform to highlight a region first, then press Del to delete it.');
      return;
    }
    await runTrackOperation('Delete Selection', (trk, s0, s1, c) =>
      deleteBufferRange(c, trk.buffer!, s0, s1)
    );
    setSelectionEnd(selectionStart);
  };

  const handleTrimToSelection = () => {
    if (selectionEnd - selectionStart <= 0.03) {
      setStatusMsg('Drag across a waveform to highlight the range you want to keep before trimming.');
      return;
    }
    runTrackOperation('Trim Outside Selection', (trk, s0, s1, c) => {
      setSelectionStart(trk.offsetSec);
      setSelectionEnd(trk.offsetSec + (s1 - s0) / trk.rate);
      return trimBufferToRange(c, trk.buffer!, s0, s1);
    });
  };

  const handleSilenceSelection = () =>
    runTrackOperation('Silence Selection', (trk, s0, s1, c) =>
      silenceBufferRange(c, trk.buffer!, s0, s1)
    );

  // Add / Duplicate / Remove / Mixdown Tracks
  const handleAddEmptyTrack = () => {
    pushUndoSnapshot(tracks, selectedTrackId);
    const newId = `trk_${Date.now()}`;
    setTracks((prev) => [
      ...prev,
      {
        id: newId,
        name: `Track ${prev.length + 1} · Audio`,
        buffer: null,
        offsetSec: 0,
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        rate: 1.0,
        viewMode: 'waveform',
        effects: createDefaultTrackEffects(),
      },
    ]);
    setSelectedTrackId(newId);
    setStatusMsg('Added new stereo audio track.');
  };

  const handleDuplicateSelectedTrack = () => {
    if (!selectedTrack) return;
    pushUndoSnapshot(tracks, selectedTrackId);
    const ctx = getAudioContext();
    const newId = `trk_${Date.now()}`;
    setTracks((prev) => [
      ...prev,
      {
        ...selectedTrack,
        id: newId,
        name: `${selectedTrack.name} (Copy)`,
        buffer: selectedTrack.buffer ? cloneAudioBuffer(ctx, selectedTrack.buffer) : null,
        effects: cloneTrackEffects(selectedTrack.effects),
      },
    ]);
    setSelectedTrackId(newId);
    setStatusMsg(`Duplicated "${selectedTrack.name}".`);
  };

  const handleRemoveTrack = (id: string) => {
    if (tracks.length <= 1) {
      pushUndoSnapshot(tracks, selectedTrackId);
      setTracks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, buffer: null, offsetSec: 0 } : t))
      );
      setStatusMsg('Cleared track audio.');
      return;
    }
    pushUndoSnapshot(tracks, selectedTrackId);
    const remaining = tracks.filter((t) => t.id !== id);
    setTracks(remaining);
    if (selectedTrackId === id && remaining[0]) {
      setSelectedTrackId(remaining[0].id);
    }
  };

  const handleMixAndRenderTrack = async () => {
    const rendered = await mixdownMultitrackToBuffer(tracks, projectRate);
    if (!rendered) {
      setStatusMsg('Load at least one unmuted track before running Mix & Render.');
      return;
    }
    pushUndoSnapshot(tracks, selectedTrackId);
    const newId = `trk_${Date.now()}`;
    setTracks((prev) => [
      ...prev,
      {
        id: newId,
        name: `Mixdown Track (${prev.length + 1})`,
        buffer: rendered,
        offsetSec: 0,
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        rate: 1.0,
        viewMode: 'waveform',
        effects: createDefaultTrackEffects(),
      },
    ]);
    setSelectedTrackId(newId);
    setStatusMsg('Rendered active tracks into a new stereo Mixdown Track.');
  };

  // File Import & Demo / Generate Clips
  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const ab = await file.arrayBuffer();
      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(ab);
      pushUndoSnapshot(tracks, selectedTrackId);
      const targetId = targetUploadTrackRef.current || selectedTrackId;
      setTracks((prev) =>
        prev.map((t) => (t.id === targetId ? { ...t, buffer: decoded, name: file.name } : t))
      );
      setStatusMsg(`Imported "${file.name}" (${decoded.duration.toFixed(2)}s).`);
    } catch {
      setStatusMsg('Unable to decode audio file. Choose a valid .wav, .mp3, .ogg, or .m4a file.');
    }
  };

  const handleLoadDemoStem = async (style: 'afro' | 'house' | 'trap') => {
    const buf = await renderGrooveBuffer(style, style === 'afro' ? 112 : style === 'house' ? 124 : 140, 4);
    pushUndoSnapshot(tracks, selectedTrackId);
    const targetId = selectedTrack?.id || tracks[0].id;
    setTracks((prev) =>
      prev.map((t) =>
        t.id === targetId
          ? { ...t, buffer: buf, offsetSec: 0, name: `Demo Stem · ${style.toUpperCase()}` }
          : t
      )
    );
    setStatusMsg(`Loaded ${style.toUpperCase()} groove stem onto ${selectedTrack?.name}.`);
  };

  const handleGenerateAudio = (kind: 'sine' | 'chirp' | 'noise' | 'silence') => {
    const ctx = getAudioContext();
    const buf = generateSynthesizedClip(ctx, kind, 2.5, 440, 0.55);
    pushUndoSnapshot(tracks, selectedTrackId);
    const targetId = selectedTrack?.id || tracks[0].id;
    setTracks((prev) =>
      prev.map((t) =>
        t.id === targetId
          ? {
              ...t,
              buffer: buf,
              offsetSec: playheadSec,
              name: `Generated ${kind.toUpperCase()}`,
            }
          : t
      )
    );
    setStatusMsg(`Generated 2.5s ${kind} clip onto ${selectedTrack?.name}.`);
  };

  const handleInsertMemeSfx = async (padId: DrumPadId, label: string) => {
    const offline = new OfflineAudioContext(2, Math.floor(projectRate * 1.2), projectRate);
    triggerSynthPad(offline, offline.destination, padId, 0.02, 0.95);
    const rendered = await offline.startRendering();
    pushUndoSnapshot(tracks, selectedTrackId);
    const targetId = selectedTrack?.id || tracks[0].id;
    setTracks((prev) =>
      prev.map((t) =>
        t.id === targetId ? { ...t, buffer: rendered, name: `SFX · ${label}` } : t
      )
    );
    const ctx = getAudioContext();
    triggerSynthPad(ctx, getStudioMasterNode(ctx), padId, ctx.currentTime, 0.75);
    setStatusMsg(`Inserted ${label} stinger onto ${selectedTrack?.name}.`);
  };

  // Record Microphone Directly Onto Selected Track
  const handleToggleRecord = async () => {
    if (isRecording) {
      mediaRecRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = getAudioContext();
      const micSource = ctx.createMediaStreamSource(stream);
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 1024;
      micAnalyser.smoothingTimeConstant = 0.6;
      micSource.connect(micAnalyser);
      micSourceRef.current = micSource;
      setRecordAnalyser(micAnalyser);
      setRecStartWallMs(performance.now());

      const rec = new MediaRecorder(stream);
      recChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) recChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        micSourceRef.current?.disconnect();
        micSourceRef.current = null;
        setRecordAnalyser(null);
        setRecStartWallMs(0);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunksRef.current, { type: 'audio/webm' });
        const ab = await blob.arrayBuffer();
        const decodeCtx = getAudioContext();
        const decoded = await decodeCtx.decodeAudioData(ab);
        pushUndoSnapshot(tracks, selectedTrackId);
        const newId = `trk_rec_${Date.now()}`;

        let finalBuffer = decoded;
        let finalOffset = playheadSec;
        let trackLabel = `Recorded Vocal Take (${decoded.duration.toFixed(1)}s)`;

        if (autoPolishOnRecord) {
          try {
            const polishResult = await runVocalMasteringPipeline(
              decodeCtx,
              decoded,
              playheadSec,
              {
                ...vocalPolishSettings,
                bpm: vocalPolishSettings.bpm || exportBpm || 112,
              }
            );
            finalBuffer = polishResult.processedBuffer;
            finalOffset = polishResult.newOffsetSec;
            trackLabel = `Remix Vocal Take (Polished · ${vocalPolishSettings.scale})`;
            setStatusMsg(`✨ Auto-Polished Take: ${polishResult.summary}`);
          } catch {
            setStatusMsg(`Recorded ${decoded.duration.toFixed(2)}s take at ${formatTimecode(playheadSec)}.`);
          }
        } else {
          setStatusMsg(`Recorded ${decoded.duration.toFixed(2)}s take. Click "✨ Polish" to clean, tune & beat-align.`);
        }

        setTracks((prev) => [
          ...prev,
          {
            id: newId,
            name: trackLabel,
            buffer: finalBuffer,
            offsetSec: finalOffset,
            gainDb: 0,
            pan: 0,
            muted: false,
            solo: false,
            rate: 1.0,
            viewMode: 'waveform',
            effects: createDefaultTrackEffects(),
          },
        ]);
        setSelectedTrackId(newId);
        setTargetVocalTrackId(newId);
      };
      mediaRecRef.current = rec;
      rec.start();
      setIsRecording(true);
      setStatusMsg(
        autoPolishOnRecord
          ? 'Recording vocal take... When you stop, it will automatically de-noise, de-mud hoarse bass, auto-tune, and align to beats!'
          : 'Recording microphone... Click Record or Stop when finished.'
      );
    } catch {
      micSourceRef.current?.disconnect();
      micSourceRef.current = null;
      setRecordAnalyser(null);
      setRecStartWallMs(0);
      setStatusMsg('Microphone permission denied. Import a vocal file via File > Open Audio instead.');
    }
  };

  const handleApplyVocalPolishToTrack = async (
    trackId?: string,
    customOptions?: Partial<VocalPolishOptions>
  ) => {
    const tId = trackId || targetVocalTrackId || selectedTrackId;
    const trk = tracks.find((t) => t.id === tId);
    if (!trk || !trk.buffer) {
      setStatusMsg('Select an audio track with loaded audio before running Vocal Polish.');
      return;
    }
    setIsPolishingVocal(true);
    setStatusMsg('Processing vocal take: removing noise, de-mudding hoarse bass, auto-tuning and aligning beats...');
    try {
      const ctx = getAudioContext();
      pushUndoSnapshot(tracks, selectedTrackId);
      const effectiveOptions: VocalPolishOptions = {
        ...vocalPolishSettings,
        ...(customOptions || {}),
        bpm: customOptions?.bpm || vocalPolishSettings.bpm || exportBpm || 112,
      };
      const result = await runVocalMasteringPipeline(
        ctx,
        trk.buffer,
        trk.offsetSec,
        effectiveOptions
      );
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trk.id
            ? {
                ...t,
                buffer: result.processedBuffer,
                offsetSec: result.newOffsetSec,
                name: t.name.includes('(Polished)') ? t.name : `${t.name} (Polished)`,
              }
            : t
        )
      );
      setStatusMsg(`✨ Vocal Polish applied to "${trk.name}": ${result.summary}`);
      setShowVocalPolishModal(false);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to apply vocal polish.');
    } finally {
      setIsPolishingVocal(false);
    }
  };

  // WAV Export
  const handleExportMasterWav = async () => {
    setRenderingWav(true);
    try {
      const rendered = await mixdownMultitrackToBuffer(tracks, projectRate);
      if (!rendered) {
        setStatusMsg('Add audio to at least one unmuted track before exporting.');
        return;
      }
      const blob = audioBufferToWavBlob(rendered);
      triggerBlobDownload(blob, 'wavacity-sounddeck-mix.wav');
      setStatusMsg('Exported lossless 16-bit PCM WAV mixdown.');
    } finally {
      setRenderingWav(false);
    }
  };

  const handleExportSelectedWav = () => {
    if (!selectedTrack?.buffer) {
      setStatusMsg('Selected track has no audio to export.');
      return;
    }
    const blob = audioBufferToWavBlob(selectedTrack.buffer);
    const safeName = selectedTrack.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    triggerBlobDownload(blob, `${safeName || 'track'}.wav`);
    setStatusMsg(`Exported "${selectedTrack.name}" as .WAV.`);
  };

  const handleRunExportProject = async () => {
    setRenderingWav(true);
    setStatusMsg(`Rendering project to ${exportFormat.toUpperCase()}...`);
    try {
      const rendered = await mixdownMultitrackToBuffer(tracks, projectRate);
      if (!rendered) {
        setStatusMsg('Add audio to at least one unmuted track before exporting.');
        return;
      }

      let exportBuffer = rendered;
      if (includeMetronome) {
        const offline = new OfflineAudioContext(2, rendered.length, rendered.sampleRate);
        const src = offline.createBufferSource();
        src.buffer = rendered;
        src.connect(offline.destination);
        src.start(0);

        const { beatsPerMeasure, subdivisionFactor } = BEAT_SIGNATURE_CONFIG[exportBeatSignature];
        const secondsPerBeat = (60 / exportBpm) * subdivisionFactor;
        const totalBeats = Math.floor(rendered.duration / secondsPerBeat);

        for (let b = 0; b < totalBeats; b++) {
          const t = b * secondsPerBeat;
          const isDownbeat = b % beatsPerMeasure === 0;
          triggerMetronomeClick(offline, offline.destination, t, isDownbeat, 0.45);
        }
        exportBuffer = await offline.startRendering();
      }

      if (exportFormat === 'wav') {
        const blob = audioBufferToWavBlob(exportBuffer);
        triggerBlobDownload(blob, `wavacity-project-${exportBpm}bpm.wav`);
        setStatusMsg('Project exported as lossless 16-bit PCM WAV.');
      } else {
        const ctx = getAudioContext();
        const dest = ctx.createMediaStreamDestination();
        const src = ctx.createBufferSource();
        src.buffer = exportBuffer;
        src.connect(dest);
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        const rec = new MediaRecorder(dest.stream, { mimeType });
        const chunks: Blob[] = [];
        rec.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };
        const finished = new Promise<Blob>((resolve) => {
          rec.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        });
        rec.start();
        src.start();
        setTimeout(() => {
          try {
            src.stop();
          } catch {}
          rec.stop();
        }, Math.min(6000, Math.round(exportBuffer.duration * 1000)));
        const blob = await finished;
        triggerBlobDownload(blob, `wavacity-project-${exportBpm}bpm.mp3`);
        setStatusMsg('Project exported as MP3 audio stream.');
      }
      setShowExportModal(false);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setRenderingWav(false);
    }
  };

  // Timeline pointer handlers (Select / Time Shift / Zoom)
  const clientXToTimelineSec = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, clientX - rect.left);
    return snapTime(x / pxPerSec);
  };

  const handleCanvasMouseDown = (track: DawTrack, e: React.MouseEvent<HTMLCanvasElement>) => {
    setSelectedTrackId(track.id);
    const sec = clientXToTimelineSec(e.clientX, e.currentTarget);

    if (toolMode === 'zoom') {
      if (e.shiftKey || e.altKey) {
        setPxPerSec((z) => Math.max(30, z - 20));
      } else {
        setPxPerSec((z) => Math.min(240, z + 25));
      }
      setPlayheadSec(sec);
      return;
    }

    if (toolMode === 'shift') {
      pushUndoSnapshot(tracks, track.id);
      dragStateRef.current = {
        active: true,
        trackId: track.id,
        startX: e.clientX,
        anchorSec: sec,
        origOffsetSec: track.offsetSec,
      };
      return;
    }

    // Selection tool
    setPlayheadSec(sec);
    setSelectionStart(sec);
    setSelectionEnd(sec);
    dragStateRef.current = {
      active: true,
      trackId: track.id,
      startX: e.clientX,
      anchorSec: sec,
      origOffsetSec: track.offsetSec,
    };
  };

  const handleCanvasMouseMove = (track: DawTrack, e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (!drag || !drag.active || drag.trackId !== track.id) return;

    if (toolMode === 'shift') {
      const deltaPx = e.clientX - drag.startX;
      const nextOffset = Math.max(0, snapTime(drag.origOffsetSec + deltaPx / pxPerSec));
      setTracks((prev) =>
        prev.map((t) => (t.id === track.id ? { ...t, offsetSec: nextOffset } : t))
      );
      return;
    }

    if (toolMode === 'select') {
      const curSec = clientXToTimelineSec(e.clientX, e.currentTarget);
      const s0 = Math.min(drag.anchorSec, curSec);
      const s1 = Math.max(drag.anchorSec, curSec);
      setSelectionStart(s0);
      setSelectionEnd(s1);
      setPlayheadSec(s0);
    }
  };

  const handleCanvasMouseUp = () => {
    dragStateRef.current = null;
  };

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const sec = clientXToTimelineSec(e.clientX, e.currentTarget);
    setPlayheadSec(sec);
    setSelectionStart(sec);
    setSelectionEnd(sec);
  };

  const handleFitProject = () => {
    const wrapW = timelineWrapRef.current?.clientWidth || 720;
    const targetZoom = Math.max(30, Math.min(220, Math.floor((wrapW - 32) / projectDurationSec)));
    setPxPerSec(targetZoom);
  };

  // Sync latest handlers into shortcutActionsRef so keydown listener never holds stale state
  shortcutActionsRef.current = {
    isPlaying,
    stopPlayback,
    handlePlay,
    handleToggleRecord,
    handleDeleteSelection,
    handleUndo,
    handleRedo,
    handleCopy,
    handleCut,
    handlePaste,
    handleSilenceSelection,
    handleTrimToSelection,
    selectAllTimeline: () => {
      setSelectionStart(0);
      setSelectionEnd(projectDurationSec);
      setStatusMsg(`Selected full timeline (${projectDurationSec.toFixed(1)}s).`);
    },
    jumpToStart: () => {
      setPlayheadSec(0);
      setSelectionStart(0);
      setSelectionEnd(0);
    },
    jumpToEnd: () => {
      setPlayheadSec(projectDurationSec);
      setSelectionStart(projectDurationSec);
      setSelectionEnd(projectDurationSec);
    },
    toggleLoop: () => setLoopSelection((v) => !v),
    zoomIn: () => setPxPerSec((z) => Math.min(240, z + 25)),
    zoomOut: () => setPxPerSec((z) => Math.max(30, z - 20)),
    setTool: (mode: ToolMode) => setToolMode(mode),
    closeOverlays: () => {
      setOpenMenu(null);
      setShowShortcuts(false);
    },
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) {
        return;
      }

      const actions = shortcutActionsRef.current;
      if (!actions) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.code === 'Space') {
        e.preventDefault();
        if (actions.isPlaying) actions.stopPlayback(false);
        else actions.handlePlay(false);
        return;
      }

      if (e.key === 'Escape') {
        actions.closeOverlays();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        actions.handleDeleteSelection();
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        actions.jumpToStart();
        return;
      }

      if (e.key === 'End') {
        e.preventDefault();
        actions.jumpToEnd();
        return;
      }

      if (mod) {
        if (key === 'z' && e.shiftKey) {
          e.preventDefault();
          actions.handleRedo();
        } else if (key === 'z') {
          e.preventDefault();
          actions.handleUndo();
        } else if (key === 'y') {
          e.preventDefault();
          actions.handleRedo();
        } else if (key === 'c') {
          e.preventDefault();
          actions.handleCopy();
        } else if (key === 'x') {
          e.preventDefault();
          actions.handleCut();
        } else if (key === 'v') {
          e.preventDefault();
          actions.handlePaste();
        } else if (key === 'a') {
          e.preventDefault();
          actions.selectAllTimeline();
        } else if (key === 'l') {
          e.preventDefault();
          actions.handleSilenceSelection();
        } else if (key === 't') {
          e.preventDefault();
          actions.handleTrimToSelection();
        }
        return;
      }

      // Single-key DAW shortcuts (no Ctrl/Meta/Alt modifiers)
      if (e.altKey) return;

      if (key === 'r') {
        e.preventDefault();
        actions.handleToggleRecord();
      } else if (key === 'l') {
        e.preventDefault();
        actions.toggleLoop();
      } else if (key === 'i' || key === '1') {
        actions.setTool('select');
      } else if (key === '2') {
        actions.setTool('shift');
      } else if (key === '3') {
        actions.setTool('zoom');
      } else if (key === '=' || key === '+') {
        actions.zoomIn();
      } else if (key === '-') {
        actions.zoomOut();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="space-y-4 select-none">
      {/* Hidden global file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChosen}
        className="hidden"
      />

      {/* DAW Shell Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 border-b border-[#232833] pb-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-100">
            Wavacity Web DAW
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Browser multitrack waveform &amp; spectrogram editor with destructive DSP effects, timeline shifting, and Audacity bridge.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoPolishOnRecord((a) => !a)}
            title="Automatically remove noise, clarify hoarse bass voice, auto-tune pitch, and align to beats when microphone recording stops"
            className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              autoPolishOnRecord
                ? 'bg-amber-500/20 border-amber-500/80 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                : 'bg-[#13161B] hover:bg-[#1B2028] border-[#232833] text-slate-400'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Auto-Polish Take: {autoPolishOnRecord ? 'ON' : 'OFF'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTargetVocalTrackId(selectedTrackId);
              setShowVocalPolishModal(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-[#1B2028] hover:bg-[#252B36] border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shadow"
          >
            <Wand2 className="w-3.5 h-3.5 text-amber-400" />
            <span>✨ AI Vocal Polish</span>
          </button>
          <button
            type="button"
            onClick={() => handleLoadDemoStem('afro')}
            className="px-3 py-1.5 rounded-lg bg-[#13161B] hover:bg-[#1B2028] border border-[#232833] text-xs text-slate-200 transition-colors whitespace-nowrap"
          >
            Afrobeats Stem
          </button>
          <button
            type="button"
            onClick={() => handleLoadDemoStem('house')}
            className="px-3 py-1.5 rounded-lg bg-[#13161B] hover:bg-[#1B2028] border border-[#232833] text-xs text-slate-200 transition-colors whitespace-nowrap"
          >
            House Stem
          </button>
          <button
            type="button"
            onClick={() => setShowEffectRack((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              showEffectRack
                ? 'bg-[#1B2028] border-cyan-500/50 text-cyan-300'
                : 'bg-[#13161B] hover:bg-[#1B2028] border-[#232833] text-slate-300'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Effect Rack</span>
          </button>
          <button
            type="button"
            onClick={() => setShowLiveVisualizer((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              showLiveVisualizer
                ? 'bg-[#1B2028] border-amber-500/50 text-amber-300'
                : 'bg-[#13161B] hover:bg-[#1B2028] border-[#232833] text-slate-300'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>Live Scope</span>
          </button>
          <button
            type="button"
            onClick={() => setShowShortcuts((s) => !s)}
            className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              showShortcuts
                ? 'bg-[#1B2028] border-amber-500/50 text-amber-300'
                : 'bg-[#13161B] hover:bg-[#1B2028] border-[#232833] text-slate-300'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5 text-amber-400" />
            <span>Shortcuts</span>
          </button>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Project...</span>
          </button>
        </div>
      </div>

      {showShortcuts && (
        <div className="rounded-xl bg-[#13161B] border border-[#232833] px-4 py-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-[11px]">
          {[
            { key: 'Space', desc: 'Play / Pause' },
            { key: 'R', desc: 'Record Mic' },
            { key: 'Del / Backspace', desc: 'Delete Region' },
            { key: 'L', desc: 'Loop Selection' },
            { key: 'Ctrl + Z / Y', desc: 'Undo / Redo' },
            { key: 'Ctrl + C / X / V', desc: 'Copy / Cut / Paste' },
            { key: 'Ctrl + A', desc: 'Select Timeline' },
            { key: 'Ctrl + L / T', desc: 'Silence / Trim' },
            { key: '1 / 2 / 3', desc: 'Select / Shift / Zoom' },
            { key: '+ / -', desc: 'Zoom In / Out' },
            { key: 'Home / End', desc: 'Jump Start / End' },
            { key: 'Esc', desc: 'Close Menus' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#0B0D10] border border-[#232833]">
              <span className="font-mono text-amber-400 font-semibold">{item.key}</span>
              <span className="text-slate-300 truncate">{item.desc}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Wavacity Desktop-Style Window Frame */}
      <div className="rounded-xl bg-[#13161B] border border-[#232833] overflow-hidden shadow-xl">
        {/* 1. Classic Wavacity Menu Bar */}
        <div
          ref={menuContainerRef}
          className="relative flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#0F1217] border-b border-[#232833] text-xs"
        >
          <div className="flex flex-wrap items-center gap-0.5">
            {(
              [
                { id: 'file', label: 'File' },
                { id: 'edit', label: 'Edit' },
                { id: 'select', label: 'Select' },
                { id: 'view', label: 'View' },
                { id: 'transport', label: 'Transport' },
                { id: 'tracks', label: 'Tracks' },
                { id: 'generate', label: 'Generate' },
                { id: 'effect', label: 'Effect' },
                { id: 'audacity', label: 'Audacity Bridge' },
              ] as const
            ).map((menu) => (
              <div key={menu.id} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu((m) => (m === menu.id ? null : menu.id))}
                  className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                    openMenu === menu.id
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:bg-[#1B2028] hover:text-white'
                  }`}
                >
                  <span>{menu.label}</span>
                  {menu.id === 'audacity' && <ChevronDown className="w-3 h-3" />}
                </button>

                {openMenu === menu.id && (
                  <div className="absolute left-0 top-full mt-1 z-40 w-56 rounded-lg bg-[#13161B] border border-[#2A313E] shadow-2xl py-1.5 text-xs text-slate-200">
                    {menu.id === 'file' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            targetUploadTrackRef.current = selectedTrackId;
                            fileInputRef.current?.click();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] flex justify-between"
                        >
                          <span>Import Audio to Track...</span>
                          <span className="font-mono text-[10px] text-slate-500">WAV/MP3</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleLoadDemoStem('afro');
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Load Demo Afrobeats Stem
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleLoadDemoStem('trap');
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Load Demo Trap Stem
                        </button>
                        <div className="my-1 border-t border-[#232833]" />
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleExportMasterWav();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] text-amber-400 font-medium"
                        >
                          Export Master Mixdown (.WAV)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleExportSelectedWav();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Export Selected Track (.WAV)
                        </button>
                      </>
                    )}

                    {menu.id === 'edit' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleUndo();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] flex justify-between"
                        >
                          <span>Undo</span>
                          <span className="font-mono text-[10px] text-slate-500">{undoStack.length}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleRedo();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] flex justify-between"
                        >
                          <span>Redo</span>
                          <span className="font-mono text-[10px] text-slate-500">{redoStack.length}</span>
                        </button>
                        <div className="my-1 border-t border-[#232833]" />
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleCut();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Cut Selection
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleCopy();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Copy Selection
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handlePaste();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Paste at Cursor
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleDeleteSelection();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] flex justify-between"
                        >
                          <span>Delete Selection</span>
                          <span className="font-mono text-[10px] text-slate-500">Del</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleTrimToSelection();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Trim Outside Selection
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleSilenceSelection();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Silence Selection
                        </button>
                      </>
                    )}

                    {menu.id === 'select' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            if (selectedTrack?.buffer) {
                              setSelectionStart(selectedTrack.offsetSec);
                              setSelectionEnd(
                                selectedTrack.offsetSec + selectedTrack.buffer.duration / selectedTrack.rate
                              );
                            } else {
                              setSelectionStart(0);
                              setSelectionEnd(projectDurationSec);
                            }
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Select Selected Track Clip
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            setSelectionStart(0);
                            setSelectionEnd(projectDurationSec);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Select All Project Timeline
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            setSelectionStart(playheadSec);
                            setSelectionEnd(playheadSec);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Clear Selection
                        </button>
                      </>
                    )}

                    {menu.id === 'view' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            setPxPerSec((z) => Math.min(240, z + 25));
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Zoom In
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            setPxPerSec((z) => Math.max(30, z - 20));
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Zoom Out
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleFitProject();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Fit Project in Window
                        </button>
                        <div className="my-1 border-t border-[#232833]" />
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            setTracks((prev) =>
                              prev.map((t) =>
                                t.id === selectedTrackId
                                  ? {
                                      ...t,
                                      viewMode: t.viewMode === 'waveform' ? 'spectrogram' : 'waveform',
                                    }
                                  : t
                              )
                            );
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Toggle Waveform / Spectrogram
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            setShowLiveVisualizer((v) => !v);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] flex justify-between"
                        >
                          <span>Live Region Visualizer</span>
                          <span className="font-mono text-amber-400">
                            {showLiveVisualizer ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      </>
                    )}

                    {menu.id === 'transport' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handlePlay(false);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] flex justify-between"
                        >
                          <span>Play / Pause</span>
                          <span className="font-mono text-[10px] text-slate-500">Space</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            stopPlayback(true);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Stop
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            setLoopSelection((l) => !l);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] flex justify-between"
                        >
                          <span>Loop Selection (L)</span>
                          <span className="font-mono text-amber-400">{loopSelection ? 'ON' : 'OFF'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleToggleRecord();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] text-rose-300 flex justify-between"
                        >
                          <span>{isRecording ? 'Stop Recording' : 'Record New Mic Track'}</span>
                          <span className="font-mono text-[10px] text-slate-500">R</span>
                        </button>
                      </>
                    )}

                    {menu.id === 'tracks' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleAddEmptyTrack();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Add New Stereo Track
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleDuplicateSelectedTrack();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Duplicate Selected Track
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleMixAndRenderTrack();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] text-amber-400"
                        >
                          Mix and Render to New Track
                        </button>
                      </>
                    )}

                    {menu.id === 'generate' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleGenerateAudio('sine');
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Tone (440 Hz Sine)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleGenerateAudio('chirp');
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Chirp (440 → 880 Hz)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleGenerateAudio('noise');
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          White Noise
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleGenerateAudio('silence');
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Silence (2.5s)
                        </button>
                        <div className="my-1 border-t border-[#232833]" />
                        {MEME_SFX_PRESETS.map((sfx) => (
                          <button
                            key={sfx.id}
                            type="button"
                            onClick={() => {
                              setOpenMenu(null);
                              handleInsertMemeSfx(sfx.id, sfx.label);
                            }}
                            className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] text-amber-300"
                          >
                            SFX: {sfx.label}
                          </button>
                        ))}
                      </>
                    )}

                    {menu.id === 'effect' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            setShowEffectRack(true);
                            window.setTimeout(() => {
                              effectRackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }, 50);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] text-cyan-300 font-semibold flex items-center justify-between"
                        >
                          <span className="flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Real-Time Effect Rack (Reverb / Delay / Comp)</span>
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-[9px] font-mono text-cyan-300">
                            LIVE
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            setTargetVocalTrackId(selectedTrackId);
                            setShowVocalPolishModal(true);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028] text-amber-300 font-semibold flex items-center justify-between"
                        >
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>AI Vocal Studio Polish &amp; Beat-Align...</span>
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[9px] font-mono text-amber-300">
                            PRO
                          </span>
                        </button>
                        <div className="my-1 border-t border-[#232833]" />
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            runTrackOperation('Normalize (-1 dB)', (trk, s0, s1, c) =>
                              applyNormalizeOrAmplify(c, trk.buffer!, s0, s1, 'normalize')
                            );
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Normalize (-1.0 dB)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            runTrackOperation('Amplify (+3 dB)', (trk, s0, s1, c) =>
                              applyNormalizeOrAmplify(c, trk.buffer!, s0, s1, 'amplify', 3)
                            );
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Amplify (+3 dB)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            runTrackOperation('Fade In', (trk, s0, s1, c) =>
                              applyFadeRange(c, trk.buffer!, s0, s1, 'in')
                            );
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Fade In
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            runTrackOperation('Fade Out', (trk, s0, s1, c) =>
                              applyFadeRange(c, trk.buffer!, s0, s1, 'out')
                            );
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Fade Out
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            runTrackOperation('Reverse', (trk, s0, s1, c) =>
                              applyReverseRange(c, trk.buffer!, s0, s1)
                            );
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Reverse
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            runTrackOperation('Invert Phase', (trk, s0, s1, c) =>
                              applyInvertRange(c, trk.buffer!, s0, s1)
                            );
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Invert Phase
                        </button>
                        <div className="my-1 border-t border-[#232833]" />
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            runTrackOperation('Echo / Delay', (trk, s0, s1, c) =>
                              applyEchoToRange(c, trk.buffer!, s0, s1, 0.26, 0.35)
                            );
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Echo / Delay (260ms)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            runTrackOperation('Bass Boost EQ', (trk, s0, s1, c) =>
                              applyEqToRange(c, trk.buffer!, s0, s1, 'lowshelf', 160, 6)
                            );
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Bass Boost (+6 dB @ 160Hz)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            runTrackOperation('Vocal Air EQ', (trk, s0, s1, c) =>
                              applyEqToRange(c, trk.buffer!, s0, s1, 'highshelf', 4500, 5)
                            );
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#1B2028]"
                        >
                          Vocal Presence (+5 dB @ 4.5kHz)
                        </button>
                      </>
                    )}

                    {menu.id === 'audacity' && (
                      <>
                        <a
                          href="https://www.audacityteam.org/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full px-3 py-1.5 hover:bg-[#1B2028] flex items-center justify-between text-amber-400"
                        >
                          <span>Audacity Official</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <a
                          href="https://www.audacityteam.org/download/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full px-3 py-1.5 hover:bg-[#1B2028] flex items-center justify-between"
                        >
                          <span>Download Audacity Desktop</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <a
                          href="https://www.audacityteam.org/openvino-ai-plugins/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full px-3 py-1.5 hover:bg-[#1B2028] flex items-center justify-between"
                        >
                          <span>OpenVINO AI Stem Split</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <a
                          href="https://support.audacityteam.org/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full px-3 py-1.5 hover:bg-[#1B2028] flex items-center justify-between"
                        >
                          <span>Audacity Manual</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <a
                          href="https://audio.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full px-3 py-1.5 hover:bg-[#1B2028] flex items-center justify-between"
                        >
                          <span>Audio.com Cloud Share</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="text-[11px] font-mono text-slate-400 truncate max-w-md">{statusMsg}</div>
        </div>

        {/* 2. Wavacity Docked Toolbars (Transport + Tools + Edit/Zoom + Output Meter) */}
        <div className="px-3 py-2.5 bg-[#13161B] border-b border-[#232833] flex flex-wrap items-center justify-between gap-3">
          {/* Transport + Tools Cluster */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Transport Buttons */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0D10] border border-[#232833]">
              <button
                type="button"
                onClick={() => handlePlay(false)}
                title={isPlaying ? 'Pause' : 'Play (Space)'}
                aria-label="Play or Pause"
                className={`p-2 rounded transition-colors ${
                  isPlaying
                    ? 'bg-emerald-500 text-slate-950'
                    : isPaused
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-emerald-400 hover:bg-[#1B2028]'
                }`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => stopPlayback(true)}
                title="Stop"
                aria-label="Stop playback"
                className="p-2 rounded text-slate-200 hover:bg-[#1B2028] transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlayheadSec(0);
                  setSelectionStart(0);
                  setSelectionEnd(0);
                }}
                title="Skip to Start"
                aria-label="Skip to Start"
                className="p-2 rounded text-slate-300 hover:bg-[#1B2028] transition-colors"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlayheadSec(projectDurationSec);
                  setSelectionStart(projectDurationSec);
                  setSelectionEnd(projectDurationSec);
                }}
                title="Skip to End"
                aria-label="Skip to End"
                className="p-2 rounded text-slate-300 hover:bg-[#1B2028] transition-colors"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setLoopSelection((v) => !v)}
                title="Loop Selection"
                aria-label="Toggle Loop Selection"
                className={`p-2 rounded transition-colors ${
                  loopSelection ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:bg-[#1B2028]'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleToggleRecord}
                title={isRecording ? 'Stop Microphone Recording (R)' : 'Record New Track (R)'}
                aria-label="Record New Track (R)"
                className={`p-2 rounded transition-colors ${
                  isRecording
                    ? 'bg-rose-500 text-white'
                    : 'text-rose-400 hover:bg-[#1B2028]'
                }`}
              >
                <Circle className={`w-3.5 h-3.5 ${isRecording ? 'fill-white' : 'fill-rose-500'}`} />
              </button>
            </div>

            {/* Wavacity Editing Tools (Selection / Time Shift / Zoom) */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0D10] border border-[#232833]">
              <button
                type="button"
                onClick={() => setToolMode('select')}
                title="Selection Tool (I) — Drag to highlight audio region"
                className={`px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors ${
                  toolMode === 'select'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:bg-[#1B2028]'
                }`}
              >
                <MousePointer className="w-3.5 h-3.5" />
                <span>Select</span>
              </button>
              <button
                type="button"
                onClick={() => setToolMode('shift')}
                title="Time Shift Tool — Drag audio clips along the timeline"
                className={`px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors ${
                  toolMode === 'shift'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:bg-[#1B2028]'
                }`}
              >
                <MoveHorizontal className="w-3.5 h-3.5" />
                <span>Time Shift</span>
              </button>
              <button
                type="button"
                onClick={() => setToolMode('zoom')}
                title="Zoom Tool — Click to zoom in, Shift+Click to zoom out"
                className={`px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors ${
                  toolMode === 'zoom'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:bg-[#1B2028]'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Zoom</span>
              </button>
            </div>

            {/* Edit & Zoom Quick Toolbar */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0D10] border border-[#232833]">
              <button
                type="button"
                onClick={handleCut}
                title="Cut Selection"
                className="p-1.5 rounded text-slate-300 hover:bg-[#1B2028]"
              >
                <Scissors className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCopy}
                title="Copy Selection"
                className="p-1.5 rounded text-slate-300 hover:bg-[#1B2028]"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handlePaste}
                disabled={!clipboardBuffer}
                title="Paste at Cursor"
                className="p-1.5 rounded text-slate-300 hover:bg-[#1B2028] disabled:opacity-40"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleTrimToSelection}
                title="Trim Outside Selection"
                className="p-1.5 rounded text-slate-300 hover:bg-[#1B2028]"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDeleteSelection}
                title="Delete Selection"
                className="p-1.5 rounded text-slate-300 hover:bg-[#1B2028]"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <span className="h-4 w-[1px] bg-[#232833] mx-0.5" />

              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                title="Undo"
                className="p-1.5 rounded text-slate-300 hover:bg-[#1B2028] disabled:opacity-40"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                title="Redo"
                className="p-1.5 rounded text-slate-300 hover:bg-[#1B2028] disabled:opacity-40"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              <span className="h-4 w-[1px] bg-[#232833] mx-0.5" />

              <button
                type="button"
                onClick={() => setPxPerSec((z) => Math.min(240, z + 25))}
                title="Zoom In"
                className="p-1.5 rounded text-slate-300 hover:bg-[#1B2028]"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPxPerSec((z) => Math.max(30, z - 20))}
                title="Zoom Out"
                className="p-1.5 rounded text-slate-300 hover:bg-[#1B2028]"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleFitProject}
                title="Fit Project Width"
                className="p-1.5 rounded text-slate-300 hover:bg-[#1B2028]"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Live Peak Output dB Meter */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#0B0D10] border border-[#232833] min-w-[200px]">
            <span className="text-[11px] font-mono text-slate-400">OUT</span>
            <div className="flex-1 h-3 rounded bg-[#161A22] overflow-hidden flex items-center p-[1px]">
              <div
                className="h-full rounded-sm transition-all duration-75"
                style={{
                  width: `${meterLevelPct}%`,
                  background:
                    meterLevelPct > 86
                      ? 'linear-gradient(90deg, #10B981 0%, #F59E0B 65%, #EF4444 100%)'
                      : 'linear-gradient(90deg, #10B981 0%, #F59E0B 85%)',
                }}
              />
            </div>
            <span className="font-mono text-[11px] text-amber-400 w-12 text-right tabular-nums">
              {isPlaying ? `${meterPeakDb} dB` : '-∞ dB'}
            </span>
          </div>
        </div>

        {/* 2b. Real-Time Selected Region & Recording Waveform Visualizer */}
        {showLiveVisualizer && (
          <LiveRegionWaveform
            track={selectedTrack}
            selectionStart={selectionStart}
            selectionEnd={selectionEnd}
            playheadSec={playheadSec}
            isPlaying={isPlaying}
            isRecording={isRecording}
            playStartWallMs={playTiming.startWallMs}
            playStartSec={playTiming.startSec}
            recStartWallMs={recStartWallMs}
            playbackAnalyser={playbackAnalyser}
            recordAnalyser={recordAnalyser}
          />
        )}

        {/* 3. Multi-Track Timeline Area */}
        <div ref={timelineWrapRef} className="overflow-x-auto bg-[#0B0D10]">
          <div className="min-w-fit">
            {/* Timeline Ruler Row */}
            <div className="flex border-b border-[#232833] bg-[#101318]">
              <div className="w-56 shrink-0 px-3 py-2 border-r border-[#232833] flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Tracks ({tracks.length})</span>
                <button
                  type="button"
                  onClick={handleAddEmptyTrack}
                  className="px-2 py-0.5 rounded bg-[#1B2028] hover:bg-amber-500 text-amber-400 hover:text-slate-950 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>

              <div
                onClick={handleRulerClick}
                style={{ width: `${timelineWidthPx}px` }}
                className="relative h-8 cursor-pointer select-none overflow-hidden"
                title="Click ruler to move playhead"
              >
                {Array.from({ length: Math.ceil(timelineWidthPx / pxPerSec) + 1 }, (_, sec) => (
                  <div
                    key={sec}
                    style={{ left: `${sec * pxPerSec}px` }}
                    className="absolute top-0 bottom-0 border-l border-[#2A313E] pl-1 pt-1 text-[10px] font-mono text-slate-500 tabular-nums"
                  >
                    {sec}.0s
                  </div>
                ))}

                {/* Selection marker on ruler */}
                {selectionEnd > selectionStart && (
                  <div
                    style={{
                      left: `${selectionStart * pxPerSec}px`,
                      width: `${Math.max(2, (selectionEnd - selectionStart) * pxPerSec)}px`,
                    }}
                    className="absolute inset-y-0 bg-amber-500/25 border-x border-amber-400/70 pointer-events-none"
                  />
                )}

                {/* Playhead triangle on ruler */}
                <div
                  style={{ left: `${playheadSec * pxPerSec - 4}px` }}
                  className="absolute top-0 w-2 h-full border-l-2 border-amber-400 pointer-events-none"
                />
              </div>
            </div>

            {/* Individual Track Rows */}
            <div className="divide-y divide-[#232833]">
              {tracks.map((track) => {
                const isSelected = track.id === selectedTrackId;
                return (
                  <div key={track.id} className="flex items-stretch">
                    {/* Left Track Control Panel (TCP) */}
                    <div
                      onClick={() => setSelectedTrackId(track.id)}
                      className={`w-56 shrink-0 p-3 border-r border-[#232833] flex flex-col justify-between gap-2.5 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#171C24] ring-1 ring-inset ring-amber-500/45'
                          : 'bg-[#13161B] hover:bg-[#151921]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <input
                          type="text"
                          value={track.name}
                          onChange={(e) =>
                            setTracks((prev) =>
                              prev.map((t) =>
                                t.id === track.id ? { ...t, name: e.target.value } : t
                              )
                            )
                          }
                          className="w-full bg-transparent text-xs font-semibold text-slate-100 focus:outline-none focus:bg-[#0B0D10] rounded px-1 -mx-1 truncate"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveTrack(track.id);
                          }}
                          title="Remove or Clear Track"
                          className="text-slate-500 hover:text-rose-400 shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTracks((prev) =>
                                prev.map((t) =>
                                  t.id === track.id ? { ...t, muted: !t.muted } : t
                                )
                              );
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium border flex items-center gap-1 ${
                              track.muted
                                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                                : 'bg-[#0B0D10] border-[#232833] text-slate-300'
                            }`}
                          >
                            {track.muted ? (
                              <VolumeX className="w-3 h-3" />
                            ) : (
                              <Volume2 className="w-3 h-3" />
                            )}
                            <span>Mute</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTracks((prev) =>
                                prev.map((t) =>
                                  t.id === track.id ? { ...t, solo: !t.solo } : t
                                )
                              );
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                              track.solo
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                                : 'bg-[#0B0D10] border-[#232833] text-slate-300'
                            }`}
                          >
                            Solo
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTracks((prev) =>
                              prev.map((t) =>
                                t.id === track.id
                                  ? {
                                      ...t,
                                      viewMode: t.viewMode === 'waveform' ? 'spectrogram' : 'waveform',
                                    }
                                  : t
                              )
                            );
                          }}
                          title="Switch Waveform / Spectrogram"
                          className="px-1.5 py-0.5 rounded bg-[#0B0D10] border border-[#232833] text-[10px] font-mono text-amber-400 hover:border-amber-500/40"
                        >
                          {track.viewMode === 'waveform' ? 'Wave' : 'Spec'}
                        </button>
                      </div>

                      {/* Gain & Pan Sliders */}
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400 w-8">Gain</span>
                          <input
                            type="range"
                            min={-24}
                            max={12}
                            step={1}
                            value={track.gainDb}
                            onChange={(e) =>
                              setTracks((prev) =>
                                prev.map((t) =>
                                  t.id === track.id ? { ...t, gainDb: Number(e.target.value) } : t
                                )
                              )
                            }
                            className="studio-slider flex-1"
                          />
                          <span className="font-mono text-slate-300 w-10 text-right tabular-nums">
                            {track.gainDb > 0 ? `+${track.gainDb}` : track.gainDb}dB
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400 w-8">Pan</span>
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.1}
                            value={track.pan}
                            onChange={(e) =>
                              setTracks((prev) =>
                                prev.map((t) =>
                                  t.id === track.id ? { ...t, pan: Number(e.target.value) } : t
                                )
                              )
                            }
                            className="studio-slider flex-1"
                          />
                          <span className="font-mono text-slate-300 w-10 text-right tabular-nums">
                            {track.pan === 0
                              ? 'C'
                              : track.pan < 0
                              ? `L${Math.round(Math.abs(track.pan) * 100)}`
                              : `R${Math.round(track.pan * 100)}`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400 w-8">Rate</span>
                          <input
                            type="range"
                            min={0.6}
                            max={1.6}
                            step={0.05}
                            value={track.rate}
                            onChange={(e) =>
                              setTracks((prev) =>
                                prev.map((t) =>
                                  t.id === track.id ? { ...t, rate: Number(e.target.value) } : t
                                )
                              )
                            }
                            className="studio-slider flex-1"
                          />
                          <span className="font-mono text-slate-300 w-10 text-right tabular-nums">
                            {track.rate.toFixed(2)}x
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-[#232833]">
                        <span>
                          {track.buffer
                            ? `${track.buffer.numberOfChannels === 2 ? 'Stereo' : 'Mono'} · ${track.buffer.duration.toFixed(1)}s`
                            : 'Empty'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTrackId(track.id);
                              setShowEffectRack(true);
                              window.setTimeout(() => {
                                effectRackRef.current?.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'nearest',
                                });
                              }, 50);
                            }}
                            title="Open Real-Time Effect Rack (Reverb, Delay, Compressor) for this track"
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                              !track.effects.bypassAll &&
                              (track.effects.compressor.enabled ||
                                track.effects.delay.enabled ||
                                track.effects.reverb.enabled)
                                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-semibold'
                                : 'bg-[#0B0D10] border-[#232833] text-slate-400 hover:text-cyan-300'
                            }`}
                          >
                            FX
                            {!track.effects.bypassAll &&
                            [
                              track.effects.compressor.enabled,
                              track.effects.delay.enabled,
                              track.effects.reverb.enabled,
                            ].filter(Boolean).length > 0
                              ? `(${
                                  [
                                    track.effects.compressor.enabled,
                                    track.effects.delay.enabled,
                                    track.effects.reverb.enabled,
                                  ].filter(Boolean).length
                                })`
                              : ''}
                          </button>
                          {track.buffer && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTargetVocalTrackId(track.id);
                                setShowVocalPolishModal(true);
                              }}
                              title="AI Vocal Polish: Clean, De-Mud, Tune & Beat-Align"
                              className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3 text-amber-400" />
                              <span>Polish</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              targetUploadTrackRef.current = track.id;
                              fileInputRef.current?.click();
                            }}
                            className="text-slate-400 hover:text-slate-200 flex items-center gap-1"
                          >
                            <Upload className="w-3 h-3" />
                            <span>Import</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right Interactive Waveform / Spectrogram Timeline Canvas */}
                    <div className="relative bg-[#0B0D10]" style={{ width: `${timelineWidthPx}px` }}>
                      <canvas
                        ref={(el) => {
                          canvasRefs.current[track.id] = el;
                        }}
                        width={timelineWidthPx}
                        height={146}
                        onMouseDown={(e) => handleCanvasMouseDown(track, e)}
                        onMouseMove={(e) => handleCanvasMouseMove(track, e)}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseLeave={handleCanvasMouseUp}
                        className={`block h-[146px] ${
                          toolMode === 'shift'
                            ? 'cursor-ew-resize'
                            : toolMode === 'zoom'
                            ? 'cursor-zoom-in'
                            : 'cursor-text'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. Wavacity Bottom Selection & Project Rate Toolbar */}
        <div className="px-4 py-2.5 bg-[#0F1217] border-t border-[#232833] flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-slate-400">
              <span>Project Rate (Hz):</span>
              <select
                value={projectRate}
                onChange={(e) => setProjectRate(Number(e.target.value) as 44100 | 48000)}
                className="px-2 py-1 rounded bg-[#13161B] border border-[#232833] text-xs font-mono text-slate-100"
              >
                <option value={44100}>44100</option>
                <option value={48000}>48000</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-slate-400">
              <span>Snap To:</span>
              <select
                value={snapMode}
                onChange={(e) => setSnapMode(e.target.value as 'off' | '0.1s' | '0.5s')}
                className="px-2 py-1 rounded bg-[#13161B] border border-[#232833] text-xs font-mono text-slate-100"
              >
                <option value="off">Off</option>
                <option value="0.1s">0.10 s</option>
                <option value="0.5s">0.50 s</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-5 font-mono text-[11px] tabular-nums">
            <div>
              <span className="text-slate-500 mr-1.5">Cursor:</span>
              <span className="text-amber-400">{formatTimecode(playheadSec)}</span>
            </div>
            <div>
              <span className="text-slate-500 mr-1.5">Sel Start:</span>
              <span className="text-slate-200">{formatTimecode(selectionStart)}</span>
            </div>
            <div>
              <span className="text-slate-500 mr-1.5">Sel End:</span>
              <span className="text-slate-200">
                {formatTimecode(selectionEnd)}
                {selectionEnd > selectionStart
                  ? ` (${(selectionEnd - selectionStart).toFixed(2)}s)`
                  : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Per-Track Effect Rack (Compressor, Delay, Reverb) */}
      {showEffectRack && (
        <div ref={effectRackRef}>
          <DawEffectRack
            tracks={tracks.map((t) => ({
              id: t.id,
              name: t.name,
              hasBuffer: Boolean(t.buffer),
              effects: t.effects,
            }))}
            selectedTrackId={selectedTrack?.id || tracks[0]?.id || 'trk_1'}
            projectBpm={exportBpm}
            isPlaying={isPlaying}
            compressorReductionDb={compReductionDb}
            bakingEffects={bakingEffects}
            onSelectTrack={(trackId) => setSelectedTrackId(trackId)}
            onUpdateTrackEffects={handleUpdateTrackEffects}
            onBakeTrackEffects={handleBakeTrackEffects}
          />
        </div>
      )}

      {/* AI Vocal Studio Polish & Beat Alignment Modal */}
      {showVocalPolishModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#13161B] border border-[#2A313E] rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-5 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#232833] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-100 flex items-center gap-2">
                    <span>AI Vocal Studio Polish &amp; Beat Alignment</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[10px] font-mono text-amber-300 font-bold">
                      PRO
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Engineered for hoarse/bass vocals, off-pitch singing, and remixing tracks like &ldquo;Time&rdquo; by Toxic Lyrikali.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVocalPolishModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#1B2028] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Track & Quick Presets */}
            <div className="space-y-3 bg-[#0B0D10] p-3.5 rounded-xl border border-[#232833]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Target Vocal Track:</span>
                  <select
                    value={targetVocalTrackId}
                    onChange={(e) => setTargetVocalTrackId(e.target.value)}
                    className="ml-1 px-2.5 py-1 rounded bg-[#13161B] border border-[#2A313E] text-xs font-mono text-amber-300 font-bold focus:outline-none"
                  >
                    {tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.buffer ? `(${t.buffer.duration.toFixed(1)}s)` : '(Empty)'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* One-Click Presets */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                  Quick Vocal Presets:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setVocalPolishSettings({
                        denoise: true,
                        denoiseThresholdDb: -40,
                        clarifyHoarseVoice: true,
                        autoTune: true,
                        scale: 'A minor',
                        tuneSpeed: 0.88,
                        beatAlign: true,
                        bpm: 112,
                        normalizeVolume: true,
                      });
                      setStatusMsg('Loaded "Time - Toxic Lyrikali Remix" vocal preset (A minor · 112 BPM).');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/50 text-[11px] font-semibold text-amber-300 transition-colors flex items-center gap-1"
                  >
                    <Music className="w-3 h-3 text-amber-400" />
                    <span>Time (Toxic Lyrikali Remix)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVocalPolishSettings((prev) => ({
                        ...prev,
                        clarifyHoarseVoice: true,
                        denoise: true,
                        denoiseThresholdDb: -38,
                        normalizeVolume: true,
                      }));
                      setStatusMsg('Loaded "Hoarse Bass De-Mud & Presence" preset.');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#141820] hover:bg-[#1C2230] border border-[#293040] text-[11px] font-medium text-slate-300 transition-colors"
                  >
                    Hoarse Bass De-Mud &amp; Presence
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVocalPolishSettings((prev) => ({
                        ...prev,
                        autoTune: true,
                        tuneSpeed: 1.0,
                        beatAlign: true,
                      }));
                      setStatusMsg('Loaded "Modern Hard Tune & Beat Lock" preset.');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#141820] hover:bg-[#1C2230] border border-[#293040] text-[11px] font-medium text-slate-300 transition-colors"
                  >
                    Hard Tune &amp; Trap Lock
                  </button>
                </div>
              </div>
            </div>

            {/* 4 Feature Parameter Cards */}
            <div className="space-y-3.5">
              {/* Feature 1: Background Noise & Mic Rumble */}
              <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vocalPolishSettings.denoise}
                      onChange={(e) =>
                        setVocalPolishSettings((prev) => ({ ...prev, denoise: e.target.checked }))
                      }
                      className="rounded border-[#2A313E] text-amber-500 focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-slate-200">
                      1. Background Noise Removal &amp; Mic De-Rumble
                    </span>
                  </label>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                    85Hz Cut + -28dB Room Gate
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed pl-6">
                  Removes handling thumps, sub-bass room rumble, and room hiss during non-singing pauses with a smooth-decay expander gate.
                </p>
                {vocalPolishSettings.denoise && (
                  <div className="pl-6 pt-1 flex items-center gap-3 text-xs">
                    <span className="text-slate-400 text-[11px]">Gate Sensitivity:</span>
                    <input
                      type="range"
                      min={-50}
                      max={-30}
                      step={2}
                      value={vocalPolishSettings.denoiseThresholdDb ?? -40}
                      onChange={(e) =>
                        setVocalPolishSettings((prev) => ({
                          ...prev,
                          denoiseThresholdDb: Number(e.target.value),
                        }))
                      }
                      className="studio-slider flex-1"
                    />
                    <span className="font-mono text-amber-400 text-[11px] w-12 text-right">
                      {vocalPolishSettings.denoiseThresholdDb ?? -40} dB
                    </span>
                  </div>
                )}
              </div>

              {/* Feature 2: Clear Audible Voice & Hoarse Bass De-Mud */}
              <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vocalPolishSettings.clarifyHoarseVoice}
                      onChange={(e) =>
                        setVocalPolishSettings((prev) => ({
                          ...prev,
                          clarifyHoarseVoice: e.target.checked,
                        }))
                      }
                      className="rounded border-[#2A313E] text-amber-500 focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-slate-200">
                      2. Clear Audible Voice &amp; Hoarse Bass De-Mud
                    </span>
                  </label>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    Pro Vocal EQ &amp; Leveler
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed pl-6">
                  Tames muddy chest resonance (-5dB @ 240Hz), boosts diction clarity (+5dB @ 3.4kHz), adds studio air sheen (+3.5dB @ 10.5kHz), and smooths out loud boomy peaks with transparent optical compression.
                </p>
                <div className="pl-6 flex flex-wrap gap-1.5 pt-0.5">
                  <span className="px-2 py-0.5 rounded bg-[#161B24] border border-[#232833] text-[10px] font-mono text-slate-300">
                    -5dB @ 240Hz (De-Mud)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#161B24] border border-[#232833] text-[10px] font-mono text-slate-300">
                    +5dB @ 3.4kHz (Presence)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#161B24] border border-[#232833] text-[10px] font-mono text-slate-300">
                    +3.5dB @ 10.5kHz (Air)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#161B24] border border-[#232833] text-[10px] font-mono text-slate-300">
                    -3dB @ 7kHz (De-Ess)
                  </span>
                </div>
              </div>

              {/* Feature 3: Auto-Tune Pitch Correction */}
              <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vocalPolishSettings.autoTune}
                      onChange={(e) =>
                        setVocalPolishSettings((prev) => ({ ...prev, autoTune: e.target.checked }))
                      }
                      className="rounded border-[#2A313E] text-amber-500 focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-slate-200">
                      3. Auto-Tune Pitch Correction (Fix Out-Of-Tune Singing)
                    </span>
                  </label>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                    Autocorrelation Pitch Shifter
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed pl-6">
                  Detects vocal pitch and snaps off-tune notes smoothly into the key of the track.
                </p>
                {vocalPolishSettings.autoTune && (
                  <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <label className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Musical Scale / Key:</span>
                      <select
                        value={vocalPolishSettings.scale || 'A minor'}
                        onChange={(e) =>
                          setVocalPolishSettings((prev) => ({
                            ...prev,
                            scale: e.target.value as 'A minor' | 'C major' | 'D minor' | 'G major' | 'Chromatic',
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded bg-[#13161B] border border-[#2A313E] text-xs font-mono text-amber-300 font-semibold"
                      >
                        <option value="A minor">A minor (Time - Toxic Lyrikali)</option>
                        <option value="C major">C major</option>
                        <option value="D minor">D minor</option>
                        <option value="G major">G major</option>
                        <option value="Chromatic">Chromatic (All 12 Notes)</option>
                      </select>
                    </label>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Correction Speed:</span>
                        <span className="font-mono text-amber-300">
                          {Math.round((vocalPolishSettings.tuneSpeed || 0.85) * 100)}% ({vocalPolishSettings.tuneSpeed && vocalPolishSettings.tuneSpeed > 0.9 ? 'Hard Tune' : 'Natural'})
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.3}
                        max={1.0}
                        step={0.05}
                        value={vocalPolishSettings.tuneSpeed ?? 0.85}
                        onChange={(e) =>
                          setVocalPolishSettings((prev) => ({
                            ...prev,
                            tuneSpeed: Number(e.target.value),
                          }))
                        }
                        className="studio-slider w-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Feature 4: Beat & Instrumental Alignment */}
              <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vocalPolishSettings.beatAlign}
                      onChange={(e) =>
                        setVocalPolishSettings((prev) => ({ ...prev, beatAlign: e.target.checked }))
                      }
                      className="rounded border-[#2A313E] text-amber-500 focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-slate-200">
                      4. Beat &amp; Instrumental Alignment (Align With Original Song)
                    </span>
                  </label>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    Transient Beat-Lock
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed pl-6">
                  Analyzes vocal transient attacks and shifts the track offset to lock firmly onto the beat grid of the instrumentals.
                </p>
                {vocalPolishSettings.beatAlign && (
                  <div className="pl-6 flex items-center gap-3 pt-1">
                    <span className="text-[11px] text-slate-400">Song BPM:</span>
                    <input
                      type="number"
                      min={40}
                      max={240}
                      value={vocalPolishSettings.bpm || exportBpm || 112}
                      onChange={(e) =>
                        setVocalPolishSettings((prev) => ({
                          ...prev,
                          bpm: Number(e.target.value) || 112,
                        }))
                      }
                      className="w-20 px-2 py-1 rounded bg-[#13161B] border border-[#2A313E] text-xs font-mono text-amber-300 font-bold"
                    />
                    <span className="text-[10px] font-mono text-slate-500">
                      (112 BPM = &ldquo;Time&rdquo; by Toxic Lyrikali)
                    </span>
                  </div>
                )}
              </div>

              {/* Feature 5: Volume Normalization */}
              <div className="p-3 rounded-xl bg-[#0B0D10] border border-[#232833] flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vocalPolishSettings.normalizeVolume}
                    onChange={(e) =>
                      setVocalPolishSettings((prev) => ({
                        ...prev,
                        normalizeVolume: e.target.checked,
                      }))
                    }
                    className="rounded border-[#2A313E] text-amber-500 focus:ring-0"
                  />
                  <span className="text-xs font-medium text-slate-200">
                    5. Broadcast Normalization (-1.0 dBFS Peak Ceiling)
                  </span>
                </label>
                <span className="text-[10px] font-mono text-slate-400">Consistent Radio Output</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#232833]">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={autoPolishOnRecord}
                  onChange={(e) => setAutoPolishOnRecord(e.target.checked)}
                  className="rounded border-[#2A313E] text-amber-500 focus:ring-0"
                />
                <span>Always Auto-Polish future mic recordings</span>
              </label>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowVocalPolishModal(false)}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-[#141820] hover:bg-[#1C2230] text-slate-300 text-xs font-semibold border border-[#293040] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPolishingVocal}
                  onClick={() => handleApplyVocalPolishToTrack(targetVocalTrackId)}
                  className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-lg hover:shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isPolishingVocal ? 'Polishing Vocals...' : 'Apply Vocal Magic Polish'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Project Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#13161B] border border-[#2A313E] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#232833] pb-4">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Download className="w-5 h-5 text-amber-400" />
                  <span>Export Project Mixdown</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Render all active multitrack stems into a high-fidelity master audio file.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#1B2028]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Format Selection */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-300">Audio Format:</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportFormat('wav')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      exportFormat === 'wav'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow'
                        : 'bg-[#0B0D10] border-[#232833] text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs">WAV (Lossless PCM)</div>
                    <div className="text-[10px] opacity-75 font-mono">16-bit · 44.1kHz Studio Master</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('mp3')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      exportFormat === 'mp3'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow'
                        : 'bg-[#0B0D10] border-[#232833] text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs">MP3 (Compressed)</div>
                    <div className="text-[10px] opacity-75 font-mono">Web audio stream capture</div>
                  </button>
                </div>
              </div>

              {/* Metronome Inclusion */}
              <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-slate-200 block">
                      Include Metronome Click Track
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Overlay rhythmic accented clicks aligned with project tempo
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeMetronome}
                    onChange={(e) => setIncludeMetronome(e.target.checked)}
                    className="rounded border-[#2A313E] text-amber-500 focus:ring-0"
                  />
                </label>

                {includeMetronome && (
                  <div className="pt-2 border-t border-[#1F2633] grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-[11px] text-slate-400">Project BPM:</span>
                      <input
                        type="number"
                        min={40}
                        max={240}
                        value={exportBpm}
                        onChange={(e) => setExportBpm(Number(e.target.value) || 120)}
                        className="w-full px-2.5 py-1.5 rounded bg-[#13161B] border border-[#2A313E] text-xs font-mono text-amber-300 font-bold"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-slate-400">Beat Signature:</span>
                      <select
                        value={exportBeatSignature}
                        onChange={(e) => setExportBeatSignature(e.target.value as BeatSignature)}
                        className="w-full px-2.5 py-1.5 rounded bg-[#13161B] border border-[#2A313E] text-xs font-mono text-amber-300 font-semibold"
                      >
                        {(Object.keys(BEAT_SIGNATURE_CONFIG) as BeatSignature[]).map((sig) => (
                          <option key={sig} value={sig}>
                            {sig}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#232833]">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 rounded-xl bg-[#141820] hover:bg-[#1C2230] text-slate-300 text-xs font-semibold border border-[#293040] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={renderingWav}
                onClick={handleRunExportProject}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-lg hover:shadow-amber-500/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{renderingWav ? 'Rendering Audio...' : `Render & Download .${exportFormat.toUpperCase()}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
