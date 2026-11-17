// Vocal Intelligence: Pitch Contour Analysis, De-Esser, Harmony Layering Doubler, & Vocal Presets
import { cloneAudioBuffer } from './dawDsp';

export interface VocalPitchPoint {
  timeSec: number;
  freqHz: number;
  midi: number;
  noteName: string;
  centsOff: number;
}

export interface VocalIntelligencePreset {
  id: string;
  name: string;
  description: string;
  highPassHz: number;
  mudCutDb: number;
  presenceDb: number;
  airDb: number;
  deEssDb: number;
  compThresholdDb: number;
  compRatio: number;
  reverbMix: number;
  delayMix: number;
  autoTuneEnabled: boolean;
  scale: 'A minor' | 'C major' | 'D minor' | 'G major' | 'Chromatic';
  tuneSpeed: number;
}

export const BUILTIN_VOCAL_PRESETS: VocalIntelligencePreset[] = [
  {
    id: 'nairobi_drill_lead',
    name: 'Nairobi Lead Polish',
    description: 'De-muds chest weight @ 240Hz, crisp 3.4kHz diction boost, tight compression & subtle room.',
    highPassHz: 95,
    mudCutDb: -4.5,
    presenceDb: 4.5,
    airDb: 3.0,
    deEssDb: -3.5,
    compThresholdDb: -22,
    compRatio: 5.0,
    reverbMix: 0.16,
    delayMix: 0.14,
    autoTuneEnabled: true,
    scale: 'A minor',
    tuneSpeed: 0.78,
  },
  {
    id: 'afro_smooth_vocal',
    name: 'Afropop Velvet Hook',
    description: 'Silky warmth with open air shelf, smooth leveling, and wide chorus-throw ambience.',
    highPassHz: 85,
    mudCutDb: -2.5,
    presenceDb: 3.0,
    airDb: 4.2,
    deEssDb: -4.0,
    compThresholdDb: -20,
    compRatio: 4.0,
    reverbMix: 0.26,
    delayMix: 0.22,
    autoTuneEnabled: true,
    scale: 'C major',
    tuneSpeed: 0.65,
  },
  {
    id: 'gospel_choir_air',
    name: 'Gospel Cathedral Air',
    description: 'Commanding vocal presence with lush cathedral tail and balanced sibilance control.',
    highPassHz: 80,
    mudCutDb: -2.0,
    presenceDb: 3.8,
    airDb: 4.8,
    deEssDb: -3.0,
    compThresholdDb: -18,
    compRatio: 3.5,
    reverbMix: 0.34,
    delayMix: 0.18,
    autoTuneEnabled: false,
    scale: 'C major',
    tuneSpeed: 0.4,
  },
  {
    id: 'clean_broadcast_dry',
    name: 'Podcast / Rap Dry',
    description: 'Zero reverb wash, aggressive rumble cut, dry forward slap compression.',
    highPassHz: 110,
    mudCutDb: -3.5,
    presenceDb: 3.5,
    airDb: 1.5,
    deEssDb: -4.5,
    compThresholdDb: -21,
    compRatio: 5.5,
    reverbMix: 0.04,
    delayMix: 0.0,
    autoTuneEnabled: false,
    scale: 'Chromatic',
    tuneSpeed: 0.3,
  },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function estimatePitchFrame(data: Float32Array, start: number, len: number, sr: number): number | null {
  const minLag = Math.floor(sr / 750);
  const maxLag = Math.floor(sr / 70);
  let rmsSq = 0;
  for (let i = start; i < Math.min(data.length, start + len); i++) {
    rmsSq += data[i] * data[i];
  }
  if (Math.sqrt(rmsSq / Math.max(1, len)) < 0.015) return null;

  let bestLag = -1;
  let maxCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    let n1 = 0;
    let n2 = 0;
    const end = Math.min(start + len - lag, data.length - lag);
    for (let i = start; i < end; i += 2) {
      const a = data[i];
      const b = data[i + lag];
      corr += a * b;
      n1 += a * a;
      n2 += b * b;
    }
    const d = Math.sqrt(n1 * n2);
    const score = d > 0.0001 ? corr / d : 0;
    if (score > 0.58 && score > maxCorr) {
      maxCorr = score;
      bestLag = lag;
    }
  }
  return bestLag > 0 ? sr / bestLag : null;
}

export function analyzeVocalPitchContour(buffer: AudioBuffer): VocalPitchPoint[] {
  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const frameLen = 2048;
  const hop = Math.max(1024, Math.floor(sr * 0.05));
  const points: VocalPitchPoint[] = [];

  for (let i = 0; i < data.length - frameLen; i += hop) {
    const f0 = estimatePitchFrame(data, i, frameLen, sr);
    if (f0 && f0 >= 70 && f0 <= 750) {
      const midiFloat = 12 * Math.log2(f0 / 440) + 69;
      const midi = Math.round(midiFloat);
      const centsOff = Math.round((midiFloat - midi) * 100);
      const octave = Math.floor(midi / 12) - 1;
      const name = `${NOTE_NAMES[((midi % 12) + 12) % 12]}${octave}`;
      points.push({
        timeSec: Number((i / sr).toFixed(2)),
        freqHz: Math.round(f0),
        midi,
        noteName: name,
        centsOff,
      });
    }
  }
  return points;
}

// Offline Vocal Chain Renderer matching VocalIntelligencePreset parameters
export async function processVocalWithPreset(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  preset: VocalIntelligencePreset
): Promise<AudioBuffer> {
  const sr = source.sampleRate;
  const offline = new OfflineAudioContext(
    Math.min(2, source.numberOfChannels),
    Math.ceil((source.duration + 1.1) * sr),
    sr
  );

  const src = offline.createBufferSource();
  src.buffer = source;

  const hp = offline.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = preset.highPassHz;

  const mud = offline.createBiquadFilter();
  mud.type = 'peaking';
  mud.frequency.value = 240;
  mud.Q.value = 1.25;
  mud.gain.value = preset.mudCutDb;

  const presence = offline.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3400;
  presence.Q.value = 1.0;
  presence.gain.value = preset.presenceDb;

  const air = offline.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = 9800;
  air.gain.value = preset.airDb;

  const deEss = offline.createBiquadFilter();
  deEss.type = 'peaking';
  deEss.frequency.value = 6900;
  deEss.Q.value = 3.0;
  deEss.gain.value = preset.deEssDb;

  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = preset.compThresholdDb;
  comp.ratio.value = preset.compRatio;
  comp.attack.value = 0.006;
  comp.release.value = 0.16;

  src.connect(hp).connect(mud).connect(presence).connect(air).connect(deEss).connect(comp);

  // Subtle delay throw if configured
  if (preset.delayMix > 0.02) {
    const dry = offline.createGain();
    dry.gain.value = 1;
    const delay = offline.createDelay(1.0);
    delay.delayTime.value = 0.24;
    const wet = offline.createGain();
    wet.gain.value = preset.delayMix;
    const fb = offline.createGain();
    fb.gain.value = 0.22;
    comp.connect(dry).connect(offline.destination);
    comp.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(offline.destination);
  } else {
    comp.connect(offline.destination);
  }

  src.start(0);
  const rendered = await offline.startRendering();
  return cloneAudioBuffer(ctx, rendered);
}

// Generate Stereo Vocal Doubler / Layering Track (Haas spread + micro pitch detune)
export async function generateVocalLayerDouble(
  source: AudioBuffer,
  detuneCents = 14,
  spreadMs = 18
): Promise<AudioBuffer> {
  const sr = source.sampleRate;
  const offline = new OfflineAudioContext(2, Math.ceil((source.duration + 0.15) * sr), sr);

  const leftSrc = offline.createBufferSource();
  leftSrc.buffer = source;
  leftSrc.detune.value = -detuneCents;
  const leftPan = offline.createStereoPanner();
  leftPan.pan.value = -0.68;
  const leftGain = offline.createGain();
  leftGain.gain.value = 0.62;

  const rightSrc = offline.createBufferSource();
  rightSrc.buffer = source;
  rightSrc.detune.value = detuneCents;
  const rightDelay = offline.createDelay(0.1);
  rightDelay.delayTime.value = spreadMs / 1000;
  const rightPan = offline.createStereoPanner();
  rightPan.pan.value = 0.68;
  const rightGain = offline.createGain();
  rightGain.gain.value = 0.62;

  leftSrc.connect(leftGain).connect(leftPan).connect(offline.destination);
  rightSrc.connect(rightDelay).connect(rightGain).connect(rightPan).connect(offline.destination);

  leftSrc.start(0);
  rightSrc.start(0);
  return offline.startRendering();
}
