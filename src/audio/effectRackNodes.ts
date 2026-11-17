// Real-Time & Offline Web Audio API Effect Rack Graph (Compressor, Delay, Convolution Reverb)

export interface CompressorEffectSettings {
  enabled: boolean;
  thresholdDb: number; // -50 to 0
  ratio: number; // 1 to 20
  attackSec: number; // 0.001 to 0.2
  releaseSec: number; // 0.05 to 1.0
}

export interface DelayEffectSettings {
  enabled: boolean;
  timeSec: number; // 0.04 to 1.0
  feedback: number; // 0 to 0.85
  mix: number; // 0 to 1
}

export interface ReverbEffectSettings {
  enabled: boolean;
  decaySec: number; // 0.4 to 4.5
  dampingHz: number; // 1200 to 12000
  mix: number; // 0 to 1
}

export interface TrackEffectsState {
  bypassAll: boolean;
  compressor: CompressorEffectSettings;
  delay: DelayEffectSettings;
  reverb: ReverbEffectSettings;
}

export function createDefaultTrackEffects(): TrackEffectsState {
  return {
    bypassAll: false,
    compressor: {
      enabled: false,
      thresholdDb: -18,
      ratio: 4,
      attackSec: 0.01,
      releaseSec: 0.25,
    },
    delay: {
      enabled: false,
      timeSec: 0.26,
      feedback: 0.35,
      mix: 0.3,
    },
    reverb: {
      enabled: false,
      decaySec: 1.8,
      dampingHz: 5500,
      mix: 0.25,
    },
  };
}

export const EFFECT_RACK_PRESETS: {
  id: string;
  label: string;
  effects: TrackEffectsState;
}[] = [
  {
    id: 'clean',
    label: 'Reset Clean',
    effects: createDefaultTrackEffects(),
  },
  {
    id: 'vocal_studio',
    label: 'Vocal Studio',
    effects: {
      bypassAll: false,
      compressor: { enabled: true, thresholdDb: -22, ratio: 4.5, attackSec: 0.008, releaseSec: 0.22 },
      delay: { enabled: true, timeSec: 0.24, feedback: 0.22, mix: 0.18 },
      reverb: { enabled: true, decaySec: 1.4, dampingHz: 6200, mix: 0.24 },
    },
  },
  {
    id: 'dub_echo',
    label: 'Dub Echo',
    effects: {
      bypassAll: false,
      compressor: { enabled: true, thresholdDb: -16, ratio: 3.5, attackSec: 0.015, releaseSec: 0.28 },
      delay: { enabled: true, timeSec: 0.375, feedback: 0.58, mix: 0.48 },
      reverb: { enabled: true, decaySec: 2.2, dampingHz: 3800, mix: 0.28 },
    },
  },
  {
    id: 'drum_punch',
    label: 'Drum Punch',
    effects: {
      bypassAll: false,
      compressor: { enabled: true, thresholdDb: -24, ratio: 7.5, attackSec: 0.004, releaseSec: 0.14 },
      delay: { enabled: false, timeSec: 0.18, feedback: 0.2, mix: 0.12 },
      reverb: { enabled: true, decaySec: 0.75, dampingHz: 4800, mix: 0.14 },
    },
  },
  {
    id: 'ambient_hall',
    label: 'Ambient Hall',
    effects: {
      bypassAll: false,
      compressor: { enabled: false, thresholdDb: -18, ratio: 3, attackSec: 0.02, releaseSec: 0.3 },
      delay: { enabled: true, timeSec: 0.45, feedback: 0.44, mix: 0.34 },
      reverb: { enabled: true, decaySec: 3.6, dampingHz: 4200, mix: 0.56 },
    },
  },
];

const irBufferCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

export function generateReverbImpulseResponse(
  ctx: BaseAudioContext,
  decaySec: number,
  dampingHz: number
): AudioBuffer {
  const safeDecay = Math.max(0.3, Math.min(5.0, decaySec));
  const safeDamping = Math.max(800, Math.min(16000, dampingHz));
  const cacheKey = `${ctx.sampleRate}_${safeDecay.toFixed(2)}_${Math.round(safeDamping / 100)}`;

  let ctxMap = irBufferCache.get(ctx);
  if (!ctxMap) {
    ctxMap = new Map();
    irBufferCache.set(ctx, ctxMap);
  }
  const cached = ctxMap.get(cacheKey);
  if (cached) return cached;

  const sr = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(sr * safeDecay));
  const ir = ctx.createBuffer(2, length, sr);

  // Simple one-pole lowpass coefficient to emulate room air damping across decay tail
  const cutoffNorm = Math.min(0.95, (2 * Math.PI * safeDamping) / sr);
  const alpha = Math.max(0.05, Math.min(1.0, cutoffNorm / (1 + cutoffNorm)));

  for (let ch = 0; ch < 2; ch++) {
    const channelData = ir.getChannelData(ch);
    let lpState = 0;
    for (let i = 0; i < length; i++) {
      const tNorm = i / length;
      const envelope = Math.pow(1 - tNorm, 2.4);
      const white = Math.random() * 2 - 1;
      lpState = lpState + alpha * (white - lpState);
      channelData[i] = lpState * envelope;
    }
  }

  if (ctxMap.size > 24) {
    ctxMap.clear();
  }
  ctxMap.set(cacheKey, ir);
  return ir;
}

export interface TrackEffectChainInstance {
  input: GainNode;
  output: GainNode;
  compressorNode: DynamicsCompressorNode;
  compDryGain: GainNode;
  compWetGain: GainNode;
  delayNode: DelayNode;
  delayToneFilter: BiquadFilterNode;
  delayFeedbackGain: GainNode;
  delayDryGain: GainNode;
  delayWetGain: GainNode;
  reverbConvolver: ConvolverNode;
  reverbDampFilter: BiquadFilterNode;
  reverbDryGain: GainNode;
  reverbWetGain: GainNode;
  lastDecaySec: number;
  lastDampingHz: number;
  disconnect: () => void;
}

export function createTrackEffectChain(
  ctx: BaseAudioContext,
  effects: TrackEffectsState
): TrackEffectChainInstance {
  const input = ctx.createGain();
  const stage2In = ctx.createGain();
  const stage3In = ctx.createGain();
  const output = ctx.createGain();

  // 1. Compressor stage (parallel dry/wet crossfade for click-free live bypass)
  const compressorNode = ctx.createDynamicsCompressor();
  compressorNode.knee.value = 12;
  const compDryGain = ctx.createGain();
  const compWetGain = ctx.createGain();

  input.connect(compDryGain);
  compDryGain.connect(stage2In);

  input.connect(compressorNode);
  compressorNode.connect(compWetGain);
  compWetGain.connect(stage2In);

  // 2. Delay stage (DelayNode + lowpass feedback loop + wet/dry mix)
  const delayNode = ctx.createDelay(1.5);
  const delayToneFilter = ctx.createBiquadFilter();
  delayToneFilter.type = 'lowpass';
  delayToneFilter.frequency.value = 4800;
  const delayFeedbackGain = ctx.createGain();
  const delayDryGain = ctx.createGain();
  const delayWetGain = ctx.createGain();

  stage2In.connect(delayDryGain);
  delayDryGain.connect(stage3In);

  stage2In.connect(delayNode);
  delayNode.connect(delayToneFilter);
  delayToneFilter.connect(delayFeedbackGain);
  delayFeedbackGain.connect(delayNode);
  delayToneFilter.connect(delayWetGain);
  delayWetGain.connect(stage3In);

  // 3. Convolution Reverb stage (ConvolverNode + damping filter + wet/dry mix)
  const reverbConvolver = ctx.createConvolver();
  reverbConvolver.buffer = generateReverbImpulseResponse(
    ctx,
    effects.reverb.decaySec,
    effects.reverb.dampingHz
  );
  const reverbDampFilter = ctx.createBiquadFilter();
  reverbDampFilter.type = 'lowpass';
  reverbDampFilter.frequency.value = effects.reverb.dampingHz;
  const reverbDryGain = ctx.createGain();
  const reverbWetGain = ctx.createGain();

  stage3In.connect(reverbDryGain);
  reverbDryGain.connect(output);

  stage3In.connect(reverbConvolver);
  reverbConvolver.connect(reverbDampFilter);
  reverbDampFilter.connect(reverbWetGain);
  reverbWetGain.connect(output);

  const instance: TrackEffectChainInstance = {
    input,
    output,
    compressorNode,
    compDryGain,
    compWetGain,
    delayNode,
    delayToneFilter,
    delayFeedbackGain,
    delayDryGain,
    delayWetGain,
    reverbConvolver,
    reverbDampFilter,
    reverbDryGain,
    reverbWetGain,
    lastDecaySec: effects.reverb.decaySec,
    lastDampingHz: effects.reverb.dampingHz,
    disconnect: () => {
      try {
        input.disconnect();
        compDryGain.disconnect();
        compressorNode.disconnect();
        compWetGain.disconnect();
        stage2In.disconnect();
        delayDryGain.disconnect();
        delayNode.disconnect();
        delayToneFilter.disconnect();
        delayFeedbackGain.disconnect();
        delayWetGain.disconnect();
        stage3In.disconnect();
        reverbDryGain.disconnect();
        reverbConvolver.disconnect();
        reverbDampFilter.disconnect();
        reverbWetGain.disconnect();
        output.disconnect();
      } catch {
        // Ignore nodes already disconnected
      }
    },
  };

  updateTrackEffectChain(ctx, instance, effects, true);
  return instance;
}

export function updateTrackEffectChain(
  ctx: BaseAudioContext,
  chain: TrackEffectChainInstance,
  effects: TrackEffectsState,
  immediate = false
): void {
  const now = ctx.currentTime;
  const tc = 0.018;

  const setParam = (param: AudioParam, value: number) => {
    if (immediate) {
      param.setValueAtTime(value, now);
    } else {
      param.setTargetAtTime(value, now, tc);
    }
  };

  const compActive = !effects.bypassAll && effects.compressor.enabled;
  setParam(chain.compressorNode.threshold, Math.max(-50, Math.min(0, effects.compressor.thresholdDb)));
  setParam(chain.compressorNode.ratio, Math.max(1, Math.min(20, effects.compressor.ratio)));
  setParam(chain.compressorNode.attack, Math.max(0.001, Math.min(0.25, effects.compressor.attackSec)));
  setParam(chain.compressorNode.release, Math.max(0.05, Math.min(1.0, effects.compressor.releaseSec)));
  setParam(chain.compDryGain.gain, compActive ? 0 : 1);
  setParam(chain.compWetGain.gain, compActive ? 1 : 0);

  const delayActive = !effects.bypassAll && effects.delay.enabled;
  const delayMix = Math.max(0, Math.min(1, effects.delay.mix));
  setParam(chain.delayNode.delayTime, Math.max(0.02, Math.min(1.2, effects.delay.timeSec)));
  setParam(
    chain.delayFeedbackGain.gain,
    delayActive ? Math.max(0, Math.min(0.85, effects.delay.feedback)) : 0
  );
  setParam(chain.delayDryGain.gain, delayActive ? Math.max(0.45, 1 - delayMix * 0.45) : 1);
  setParam(chain.delayWetGain.gain, delayActive ? delayMix : 0);

  const reverbActive = !effects.bypassAll && effects.reverb.enabled;
  const reverbMix = Math.max(0, Math.min(1, effects.reverb.mix));
  setParam(chain.reverbDampFilter.frequency, Math.max(800, Math.min(16000, effects.reverb.dampingHz)));
  setParam(chain.reverbDryGain.gain, reverbActive ? Math.max(0.45, 1 - reverbMix * 0.4) : 1);
  setParam(chain.reverbWetGain.gain, reverbActive ? reverbMix : 0);

  if (
    Math.abs(chain.lastDecaySec - effects.reverb.decaySec) > 0.08 ||
    Math.abs(chain.lastDampingHz - effects.reverb.dampingHz) > 250
  ) {
    chain.reverbConvolver.buffer = generateReverbImpulseResponse(
      ctx,
      effects.reverb.decaySec,
      effects.reverb.dampingHz
    );
    chain.lastDecaySec = effects.reverb.decaySec;
    chain.lastDampingHz = effects.reverb.dampingHz;
  }
}

export async function bakeEffectRackIntoBuffer(
  source: AudioBuffer,
  effects: TrackEffectsState
): Promise<AudioBuffer> {
  const hasAny =
    !effects.bypassAll &&
    (effects.compressor.enabled || effects.delay.enabled || effects.reverb.enabled);
  if (!hasAny) return source;

  const tailSec = effects.reverb.enabled
    ? Math.min(3.5, effects.reverb.decaySec * 0.85)
    : effects.delay.enabled
    ? Math.min(2.0, effects.delay.timeSec * 3)
    : 0.05;

  const sr = source.sampleRate;
  const numCh = Math.min(2, source.numberOfChannels);
  const offline = new OfflineAudioContext(
    numCh,
    Math.ceil((source.duration + tailSec) * sr),
    sr
  );
  const src = offline.createBufferSource();
  src.buffer = source;

  const chain = createTrackEffectChain(offline, effects);
  src.connect(chain.input);
  chain.output.connect(offline.destination);
  src.start(0);

  return offline.startRendering();
}
