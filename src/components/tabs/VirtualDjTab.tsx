import { useEffect, useRef, useState, useCallback } from 'react';
import { STUDIO_IMAGES } from '../../assets/studioAssets';
import {
  Disc3,
  ExternalLink,
  Play,
  Square,
  Upload,
  Radio,
  Download,
  RefreshCw,
  Headphones,
  Zap,
  Scissors,
  Sliders,
  Volume2,
  FastForward,
  Rewind,
} from 'lucide-react';
import {
  getAudioContext,
  triggerBlobDownload,
  audioBufferToWavBlob,
} from '../../audio/studioAudio';
import { getOfflineAudioBlob } from '../../audio/offlineLibraryDb';
import {
  CLUB_CRATE_TRACKS,
  estimateAudioBpm,
  formatDjTime,
  getCrossfaderGains,
  getReversedAudioBuffer,
  renderCrateTrackBuffer,
  triggerSamplerDrop,
  type CrossfaderCurve,
  type DeckId,
  type DjCrateTrack,
  type FxMode,
  type FxTarget,
  type SamplerDropId,
} from '../../audio/virtualDjEngine';
import { generateReverbImpulseResponse } from '../../audio/effectRackNodes';
import { DualWaveformDisplay } from '../dj/DualWaveformDisplay';
import { CamelotWheelPanel } from '../dj/CamelotWheelPanel';
import { KaossFxSamplerPanel } from '../dj/KaossFxSamplerPanel';
import { DjCrateDrawer } from '../dj/DjCrateDrawer';
import {
  DjEffectsRackPanel,
  INITIAL_DJ_EFFECTS_RACK,
  type DjEffectsRackState,
} from '../dj/DjEffectsRackPanel';

interface VirtualDjTabProps {
  userRole?: string;
}

interface DeckState {
  id: DeckId;
  title: string;
  baseBpm: number;
  camelotKey: string;
  playing: boolean;
  pitchPct: number; // -16 to +16
  keyLock: boolean;
  trimGain: number; // 0.3 to 1.5
  lowEq: number; // -32 to +6
  midEq: number;
  highEq: number;
  filterSweep: number; // -1 (LPF) to +1 (HPF)
  cueMonitor: boolean; // PFL Headphone Cue toggle
  loopBeats: number | null;
  loopStartSec: number | null;
  slipMode: boolean;
  reverse: boolean;
  quantize: boolean;
  hotCues: (number | null)[];
  stems: {
    vocals: number;
    drums: number;
    bass: number;
    melody: number;
  };
  buffer: AudioBuffer | null;
  scratching: boolean;
}

interface DeckAudioNodes {
  source: AudioBufferSourceNode;
  channelGain: GainNode;
  trimNode: GainNode;
  lowFilter: BiquadFilterNode;
  midFilter: BiquadFilterNode;
  highFilter: BiquadFilterNode;
  colorFilter: BiquadFilterNode;
  stemBassGain: GainNode;
  stemMidGain: GainNode;
  stemHighGain: GainNode;
  delayNode: DelayNode;
  delayFeedback: GainNode;
  delayWetGain: GainNode;
  flangerDelay: DelayNode;
  flangerLfo: OscillatorNode;
  flangerLfoGain: GainNode;
  flangerWetGain: GainNode;
  cueSendGain: GainNode;
  analyser: AnalyserNode;
  isReversedBuffer: boolean;
  bufferDuration: number;
}

interface DeckClockState {
  offsetSec: number;
  anchorCtxTime: number;
  isPlaying: boolean;
  rate: number;
  reverse: boolean;
  loopStartSec: number | null;
  loopEndSec: number | null;
  slipAnchorCtxTime: number | null;
  slipAnchorOffsetSec: number;
}

const VINYL_IMG = STUDIO_IMAGES.djDeckVinyl;

const INITIAL_DECK_A: DeckState = {
  id: 'A',
  title: 'Afro-Tech Club Anthem',
  baseBpm: 122,
  camelotKey: '8A',
  playing: false,
  pitchPct: 0,
  keyLock: true,
  trimGain: 1.0,
  lowEq: 0,
  midEq: 0,
  highEq: 0,
  filterSweep: 0,
  cueMonitor: true,
  loopBeats: null,
  loopStartSec: null,
  slipMode: false,
  reverse: false,
  quantize: true,
  hotCues: [0, 1.97, 3.93, 7.87, null, null, null, null],
  stems: { vocals: 1, drums: 1, bass: 1, melody: 1 },
  buffer: null,
  scratching: false,
};

const INITIAL_DECK_B: DeckState = {
  id: 'B',
  title: 'Peak Hour Tech-House Roller',
  baseBpm: 126,
  camelotKey: '9A',
  playing: false,
  pitchPct: 0,
  keyLock: true,
  trimGain: 1.0,
  lowEq: 0,
  midEq: 0,
  highEq: 0,
  filterSweep: 0,
  cueMonitor: false,
  loopBeats: null,
  loopStartSec: null,
  slipMode: false,
  reverse: false,
  quantize: true,
  hotCues: [0, 1.9, 3.81, 7.62, null, null, null, null],
  stems: { vocals: 1, drums: 1, bass: 1, melody: 1 },
  buffer: null,
  scratching: false,
};

function computeAnalyserRms(analyser: AnalyserNode | null, scratchBuf: Float32Array<ArrayBuffer>): number {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(scratchBuf);
  let peak = 0;
  for (let i = 0; i < scratchBuf.length; i++) {
    const abs = Math.abs(scratchBuf[i]);
    if (abs > peak) peak = abs;
  }
  return Math.min(1, peak * 1.35);
}

export function VirtualDjTab({ userRole: _userRole }: VirtualDjTabProps) {
  const [deckA, setDeckA] = useState<DeckState>(INITIAL_DECK_A);
  const [deckB, setDeckB] = useState<DeckState>(INITIAL_DECK_B);
  const [crossfader, setCrossfader] = useState(0.5);
  const [crossfaderCurve, setCrossfaderCurve] = useState<CrossfaderCurve>('blend');
  const [masterVolume, setMasterVolume] = useState(0.85);
  const [headphoneVolume, setHeadphoneVolume] = useState(0.65);
  const [cueMix, setCueMix] = useState(0.35); // 0 = pure Cue PFL, 1 = Master
  const [samplerVolume, setSamplerVolume] = useState(0.8);

  // Kaoss XY Beat FX state
  const [fxMode, setFxMode] = useState<FxMode>('echo');
  const [fxTarget, setFxTarget] = useState<FxTarget>('MASTER');
  const [fxX, setFxX] = useState(0.5);
  const [fxY, setFxY] = useState(0.0);
  const [fxActive, setFxActive] = useState(false);

  // Real-Time Master Stream Audio Effects Rack state (Filter, Flanger, Reverb)
  const [effectsRack, setEffectsRack] = useState<DjEffectsRackState>(INITIAL_DJ_EFFECTS_RACK);

  // Automix state
  const [automixActive, setAutomixActive] = useState(false);
  const [automixBeats, setAutomixBeats] = useState<8 | 16>(16);
  const [automixBassSwap, setAutomixBassSwap] = useState(true);

  // Crate loading & mix recorder
  const [loadingCrateId, setLoadingCrateId] = useState<string | null>(null);
  const [recordingMix, setRecordingMix] = useState(false);
  const [recordedMixUrl, setRecordedMixUrl] = useState<string | null>(null);
  const [recordedMixFilename, setRecordedMixFilename] = useState('sounddeck-dj-live-mix.webm');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Live VU levels (0..1)
  const [vuLevels, setVuLevels] = useState<{ a: number; b: number; master: number }>({
    a: 0,
    b: 0,
    master: 0,
  });

  // Refs for Web Audio & clocks
  const deckNodesRef = useRef<{ A: DeckAudioNodes | null; B: DeckAudioNodes | null }>({
    A: null,
    B: null,
  });
  const deckClocksRef = useRef<{ A: DeckClockState; B: DeckClockState }>({
    A: {
      offsetSec: 0,
      anchorCtxTime: 0,
      isPlaying: false,
      rate: 1,
      reverse: false,
      loopStartSec: null,
      loopEndSec: null,
      slipAnchorCtxTime: null,
      slipAnchorOffsetSec: 0,
    },
    B: {
      offsetSec: 0,
      anchorCtxTime: 0,
      isPlaying: false,
      rate: 1,
      reverse: false,
      loopStartSec: null,
      loopEndSec: null,
      slipAnchorCtxTime: null,
      slipAnchorOffsetSec: 0,
    },
  });

  const deckStateRef = useRef<{ A: DeckState; B: DeckState }>({ A: deckA, B: deckB });
  deckStateRef.current = { A: deckA, B: deckB };

  const masterBusRef = useRef<GainNode | null>(null);
  const masterAnalyserRef = useRef<AnalyserNode | null>(null);
  const masterRackNodesRef = useRef<{
    filterNode: BiquadFilterNode;
    flangerDryGain: GainNode;
    flangerDelay: DelayNode;
    flangerFeedback: GainNode;
    flangerLfo: OscillatorNode;
    flangerLfoGain: GainNode;
    flangerWetGain: GainNode;
    reverbDryGain: GainNode;
    reverbConvolver: ConvolverNode;
    reverbDampFilter: BiquadFilterNode;
    reverbWetGain: GainNode;
    lastDecaySec: number;
    lastDampingHz: number;
  } | null>(null);
  const cueBusGainRef = useRef<GainNode | null>(null);
  const masterToCueGainRef = useRef<GainNode | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixRecorderRef = useRef<MediaRecorder | null>(null);
  const mixChunksRef = useRef<Blob[]>([]);
  const rollReturnTimerRef = useRef<{ active: boolean; prevPos: number; prevLoop: number | null; target: DeckId } | null>(null);

  const scratchRef = useRef<{
    activeDeck: DeckId | null;
    startX: number;
    startY: number;
  }>({ activeDeck: null, startX: 0, startY: 0 });

  // Snapshot live playhead clock in seconds (always in forward-track timeline)
  const getDeckPositionSec = useCallback((id: DeckId): number => {
    const clock = deckClocksRef.current[id];
    const deck = deckStateRef.current[id];
    const dur = deck.buffer?.duration || 1;
    if (!clock.isPlaying) {
      return ((clock.offsetSec % dur) + dur) % dur;
    }
    const ctx = getAudioContext();
    const elapsed = Math.max(0, ctx.currentTime - clock.anchorCtxTime) * clock.rate;
    let pos = clock.reverse ? clock.offsetSec - elapsed : clock.offsetSec + elapsed;

    if (
      !clock.reverse &&
      clock.loopStartSec !== null &&
      clock.loopEndSec !== null &&
      clock.loopEndSec > clock.loopStartSec
    ) {
      const loopLen = clock.loopEndSec - clock.loopStartSec;
      if (pos >= clock.loopStartSec) {
        pos = clock.loopStartSec + ((pos - clock.loopStartSec) % loopLen);
      }
    }
    return ((pos % dur) + dur) % dur;
  }, []);

  const getSlipPositionSec = useCallback((id: DeckId): number | null => {
    const clock = deckClocksRef.current[id];
    const deck = deckStateRef.current[id];
    if (!deck.slipMode || clock.slipAnchorCtxTime === null || !deck.buffer) return null;
    const ctx = getAudioContext();
    const elapsed = Math.max(0, ctx.currentTime - clock.slipAnchorCtxTime) * clock.rate;
    const dur = deck.buffer.duration || 1;
    return ((clock.slipAnchorOffsetSec + elapsed) % dur + dur) % dur;
  }, []);

  const ensureMasterBus = useCallback(() => {
    const ctx = getAudioContext();
    if (!masterBusRef.current) {
      const bus = ctx.createGain();
      bus.gain.value = masterVolume;

      // 1. Real-Time Audio Effects Rack: Filter -> Flanger -> Convolution Reverb
      const filterNode = ctx.createBiquadFilter();
      filterNode.type = 'allpass';
      filterNode.frequency.value = 1400;
      filterNode.Q.value = 3.2;

      const flangerStageIn = filterNode;
      const reverbStageIn = ctx.createGain();
      const postRackOutput = ctx.createGain();

      // Flanger parallel dry/wet + feedback comb LFO
      const flangerDryGain = ctx.createGain();
      flangerDryGain.gain.value = 1;
      const flangerDelay = ctx.createDelay(0.05);
      flangerDelay.delayTime.value = 0.0055;
      const flangerFeedback = ctx.createGain();
      flangerFeedback.gain.value = 0;
      const flangerLfo = ctx.createOscillator();
      flangerLfo.type = 'sine';
      flangerLfo.frequency.value = 0.65;
      const flangerLfoGain = ctx.createGain();
      flangerLfoGain.gain.value = 0.0032;
      flangerLfo.connect(flangerLfoGain).connect(flangerDelay.delayTime);
      flangerLfo.start();
      const flangerWetGain = ctx.createGain();
      flangerWetGain.gain.value = 0;

      flangerDelay.connect(flangerFeedback);
      flangerFeedback.connect(flangerDelay);

      bus.connect(filterNode);
      flangerStageIn.connect(flangerDryGain).connect(reverbStageIn);
      flangerStageIn.connect(flangerDelay).connect(flangerWetGain).connect(reverbStageIn);

      // Convolution Reverb stage
      const reverbDryGain = ctx.createGain();
      reverbDryGain.gain.value = 1;
      const reverbConvolver = ctx.createConvolver();
      reverbConvolver.buffer = generateReverbImpulseResponse(ctx, 2.2, 5400);
      const reverbDampFilter = ctx.createBiquadFilter();
      reverbDampFilter.type = 'lowpass';
      reverbDampFilter.frequency.value = 5400;
      const reverbWetGain = ctx.createGain();
      reverbWetGain.gain.value = 0;

      reverbStageIn.connect(reverbDryGain).connect(postRackOutput);
      reverbStageIn.connect(reverbConvolver).connect(reverbDampFilter).connect(reverbWetGain).connect(postRackOutput);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      const dest = ctx.createMediaStreamDestination();
      postRackOutput.connect(analyser);
      analyser.connect(ctx.destination);
      postRackOutput.connect(dest);

      // Headphone Cue PFL Monitor Bus + Cue/Master blend
      const cueBus = ctx.createGain();
      cueBus.gain.value = headphoneVolume * (1 - cueMix * 0.7);
      cueBus.connect(ctx.destination);

      const masterToCue = ctx.createGain();
      masterToCue.gain.value = headphoneVolume * cueMix * 0.4;
      postRackOutput.connect(masterToCue).connect(ctx.destination);

      masterBusRef.current = bus;
      masterAnalyserRef.current = analyser;
      masterRackNodesRef.current = {
        filterNode,
        flangerDryGain,
        flangerDelay,
        flangerFeedback,
        flangerLfo,
        flangerLfoGain,
        flangerWetGain,
        reverbDryGain,
        reverbConvolver,
        reverbDampFilter,
        reverbWetGain,
        lastDecaySec: 2.2,
        lastDampingHz: 5400,
      };
      mixDestRef.current = dest;
      cueBusGainRef.current = cueBus;
      masterToCueGainRef.current = masterToCue;
    } else {
      const now = ctx.currentTime;
      masterBusRef.current.gain.setTargetAtTime(masterVolume, now, 0.02);
      cueBusGainRef.current?.gain.setTargetAtTime(headphoneVolume * (1 - cueMix * 0.7), now, 0.02);
      masterToCueGainRef.current?.gain.setTargetAtTime(headphoneVolume * cueMix * 0.4, now, 0.02);
    }
    return {
      ctx,
      bus: masterBusRef.current!,
      cueBus: cueBusGainRef.current!,
      dest: mixDestRef.current!,
    };
  }, [masterVolume, headphoneVolume, cueMix]);

  const stopDeck = useCallback(
    (id: DeckId, preservePosition = true) => {
      const currentPos = preservePosition ? getDeckPositionSec(id) : 0;
      const existing = deckNodesRef.current[id];
      if (existing) {
        try {
          existing.source.stop();
          existing.flangerLfo.stop();
        } catch {
          // ignored
        }
        deckNodesRef.current[id] = null;
      }
      const clock = deckClocksRef.current[id];
      clock.offsetSec = currentPos;
      clock.isPlaying = false;
      clock.slipAnchorCtxTime = null;

      const setter = id === 'A' ? setDeckA : setDeckB;
      setter((d) => ({ ...d, playing: false, scratching: false }));
    },
    [getDeckPositionSec]
  );

  const startDeck = useCallback(
    (deck: DeckState, overrideOffsetSec?: number, overrideReverse?: boolean) => {
      if (!deck.buffer) return;
      const existingPos = getDeckPositionSec(deck.id);
      const startFrom =
        overrideOffsetSec !== undefined ? overrideOffsetSec : existingPos;
      const useReverse =
        overrideReverse !== undefined ? overrideReverse : deck.reverse;

      const existing = deckNodesRef.current[deck.id];
      if (existing) {
        try {
          existing.source.stop();
          existing.flangerLfo.stop();
        } catch {
          // ignored
        }
        deckNodesRef.current[deck.id] = null;
      }

      const { ctx, bus, cueBus } = ensureMasterBus();
      const bufferToPlay = useReverse
        ? getReversedAudioBuffer(ctx, deck.buffer)
        : deck.buffer;

      const src = ctx.createBufferSource();
      src.buffer = bufferToPlay;
      src.loop = true;

      const rate = Math.max(0.25, 1 + deck.pitchPct / 100);
      src.playbackRate.value = rate;

      const dur = deck.buffer.duration;
      const clampedStart = ((startFrom % dur) + dur) % dur;

      let loopStartBound: number | null = null;
      let loopEndBound: number | null = null;
      if (!useReverse && deck.loopBeats && deck.loopBeats > 0) {
        const beatDur = 60 / Math.max(40, deck.baseBpm);
        const loopDur = Math.max(0.08, beatDur * deck.loopBeats);
        const lStart = deck.loopStartSec !== null ? deck.loopStartSec : clampedStart;
        const lEnd = Math.min(dur, lStart + loopDur);
        if (lEnd > lStart + 0.04) {
          src.loopStart = lStart;
          src.loopEnd = lEnd;
          loopStartBound = lStart;
          loopEndBound = lEnd;
        }
      }

      const trimNode = ctx.createGain();
      trimNode.gain.value = deck.trimGain;

      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = 'lowshelf';
      lowFilter.frequency.value = 220;
      lowFilter.gain.value = deck.lowEq;

      const midFilter = ctx.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.frequency.value = 1150;
      midFilter.Q.value = 1.1;
      midFilter.gain.value = deck.midEq;

      const highFilter = ctx.createBiquadFilter();
      highFilter.type = 'highshelf';
      highFilter.frequency.value = 3800;
      highFilter.gain.value = deck.highEq;

      const colorFilter = ctx.createBiquadFilter();
      colorFilter.type = 'allpass';

      // 4-Stem Crossover Isolation Filters
      const stemLP = ctx.createBiquadFilter();
      stemLP.type = 'lowpass';
      stemLP.frequency.value = 230;
      const stemBassGain = ctx.createGain();
      stemBassGain.gain.value = deck.stems.bass * 0.95 + deck.stems.drums * 0.35;

      const stemBP = ctx.createBiquadFilter();
      stemBP.type = 'bandpass';
      stemBP.frequency.value = 1250;
      stemBP.Q.value = 0.75;
      const stemMidGain = ctx.createGain();
      stemMidGain.gain.value = deck.stems.vocals * 0.75 + deck.stems.melody * 0.75;

      const stemHP = ctx.createBiquadFilter();
      stemHP.type = 'highpass';
      stemHP.frequency.value = 3400;
      const stemHighGain = ctx.createGain();
      stemHighGain.gain.value = deck.stems.drums * 0.75 + deck.stems.vocals * 0.45;

      const channelGain = ctx.createGain();
      const { gainA, gainB } = getCrossfaderGains(crossfader, crossfaderCurve);
      channelGain.gain.value = deck.id === 'A' ? gainA : gainB;

      // Per-deck Tempo Echo w/ Feedback & Damping
      const delayNode = ctx.createDelay(2.0);
      delayNode.delayTime.value = (60 / Math.max(40, deck.baseBpm)) * 0.5;
      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.38;
      const delayWetGain = ctx.createGain();
      delayWetGain.gain.value = 0;

      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);

      // LFO Modulated Flanger
      const flangerDelay = ctx.createDelay(0.05);
      flangerDelay.delayTime.value = 0.005;
      const flangerLfo = ctx.createOscillator();
      flangerLfo.type = 'sine';
      flangerLfo.frequency.value = 0.45;
      const flangerLfoGain = ctx.createGain();
      flangerLfoGain.gain.value = 0.003;
      flangerLfo.connect(flangerLfoGain).connect(flangerDelay.delayTime);
      flangerLfo.start();
      const flangerWetGain = ctx.createGain();
      flangerWetGain.gain.value = 0;

      // Headphone Cue PFL Send (Pre-Crossfader)
      const cueSendGain = ctx.createGain();
      cueSendGain.gain.value = deck.cueMonitor ? 0.65 : 0;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      src.connect(trimNode);
      trimNode.connect(lowFilter);
      lowFilter.connect(midFilter);
      midFilter.connect(highFilter);
      highFilter.connect(colorFilter);

      colorFilter.connect(stemLP).connect(stemBassGain).connect(analyser);
      colorFilter.connect(stemBP).connect(stemMidGain).connect(analyser);
      colorFilter.connect(stemHP).connect(stemHighGain).connect(analyser);

      // Cue tap pre-crossfader
      analyser.connect(cueSendGain).connect(cueBus);

      // Main Channel Crossfader Output + Beat FX Sends
      analyser.connect(channelGain);
      channelGain.connect(bus);
      channelGain.connect(delayNode).connect(delayWetGain).connect(bus);
      channelGain.connect(flangerDelay).connect(flangerWetGain).connect(bus);

      // Offset mapping for reversed buffer playback
      const sourceOffset = useReverse
        ? Math.max(0, Math.min(dur - 0.01, dur - clampedStart))
        : clampedStart;

      src.start(ctx.currentTime, sourceOffset);

      const clock = deckClocksRef.current[deck.id];
      clock.offsetSec = clampedStart;
      clock.anchorCtxTime = ctx.currentTime;
      clock.isPlaying = true;
      clock.rate = rate;
      clock.reverse = useReverse;
      clock.loopStartSec = loopStartBound;
      clock.loopEndSec = loopEndBound;
      if (deck.slipMode && clock.slipAnchorCtxTime === null) {
        clock.slipAnchorCtxTime = ctx.currentTime;
        clock.slipAnchorOffsetSec = clampedStart;
      }

      deckNodesRef.current[deck.id] = {
        source: src,
        channelGain,
        trimNode,
        lowFilter,
        midFilter,
        highFilter,
        colorFilter,
        stemBassGain,
        stemMidGain,
        stemHighGain,
        delayNode,
        delayFeedback,
        delayWetGain,
        flangerDelay,
        flangerLfo,
        flangerLfoGain,
        flangerWetGain,
        cueSendGain,
        analyser,
        isReversedBuffer: useReverse,
        bufferDuration: dur,
      };

      const setter = deck.id === 'A' ? setDeckA : setDeckB;
      setter((d) => ({ ...d, playing: true }));
    },
    [crossfader, crossfaderCurve, ensureMasterBus, getDeckPositionSec]
  );

  // Seek / Beat-jump helper
  const seekDeckTo = useCallback(
    (id: DeckId, targetSec: number) => {
      const deck = deckStateRef.current[id];
      if (!deck.buffer) return;
      const dur = deck.buffer.duration;
      const clamped = ((targetSec % dur) + dur) % dur;
      if (deck.playing) {
        startDeck(deck, clamped);
      } else {
        deckClocksRef.current[id].offsetSec = clamped;
      }
    },
    [startDeck]
  );

  // Initial preload of Deck 1 & Deck 2 club grooves
  useEffect(() => {
    let mounted = true;
    Promise.all([
      renderCrateTrackBuffer(CLUB_CRATE_TRACKS[0]),
      renderCrateTrackBuffer(CLUB_CRATE_TRACKS[1]),
    ]).then(([bufA, bufB]) => {
      if (!mounted) return;
      setDeckA((d) => (d.buffer ? d : { ...d, buffer: bufA }));
      setDeckB((d) => (d.buffer ? d : { ...d, buffer: bufB }));
    });
    return () => {
      mounted = false;
      stopDeck('A', false);
      stopDeck('B', false);
      if (masterRackNodesRef.current) {
        try {
          masterRackNodesRef.current.flangerLfo.stop();
        } catch {
          // ignored
        }
        masterRackNodesRef.current = null;
      }
      masterBusRef.current = null;
    };
  }, [stopDeck]);

  // Apply live DSP updates whenever mixer/FX/EQ/crossfader state changes
  useEffect(() => {
    ensureMasterBus();
    const { gainA, gainB } = getCrossfaderGains(crossfader, crossfaderCurve);
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const applyDeckDsp = (deck: DeckState, xfGain: number) => {
      const nodes = deckNodesRef.current[deck.id];
      if (!nodes) return;

      const rate = deck.scratching ? 0 : Math.max(0.25, 1 + deck.pitchPct / 100);
      nodes.source.playbackRate.setTargetAtTime(rate, now, 0.015);
      deckClocksRef.current[deck.id].rate = rate;

      nodes.channelGain.gain.setTargetAtTime(xfGain, now, 0.015);
      nodes.trimNode.gain.setTargetAtTime(deck.trimGain, now, 0.015);
      nodes.lowFilter.gain.setTargetAtTime(deck.lowEq, now, 0.015);
      nodes.midFilter.gain.setTargetAtTime(deck.midEq, now, 0.015);
      nodes.highFilter.gain.setTargetAtTime(deck.highEq, now, 0.015);
      nodes.cueSendGain.gain.setTargetAtTime(deck.cueMonitor ? 0.65 : 0, now, 0.02);

      // Stems Crossover
      nodes.stemBassGain.gain.setTargetAtTime(
        deck.stems.bass * 0.95 + deck.stems.drums * 0.35,
        now,
        0.02
      );
      nodes.stemMidGain.gain.setTargetAtTime(
        deck.stems.vocals * 0.75 + deck.stems.melody * 0.75,
        now,
        0.02
      );
      nodes.stemHighGain.gain.setTargetAtTime(
        deck.stems.drums * 0.75 + deck.stems.vocals * 0.45,
        now,
        0.02
      );

      // Kaoss XY Beat-FX targeting check
      const targetsDeck = fxActive && (fxTarget === 'MASTER' || fxTarget === deck.id);
      const beatSec = 60 / Math.max(40, deck.baseBpm * rate);
      const subdivisions = [0.125, 0.25, 0.5, 1.0];
      const divFactor = subdivisions[Math.min(3, Math.floor(fxX * 4))];

      if (targetsDeck && fxMode === 'echo') {
        nodes.delayNode.delayTime.setTargetAtTime(beatSec * divFactor, now, 0.02);
        nodes.delayFeedback.gain.setTargetAtTime(0.25 + fxY * 0.52, now, 0.02);
        nodes.delayWetGain.gain.setTargetAtTime(fxY * 0.85, now, 0.02);
      } else {
        nodes.delayWetGain.gain.setTargetAtTime(0, now, 0.04);
      }

      if (targetsDeck && fxMode === 'flanger') {
        nodes.flangerLfo.frequency.setTargetAtTime(0.3 + fxX * 4.5, now, 0.02);
        nodes.flangerWetGain.gain.setTargetAtTime(fxY * 0.75, now, 0.02);
      } else {
        nodes.flangerWetGain.gain.setTargetAtTime(0, now, 0.04);
      }

      // Color Filter: either dedicated Sweep knob OR active Kaoss Filter XY pad
      if (targetsDeck && fxMode === 'filter') {
        const cutoff = Math.max(100, Math.min(16000, 120 * Math.pow(110, fxX)));
        nodes.colorFilter.type = fxX < 0.5 ? 'lowpass' : 'highpass';
        nodes.colorFilter.frequency.setTargetAtTime(cutoff, now, 0.02);
        nodes.colorFilter.Q.setTargetAtTime(1.5 + fxY * 10, now, 0.02);
      } else if (Math.abs(deck.filterSweep) < 0.04) {
        nodes.colorFilter.type = 'allpass';
      } else if (deck.filterSweep < 0) {
        nodes.colorFilter.type = 'lowpass';
        const freq = 140 + (1 + deck.filterSweep) * 14500;
        nodes.colorFilter.frequency.setTargetAtTime(Math.max(90, freq), now, 0.02);
        nodes.colorFilter.Q.setTargetAtTime(2.8, now, 0.02);
      } else {
        nodes.colorFilter.type = 'highpass';
        const freq = 50 + deck.filterSweep * 5200;
        nodes.colorFilter.frequency.setTargetAtTime(freq, now, 0.02);
        nodes.colorFilter.Q.setTargetAtTime(2.8, now, 0.02);
      }
    };

    applyDeckDsp(deckA, gainA);
    applyDeckDsp(deckB, gainB);

    // Sync Real-Time Master Audio Effects Rack (Filter / Flanger / Reverb)
    const rackNodes = masterRackNodesRef.current;
    if (rackNodes) {
      if (effectsRack.filter.enabled) {
        rackNodes.filterNode.type = effectsRack.filter.type;
        rackNodes.filterNode.frequency.setTargetAtTime(effectsRack.filter.frequencyHz, now, 0.02);
        rackNodes.filterNode.Q.setTargetAtTime(effectsRack.filter.q, now, 0.02);
      } else {
        rackNodes.filterNode.type = 'allpass';
      }

      if (effectsRack.flanger.enabled) {
        const mix = effectsRack.flanger.mix;
        rackNodes.flangerLfo.frequency.setTargetAtTime(effectsRack.flanger.rateHz, now, 0.02);
        rackNodes.flangerFeedback.gain.setTargetAtTime(effectsRack.flanger.feedback, now, 0.02);
        rackNodes.flangerDryGain.gain.setTargetAtTime(Math.max(0.5, 1 - mix * 0.35), now, 0.02);
        rackNodes.flangerWetGain.gain.setTargetAtTime(mix, now, 0.02);
      } else {
        rackNodes.flangerFeedback.gain.setTargetAtTime(0, now, 0.02);
        rackNodes.flangerDryGain.gain.setTargetAtTime(1, now, 0.02);
        rackNodes.flangerWetGain.gain.setTargetAtTime(0, now, 0.02);
      }

      if (effectsRack.reverb.enabled) {
        const mix = effectsRack.reverb.mix;
        rackNodes.reverbDampFilter.frequency.setTargetAtTime(effectsRack.reverb.dampingHz, now, 0.02);
        rackNodes.reverbDryGain.gain.setTargetAtTime(Math.max(0.45, 1 - mix * 0.4), now, 0.02);
        rackNodes.reverbWetGain.gain.setTargetAtTime(mix, now, 0.02);
        if (
          Math.abs(rackNodes.lastDecaySec - effectsRack.reverb.decaySec) > 0.08 ||
          Math.abs(rackNodes.lastDampingHz - effectsRack.reverb.dampingHz) > 250
        ) {
          rackNodes.reverbConvolver.buffer = generateReverbImpulseResponse(
            ctx,
            effectsRack.reverb.decaySec,
            effectsRack.reverb.dampingHz
          );
          rackNodes.lastDecaySec = effectsRack.reverb.decaySec;
          rackNodes.lastDampingHz = effectsRack.reverb.dampingHz;
        }
      } else {
        rackNodes.reverbDryGain.gain.setTargetAtTime(1, now, 0.02);
        rackNodes.reverbWetGain.gain.setTargetAtTime(0, now, 0.02);
      }
    }
  }, [
    deckA,
    deckB,
    crossfader,
    crossfaderCurve,
    masterVolume,
    headphoneVolume,
    cueMix,
    fxActive,
    fxMode,
    fxTarget,
    fxX,
    fxY,
    effectsRack,
    ensureMasterBus,
  ]);

  // Live 25fps AnalyserNode Stereo VU Meter loop
  useEffect(() => {
    let rafId = 0;
    let frameCount = 0;
    const scratchBuf = new Float32Array(new ArrayBuffer(256 * 4));

    const tick = () => {
      frameCount++;
      if (frameCount % 2 === 0) {
        const a = computeAnalyserRms(deckNodesRef.current.A?.analyser || null, scratchBuf);
        const b = computeAnalyserRms(deckNodesRef.current.B?.analyser || null, scratchBuf);
        const m = computeAnalyserRms(masterAnalyserRef.current, scratchBuf);
        setVuLevels((prev) =>
          Math.abs(prev.a - a) > 0.02 || Math.abs(prev.b - b) > 0.02 || Math.abs(prev.master - m) > 0.02
            ? { a, b, master: m }
            : prev
        );
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  // Kaoss Pad pointer update handler including live Beat Roll trigger
  const handleUpdateFxPad = (x: number, y: number, active: boolean) => {
    setFxX(x);
    setFxY(y);
    setFxActive(active);

    if (fxMode === 'roll') {
      const targetId: DeckId = fxTarget === 'B' ? 'B' : 'A';
      const targetDeck = deckStateRef.current[targetId];
      const setter = targetId === 'A' ? setDeckA : setDeckB;
      const beatSubdivisions = [0.125, 0.25, 0.5, 1.0];
      const divBeats = beatSubdivisions[Math.min(3, Math.floor(x * 4))];

      if (active && targetDeck.playing && targetDeck.buffer) {
        if (!rollReturnTimerRef.current?.active) {
          const curPos = getDeckPositionSec(targetId);
          rollReturnTimerRef.current = {
            active: true,
            prevPos: curPos,
            prevLoop: targetDeck.loopBeats,
            target: targetId,
          };
          const updated = {
            ...targetDeck,
            slipMode: true,
            loopBeats: divBeats,
            loopStartSec: curPos,
          };
          setter(updated);
          startDeck(updated, curPos);
        }
      } else if (!active && rollReturnTimerRef.current?.active) {
        const saved = rollReturnTimerRef.current;
        rollReturnTimerRef.current = null;
        const slipResume = getSlipPositionSec(saved.target) ?? saved.prevPos;
        const d = deckStateRef.current[saved.target];
        const restoreSetter = saved.target === 'A' ? setDeckA : setDeckB;
        const restored = { ...d, loopBeats: saved.prevLoop, loopStartSec: null };
        restoreSetter(restored);
        if (d.playing) startDeck(restored, slipResume);
      }
    }
  };

  // Vinyl Scratch Drag handlers
  const handleScratchStart = (deckId: DeckId, e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    scratchRef.current = { activeDeck: deckId, startX: clientX, startY: clientY };

    const deck = deckStateRef.current[deckId];
    const setter = deckId === 'A' ? setDeckA : setDeckB;
    if (!deck.playing && deck.buffer) {
      startDeck(deck);
    }
    setter((d) => ({ ...d, scratching: true }));
  };

  const handleScratchMove = useCallback((e: MouseEvent | TouchEvent) => {
    const { activeDeck, startX, startY } = scratchRef.current;
    if (!activeDeck) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const delta = (clientX - startX - (clientY - startY)) * 0.045;
    const clampedRate = Math.max(0.1, Math.min(3.8, 1 + delta));

    const nodes = deckNodesRef.current[activeDeck];
    if (nodes) {
      try {
        nodes.source.playbackRate.value = clampedRate;
      } catch {
        // ignored
      }
    }
  }, []);

  const handleScratchEnd = useCallback(() => {
    const { activeDeck } = scratchRef.current;
    if (!activeDeck) return;
    scratchRef.current.activeDeck = null;

    const deck = deckStateRef.current[activeDeck];
    const setter = activeDeck === 'A' ? setDeckA : setDeckB;
    setter((d) => ({ ...d, scratching: false }));

    const slipPos = getSlipPositionSec(activeDeck);
    if (deck.slipMode && slipPos !== null) {
      startDeck(deck, slipPos);
    } else {
      const nodes = deckNodesRef.current[activeDeck];
      if (nodes) {
        nodes.source.playbackRate.setTargetAtTime(
          Math.max(0.25, 1 + deck.pitchPct / 100),
          getAudioContext().currentTime,
          0.02
        );
      }
    }
  }, [getSlipPositionSec, startDeck]);

  useEffect(() => {
    window.addEventListener('mousemove', handleScratchMove);
    window.addEventListener('mouseup', handleScratchEnd);
    window.addEventListener('touchmove', handleScratchMove);
    window.addEventListener('touchend', handleScratchEnd);
    return () => {
      window.removeEventListener('mousemove', handleScratchMove);
      window.removeEventListener('mouseup', handleScratchEnd);
      window.removeEventListener('touchmove', handleScratchMove);
      window.removeEventListener('touchend', handleScratchEnd);
    };
  }, [handleScratchMove, handleScratchEnd]);

  // Vinyl Brake & Backspin FX
  const handleVinylBrake = (id: DeckId) => {
    const deck = deckStateRef.current[id];
    const nodes = deckNodesRef.current[id];
    if (!deck.playing || !nodes) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    nodes.source.playbackRate.cancelScheduledValues(now);
    nodes.source.playbackRate.setValueAtTime(nodes.source.playbackRate.value, now);
    nodes.source.playbackRate.exponentialRampToValueAtTime(0.02, now + 0.75);
    setStatusMsg(`Deck ${id === 'A' ? '1' : '2'} Vinyl Motor Brake engaged.`);
    window.setTimeout(() => {
      stopDeck(id, true);
    }, 760);
  };

  const handleBackspin = (id: DeckId) => {
    const deck = deckStateRef.current[id];
    if (!deck.buffer) return;
    const pos = getDeckPositionSec(id);
    startDeck(deck, pos, true);
    const nodes = deckNodesRef.current[id];
    if (nodes) {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      nodes.source.playbackRate.setValueAtTime(3.0, now);
      nodes.source.playbackRate.exponentialRampToValueAtTime(0.15, now + 0.55);
    }
    setStatusMsg(`Deck ${id === 'A' ? '1' : '2'} Turntable Backspin!`);
    window.setTimeout(() => {
      const slipResume = getSlipPositionSec(id);
      if (deck.slipMode && slipResume !== null) {
        startDeck(deckStateRef.current[id], slipResume, false);
      } else {
        stopDeck(id, true);
      }
    }, 560);
  };

  // Beat Sync & Strict Phase Lock
  const handleSyncDeck = (targetId: DeckId) => {
    const target = targetId === 'A' ? deckA : deckB;
    const source = targetId === 'A' ? deckB : deckA;
    const sourceLiveBpm = source.baseBpm * (1 + source.pitchPct / 100);
    const requiredPitchPct = ((sourceLiveBpm / target.baseBpm) - 1) * 100;
    const clamped = Math.max(-16, Math.min(16, Number(requiredPitchPct.toFixed(1))));
    const setter = targetId === 'A' ? setDeckA : setDeckB;
    setter((d) => ({ ...d, pitchPct: clamped }));
    setStatusMsg(
      `Deck ${targetId === 'A' ? '1' : '2'} synced to ${sourceLiveBpm.toFixed(1)} BPM (${source.camelotKey} / ${target.camelotKey}).`
    );
  };

  const handlePhaseAlign = (targetId: DeckId) => {
    const masterId: DeckId = targetId === 'A' ? 'B' : 'A';
    const masterDeck = deckStateRef.current[masterId];
    const targetDeck = deckStateRef.current[targetId];
    const masterLiveBpm = masterDeck.baseBpm * (1 + masterDeck.pitchPct / 100);
    const beatDur = 60 / Math.max(40, masterLiveBpm);
    const masterPos = getDeckPositionSec(masterId);
    const masterPhase = masterPos % beatDur;

    const targetPos = getDeckPositionSec(targetId);
    const targetNearestBeat = Math.floor(targetPos / beatDur) * beatDur;
    const alignedPos = targetNearestBeat + masterPhase;

    const requiredPitchPct = ((masterLiveBpm / targetDeck.baseBpm) - 1) * 100;
    const clampedPitch = Math.max(-16, Math.min(16, Number(requiredPitchPct.toFixed(1))));
    const setter = targetId === 'A' ? setDeckA : setDeckB;
    setter((d) => ({ ...d, pitchPct: clampedPitch }));
    seekDeckTo(targetId, alignedPos);
    setStatusMsg(`Deck ${targetId === 'A' ? '1' : '2'} phase-locked cleanly to Beatgrid.`);
  };

  // AI Smart Phrase Automix (Crossfade + Bass EQ Swap across 8 or 16 beats)
  const handleTriggerAutomix = (direction: 'AtoB' | 'BtoA') => {
    if (automixActive) return;
    const incomingId: DeckId = direction === 'AtoB' ? 'B' : 'A';
    const outgoingId: DeckId = direction === 'AtoB' ? 'A' : 'B';
    const incomingDeck = deckStateRef.current[incomingId];
    const outgoingDeck = deckStateRef.current[outgoingId];
    if (!incomingDeck.buffer) return;

    setAutomixActive(true);
    const outLiveBpm = outgoingDeck.baseBpm * (1 + outgoingDeck.pitchPct / 100);
    const durationMs = Math.max(2000, Math.min(14000, (60 / outLiveBpm) * automixBeats * 1000));

    // Sync incoming BPM & start if paused
    const requiredPitch = Math.max(-16, Math.min(16, Number((((outLiveBpm / incomingDeck.baseBpm) - 1) * 100).toFixed(1))));
    const setIncoming = incomingId === 'A' ? setDeckA : setDeckB;
    const setOutgoing = outgoingId === 'A' ? setDeckA : setDeckB;

    const preparedIncoming: DeckState = {
      ...incomingDeck,
      pitchPct: requiredPitch,
      lowEq: automixBassSwap ? -18 : incomingDeck.lowEq,
    };
    setIncoming(preparedIncoming);
    if (!incomingDeck.playing) {
      startDeck(preparedIncoming, 0);
    }

    const startTime = performance.now();
    const startXf = direction === 'AtoB' ? 0 : 1;
    const endXf = direction === 'AtoB' ? 1 : 0;

    setStatusMsg(`Auto-Mixing Deck ${outgoingId === 'A' ? '1' : '2'} → Deck ${incomingId === 'A' ? '1' : '2'} (${automixBeats} beats)...`);

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = t * t * (3 - 2 * t);
      setCrossfader(startXf + (endXf - startXf) * eased);

      if (automixBassSwap) {
        // Bass swap happens cleanly around midpoint (0.35 -> 0.65)
        const bassRatio = Math.max(0, Math.min(1, (t - 0.35) / 0.3));
        setIncoming((d) => ({ ...d, lowEq: Math.round(-18 + bassRatio * 18) }));
        setOutgoing((d) => ({ ...d, lowEq: Math.round(-bassRatio * 18) }));
      }

      if (t < 1) {
        window.requestAnimationFrame(step);
      } else {
        setAutomixActive(false);
        setOutgoing((d) => ({ ...d, lowEq: 0 }));
        setStatusMsg(`Phrase Automix completed onto Deck ${incomingId === 'A' ? '1' : '2'}.`);
      }
    };
    window.requestAnimationFrame(step);
  };

  // Load Crate Track (Club, African, or Offline IndexedDB full song!)
  const handleLoadCrateTrack = async (deckId: DeckId, track: DjCrateTrack) => {
    setLoadingCrateId(track.id);
    try {
      const ctx = getAudioContext();
      let decoded: AudioBuffer | null = null;
      let detectedBpm = track.bpm;

      if (track.origin === 'offline' && track.offlineId) {
        const blob = await getOfflineAudioBlob(track.offlineId);
        if (blob) {
          decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
          detectedBpm = estimateAudioBpm(decoded, track.bpm);
        } else if (track.fallbackUrl) {
          const res = await fetch(track.fallbackUrl);
          if (res.ok) {
            decoded = await ctx.decodeAudioData(await res.arrayBuffer());
            detectedBpm = estimateAudioBpm(decoded, track.bpm);
          }
        }
      } else {
        decoded = await renderCrateTrackBuffer(track);
      }

      if (!decoded) {
        setStatusMsg(`Could not load audio stream for "${track.title}".`);
        return;
      }

      stopDeck(deckId, false);
      const setter = deckId === 'A' ? setDeckA : setDeckB;
      const beatSec = 60 / detectedBpm;
      setter((d) => ({
        ...d,
        title: track.title,
        baseBpm: detectedBpm,
        camelotKey: track.camelotKey,
        buffer: decoded,
        loopBeats: null,
        loopStartSec: null,
        hotCues: [0, Number((beatSec * 4).toFixed(2)), Number((beatSec * 8).toFixed(2)), Number((beatSec * 16).toFixed(2)), null, null, null, null],
      }));
      setStatusMsg(`Loaded "${track.title}" (${detectedBpm} BPM · ${track.camelotKey}) onto Deck ${deckId === 'A' ? '1' : '2'}.`);
    } catch {
      setStatusMsg(`Failed to decode "${track.title}" onto Deck ${deckId === 'A' ? '1' : '2'}.`);
    } finally {
      setLoadingCrateId(null);
    }
  };

  const handleLoadDeckFile = async (id: DeckId, file: File) => {
    try {
      const ab = await file.arrayBuffer();
      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(ab);
      const detectedBpm = estimateAudioBpm(decoded, 120);
      stopDeck(id, false);
      const setter = id === 'A' ? setDeckA : setDeckB;
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      const beatSec = 60 / detectedBpm;
      setter((d) => ({
        ...d,
        buffer: decoded,
        title: cleanName,
        baseBpm: detectedBpm,
        loopBeats: null,
        loopStartSec: null,
        hotCues: [0, Number((beatSec * 4).toFixed(2)), Number((beatSec * 8).toFixed(2)), Number((beatSec * 16).toFixed(2)), null, null, null, null],
      }));
      setStatusMsg(`Analyzed & loaded "${cleanName}" (${detectedBpm} BPM) on Deck ${id === 'A' ? '1' : '2'}.`);
    } catch {
      setStatusMsg('Could not decode audio file for deck.');
    }
  };

  // Trigger SP-8 Sampler Pad
  const handleTriggerDrop = (id: SamplerDropId) => {
    const { ctx, bus } = ensureMasterBus();
    triggerSamplerDrop(ctx, bus, id, samplerVolume);
  };

  // Mix Recording -> WebM & automatic WAV export option
  const handleToggleRecordMix = () => {
    if (recordingMix) {
      mixRecorderRef.current?.stop();
      setRecordingMix(false);
      return;
    }
    const { dest } = ensureMasterBus();
    const rec = new MediaRecorder(dest.stream);
    mixChunksRef.current = [];
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) mixChunksRef.current.push(ev.data);
    };
    rec.onstop = async () => {
      const webmBlob = new Blob(mixChunksRef.current, { type: 'audio/webm' });
      let downloadBlob: Blob = webmBlob;
      let filename = 'sounddeck-dj-live-mix.webm';
      try {
        // Also attempt decoding to clean universal WAV for seamless PC/Media Player playback
        const decoded = await getAudioContext().decodeAudioData(await webmBlob.arrayBuffer());
        downloadBlob = audioBufferToWavBlob(decoded);
        filename = 'sounddeck-dj-live-mix.wav';
      } catch {
        // Keep WebM if container decode unavailable
      }
      const url = URL.createObjectURL(downloadBlob);
      setRecordedMixUrl(url);
      setRecordedMixFilename(filename);
      triggerBlobDownload(downloadBlob, filename);
      setStatusMsg(`Live DJ mix recorded and exported (${filename}).`);
    };
    mixRecorderRef.current = rec;
    rec.start();
    setRecordingMix(true);
  };

  const renderVuColumn = (level: number, colorClass: string, label: string) => {
    const segments = 12;
    const activeCount = Math.round(level * segments);
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="w-3 bg-[#07090d] border border-[#1d2432] rounded p-0.5 flex flex-col-reverse gap-0.5 h-28">
          {Array.from({ length: segments }).map((_, i) => {
            const lit = i < activeCount;
            const segColor =
              i >= 10
                ? 'bg-red-500'
                : i >= 8
                ? 'bg-amber-400'
                : colorClass;
            return (
              <div
                key={i}
                className={`w-full flex-1 rounded-[1px] transition-colors duration-75 ${
                  lit ? segColor : 'bg-[#151b26]'
                }`}
              />
            );
          })}
        </div>
        <span className="text-[9px] font-mono text-slate-400">{label}</span>
      </div>
    );
  };

  const renderDeckHardware = (
    deck: DeckState,
    setDeck: React.Dispatch<React.SetStateAction<DeckState>>
  ) => {
    const isDeckA = deck.id === 'A';
    const liveBpm = (deck.baseBpm * (1 + deck.pitchPct / 100)).toFixed(1);
    const accentText = isDeckA ? 'text-amber-400' : 'text-cyan-400';
    const accentBgBtn = isDeckA
      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950';

    return (
      <div className="rounded-2xl bg-[#0f131a] border border-[#222834] p-4 space-y-4">
        {/* Deck Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span
                className={`px-1.5 py-0.5 rounded font-bold ${
                  isDeckA
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                }`}
              >
                DECK {isDeckA ? '1' : '2'}
              </span>
              <span className={`${accentText} tabular-nums font-semibold`}>
                {liveBpm} BPM · KEY {deck.camelotKey}
              </span>
            </div>
            <h3 className="font-display text-sm font-semibold text-slate-100 truncate mt-1">
              {deck.title}
            </h3>
          </div>

          <label className="px-2.5 py-1.5 rounded-lg bg-[#141820] hover:bg-[#1e2432] text-slate-200 text-xs border border-[#293040] flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors whitespace-nowrap">
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>Load File</span>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLoadDeckFile(deck.id, file);
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>
        </div>

        {/* Platter + Transport & Pitch Matrix */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div
              onMouseDown={(e) => handleScratchStart(deck.id, e)}
              onTouchStart={(e) => handleScratchStart(deck.id, e)}
              title="Drag turntable platter to scratch or backcue"
              className={`relative w-32 h-32 rounded-full overflow-hidden border-4 bg-[#080a0f] cursor-grab active:cursor-grabbing group select-none ${
                deck.playing
                  ? isDeckA
                    ? 'border-amber-500/60'
                    : 'border-cyan-500/60'
                  : 'border-[#1d2432]'
              }`}
            >
              <img
                src={VINYL_IMG}
                alt={`Deck ${isDeckA ? '1' : '2'} platter`}
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover pointer-events-none ${
                  deck.playing
                    ? deck.scratching
                      ? 'scale-105'
                      : 'animate-vinyl'
                    : 'animate-vinyl-paused'
                }`}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 rounded-full bg-[#0a0d14] border-2 border-amber-500/70 flex items-center justify-center">
                  <Disc3 className={`w-5 h-5 ${accentText}`} />
                </div>
              </div>
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                <span className="text-[10px] font-mono font-bold text-slate-100">SCRATCH</span>
              </div>
            </div>

            {/* Motor FX: Brake / Backspin / Censor */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleVinylBrake(deck.id)}
                className="px-2 py-1 rounded bg-[#141820] hover:bg-[#1e2432] text-slate-300 border border-[#273042] text-[10px] font-mono"
                title="Exponential Vinyl Motor Brake Stop"
              >
                BRAKE
              </button>
              <button
                type="button"
                onClick={() => handleBackspin(deck.id)}
                className="px-2 py-1 rounded bg-[#141820] hover:bg-[#1e2432] text-slate-300 border border-[#273042] text-[10px] font-mono"
                title="Turntable Backspin"
              >
                SPIN
              </button>
              <button
                type="button"
                onPointerDown={() => {
                  if (!deck.playing || !deck.buffer) return;
                  const pos = getDeckPositionSec(deck.id);
                  setDeck((d) => ({ ...d, slipMode: true }));
                  startDeck({ ...deck, slipMode: true }, pos, true);
                }}
                onPointerUp={() => {
                  if (!deck.playing) return;
                  const slipResume = getSlipPositionSec(deck.id) ?? getDeckPositionSec(deck.id);
                  startDeck(deck, slipResume, false);
                }}
                className="px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[10px] font-mono"
                title="Hold for Slip Censor Reverse (snaps back on release)"
              >
                CNSR
              </button>
            </div>
          </div>

          <div className="flex-1 w-full space-y-2.5">
            {/* Transport & Modes Row */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => (deck.playing ? stopDeck(deck.id, true) : startDeck(deck))}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  deck.playing
                    ? 'bg-red-500/20 text-red-200 border border-red-500/50 hover:bg-red-500/30'
                    : accentBgBtn
                }`}
              >
                {deck.playing ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{deck.playing ? 'PAUSE' : 'PLAY'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSyncDeck(deck.id)}
                className="px-2.5 py-2 rounded-lg bg-[#141820] hover:bg-[#1e2432] text-amber-300 text-xs font-semibold border border-[#273042] flex items-center gap-1 whitespace-nowrap"
              >
                <RefreshCw className="w-3 h-3" />
                <span>SYNC</span>
              </button>

              <button
                type="button"
                onClick={() => setDeck((d) => ({ ...d, slipMode: !d.slipMode }))}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-mono font-semibold border transition-colors ${
                  deck.slipMode
                    ? 'bg-red-500/20 border-red-500 text-red-300'
                    : 'bg-[#141820] border-[#273042] text-slate-400 hover:text-slate-200'
                }`}
                title="Slip Mode keeps phantom playhead running under loops & scratches"
              >
                SLIP
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextRev = !deck.reverse;
                  const curPos = getDeckPositionSec(deck.id);
                  const updated = { ...deck, reverse: nextRev };
                  setDeck(updated);
                  if (deck.playing) startDeck(updated, curPos, nextRev);
                }}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-mono font-semibold border transition-colors ${
                  deck.reverse
                    ? 'bg-red-500/25 border-red-500 text-red-200'
                    : 'bg-[#141820] border-[#273042] text-slate-400 hover:text-slate-200'
                }`}
                title="True Sample-Reversed Buffer Playback"
              >
                REV
              </button>

              <button
                type="button"
                onClick={() => setDeck((d) => ({ ...d, quantize: !d.quantize }))}
                className={`px-2 py-2 rounded-lg text-[11px] font-mono font-semibold border transition-colors ${
                  deck.quantize
                    ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                    : 'bg-[#141820] border-[#273042] text-slate-400'
                }`}
                title="Beatgrid Quantize Lock"
              >
                Q
              </button>
            </div>

            {/* Auto Loop + Halve/Double */}
            <div className="flex items-center gap-1 bg-[#080a0f] p-1 rounded-lg border border-[#1d2432]">
              <span className="text-[10px] font-mono text-slate-400 px-1.5">LOOP</span>
              <button
                type="button"
                onClick={() => {
                  if (!deck.loopBeats) return;
                  const nextLoop = Math.max(0.25, deck.loopBeats / 2);
                  const lStart = deck.loopStartSec ?? getDeckPositionSec(deck.id);
                  const updated = { ...deck, loopBeats: nextLoop, loopStartSec: lStart };
                  setDeck(updated);
                  if (deck.playing) startDeck(updated, lStart);
                }}
                className="px-1.5 py-1 rounded bg-[#141820] text-slate-300 hover:text-white border border-[#252c3b] text-[10px] font-mono"
                title="Halve active loop"
              >
                /2
              </button>
              {[1, 2, 4, 8, 16].map((beats) => (
                <button
                  key={beats}
                  type="button"
                  onClick={() => {
                    const isTurningOff = deck.loopBeats === beats;
                    const curPos = getDeckPositionSec(deck.id);
                    const beatSec = 60 / Math.max(40, deck.baseBpm);
                    const snappedStart = deck.quantize
                      ? Math.round(curPos / beatSec) * beatSec
                      : curPos;
                    const nextLoop = isTurningOff ? null : beats;
                    const updated = {
                      ...deck,
                      loopBeats: nextLoop,
                      loopStartSec: isTurningOff ? null : snappedStart,
                    };
                    setDeck(updated);
                    if (deck.playing) {
                      const slipPos = isTurningOff ? getSlipPositionSec(deck.id) : null;
                      startDeck(updated, slipPos ?? snappedStart);
                    }
                  }}
                  className={`flex-1 py-1 rounded text-[10px] font-mono border transition-colors ${
                    deck.loopBeats === beats
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                      : 'bg-[#141820] text-slate-300 border-[#252c3b] hover:bg-[#1e2432]'
                  }`}
                >
                  {beats}B
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (!deck.loopBeats) return;
                  const nextLoop = Math.min(32, deck.loopBeats * 2);
                  const lStart = deck.loopStartSec ?? getDeckPositionSec(deck.id);
                  const updated = { ...deck, loopBeats: nextLoop, loopStartSec: lStart };
                  setDeck(updated);
                  if (deck.playing) startDeck(updated, lStart);
                }}
                className="px-1.5 py-1 rounded bg-[#141820] text-slate-300 hover:text-white border border-[#252c3b] text-[10px] font-mono"
                title="Double active loop"
              >
                x2
              </button>
            </div>

            {/* Beat Jump Row */}
            <div className="flex items-center gap-1 bg-[#080a0f] p-1 rounded-lg border border-[#1d2432]">
              <span className="text-[10px] font-mono text-slate-400 px-1.5">JUMP</span>
              {[-4, -1, 1, 4].map((jumpBeats) => {
                const beatSec = 60 / Math.max(40, deck.baseBpm);
                return (
                  <button
                    key={jumpBeats}
                    type="button"
                    onClick={() => {
                      const nextPos = getDeckPositionSec(deck.id) + jumpBeats * beatSec;
                      seekDeckTo(deck.id, nextPos);
                    }}
                    className="flex-1 py-1 rounded bg-[#141820] hover:bg-[#1e2432] text-slate-300 border border-[#252c3b] text-[10px] font-mono flex items-center justify-center gap-0.5"
                  >
                    {jumpBeats < 0 && <Rewind className="w-2.5 h-2.5" />}
                    <span>{jumpBeats > 0 ? `+${jumpBeats}B` : `${jumpBeats}B`}</span>
                    {jumpBeats > 0 && <FastForward className="w-2.5 h-2.5" />}
                  </button>
                );
              })}
            </div>

            {/* Tempo Fader + Reset */}
            <div className="flex items-center gap-2 bg-[#080a0f] px-2.5 py-1.5 rounded-lg border border-[#1d2432] text-xs">
              <button
                type="button"
                onClick={() => setDeck((d) => ({ ...d, pitchPct: 0 }))}
                className="text-[10px] font-mono text-slate-400 hover:text-amber-300"
                title="Reset tempo to 0%"
              >
                TEMPO
              </button>
              <input
                type="range"
                min={-16}
                max={16}
                step={0.1}
                value={deck.pitchPct}
                onChange={(e) => setDeck((d) => ({ ...d, pitchPct: Number(e.target.value) }))}
                aria-label={`Deck ${isDeckA ? '1' : '2'} tempo fader`}
                className="studio-slider flex-1"
              />
              <span className={`font-mono text-[11px] tabular-nums w-12 text-right ${accentText}`}>
                {deck.pitchPct > 0 ? `+${deck.pitchPct.toFixed(1)}` : deck.pitchPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* 4-Stem Isolation Matrix + Quick Vocal/Instr Presets */}
        <div className="p-3 rounded-xl bg-[#080a0f] border border-[#1b2230] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span>Real-Time 4-Stem Separation</span>
            </span>
            <div className="flex items-center gap-1.5 text-[10px] font-mono">
              <button
                type="button"
                onClick={() =>
                  setDeck((d) => ({ ...d, stems: { vocals: 1, drums: 0, bass: 0, melody: 0 } }))
                }
                className="px-2 py-0.5 rounded bg-[#141820] hover:bg-[#1e2432] text-cyan-300 border border-[#273042]"
              >
                Acapella
              </button>
              <button
                type="button"
                onClick={() =>
                  setDeck((d) => ({ ...d, stems: { vocals: 0, drums: 1, bass: 1, melody: 1 } }))
                }
                className="px-2 py-0.5 rounded bg-[#141820] hover:bg-[#1e2432] text-amber-300 border border-[#273042]"
              >
                Instrumental
              </button>
              <button
                type="button"
                onClick={() =>
                  setDeck((d) => ({ ...d, stems: { vocals: 1, drums: 1, bass: 1, melody: 1 } }))
                }
                className="px-2 py-0.5 rounded bg-[#141820] hover:bg-[#1e2432] text-slate-300 border border-[#273042]"
              >
                Full
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['vocals', 'drums', 'bass', 'melody'] as const).map((stemKey) => (
              <div
                key={stemKey}
                className="space-y-1 bg-[#10141e] p-2 rounded-lg border border-[#1f2738]"
              >
                <div className="flex items-center justify-between text-[11px] capitalize">
                  <button
                    type="button"
                    onClick={() =>
                      setDeck((d) => ({
                        ...d,
                        stems: {
                          ...d.stems,
                          [stemKey]: d.stems[stemKey] > 0.1 ? 0 : 1,
                        },
                      }))
                    }
                    className={`font-medium ${
                      deck.stems[stemKey] <= 0.1 ? 'text-red-400 line-through' : 'text-slate-200'
                    }`}
                  >
                    {stemKey}
                  </button>
                  <span className={`font-mono tabular-nums ${accentText}`}>
                    {Math.round(deck.stems[stemKey] * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={deck.stems[stemKey]}
                  onChange={(e) =>
                    setDeck((d) => ({
                      ...d,
                      stems: { ...d.stems, [stemKey]: Number(e.target.value) },
                    }))
                  }
                  aria-label={`Deck ${isDeckA ? '1' : '2'} ${stemKey} stem`}
                  className="studio-slider w-full"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Live Playhead Hot Cue Pads (1-8) */}
        <div className="bg-[#080a0f] p-3 rounded-xl border border-[#1d2432] space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="font-semibold">HOT CUE PADS (CLICK CAPTURE/JUMP · SHIFT+CLICK CLEAR)</span>
            <span>{deck.hotCues.filter((c) => c !== null).length}/8 SET</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {deck.hotCues.map((cueTime, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  if (e.shiftKey && cueTime !== null) {
                    const nextCues = [...deck.hotCues];
                    nextCues[idx] = null;
                    setDeck((d) => ({ ...d, hotCues: nextCues }));
                    return;
                  }
                  if (cueTime !== null) {
                    startDeck(deck, cueTime);
                  } else {
                    const livePos = Number(getDeckPositionSec(deck.id).toFixed(2));
                    const nextCues = [...deck.hotCues];
                    nextCues[idx] = livePos;
                    setDeck((d) => ({ ...d, hotCues: nextCues }));
                  }
                }}
                className={`py-1.5 px-1.5 rounded-lg text-[10px] font-mono border font-semibold transition-colors ${
                  cueTime !== null
                    ? isDeckA
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 hover:bg-amber-500/30'
                      : 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 hover:bg-cyan-500/30'
                    : 'bg-[#141820] border-[#252c3b] text-slate-500 hover:text-slate-300'
                }`}
              >
                {cueTime !== null ? `C${idx + 1} · ${formatDjTime(cueTime)}` : `SET ${idx + 1}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Studio Console Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#232833] pb-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <Disc3 className="w-6 h-6 text-amber-400" />
            <span>Virtual DJ Pro Console</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Dual-deck performance rig featuring synchronized RGB beatgrid waveforms, Slip Mode &amp; real reversed playback, 4-stem separation, Camelot harmonic matching, XY Kaoss Beat-FX, Phrase Automix, and SP-8 Drop Sampler.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://www.virtualdj.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-lg bg-[#141820] hover:bg-[#1e2432] text-amber-400 text-xs font-medium border border-[#273042] flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <span>VirtualDJ.com</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {statusMsg && (
        <div className="px-3.5 py-2.5 rounded-lg bg-[#13161B] border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{statusMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-[11px] font-mono text-slate-400 hover:text-slate-200"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Dual Stacked 60fps RGB Waveforms + Phase Alignment Meter + Overview Scrubbers */}
      <DualWaveformDisplay
        deckA={deckA}
        deckB={deckB}
        getDeckPositionSec={getDeckPositionSec}
        getSlipPositionSec={getSlipPositionSec}
        onSeekDeck={seekDeckTo}
        onNudgeDeck={(id, delta) => seekDeckTo(id, getDeckPositionSec(id) + delta)}
        onPhaseAlign={handlePhaseAlign}
      />

      {/* Core Dual CDJ Decks + Central Pro 2-Channel DJM Mixer */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-5">{renderDeckHardware(deckA, setDeckA)}</div>

        {/* Central Pro DJM Mixer Console */}
        <div className="xl:col-span-2 rounded-2xl bg-[#0f131a] border border-[#222834] p-3.5 space-y-4">
          <div className="text-[11px] font-mono font-bold tracking-wider text-amber-400 text-center">
            DJM-PRO MIXER
          </div>

          {/* Live AnalyserNode Stereo Peak Meters */}
          <div className="bg-[#080a0f] border border-[#1d2432] rounded-xl p-2.5 flex items-center justify-around">
            {renderVuColumn(vuLevels.a, 'bg-amber-400', 'CH1')}
            {renderVuColumn(vuLevels.master, 'bg-emerald-400', 'MST')}
            {renderVuColumn(vuLevels.b, 'bg-cyan-400', 'CH2')}
          </div>

          {/* Dual Channel Trim, 3-Band Kill EQ, Color Filter & Cue PFL */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { deck: deckA, setDeck: setDeckA, label: 'D1', color: 'text-amber-400' },
              { deck: deckB, setDeck: setDeckB, label: 'D2', color: 'text-cyan-400' },
            ].map(({ deck, setDeck, label, color }) => (
              <div
                key={deck.id}
                className="bg-[#080a0f] border border-[#1d2432] rounded-lg p-2 space-y-2"
              >
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className={`font-bold ${color}`}>{label}</span>
                  <button
                    type="button"
                    onClick={() => setDeck((d) => ({ ...d, cueMonitor: !d.cueMonitor }))}
                    className={`px-1.5 py-0.5 rounded border text-[9px] font-bold flex items-center gap-0.5 ${
                      deck.cueMonitor
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-[#141820] text-slate-400 border-[#252c3b]'
                    }`}
                    title="Headphone Pre-Fader Listen (CUE PFL)"
                  >
                    <Headphones className="w-2.5 h-2.5" />
                    <span>CUE</span>
                  </button>
                </div>

                {/* Channel Trim */}
                <div className="space-y-0.5">
                  <div className="text-[9px] font-mono text-slate-400 flex justify-between">
                    <span>TRIM</span>
                    <span>{Math.round(deck.trimGain * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={1.5}
                    step={0.05}
                    value={deck.trimGain}
                    onChange={(e) => setDeck((d) => ({ ...d, trimGain: Number(e.target.value) }))}
                    aria-label={`${label} trim gain`}
                    className="studio-slider w-full"
                  />
                </div>

                {/* High / Mid / Low Kill Isolators */}
                {(['highEq', 'midEq', 'lowEq'] as const).map((band) => {
                  const bandShort = band === 'highEq' ? 'HI' : band === 'midEq' ? 'MID' : 'LOW';
                  const isKilled = deck[band] <= -22;
                  return (
                    <div key={band} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[9px] font-mono">
                        <button
                          type="button"
                          onClick={() =>
                            setDeck((d) => ({
                              ...d,
                              [band]: isKilled ? 0 : -30,
                            }))
                          }
                          className={`px-1 rounded ${
                            isKilled ? 'bg-red-500/30 text-red-300 font-bold' : 'text-slate-400 hover:text-white'
                          }`}
                          title={`Click to Kill/Reset ${bandShort}`}
                        >
                          {bandShort}
                        </button>
                        <span className="text-slate-300 tabular-nums">{deck[band]}dB</span>
                      </div>
                      <input
                        type="range"
                        min={-30}
                        max={6}
                        step={1}
                        value={deck[band]}
                        onChange={(e) => setDeck((d) => ({ ...d, [band]: Number(e.target.value) }))}
                        aria-label={`${label} ${bandShort} EQ`}
                        className="studio-slider w-full"
                      />
                    </div>
                  );
                })}

                {/* Resonant Color Filter Sweep */}
                <div className="space-y-0.5 pt-1 border-t border-[#181f2c]">
                  <div className="flex items-center justify-between text-[9px] font-mono">
                    <button
                      type="button"
                      onClick={() => setDeck((d) => ({ ...d, filterSweep: 0 }))}
                      className="text-slate-400 hover:text-white"
                      title="Reset filter cutoff"
                    >
                      FILTER
                    </button>
                    <span className="text-slate-300 tabular-nums">
                      {deck.filterSweep === 0
                        ? 'THRU'
                        : deck.filterSweep < 0
                        ? 'LPF'
                        : 'HPF'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={deck.filterSweep}
                    onChange={(e) => setDeck((d) => ({ ...d, filterSweep: Number(e.target.value) }))}
                    aria-label={`${label} color filter`}
                    className="studio-slider w-full"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Master & Headphone Cue Mix */}
          <div className="bg-[#080a0f] p-2.5 rounded-xl border border-[#1d2432] space-y-2 text-[10px] font-mono">
            <div className="space-y-0.5">
              <div className="flex justify-between text-slate-300">
                <span className="flex items-center gap-1">
                  <Volume2 className="w-3 h-3 text-amber-400" />
                  MASTER
                </span>
                <span className="text-amber-400 tabular-nums">{Math.round(masterVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.05}
                value={masterVolume}
                onChange={(e) => setMasterVolume(Number(e.target.value))}
                aria-label="Master output volume"
                className="studio-slider w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-0.5">
                <div className="flex justify-between text-slate-400">
                  <span>HP VOL</span>
                  <span>{Math.round(headphoneVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={headphoneVolume}
                  onChange={(e) => setHeadphoneVolume(Number(e.target.value))}
                  aria-label="Headphone monitor volume"
                  className="studio-slider w-full"
                />
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-slate-400">
                  <span>CUE/MST</span>
                  <span>{Math.round(cueMix * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={cueMix}
                  onChange={(e) => setCueMix(Number(e.target.value))}
                  aria-label="Headphone cue/master mix"
                  className="studio-slider w-full"
                />
              </div>
            </div>
          </div>

          {/* Master Crossfader + Curve Toggle */}
          <div className="space-y-2 bg-[#080a0f] p-3 rounded-xl border border-[#1d2432]">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-amber-400 font-bold">
                D1 {Math.round(getCrossfaderGains(crossfader, crossfaderCurve).gainA * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setCrossfaderCurve((c) => (c === 'blend' ? 'cut' : 'blend'))}
                className="px-1.5 py-0.5 rounded bg-[#141820] border border-[#252c3b] text-slate-300 flex items-center gap-1"
                title="Switch between Smooth Blend curve and Sharp Scratch Cut curve"
              >
                <Sliders className="w-2.5 h-2.5" />
                <span>{crossfaderCurve.toUpperCase()}</span>
              </button>
              <span className="text-cyan-400 font-bold">
                D2 {Math.round(getCrossfaderGains(crossfader, crossfaderCurve).gainB * 100)}%
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={crossfader}
              onChange={(e) => setCrossfader(Number(e.target.value))}
              aria-label="Master DJ crossfader"
              className="studio-slider w-full cursor-pointer"
            />

            <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setCrossfader(0)}
                className="px-2 py-0.5 rounded bg-[#141820] text-amber-300 border border-[#252c3b]"
              >
                Full D1
              </button>
              <button
                type="button"
                onClick={() => setCrossfader(0.5)}
                className="px-2 py-0.5 rounded bg-[#141820] text-slate-300 border border-[#252c3b]"
              >
                Center
              </button>
              <button
                type="button"
                onClick={() => setCrossfader(1)}
                className="px-2 py-0.5 rounded bg-[#141820] text-cyan-300 border border-[#252c3b]"
              >
                Full D2
              </button>
            </div>
          </div>

          {/* Live Mix Recording */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleToggleRecordMix}
              className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                recordingMix
                  ? 'bg-red-500/25 text-red-200 border border-red-500'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{recordingMix ? 'STOP & EXPORT MIX' : 'RECORD DJ MIX'}</span>
            </button>

            {recordedMixUrl && (
              <a
                href={recordedMixUrl}
                download={recordedMixFilename}
                className="w-full py-2 rounded-lg bg-[#141820] text-slate-200 text-xs font-medium border border-[#273042] flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Save Mix Again</span>
              </a>
            )}
          </div>
        </div>

        <div className="xl:col-span-5">{renderDeckHardware(deckB, setDeckB)}</div>
      </div>

      {/* Real-Time Audio Effects Rack (Filter, Flanger, Reverb toggles & DSP) */}
      <DjEffectsRackPanel
        rack={effectsRack}
        activeStreamLabel={
          deckA.playing && deckB.playing
            ? 'DECK 1 + DECK 2 MIX'
            : deckA.playing
            ? 'DECK 1 LIVE'
            : deckB.playing
            ? 'DECK 2 LIVE'
            : 'MASTER BUS'
        }
        onChangeRack={setEffectsRack}
      />

      {/* XY Kaoss Beat-FX Touchpad + SP-8 Performance Sampler Bank */}
      <KaossFxSamplerPanel
        fxMode={fxMode}
        fxTarget={fxTarget}
        fxX={fxX}
        fxY={fxY}
        fxActive={fxActive}
        samplerVolume={samplerVolume}
        onChangeFxMode={setFxMode}
        onChangeFxTarget={setFxTarget}
        onUpdateFxPad={handleUpdateFxPad}
        onChangeSamplerVolume={setSamplerVolume}
        onTriggerDrop={handleTriggerDrop}
      />

      {/* Harmonic Camelot Wheel + Phrase Automix Engine */}
      <CamelotWheelPanel
        deckAKey={deckA.camelotKey}
        deckBKey={deckB.camelotKey}
        automixActive={automixActive}
        automixBeats={automixBeats}
        automixBassSwap={automixBassSwap}
        onChangeDeckKey={(id, nextKey) => {
          const setter = id === 'A' ? setDeckA : setDeckB;
          setter((d) => ({ ...d, camelotKey: nextKey }));
        }}
        onSetAutomixBeats={setAutomixBeats}
        onSetAutomixBassSwap={setAutomixBassSwap}
        onTriggerAutomix={handleTriggerAutomix}
      />

      {/* Multi-Source Crate Browser (Club/African Grooves + Offline Library + Local Files) */}
      <DjCrateDrawer
        activeReferenceKey={crossfader <= 0.5 ? deckA.camelotKey : deckB.camelotKey}
        loadingTrackId={loadingCrateId}
        onLoadCrateTrack={handleLoadCrateTrack}
        onUploadLocalFile={handleLoadDeckFile}
      />
    </div>
  );
}
