import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Square,
  Mic,
  Undo2,
  Redo2,
  Plus,
  Scissors,
  Copy,
  ClipboardPaste,
  Trash2,
  Upload,
  Repeat,
  ZoomIn,
  ZoomOut,
  Sliders,
  Music,
  Drum,
  Activity,
  GripHorizontal,
  Layers,
  X,
  Music2,
  Clock4,
  Download,
} from 'lucide-react';
import type {
  InstrumentId,
  MasterChainState,
  MidiNote,
  ProEffectsRackState,
  StudioTrack,
  TimelineClip,
} from '../../types/studioPro';
import type { PadSampleAssignment } from '../../firebase';
import {
  DRUM_PADS,
  type DrumPadId,
  getAudioContext,
  triggerSynthPad,
  triggerBufferPad,
  renderPatternToBuffer,
  triggerMetronomeClick,
  BEAT_SIGNATURE_CONFIG,
  type BeatSignature,
} from '../../audio/studioAudio';
import {
  GENRE_KITS,
  getGenreKit,
  type GenreKitId,
  type GenreRegionGroup,
} from '../../audio/genreKits';
import { DISCOVER_CATALOG_TRACKS } from '../../audio/discoverCatalog';
import {
  applyMasterChainToGraph,
  buildProEffectChain,
  ensureStudioGateWorkletLoaded,
} from '../../audio/proChannelStrip';
import { encodeAudioBufferToWavBlob, triggerFileDownload } from '../../audio/exportEncoders';
import { StepSequencerGrid } from '../StepSequencerGrid';
import { PianoRollEditor } from './PianoRollEditor';
import { ProEffectsRackPanel } from './ProEffectsRackPanel';

interface ClipWaveformCanvasProps {
  buffer: AudioBuffer;
  offsetInSourceSec: number;
  durationSec: number;
  color: string;
  widthPx: number;
}

function ClipWaveformCanvas({
  buffer,
  offsetInSourceSec,
  durationSec,
  color,
  widthPx,
}: ClipWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clampedWidth = Math.max(40, Math.min(1600, Math.round(widthPx)));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const ch0 = buffer.getChannelData(0);
    const startSample = Math.max(0, Math.floor(offsetInSourceSec * buffer.sampleRate));
    const totalSamples = Math.max(1, Math.floor(durationSec * buffer.sampleRate));
    const endSample = Math.min(ch0.length, startSample + totalSamples);
    const span = Math.max(1, endSample - startSample);
    const step = Math.max(1, Math.floor(span / w));

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.beginPath();

    for (let x = 0; x < w; x++) {
      const idx = startSample + Math.floor((x / w) * span);
      let min = 1;
      let max = -1;
      for (let j = 0; j < step && idx + j < endSample; j++) {
        const val = ch0[idx + j];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      if (min > max) {
        min = 0;
        max = 0;
      }
      const yTop = (0.5 - max * 0.44) * h;
      const yBot = (0.5 - min * 0.44) * h;
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yBot);
    }
    ctx.stroke();
  }, [buffer, offsetInSourceSec, durationSec, color, clampedWidth]);

  return (
    <canvas
      ref={canvasRef}
      width={clampedWidth}
      height={46}
      className="w-full h-full pointer-events-none opacity-90"
    />
  );
}

interface StudioTimelineDawProps {
  bpm: number;
  timeSignature: '4/4' | '3/4' | '6/8';
  tracks: StudioTrack[];
  masterChain: MasterChainState;
  midiNotes: MidiNote[];
  selectedInstrument: InstrumentId;
  kitPreset: GenreKitId;
  pattern: Record<string, boolean[]>;
  padAssignments: PadSampleAssignment[];
  padSampleBuffers: Partial<Record<DrumPadId, AudioBuffer>>;
  discoverCustomSamples: { id: string; title: string; buffer: AudioBuffer }[];
  canUndo: boolean;
  canRedo: boolean;
  showBottomRack: boolean;
  onChangeBpm: (next: number) => void;
  onChangeTimeSignature: (sig: '4/4' | '3/4' | '6/8') => void;
  onChangeTracks: (next: StudioTrack[], recordHistory?: boolean) => void;
  onChangeMidiNotes: (next: MidiNote[]) => void;
  onSelectInstrument: (inst: InstrumentId) => void;
  onSelectKitPreset: (kitId: GenreKitId) => void;
  onChangePattern: (pat: Record<string, boolean[]>) => void;
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
  onUndo: () => void;
  onRedo: () => void;
  onAddTrack: (kind: StudioTrack['kind']) => void;
  onDropFilesToTrack: (trackId: string, files: FileList) => Promise<void>;
  onBounceAudioToTrack: (kind: StudioTrack['kind'], buffer: AudioBuffer, clipName: string, licenseType?: TimelineClip['licenseType']) => void;
  onStatusMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}

export function StudioTimelineDaw({
  bpm,
  timeSignature,
  tracks,
  masterChain,
  midiNotes,
  selectedInstrument,
  kitPreset,
  pattern,
  padAssignments,
  padSampleBuffers,
  discoverCustomSamples,
  canUndo,
  canRedo,
  showBottomRack,
  onChangeBpm,
  onChangeTimeSignature,
  onChangeTracks,
  onChangeMidiNotes,
  onSelectInstrument,
  onSelectKitPreset,
  onChangePattern,
  onAssignSampleToPad,
  onRemovePadAssignment,
  onUndo,
  onRedo,
  onAddTrack,
  onDropFilesToTrack,
  onBounceAudioToTrack,
  onStatusMessage,
  onErrorMessage,
}: StudioTimelineDawProps) {
  const [selectedTrackId, setSelectedTrackId] = useState<string>(() => tracks[0]?.id || '');
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [clipboardClip, setClipboardClip] = useState<TimelineClip | null>(null);
  const [expandedAutoTrackId, setExpandedAutoTrackId] = useState<string | null>(null);
  const [renamingTrackId, setRenamingTrackId] = useState<string | null>(null);
  const [renameTrackValue, setRenameTrackValue] = useState('');

  // Transport, Loop & Snap state
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [zoomPxPerSec, setZoomPxPerSec] = useState(64);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapGridDivision, setSnapGridDivision] = useState<'beat' | 'half_beat' | 'bar'>('beat');
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [loopStartBar, setLoopStartBar] = useState(1);
  const [loopEndBar, setLoopEndBar] = useState(5);
  const [metronomeOn, setMetronomeOn] = useState(false);

  // Quick Microphone Recorder directly on DAW track
  const [isQuickRecording, setIsQuickRecording] = useState(false);
  const quickRecorderRef = useRef<MediaRecorder | null>(null);
  const quickChunksRef = useRef<Blob[]>([]);

  // Resizable bottom dock height
  const [bottomDockTab, setBottomDockTab] = useState<'beats' | 'piano' | 'fx'>('beats');
  const [bottomDockHeight, setBottomDockHeight] = useState(340);

  // Beat Pads & Sequencer local controls
  const [kitRegionFilter, setKitRegionFilter] = useState<'all' | GenreRegionGroup>('all');
  const [isPlayingSeq, setIsPlayingSeq] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [activePad, setActivePad] = useState<DrumPadId | null>(null);
  const [swingPct, setSwingPct] = useState(6);
  const [masterVol, setMasterVol] = useState(0.85);
  const [mapperPadId, setMapperPadId] = useState<DrumPadId>('pluck');
  const [mapperSampleKey, setMapperSampleKey] = useState<string>(DISCOVER_CATALOG_TRACKS[0].id);
  const [mapperSliceSec, setMapperSliceSec] = useState<number>(0);
  const [assigningPad, setAssigningPad] = useState(false);
  const [bouncingBeat, setBouncingBeat] = useState(false);
  const [isMidiRecording, setIsMidiRecording] = useState(false);
  const currentStepRef = useRef(0);
  const isMidiRecordingRef = useRef(false);
  isMidiRecordingRef.current = isMidiRecording;

  // Refs for playback engine
  const activePlaybackCleanupRef = useRef<(() => void) | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const seqTimerRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    type: 'move' | 'resize';
    clipId: string;
    trackId: string;
    originClientX: number;
    initialStartSec: number;
    initialDurationSec: number;
    maxDurationSec: number;
  } | null>(null);

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) || tracks[0] || null;
  const activeKit = getGenreKit(kitPreset);
  const filteredKits =
    kitRegionFilter === 'all'
      ? GENRE_KITS
      : GENRE_KITS.filter((k) => k.regionGroup === kitRegionFilter);

  const assignmentByPad = useMemo(
    () => new Map<string, PadSampleAssignment>(padAssignments.map((a) => [a.padId, a])),
    [padAssignments]
  );

  // Ensure valid selectedTrackId whenever tracks change
  useEffect(() => {
    if (!tracks.some((t) => t.id === selectedTrackId) && tracks.length > 0) {
      setSelectedTrackId(tracks[0].id);
    }
  }, [tracks, selectedTrackId]);

  const beatsPerBar = timeSignature === '3/4' ? 3 : timeSignature === '6/8' ? 6 : 4;
  const beatDurSec = (60 / Math.max(40, bpm)) * (timeSignature === '6/8' ? 0.5 : 1);
  const barDurSec = beatsPerBar * beatDurSec;

  const snapTimeSec = (rawSec: number): number => {
    const clamped = Math.max(0, rawSec);
    if (!snapEnabled) return Number(clamped.toFixed(3));
    const stepSec =
      snapGridDivision === 'bar'
        ? barDurSec
        : snapGridDivision === 'half_beat'
        ? beatDurSec * 0.5
        : beatDurSec;
    return Number((Math.round(clamped / stepSec) * stepSec).toFixed(3));
  };

  const timelineTotalSec = useMemo(() => {
    let maxEnd = Math.max(24, barDurSec * 8);
    tracks.forEach((tr) => {
      tr.clips.forEach((c) => {
        maxEnd = Math.max(maxEnd, c.startSec + c.durationSec + 4);
      });
    });
    return Math.ceil(maxEnd);
  }, [tracks, barDurSec]);

  const timelineWidthPx = Math.max(820, timelineTotalSec * zoomPxPerSec);

  const loopStartSec = Math.max(0, (loopStartBar - 1) * barDurSec);
  const loopEndSec = Math.max(loopStartSec + barDurSec, (loopEndBar - 1) * barDurSec);

  // Stop playback helper
  const stopTimelinePlayback = () => {
    if (playbackTimerRef.current) {
      window.clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    if (activePlaybackCleanupRef.current) {
      activePlaybackCleanupRef.current();
      activePlaybackCleanupRef.current = null;
    }
    setIsPlayingTimeline(false);
  };

  useEffect(() => {
    return () => {
      stopTimelinePlayback();
      if (seqTimerRef.current) window.clearTimeout(seqTimerRef.current);
    };
  }, []);

  // Schedule & play full multitrack audio starting from fromSec
  const startTimelinePlaybackFrom = async (fromSec: number) => {
    stopTimelinePlayback();
    const ctx = getAudioContext();
    await ensureStudioGateWorkletLoaded(ctx);

    const anySolo = tracks.some((t) => t.solo);
    const activeTracks = tracks.filter((t) => !t.muted && (!anySolo || t.solo));

    const masterBus = ctx.createGain();
    masterBus.gain.value = 1;
    const teardownMaster = applyMasterChainToGraph(ctx, masterBus, ctx.destination, masterChain);

    const sources: AudioBufferSourceNode[] = [];
    const chains: Array<{ disconnect: () => void }> = [];
    const startAudioTime = ctx.currentTime + 0.05;

    activeTracks.forEach((track) => {
      const trackGain = ctx.createGain();
      trackGain.gain.setValueAtTime(Math.max(0, Math.min(1.5, track.volumeGain)), startAudioTime);

      // Evaluate track volume automation points from fromSec onwards
      if (track.automation.length > 0) {
        const sorted = [...track.automation].sort((a, b) => a.timeSec - b.timeSec);
        // Find initial interpolated gain at fromSec
        let initVal = track.volumeGain;
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].timeSec <= fromSec) {
            initVal = sorted[i].value * 1.5;
          }
        }
        trackGain.gain.setValueAtTime(Math.max(0, Math.min(1.5, initVal)), startAudioTime);
        sorted.forEach((pt) => {
          if (pt.timeSec > fromSec) {
            trackGain.gain.linearRampToValueAtTime(
              Math.max(0, Math.min(1.5, pt.value * 1.5)),
              startAudioTime + (pt.timeSec - fromSec)
            );
          }
        });
      }

      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, track.pan));

      const fx = buildProEffectChain(ctx, track.effects);
      trackGain.connect(panner);
      panner.connect(fx.input);
      fx.output.connect(masterBus);
      chains.push(fx);

      track.clips.forEach((clip) => {
        const clipEnd = clip.startSec + clip.durationSec;
        if (clipEnd <= fromSec) return;

        const src = ctx.createBufferSource();
        src.buffer = clip.buffer;
        src.connect(trackGain);

        if (clip.startSec >= fromSec) {
          const delaySec = clip.startSec - fromSec;
          const offset = Math.max(0, Math.min(clip.buffer.duration - 0.05, clip.offsetInSourceSec));
          const dur = Math.max(0.05, Math.min(clip.durationSec, clip.buffer.duration - offset));
          src.start(startAudioTime + delaySec, offset, dur);
        } else {
          const elapsedIntoClip = fromSec - clip.startSec;
          const offset = Math.max(
            0,
            Math.min(clip.buffer.duration - 0.05, clip.offsetInSourceSec + elapsedIntoClip)
          );
          const remainingDur = Math.max(0.05, clipEnd - fromSec);
          src.start(startAudioTime, offset, remainingDur);
        }
        sources.push(src);
      });
    });

    // Schedule metronome clicks ahead up to end of loop or timeline if enabled
    const endBound = loopEnabled ? loopEndSec : timelineTotalSec;
    if (metronomeOn) {
      let clickIndex = Math.ceil(fromSec / beatDurSec);
      let clickTimeSec = clickIndex * beatDurSec;
      while (clickTimeSec < Math.min(endBound, fromSec + 32)) {
        const isDownbeat = clickIndex % beatsPerBar === 0;
        triggerMetronomeClick(
          ctx,
          ctx.destination,
          startAudioTime + (clickTimeSec - fromSec),
          isDownbeat,
          0.45
        );
        clickIndex += 1;
        clickTimeSec = clickIndex * beatDurSec;
      }
    }

    activePlaybackCleanupRef.current = () => {
      sources.forEach((s) => {
        try {
          s.stop();
          s.disconnect();
        } catch {
          // ignore
        }
      });
      chains.forEach((c) => c.disconnect());
      teardownMaster();
      try {
        masterBus.disconnect();
      } catch {
        // ignore
      }
    };

    setIsPlayingTimeline(true);
    const wallStartMs = performance.now();

    playbackTimerRef.current = window.setInterval(() => {
      const elapsedSec = (performance.now() - wallStartMs) / 1000;
      const nextPos = fromSec + elapsedSec;
      if (loopEnabled && nextPos >= loopEndSec) {
        setPlayheadSec(loopStartSec);
        startTimelinePlaybackFrom(loopStartSec);
      } else if (nextPos >= timelineTotalSec) {
        setPlayheadSec(0);
        stopTimelinePlayback();
      } else {
        setPlayheadSec(nextPos);
      }
    }, 35);
  };

  const handleTogglePlayTimeline = () => {
    if (isPlayingTimeline) {
      stopTimelinePlayback();
    } else {
      startTimelinePlaybackFrom(playheadSec);
    }
  };

  const handleStopTimeline = () => {
    stopTimelinePlayback();
    setPlayheadSec(loopEnabled ? loopStartSec : 0);
  };

  // Dragging clips to move or resize
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const deltaSec = (e.clientX - drag.originClientX) / zoomPxPerSec;

      onChangeTracks(
        tracks.map((tr) => {
          if (tr.id !== drag.trackId) return tr;
          return {
            ...tr,
            clips: tr.clips.map((cl) => {
              if (cl.id !== drag.clipId) return cl;
              if (drag.type === 'move') {
                return {
                  ...cl,
                  startSec: snapTimeSec(drag.initialStartSec + deltaSec),
                };
              } else {
                const rawDur = drag.initialDurationSec + deltaSec;
                const clampedDur = Math.max(0.25, Math.min(drag.maxDurationSec, rawDur));
                return {
                  ...cl,
                  durationSec: snapEnabled ? Math.max(0.25, snapTimeSec(clampedDur)) : Number(clampedDur.toFixed(2)),
                };
              }
            }),
          };
        }),
        false
      );
    };

    const onPointerUp = () => {
      if (dragStateRef.current) {
        dragStateRef.current = null;
        // Commit final position to undo stack cleanly
        onChangeTracks(tracks, true);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [tracks, zoomPxPerSec, snapEnabled, snapGridDivision, bpm, timeSignature]);

  // Step Sequencer Playback Loop (inside bottom DAW dock)
  useEffect(() => {
    if (!isPlayingSeq) {
      if (seqTimerRef.current) window.clearTimeout(seqTimerRef.current);
      return;
    }

    let step = currentStep;
    const tick = () => {
      currentStepRef.current = step;
      const ctx = getAudioContext();
      const activePads = new Set<DrumPadId>([
        ...activeKit.sequencerLanes,
        ...(Object.keys(pattern) as DrumPadId[]),
        ...padAssignments.map((a) => a.padId as DrumPadId),
      ]);
      activePads.forEach((padId) => {
        if (pattern[padId]?.[step]) {
          const customBuf = padSampleBuffers[padId];
          if (customBuf) {
            triggerBufferPad(ctx, ctx.destination, customBuf, ctx.currentTime, masterVol, 1.8);
          } else {
            triggerSynthPad(ctx, ctx.destination, padId, ctx.currentTime, masterVol, kitPreset);
          }
        }
      });
      setCurrentStep(step);
      const baseStepMs = (60 / bpm / 4) * 1000;
      const swingOffset =
        step % 2 === 1 ? (baseStepMs * swingPct) / 100 : -(baseStepMs * swingPct) / 100;
      step = (step + 1) % 32;
      seqTimerRef.current = window.setTimeout(tick, Math.max(40, baseStepMs + swingOffset));
    };

    tick();
    return () => {
      if (seqTimerRef.current) window.clearTimeout(seqTimerRef.current);
    };
  }, [isPlayingSeq, bpm, pattern, swingPct, masterVol, padSampleBuffers, padAssignments, kitPreset]);

  // Clip Editing Actions
  const findSelectedClip = (): { track: StudioTrack; clip: TimelineClip } | null => {
    if (!selectedClipId) return null;
    for (const tr of tracks) {
      const found = tr.clips.find((c) => c.id === selectedClipId);
      if (found) return { track: tr, clip: found };
    }
    return null;
  };

  const selectedClipPair = findSelectedClip();

  const handleSplitClipAtPlayhead = () => {
    if (!selectedClipPair) return;
    const { track, clip } = selectedClipPair;
    if (playheadSec <= clip.startSec + 0.1 || playheadSec >= clip.startSec + clip.durationSec - 0.1) {
      onErrorMessage('Position the playhead inside the selected clip before splitting.');
      return;
    }
    const leftDur = Number((playheadSec - clip.startSec).toFixed(3));
    const rightDur = Number((clip.durationSec - leftDur).toFixed(3));
    const leftClip: TimelineClip = {
      ...clip,
      id: `clip_${Date.now()}_L`,
      durationSec: leftDur,
    };
    const rightClip: TimelineClip = {
      ...clip,
      id: `clip_${Date.now()}_R`,
      name: `${clip.name} (Split)`,
      startSec: playheadSec,
      offsetInSourceSec: clip.offsetInSourceSec + leftDur,
      durationSec: rightDur,
    };
    onChangeTracks(
      tracks.map((tr) =>
        tr.id !== track.id
          ? tr
          : { ...tr, clips: [...tr.clips.filter((c) => c.id !== clip.id), leftClip, rightClip] }
      ),
      true
    );
    setSelectedClipId(rightClip.id);
    onStatusMessage(`Split "${clip.name}" cleanly at ${playheadSec.toFixed(2)}s.`);
  };

  const handleCopySelectedClip = () => {
    if (!selectedClipPair) return;
    setClipboardClip({ ...selectedClipPair.clip });
    onStatusMessage(`Copied "${selectedClipPair.clip.name}" to DAW clipboard.`);
  };

  const handleCutSelectedClip = () => {
    if (!selectedClipPair) return;
    const { track, clip } = selectedClipPair;
    setClipboardClip({ ...clip });
    onChangeTracks(
      tracks.map((tr) =>
        tr.id !== track.id ? tr : { ...tr, clips: tr.clips.filter((c) => c.id !== clip.id) }
      ),
      true
    );
    setSelectedClipId(null);
    onStatusMessage(`Cut "${clip.name}" to DAW clipboard.`);
  };

  const handlePasteClipAtPlayhead = () => {
    if (!clipboardClip || !selectedTrack) return;
    const pasted: TimelineClip = {
      ...clipboardClip,
      id: `clip_${Date.now()}_paste`,
      trackId: selectedTrack.id,
      startSec: snapTimeSec(playheadSec),
    };
    onChangeTracks(
      tracks.map((tr) =>
        tr.id !== selectedTrack.id ? tr : { ...tr, clips: [...tr.clips, pasted] }
      ),
      true
    );
    setSelectedClipId(pasted.id);
    onStatusMessage(`Pasted "${pasted.name}" onto "${selectedTrack.name}" at ${pasted.startSec.toFixed(2)}s.`);
  };

  const handleDuplicateSelectedClip = () => {
    if (!selectedClipPair) return;
    const { track, clip } = selectedClipPair;
    const dup: TimelineClip = {
      ...clip,
      id: `clip_${Date.now()}_dup`,
      startSec: snapTimeSec(clip.startSec + clip.durationSec),
    };
    onChangeTracks(
      tracks.map((tr) =>
        tr.id !== track.id ? tr : { ...tr, clips: [...tr.clips, dup] }
      ),
      true
    );
    setSelectedClipId(dup.id);
  };

  const handleDeleteSelectedClip = () => {
    if (!selectedClipPair) return;
    const { track, clip } = selectedClipPair;
    onChangeTracks(
      tracks.map((tr) =>
        tr.id !== track.id ? tr : { ...tr, clips: tr.clips.filter((c) => c.id !== clip.id) }
      ),
      true
    );
    setSelectedClipId(null);
  };

  // Quick Mic Recording directly onto a vocal/selected track
  const handleToggleQuickRecord = async () => {
    if (isQuickRecording) {
      quickRecorderRef.current?.stop();
      setIsQuickRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      quickChunksRef.current = [];
      const recordStartPlayhead = playheadSec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) quickChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(quickChunksRef.current, { type: 'audio/webm' });
        const ab = await blob.arrayBuffer();
        const ctx = getAudioContext();
        const decoded = await ctx.decodeAudioData(ab);
        onBounceAudioToTrack(
          'vocal',
          decoded,
          `Mic Take @ ${recordStartPlayhead.toFixed(1)}s`,
          'user_recording'
        );
        onStatusMessage(`Recorded vocal clip (${decoded.duration.toFixed(1)}s) to timeline.`);
      };
      quickRecorderRef.current = rec;
      rec.start();
      setIsQuickRecording(true);
    } catch {
      onErrorMessage('Microphone access is needed for live DAW track recording.');
    }
  };

  // Beat Pads Actions
  const handleTriggerPad = (padId: DrumPadId) => {
    const ctx = getAudioContext();
    const customBuf = padSampleBuffers[padId];
    if (customBuf) {
      triggerBufferPad(ctx, ctx.destination, customBuf, ctx.currentTime, masterVol, 2.2);
    } else {
      triggerSynthPad(ctx, ctx.destination, padId, ctx.currentTime, masterVol, kitPreset);
    }
    setActivePad(padId);
    setTimeout(() => setActivePad((p) => (p === padId ? null : p)), 130);

    // If real-time MIDI recording is active, punch this pad hit onto the active sequencer step
    if (isMidiRecordingRef.current) {
      const stepToRecord = currentStepRef.current;
      const laneKey = padId;
      const currentLaneSteps = pattern[laneKey] ? [...pattern[laneKey]] : Array(32).fill(false);
      currentLaneSteps[stepToRecord] = true;
      onChangePattern({ ...pattern, [laneKey]: currentLaneSteps });
    }
  };

  const handleAssignDiscoverSampleHere = async () => {
    setAssigningPad(true);
    try {
      const customSample = discoverCustomSamples.find((s) => s.id === mapperSampleKey);
      const catalogTrack = DISCOVER_CATALOG_TRACKS.find((t) => t.id === mapperSampleKey);
      if (!customSample && !catalogTrack) return;

      const { savedToCloud } = await onAssignSampleToPad({
        padId: mapperPadId,
        sampleName: customSample ? customSample.title : catalogTrack!.title,
        sourceType: customSample ? 'custom_audio' : 'catalog',
        sourceTrackId: customSample ? customSample.id : catalogTrack!.id,
        grooveStyle: catalogTrack ? catalogTrack.grooveStyle : 'afro',
        bpm: catalogTrack ? catalogTrack.bpm : bpm,
        sliceStartSec: mapperSliceSec,
        sliceDurationSec: 1.5,
        rawBuffer: customSample?.buffer,
      });
      onStatusMessage(
        savedToCloud
          ? `Assigned "${customSample ? customSample.title : catalogTrack!.title}" to pad and saved to Firestore.`
          : `Assigned sample to pad for this session.`
      );
    } catch (err) {
      onErrorMessage(err instanceof Error ? err.message : 'Unable to assign Discover sample.');
    } finally {
      setAssigningPad(false);
    }
  };

  const handleBounceBeatToTimeline = async () => {
    setBouncingBeat(true);
    try {
      const buf = await renderPatternToBuffer(pattern, bpm, 2, padSampleBuffers, kitPreset);
      onBounceAudioToTrack('drums', buf, `${activeKit.name} Groove (${bpm} BPM)`, 'original_synth');
      onStatusMessage(`Bounced 2-bar "${activeKit.name}" beat loop onto Drums track.`);
    } finally {
      setBouncingBeat(false);
    }
  };

  // Vertical divider drag handler for bottom rack height
  const startResizeBottomRack = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const startH = bottomDockHeight;
    const onMove = (ev: PointerEvent) => {
      const delta = startY - ev.clientY;
      setBottomDockHeight(Math.max(220, Math.min(580, startH + delta)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Automation Lane Click Handler
  const handleAutomationLaneClick = (track: StudioTrack, e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    const timeSec = Number((relX * timelineTotalSec).toFixed(2));
    const value = Number(relY.toFixed(2));
    const nextAuto = [
      ...track.automation.filter((pt) => Math.abs(pt.timeSec - timeSec) > 0.35),
      { timeSec, value },
    ].sort((a, b) => a.timeSec - b.timeSec);
    onChangeTracks(
      tracks.map((t) => (t.id === track.id ? { ...t, automation: nextAuto } : t)),
      true
    );
  };

  const barMarkers = useMemo(() => {
    const bars: number[] = [];
    for (let t = 0, barIdx = 1; t < timelineTotalSec; t += barDurSec, barIdx++) {
      bars.push(barIdx);
    }
    return bars;
  }, [timelineTotalSec, barDurSec]);

  return (
    <div className="space-y-4">
      {/* 1. Pro Transport, Tempo, Grid, Loop & Clip Editing Toolbar */}
      <div className="rounded-xl bg-[#0F1219] border border-slate-800/90 p-3 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Transport + Record + Playhead */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTogglePlayTimeline}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              isPlayingTimeline
                ? 'bg-sky-500 text-slate-950'
                : 'bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-white'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isPlayingTimeline ? 'Pause' : 'Play Mix'}</span>
          </button>

          <button
            type="button"
            onClick={handleStopTimeline}
            className="p-2 rounded-lg bg-[#090B10] hover:bg-slate-800 border border-slate-800 text-slate-300"
            title="Stop & Rewind"
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleToggleQuickRecord}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border whitespace-nowrap ${
              isQuickRecording
                ? 'bg-red-600 border-red-500 text-white'
                : 'bg-[#090B10] hover:bg-slate-800 border-slate-800 text-red-300'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>{isQuickRecording ? 'Stop Rec' : 'Rec Mic'}</span>
          </button>

          <div className="px-3 py-1.5 rounded-lg bg-[#090B10] border border-slate-800 font-mono text-xs text-sky-300 tabular-nums">
            {playheadSec.toFixed(2)}s
          </div>

          <button
            type="button"
            onClick={() => setMetronomeOn((m) => !m)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1 whitespace-nowrap ${
              metronomeOn
                ? 'bg-purple-600/25 border-purple-500/50 text-purple-200'
                : 'bg-[#090B10] border-slate-800 text-slate-400'
            }`}
            title="DAW Click Metronome during playback"
          >
            <Clock4 className="w-3.5 h-3.5" />
            <span>Click</span>
          </button>
        </div>

        {/* Center: BPM, Time Sig, Snap & Loop */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#090B10] border border-slate-800">
            <span className="text-slate-400">BPM</span>
            <input
              type="number"
              min={40}
              max={240}
              value={bpm}
              onChange={(e) => onChangeBpm(Math.max(40, Math.min(240, Number(e.target.value) || 112)))}
              className="w-12 bg-transparent font-mono text-purple-300 focus:outline-none tabular-nums"
            />
          </label>

          <select
            value={timeSignature}
            onChange={(e) => onChangeTimeSignature(e.target.value as '4/4' | '3/4' | '6/8')}
            aria-label="Time signature"
            className="px-2.5 py-1.5 rounded-lg bg-[#090B10] border border-slate-800 font-mono text-slate-200"
          >
            <option value="4/4">4/4</option>
            <option value="3/4">3/4</option>
            <option value="6/8">6/8</option>
          </select>

          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#090B10] border border-slate-800">
            <button
              type="button"
              onClick={() => setSnapEnabled((s) => !s)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                snapEnabled ? 'bg-sky-500/20 text-sky-300' : 'text-slate-500'
              }`}
            >
              Snap
            </button>
            <select
              value={snapGridDivision}
              onChange={(e) => setSnapGridDivision(e.target.value as typeof snapGridDivision)}
              aria-label="Snap grid resolution"
              className="bg-transparent text-[11px] font-mono text-slate-300 focus:outline-none"
            >
              <option value="beat" className="bg-[#0F1219]">1 Beat</option>
              <option value="half_beat" className="bg-[#0F1219]">1/2 Beat</option>
              <option value="bar" className="bg-[#0F1219]">1 Bar</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#090B10] border border-slate-800">
            <button
              type="button"
              onClick={() => setLoopEnabled((l) => !l)}
              className={`flex items-center gap-1 text-[11px] font-mono ${
                loopEnabled ? 'text-purple-300' : 'text-slate-500'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>Loop Bars</span>
            </button>
            <input
              type="number"
              min={1}
              max={16}
              value={loopStartBar}
              onChange={(e) => setLoopStartBar(Math.max(1, Number(e.target.value) || 1))}
              className="w-9 bg-[#151923] rounded px-1 text-center font-mono text-[11px] text-slate-200 tabular-nums"
              title="Loop Start Bar"
            />
            <span className="text-slate-500">-</span>
            <input
              type="number"
              min={loopStartBar + 1}
              max={32}
              value={loopEndBar}
              onChange={(e) => setLoopEndBar(Math.max(loopStartBar + 1, Number(e.target.value) || 5))}
              className="w-9 bg-[#151923] rounded px-1 text-center font-mono text-[11px] text-slate-200 tabular-nums"
              title="Loop End Bar"
            />
          </div>
        </div>

        {/* Right: Undo / Redo + Zoom */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo"
            className="p-2 rounded-lg bg-[#090B10] hover:bg-slate-800 border border-slate-800 text-slate-300 disabled:opacity-30"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo"
            className="p-2 rounded-lg bg-[#090B10] hover:bg-slate-800 border border-slate-800 text-slate-300 disabled:opacity-30"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#090B10] border border-slate-800">
            <button
              type="button"
              onClick={() => setZoomPxPerSec((z) => Math.max(24, z - 12))}
              className="text-slate-400 hover:text-slate-200"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-400 w-10 text-center tabular-nums">
              {zoomPxPerSec}px
            </span>
            <button
              type="button"
              onClick={() => setZoomPxPerSec((z) => Math.min(160, z + 12))}
              className="text-slate-400 hover:text-slate-200"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Clip Editing & Track Creation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#0F1219] border border-slate-800/80 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono text-slate-400 mr-1">Clip Tools:</span>
          <button
            type="button"
            onClick={handleSplitClipAtPlayhead}
            disabled={!selectedClipPair}
            className="px-2.5 py-1 rounded bg-[#090B10] hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center gap-1 disabled:opacity-35"
          >
            <Scissors className="w-3 h-3 text-sky-400" />
            <span>Split</span>
          </button>
          <button
            type="button"
            onClick={handleCutSelectedClip}
            disabled={!selectedClipPair}
            className="px-2.5 py-1 rounded bg-[#090B10] hover:bg-slate-800 border border-slate-800 text-slate-200 disabled:opacity-35"
          >
            Cut
          </button>
          <button
            type="button"
            onClick={handleCopySelectedClip}
            disabled={!selectedClipPair}
            className="px-2.5 py-1 rounded bg-[#090B10] hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center gap-1 disabled:opacity-35"
          >
            <Copy className="w-3 h-3" />
            <span>Copy</span>
          </button>
          <button
            type="button"
            onClick={handlePasteClipAtPlayhead}
            disabled={!clipboardClip || !selectedTrack}
            className="px-2.5 py-1 rounded bg-[#090B10] hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center gap-1 disabled:opacity-35"
          >
            <ClipboardPaste className="w-3 h-3 text-purple-400" />
            <span>Paste</span>
          </button>
          <button
            type="button"
            onClick={handleDuplicateSelectedClip}
            disabled={!selectedClipPair}
            className="px-2.5 py-1 rounded bg-[#090B10] hover:bg-slate-800 border border-slate-800 text-slate-200 disabled:opacity-35"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={handleDeleteSelectedClip}
            disabled={!selectedClipPair}
            className="px-2 py-1 rounded bg-[#090B10] hover:bg-red-950/60 border border-slate-800 text-slate-400 hover:text-red-300 disabled:opacity-35"
            title="Delete Selected Clip"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {selectedTrack && (
            <label className="cursor-pointer px-2.5 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-200 font-medium flex items-center gap-1 whitespace-nowrap">
              <Upload className="w-3 h-3" />
              <span>Import Audio Clip</span>
              <input
                type="file"
                accept="audio/*"
                multiple
                onChange={(e) => {
                  if (e.target.files?.length) {
                    onDropFilesToTrack(selectedTrack.id, e.target.files);
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => onAddTrack('audio')}
            className="px-2.5 py-1 rounded bg-[#151923] hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3 h-3 text-purple-400" />
            <span>Audio Track</span>
          </button>
          <button
            type="button"
            onClick={() => onAddTrack('vocal')}
            className="px-2.5 py-1 rounded bg-[#151923] hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3 h-3 text-sky-400" />
            <span>Vocal Track</span>
          </button>
          <button
            type="button"
            onClick={() => onAddTrack('instrument')}
            className="px-2.5 py-1 rounded bg-[#151923] hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3 h-3 text-emerald-400" />
            <span>Synth Track</span>
          </button>
        </div>
      </div>

      {/* 3. Multitrack Arrangement Grid (Track Headers + Draggable Waveform Clips + Automation) */}
      <div className="rounded-xl bg-[#0F1219] border border-slate-800/90 overflow-hidden">
        <div className="flex">
          {/* Fixed Track Controls Column */}
          <div className="w-56 sm:w-64 shrink-0 border-r border-slate-800 bg-[#0C0F16]">
            <div className="h-8 px-3 border-b border-slate-800 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
              <span>Tracks ({tracks.length})</span>
              <span>{timeSignature} · {bpm} BPM</span>
            </div>

            {tracks.map((track) => {
              const isSelected = selectedTrack?.id === track.id;
              const isAutoOpen = expandedAutoTrackId === track.id;
              return (
                <div
                  key={track.id}
                  onClick={() => setSelectedTrackId(track.id)}
                  className={`border-b border-slate-800/80 p-2.5 flex flex-col justify-between transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#151A28]' : 'bg-[#0C0F16] hover:bg-[#111520]'
                  }`}
                  style={{ height: isAutoOpen ? '156px' : '92px' }}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: track.color }}
                      />
                      {renamingTrackId === track.id ? (
                        <input
                          type="text"
                          value={renameTrackValue}
                          autoFocus
                          onChange={(e) => setRenameTrackValue(e.target.value)}
                          onBlur={() => {
                            if (renameTrackValue.trim()) {
                              onChangeTracks(
                                tracks.map((t) =>
                                  t.id === track.id ? { ...t, name: renameTrackValue.trim() } : t
                                ),
                                true
                              );
                            }
                            setRenamingTrackId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className="w-full px-1.5 py-0.5 rounded bg-[#090B10] border border-sky-500 text-xs text-slate-100"
                        />
                      ) : (
                        <button
                          type="button"
                          onDoubleClick={() => {
                            setRenamingTrackId(track.id);
                            setRenameTrackValue(track.name);
                          }}
                          title="Double-click to rename track"
                          className="text-xs font-semibold text-slate-100 truncate text-left"
                        >
                          {track.name}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeTracks(
                            tracks.map((t) => (t.id === track.id ? { ...t, muted: !t.muted } : t)),
                            false
                          );
                        }}
                        className={`w-6 h-5 rounded text-[10px] font-mono font-bold ${
                          track.muted
                            ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                            : 'bg-[#151923] text-slate-400 hover:text-slate-200'
                        }`}
                        title="Mute Track"
                      >
                        M
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeTracks(
                            tracks.map((t) => (t.id === track.id ? { ...t, solo: !t.solo } : t)),
                            false
                          );
                        }}
                        className={`w-6 h-5 rounded text-[10px] font-mono font-bold ${
                          track.solo
                            ? 'bg-sky-500 text-slate-950'
                            : 'bg-[#151923] text-slate-400 hover:text-slate-200'
                        }`}
                        title="Solo Track"
                      >
                        S
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTrackId(track.id);
                          setBottomDockTab('fx');
                        }}
                        className="px-1.5 h-5 rounded text-[10px] font-mono bg-purple-600/20 text-purple-300 hover:bg-purple-600/35"
                        title="Open Track Effects Rack"
                      >
                        FX
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="range"
                      min={0}
                      max={1.4}
                      step={0.02}
                      value={track.volumeGain}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        onChangeTracks(
                          tracks.map((t) => (t.id === track.id ? { ...t, volumeGain: val } : t)),
                          false
                        );
                      }}
                      className="studio-slider flex-1"
                      aria-label={`${track.name} volume`}
                    />
                    <span className="text-[10px] font-mono text-slate-400 w-9 text-right tabular-nums">
                      {Math.round(track.volumeGain * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedAutoTrackId((prev) => (prev === track.id ? null : track.id));
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                        isAutoOpen
                          ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                          : 'bg-[#090B10] border-slate-800 text-slate-400'
                      }`}
                      title="Toggle Volume Automation Envelope"
                    >
                      <Activity className="w-3 h-3 inline" />
                    </button>
                    {tracks.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeTracks(
                            tracks.filter((t) => t.id !== track.id),
                            true
                          );
                        }}
                        className="p-0.5 text-slate-500 hover:text-red-400"
                        title="Remove Track"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scrollable Timeline Canvas Area */}
          <div className="flex-1 overflow-x-auto relative bg-[#090B10]">
            <div style={{ width: `${timelineWidthPx}px` }} className="relative">
              {/* Top Bar Ruler + Loop Region */}
              <div
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = Math.max(0, e.clientX - rect.left);
                  const targetSec = snapTimeSec(clickX / zoomPxPerSec);
                  setPlayheadSec(targetSec);
                  if (isPlayingTimeline) {
                    startTimelinePlaybackFrom(targetSec);
                  }
                }}
                className="h-8 border-b border-slate-800 bg-[#0D1017] relative cursor-pointer select-none"
              >
                {loopEnabled && (
                  <div
                    className="absolute top-0 bottom-0 bg-purple-600/20 border-x border-purple-400/60"
                    style={{
                      left: `${loopStartSec * zoomPxPerSec}px`,
                      width: `${Math.max(12, (loopEndSec - loopStartSec) * zoomPxPerSec)}px`,
                    }}
                  />
                )}
                {barMarkers.map((barNum) => {
                  const x = (barNum - 1) * barDurSec * zoomPxPerSec;
                  return (
                    <div
                      key={barNum}
                      style={{ left: `${x}px` }}
                      className="absolute top-0 bottom-0 border-l border-slate-700/70 pl-1.5 flex items-center text-[10px] font-mono text-slate-400 tabular-nums"
                    >
                      Bar {barNum}
                    </div>
                  );
                })}
              </div>

              {/* Track Lanes */}
              {tracks.map((track) => {
                const isAutoOpen = expandedAutoTrackId === track.id;
                const autoPts = [...track.automation].sort((a, b) => a.timeSec - b.timeSec);
                const polyPoints =
                  autoPts.length > 0
                    ? autoPts
                        .map((pt) => `${(pt.timeSec / timelineTotalSec) * 100},${(1 - pt.value) * 100}`)
                        .join(' ')
                    : `0,${(1 - track.volumeGain / 1.5) * 100} 100,${(1 - track.volumeGain / 1.5) * 100}`;

                return (
                  <div
                    key={track.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.length) {
                        onDropFilesToTrack(track.id, e.dataTransfer.files);
                      }
                    }}
                    className="border-b border-slate-800/80 relative"
                  >
                    {/* Clip Row (92px) */}
                    <div className="h-[92px] relative bg-[#090B10]/95">
                      {/* Bar Gridlines */}
                      {barMarkers.map((barNum) => (
                        <div
                          key={barNum}
                          style={{ left: `${(barNum - 1) * barDurSec * zoomPxPerSec}px` }}
                          className="absolute top-0 bottom-0 border-l border-slate-800/50 pointer-events-none"
                        />
                      ))}

                      {track.clips.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-[11px] font-mono text-slate-600">
                            Drop audio file here, bounce Beat/MIDI, or add sound from Library
                          </span>
                        </div>
                      )}

                      {track.clips.map((clip) => {
                        const leftPx = clip.startSec * zoomPxPerSec;
                        const widthPx = Math.max(28, clip.durationSec * zoomPxPerSec);
                        const isClipSelected = selectedClipId === clip.id;
                        return (
                          <div
                            key={clip.id}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              setSelectedClipId(clip.id);
                              setSelectedTrackId(track.id);
                              dragStateRef.current = {
                                type: 'move',
                                clipId: clip.id,
                                trackId: track.id,
                                originClientX: e.clientX,
                                initialStartSec: clip.startSec,
                                initialDurationSec: clip.durationSec,
                                maxDurationSec: clip.sourceDurationSec - clip.offsetInSourceSec,
                              };
                            }}
                            style={{
                              left: `${leftPx}px`,
                              width: `${widthPx}px`,
                              borderColor: isClipSelected ? '#38BDF8' : `${clip.color}88`,
                            }}
                            className={`absolute top-2 bottom-2 rounded-lg border bg-[#141824]/95 overflow-hidden cursor-grab active:cursor-grabbing select-none ${
                              isClipSelected ? 'ring-1 ring-sky-400 shadow-lg shadow-sky-500/15' : ''
                            }`}
                          >
                            <div
                              className="h-5 px-2 flex items-center justify-between text-[10px] font-mono text-slate-100 truncate"
                              style={{ backgroundColor: `${clip.color}33` }}
                            >
                              <span className="truncate">{clip.name}</span>
                              <span className="opacity-75 shrink-0 ml-1 tabular-nums">
                                {clip.durationSec.toFixed(1)}s
                              </span>
                            </div>
                            <div className="h-[54px] px-0.5 py-0.5">
                              <ClipWaveformCanvas
                                buffer={clip.buffer}
                                offsetInSourceSec={clip.offsetInSourceSec}
                                durationSec={clip.durationSec}
                                color={clip.color}
                                widthPx={widthPx}
                              />
                            </div>

                            {/* Right-edge Resize / Trim Handle */}
                            <div
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                setSelectedClipId(clip.id);
                                dragStateRef.current = {
                                  type: 'resize',
                                  clipId: clip.id,
                                  trackId: track.id,
                                  originClientX: e.clientX,
                                  initialStartSec: clip.startSec,
                                  initialDurationSec: clip.durationSec,
                                  maxDurationSec: Math.max(
                                    0.4,
                                    clip.sourceDurationSec - clip.offsetInSourceSec
                                  ),
                                };
                              }}
                              title="Drag right edge to trim clip duration"
                              className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize bg-sky-400/20 hover:bg-sky-400/60 transition-colors"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Expandable Track Automation Lane (64px) */}
                    {isAutoOpen && (
                      <div className="h-[64px] bg-[#0B0E17] border-t border-slate-800/80 relative">
                        <div className="absolute top-1 left-2 text-[9px] font-mono text-sky-400 pointer-events-none flex items-center gap-2 z-10">
                          <span>Volume Automation (Click to add curve point)</span>
                        </div>
                        {track.automation.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              onChangeTracks(
                                tracks.map((t) =>
                                  t.id === track.id ? { ...t, automation: [] } : t
                                ),
                                true
                              )
                            }
                            className="absolute top-1 right-2 z-10 px-1.5 py-0.5 rounded bg-slate-900 text-[9px] font-mono text-slate-400 hover:text-red-300"
                          >
                            Clear Points
                          </button>
                        )}
                        <svg
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          onClick={(e) => handleAutomationLaneClick(track, e)}
                          className="w-full h-full cursor-crosshair"
                        >
                          <polyline
                            fill="none"
                            stroke="#38BDF8"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                            points={polyPoints}
                          />
                          {autoPts.map((pt, i) => (
                            <circle
                              key={i}
                              cx={(pt.timeSec / timelineTotalSec) * 100}
                              cy={(1 - pt.value) * 100}
                              r="1.4"
                              fill="#A855F7"
                            />
                          ))}
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Playhead Needle across full timeline height */}
              <div
                style={{ left: `${playheadSec * zoomPxPerSec}px` }}
                className="absolute top-0 bottom-0 w-0.5 bg-sky-400 pointer-events-none z-20"
              >
                <div className="w-2.5 h-2.5 -ml-1 bg-sky-400 rotate-45" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Resizable Bottom Production Dock (Beats / Piano Roll / Pro Effects Rack) */}
      {showBottomRack && (
        <div className="rounded-xl bg-[#0F1219] border border-slate-800/90 overflow-hidden">
          {/* Drag Handle to Resize Dock Height */}
          <div
            onPointerDown={startResizeBottomRack}
            className="h-3 bg-[#090B10] hover:bg-purple-900/30 border-b border-slate-800 flex items-center justify-center cursor-ns-resize transition-colors"
            title="Drag vertically to resize production rack"
          >
            <GripHorizontal className="w-4 h-3 text-slate-600" />
          </div>

          {/* Dock Navigation Header */}
          <div className="px-4 py-2.5 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 bg-[#0C0F16]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setBottomDockTab('beats')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  bottomDockTab === 'beats'
                    ? 'bg-purple-600/25 text-purple-200 border border-purple-500/40'
                    : 'text-slate-400 hover:text-slate-200 bg-[#090B10]'
                }`}
              >
                <Drum className="w-3.5 h-3.5" />
                <span>Beat Pads &amp; Step Sequencer</span>
              </button>
              <button
                type="button"
                onClick={() => setBottomDockTab('piano')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  bottomDockTab === 'piano'
                    ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200 bg-[#090B10]'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>Piano Roll &amp; Tone Instruments</span>
              </button>
              <button
                type="button"
                onClick={() => setBottomDockTab('fx')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  bottomDockTab === 'fx'
                    ? 'bg-purple-600/25 text-purple-200 border border-purple-500/40'
                    : 'text-slate-400 hover:text-slate-200 bg-[#090B10]'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Effects Rack ({selectedTrack?.name || 'Track'})</span>
              </button>
            </div>

            {bottomDockTab === 'beats' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBounceBeatToTimeline}
                  disabled={bouncingBeat}
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{bouncingBeat ? 'Bouncing...' : 'Bounce 2-Bar Beat to Timeline'}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const buf = await renderPatternToBuffer(pattern, bpm, 2, padSampleBuffers, kitPreset);
                    triggerFileDownload(
                      encodeAudioBufferToWavBlob(buf, 16),
                      `sounddeck-${kitPreset}-${bpm}bpm.wav`
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#151923] hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>Loop .WAV</span>
                </button>
              </div>
            )}
          </div>

          {/* Resizable Dock Body */}
          <div
            style={{ minHeight: `${bottomDockHeight}px` }}
            className="p-4 overflow-y-auto space-y-4"
          >
            {bottomDockTab === 'beats' && (
              <div className="space-y-4">
                {/* Genre Kit Selector */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {filteredKits.map((kit) => (
                      <button
                        key={kit.id}
                        type="button"
                        onClick={() => {
                          onSelectKitPreset(kit.id);
                          onChangePattern(kit.pattern);
                          onChangeBpm(kit.bpm);
                          setSwingPct(kit.swingPct);
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap ${
                          kitPreset === kit.id
                            ? 'bg-purple-600 text-white font-semibold'
                            : 'bg-[#090B10] text-slate-300 border border-slate-800 hover:bg-[#151923]'
                        }`}
                      >
                        {kit.name} · {kit.bpm}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090B10] border border-slate-800">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'kenya', label: 'Kenya' },
                        { id: 'africa_caribbean', label: 'Africa & Islands' },
                        { id: 'global', label: 'Global' },
                      ] as const
                    ).map((reg) => (
                      <button
                        key={reg.id}
                        type="button"
                        onClick={() => setKitRegionFilter(reg.id)}
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          kitRegionFilter === reg.id
                            ? 'bg-sky-500/20 text-sky-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {reg.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Discover Custom Pad Mapper */}
                <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 flex flex-wrap items-center gap-2 text-xs">
                  <Music2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <select
                    value={mapperSampleKey}
                    onChange={(e) => setMapperSampleKey(e.target.value)}
                    aria-label="Choose Discover sample"
                    className="flex-1 min-w-[150px] px-2.5 py-1.5 rounded bg-[#151923] border border-slate-800 text-slate-100"
                  >
                    {DISCOVER_CATALOG_TRACKS.map((t) => (
                      <option key={t.id} value={t.id}>
                        Discover: {t.title} ({t.bpm} BPM)
                      </option>
                    ))}
                    {discoverCustomSamples.map((s) => (
                      <option key={s.id} value={s.id}>
                        Uploaded: {s.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={mapperPadId}
                    onChange={(e) => setMapperPadId(e.target.value as DrumPadId)}
                    aria-label="Target drum pad"
                    className="px-2.5 py-1.5 rounded bg-[#151923] border border-slate-800 text-slate-100"
                  >
                    {DRUM_PADS.map((p) => (
                      <option key={p.id} value={p.id}>
                        Pad [{p.keyBind}] {activeKit.padLabels[p.id] || p.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={mapperSliceSec}
                    onChange={(e) => setMapperSliceSec(Number(e.target.value))}
                    aria-label="Slice offset"
                    className="px-2 py-1.5 rounded bg-[#151923] border border-slate-800 font-mono text-slate-100"
                  >
                    <option value={0}>0.0s</option>
                    <option value={0.5}>0.5s</option>
                    <option value={1.0}>1.0s</option>
                    <option value={1.5}>1.5s</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAssignDiscoverSampleHere}
                    disabled={assigningPad}
                    className="px-3 py-1.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 font-semibold whitespace-nowrap"
                  >
                    {assigningPad ? 'Mapping...' : 'Assign to Pad'}
                  </button>
                  {padAssignments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 w-full pt-1">
                      {padAssignments.map((a) => (
                        <span
                          key={a.padId}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#151923] border border-purple-500/30 text-[10px] text-purple-200"
                        >
                          <span>{a.sampleName}</span>
                          <button
                            type="button"
                            onClick={() => onRemovePadAssignment(a.padId as DrumPadId)}
                            className="text-slate-400 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 16 MPC Drum Pads + Step Sequencer */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                  <div className="xl:col-span-4 grid grid-cols-4 gap-2">
                    {DRUM_PADS.map((pad) => {
                      const isLit = activePad === pad.id;
                      const assigned = assignmentByPad.get(pad.id);
                      const padLabel = activeKit.padLabels[pad.id] || pad.label;
                      return (
                        <button
                          key={pad.id}
                          type="button"
                          onPointerDown={() => handleTriggerPad(pad.id)}
                          className={`p-2.5 rounded-lg border text-left transition-transform active:scale-95 ${
                            isLit
                              ? 'bg-gradient-to-br from-purple-500 to-sky-400 text-white border-white'
                              : assigned
                              ? 'bg-[#161B2A] border-purple-500/50 text-slate-100'
                              : 'bg-[#090B10] hover:bg-[#151923] border-slate-800 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[9px] font-mono opacity-70">
                            <span>{assigned ? 'SMP' : pad.category.slice(0, 3).toUpperCase()}</span>
                            <span>[{pad.keyBind}]</span>
                          </div>
                          <div className="text-[11px] font-semibold mt-1 truncate">
                            {assigned ? assigned.sampleName : padLabel}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="xl:col-span-8">
                    <StepSequencerGrid
                      activeKit={activeKit}
                      pattern={pattern}
                      onToggleStep={(laneId, idx) => {
                        const row = pattern[laneId] ? [...pattern[laneId]] : Array(32).fill(false);
                        row[idx] = !row[idx];
                        onChangePattern({ ...pattern, [laneId]: row });
                      }}
                      isPlaying={isPlayingSeq}
                      onTogglePlay={() => setIsPlayingSeq((p) => !p)}
                      currentStep={currentStep}
                      bpm={bpm}
                      onBpmChange={onChangeBpm}
                      swingPct={swingPct}
                      onSwingChange={setSwingPct}
                      masterVol={masterVol}
                      onVolChange={setMasterVol}
                      padAssignments={padAssignments}
                      assignmentByPad={assignmentByPad}
                      onClearPattern={() => onChangePattern({})}
                      onRandomizePattern={() => {
                        const next: Record<string, boolean[]> = {};
                        activeKit.sequencerLanes.forEach((laneId) => {
                          next[laneId] = Array(32)
                            .fill(false)
                            .map(() => Math.random() < 0.28);
                        });
                        onChangePattern(next);
                      }}
                      onTriggerPad={handleTriggerPad}
                      isMidiRecording={isMidiRecording}
                      onToggleMidiRecord={() => {
                        const nextState = !isMidiRecording;
                        setIsMidiRecording(nextState);
                        if (nextState && !isPlayingSeq) {
                          setIsPlayingSeq(true);
                        }
                        onStatusMessage(
                          nextState
                            ? 'MIDI Recording active: tap drum pads in real-time to record hits into the step sequencer.'
                            : 'Stopped MIDI recording.'
                        );
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {bottomDockTab === 'piano' && (
              <PianoRollEditor
                bpm={bpm}
                notes={midiNotes}
                selectedInstrument={selectedInstrument}
                onSelectInstrument={onSelectInstrument}
                onChangeNotes={onChangeMidiNotes}
                onBounceToTimeline={(buf, clipName) => {
                  onBounceAudioToTrack('instrument', buf, clipName, 'original_synth');
                  onStatusMessage(`Bounced "${clipName}" to Instrument track.`);
                }}
              />
            )}

            {bottomDockTab === 'fx' && selectedTrack && (
              <ProEffectsRackPanel
                trackName={selectedTrack.name}
                effects={selectedTrack.effects}
                pan={selectedTrack.pan}
                onChangePan={(nextPan) =>
                  onChangeTracks(
                    tracks.map((t) =>
                      t.id === selectedTrack.id ? { ...t, pan: nextPan } : t
                    ),
                    false
                  )
                }
                onChangeEffects={(nextFx: ProEffectsRackState) =>
                  onChangeTracks(
                    tracks.map((t) =>
                      t.id === selectedTrack.id ? { ...t, effects: nextFx } : t
                    ),
                    true
                  )
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
