// Web Audio API Synthesizer, WAV Encoder, and Multi-Track DSP Utilities
import type { GenreKitId } from './genreKits';

export type DrumPadId =
  | 'kick808'
  | 'snare'
  | 'clap'
  | 'hihatClosed'
  | 'hihatOpen'
  | 'logDrum'
  | 'rimshot'
  | 'shaker'
  | 'subBass'
  | 'rhodesC'
  | 'rhodesF'
  | 'rhodesG'
  | 'pluck'
  | 'brass'
  | 'airhorn'
  | 'scratch';

export interface DrumPadConfig {
  id: DrumPadId;
  label: string;
  keyBind: string;
  category: 'drums' | 'melodic' | 'fx';
}

export const DRUM_PADS: DrumPadConfig[] = [
  { id: 'kick808', label: '808 Kick', keyBind: '1', category: 'drums' },
  { id: 'snare', label: 'Snare', keyBind: '2', category: 'drums' },
  { id: 'clap', label: 'Studio Clap', keyBind: '3', category: 'drums' },
  { id: 'hihatClosed', label: 'Closed Hat', keyBind: '4', category: 'drums' },
  { id: 'hihatOpen', label: 'Open Hat', keyBind: 'Q', category: 'drums' },
  { id: 'logDrum', label: 'Afro Log', keyBind: 'W', category: 'drums' },
  { id: 'rimshot', label: 'Rimshot', keyBind: 'E', category: 'drums' },
  { id: 'shaker', label: 'Shaker', keyBind: 'R', category: 'drums' },
  { id: 'subBass', label: 'Sub Bass', keyBind: 'A', category: 'melodic' },
  { id: 'rhodesC', label: 'Chord Am7', keyBind: 'S', category: 'melodic' },
  { id: 'rhodesF', label: 'Chord Fmaj7', keyBind: 'D', category: 'melodic' },
  { id: 'rhodesG', label: 'Chord G6', keyBind: 'F', category: 'melodic' },
  { id: 'pluck', label: 'Afro Pluck', keyBind: 'Z', category: 'melodic' },
  { id: 'brass', label: 'Brass Stab', keyBind: 'X', category: 'melodic' },
  { id: 'airhorn', label: 'DJ Horn', keyBind: 'C', category: 'fx' },
  { id: 'scratch', label: 'Vinyl Cut', keyBind: 'V', category: 'fx' },
];

let sharedCtx: AudioContext | null = null;
let sharedAnalyser: AnalyserNode | null = null;
let sharedMasterBus: GainNode | null = null;
const connectedMediaElements = new WeakSet<HTMLMediaElement>();

export function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new AudioCtx();
  }
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

export function getStudioMasterNode(ctx?: AudioContext): AudioNode {
  const activeCtx = ctx || getAudioContext();
  if (activeCtx !== sharedCtx) {
    return activeCtx.destination;
  }
  if (!sharedMasterBus || !sharedAnalyser) {
    sharedMasterBus = activeCtx.createGain();
    sharedMasterBus.gain.value = 1.0;
    sharedAnalyser = activeCtx.createAnalyser();
    sharedAnalyser.fftSize = 128;
    sharedAnalyser.smoothingTimeConstant = 0.78;
    sharedMasterBus.connect(sharedAnalyser);
    sharedAnalyser.connect(activeCtx.destination);
  }
  return sharedMasterBus;
}

export function getStudioAnalyser(): AnalyserNode | null {
  if (!sharedCtx) return null;
  getStudioMasterNode(sharedCtx);
  return sharedAnalyser;
}

export function attachMediaElementToAnalyser(el: HTMLMediaElement | null): void {
  if (!el || connectedMediaElements.has(el)) return;
  try {
    const ctx = getAudioContext();
    const src = ctx.createMediaElementSource(el);
    src.connect(getStudioMasterNode(ctx));
    connectedMediaElements.add(el);
  } catch {
    // MediaElementAudioSource already attached or unavailable
  }
}

export function triggerSynthPad(
  ctx: BaseAudioContext,
  destination: AudioNode,
  padId: DrumPadId,
  when = ctx.currentTime,
  gainAmount = 0.85,
  kitId: GenreKitId = 'afrobeats'
): void {
  const master = ctx.createGain();
  master.gain.setValueAtTime(gainAmount, when);
  master.connect(destination);

  const isClubBounce = kitId === 'gengetone' || kitId === 'dancehall';
  const isDrill = kitId === 'drill';
  const isGospel = kitId === 'gospel';
  const isReggae = kitId === 'reggae';
  const isBenga = kitId === 'benga';
  const isAmapiano = kitId === 'amapiano';
  const isUrbantone = kitId === 'urbantone';

  switch (padId) {
    case 'kick808': {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isGospel || isReggae ? 'triangle' : 'sine';
      const startHz = isClubBounce ? 168 : isBenga ? 150 : isReggae ? 120 : 145;
      const midHz = isClubBounce ? 52 : isReggae ? 48 : 42;
      const endHz = isDrill ? 30 : isReggae ? 44 : isClubBounce ? 42 : 34;
      const decaySec = isDrill ? 0.56 : isReggae ? 0.34 : isClubBounce ? 0.38 : 0.48;
      osc.frequency.setValueAtTime(startHz, when);
      osc.frequency.exponentialRampToValueAtTime(midHz, when + 0.12);
      osc.frequency.exponentialRampToValueAtTime(endHz, when + decaySec);
      gain.gain.setValueAtTime(1.0, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + decaySec + 0.03);
      osc.connect(gain).connect(master);
      osc.start(when);
      osc.stop(when + decaySec + 0.05);
      break;
    }
    case 'snare': {
      const noiseBuf = createNoiseBuffer(ctx, 0.24);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = isDrill ? 'bandpass' : 'highpass';
      filter.frequency.setValueAtTime(
        isDrill ? 1850 : isClubBounce ? 1250 : isGospel || isReggae ? 680 : 900,
        when
      );
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(isDrill ? 0.8 : 0.7, when);
      nGain.gain.exponentialRampToValueAtTime(0.001, when + (isDrill ? 0.13 : 0.18));
      noise.connect(filter).connect(nGain).connect(master);
      noise.start(when);

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isClubBounce ? 255 : isDrill ? 280 : isGospel ? 185 : 210, when);
      osc.frequency.exponentialRampToValueAtTime(isClubBounce ? 130 : 110, when + 0.08);
      const oGain = ctx.createGain();
      oGain.gain.setValueAtTime(0.55, when);
      oGain.gain.exponentialRampToValueAtTime(0.001, when + 0.11);
      osc.connect(oGain).connect(master);
      osc.start(when);
      osc.stop(when + 0.12);
      break;
    }
    case 'clap': {
      const offsets = isGospel ? [0, 0.015, 0.03, 0.044] : [0, 0.012, 0.025];
      offsets.forEach((offset, idx) => {
        const noise = ctx.createBufferSource();
        noise.buffer = createNoiseBuffer(ctx, 0.18);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(isGospel ? 1200 : isClubBounce ? 1550 : 1350, when + offset);
        bp.Q.setValueAtTime(1.3, when + offset);
        const g = ctx.createGain();
        const isLast = idx === offsets.length - 1;
        g.gain.setValueAtTime(isLast ? 0.65 : 0.38, when + offset);
        g.gain.exponentialRampToValueAtTime(0.001, when + offset + (isLast ? 0.17 : 0.04));
        noise.connect(bp).connect(g).connect(master);
        noise.start(when + offset);
      });
      break;
    }
    case 'hihatClosed': {
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, 0.07);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(isDrill ? 7800 : isReggae ? 5200 : 6500, when);
      const g = ctx.createGain();
      g.gain.setValueAtTime(isDrill ? 0.5 : 0.45, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + (isDrill ? 0.045 : 0.055));
      noise.connect(hp).connect(g).connect(master);
      noise.start(when);
      break;
    }
    case 'hihatOpen': {
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, isGospel ? 0.5 : 0.35);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(isGospel ? 5200 : 5800, when);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.45, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + (isGospel ? 0.45 : 0.3));
      noise.connect(hp).connect(g).connect(master);
      noise.start(when);
      break;
    }
    case 'logDrum': {
      const osc = ctx.createOscillator();
      osc.type = isAmapiano || isClubBounce || isUrbantone ? 'sine' : 'triangle';
      const topHz = isAmapiano ? 245 : isClubBounce ? 210 : isBenga ? 180 : 220;
      const botHz = isAmapiano ? 64 : isClubBounce ? 72 : 76;
      const dur = isAmapiano ? 0.32 : 0.24;
      osc.frequency.setValueAtTime(topHz, when);
      osc.frequency.exponentialRampToValueAtTime(botHz, when + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.95, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      osc.connect(g).connect(master);
      osc.start(when);
      osc.stop(when + dur + 0.02);
      break;
    }
    case 'rimshot': {
      const osc = ctx.createOscillator();
      osc.type = isBenga || isReggae ? 'triangle' : 'square';
      const startHz = isBenga ? 720 : isReggae ? 420 : isClubBounce ? 540 : 480;
      const endHz = isBenga ? 520 : isReggae ? 260 : 290;
      osc.frequency.setValueAtTime(startHz, when);
      osc.frequency.exponentialRampToValueAtTime(endHz, when + 0.035);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(isBenga ? 2100 : 1600, when);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.58, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + (isBenga ? 0.08 : 0.045));
      osc.connect(bp).connect(g).connect(master);
      osc.start(when);
      osc.stop(when + 0.09);
      break;
    }
    case 'shaker': {
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, isGospel ? 0.14 : 0.09);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(isGospel ? 8800 : isBenga ? 6800 : 7500, when);
      bp.Q.setValueAtTime(isGospel ? 2.8 : 2.0, when);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.02, when);
      g.gain.linearRampToValueAtTime(isGospel ? 0.42 : 0.35, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, when + (isGospel ? 0.13 : 0.085));
      noise.connect(bp).connect(g).connect(master);
      noise.start(when);
      break;
    }
    case 'subBass': {
      const osc = ctx.createOscillator();
      osc.type = isClubBounce || isDrill ? 'sawtooth' : 'triangle';
      if (isDrill) {
        // Authentic Drill 808 slide
        osc.frequency.setValueAtTime(55, when);
        osc.frequency.exponentialRampToValueAtTime(82.41, when + 0.14);
        osc.frequency.exponentialRampToValueAtTime(49, when + 0.38);
      } else if (isReggae) {
        osc.frequency.setValueAtTime(49, when);
      } else if (isBenga) {
        osc.frequency.setValueAtTime(73.42, when);
      } else {
        osc.frequency.setValueAtTime(55, when);
      }
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(isDrill ? 260 : isClubBounce ? 230 : 180, when);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + (isDrill ? 0.62 : 0.55));
      osc.connect(lp).connect(g).connect(master);
      osc.start(when);
      osc.stop(when + 0.65);
      break;
    }
    case 'rhodesC':
    case 'rhodesF':
    case 'rhodesG': {
      const chordVoicings: Record<string, Record<'rhodesC' | 'rhodesF' | 'rhodesG', number[]>> = {
        gospel: {
          rhodesC: [261.63, 329.63, 392.0, 493.88, 587.33],
          rhodesF: [174.61, 220.0, 261.63, 329.63, 392.0],
          rhodesG: [196.0, 246.94, 329.63, 349.23, 440.0],
        },
        drill: {
          rhodesC: [130.81, 155.56, 196.0, 233.08],
          rhodesF: [103.83, 130.81, 155.56, 196.0],
          rhodesG: [98.0, 123.47, 146.83, 174.61],
        },
        reggae: {
          rhodesC: [220.0, 261.63, 329.63],
          rhodesF: [146.83, 174.61, 220.0],
          rhodesG: [196.0, 246.94, 293.66],
        },
        gengetone: {
          rhodesC: [220.0, 261.63, 329.63],
          rhodesF: [174.61, 220.0, 261.63],
          rhodesG: [164.81, 207.65, 246.94, 293.66],
        },
        benga: {
          rhodesC: [261.63, 329.63, 392.0],
          rhodesF: [174.61, 220.0, 261.63],
          rhodesG: [196.0, 246.94, 293.66],
        },
        default: {
          rhodesC: [220, 261.63, 329.63, 392.0],
          rhodesF: [174.61, 220, 261.63, 329.63],
          rhodesG: [196.0, 246.94, 293.66, 329.63],
        },
      };
      const family = isGospel
        ? 'gospel'
        : isDrill
        ? 'drill'
        : isReggae
        ? 'reggae'
        : isClubBounce
        ? 'gengetone'
        : isBenga
        ? 'benga'
        : 'default';
      const notes = chordVoicings[family][padId];
      const decay = isReggae ? 0.16 : isClubBounce ? 0.28 : isGospel ? 0.85 : 0.7;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = isGospel || isClubBounce ? 'triangle' : isReggae ? 'sawtooth' : 'sine';
        const noteStart = isBenga ? when + idx * 0.025 : when;
        osc.frequency.setValueAtTime(freq, noteStart);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(isReggae ? 1800 : isDrill ? 1400 : 2800, noteStart);
        const g = ctx.createGain();
        g.gain.setValueAtTime(isGospel ? 0.18 : 0.22, noteStart);
        g.gain.exponentialRampToValueAtTime(0.001, noteStart + decay);
        osc.connect(lp).connect(g).connect(master);
        osc.start(noteStart);
        osc.stop(noteStart + decay + 0.03);
      });
      break;
    }
    case 'pluck': {
      const osc = ctx.createOscillator();
      osc.type = isBenga || isReggae ? 'triangle' : isDrill || isUrbantone ? 'sine' : 'sawtooth';
      const baseHz = isBenga ? 587.33 : isDrill ? 659.25 : isReggae ? 329.63 : isClubBounce ? 493.88 : 440;
      osc.frequency.setValueAtTime(baseHz, when);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(isBenga ? 3800 : isReggae ? 1900 : 2800, when);
      lp.frequency.exponentialRampToValueAtTime(isReggae ? 650 : 380, when + (isReggae ? 0.1 : 0.18));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.45, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + (isReggae ? 0.11 : isBenga ? 0.18 : 0.24));
      osc.connect(lp).connect(g).connect(master);
      osc.start(when);
      osc.stop(when + 0.26);
      break;
    }
    case 'brass': {
      const freqs = isGospel ? [130.81, 164.81, 196.0, 261.63] : [110, 164.81, 220];
      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, when);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(isGospel ? 1850 : 1400, when);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.24, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + (isGospel ? 0.48 : 0.38));
        osc.connect(lp).connect(g).connect(master);
        osc.start(when);
        osc.stop(when + 0.5);
      });
      break;
    }
    case 'airhorn': {
      if (isReggae) {
        // Classic oscillating Dub Siren
        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(680, when);
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(7.5, when);
        lfoGain.gain.setValueAtTime(190, when);
        lfo.connect(lfoGain).connect(osc.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.32, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.58);
        osc.connect(g).connect(master);
        lfo.start(when);
        osc.start(when);
        lfo.stop(when + 0.6);
        osc.stop(when + 0.6);
      } else {
        [349.23, 440, 523.25].forEach((freq) => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, when);
          osc.frequency.linearRampToValueAtTime(freq * 0.96, when + 0.45);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.22, when);
          g.gain.exponentialRampToValueAtTime(0.001, when + 0.5);
          osc.connect(g).connect(master);
          osc.start(when);
          osc.stop(when + 0.52);
        });
      }
      break;
    }
    case 'scratch': {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(620, when);
      osc.frequency.exponentialRampToValueAtTime(140, when + 0.08);
      osc.frequency.exponentialRampToValueAtTime(510, when + 0.16);
      osc.frequency.exponentialRampToValueAtTime(90, when + 0.24);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1100, when);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.25);
      osc.connect(bp).connect(g).connect(master);
      osc.start(when);
      osc.stop(when + 0.26);
      break;
    }
  }
}

export function createNoiseBuffer(ctx: BaseAudioContext, durationSec: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function triggerBufferPad(
  ctx: BaseAudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  when = ctx.currentTime,
  gainAmount = 0.85,
  maxDurationSec = 2.2
): void {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  const playDur = Math.min(buffer.duration, maxDurationSec);
  gain.gain.setValueAtTime(0.001, when);
  gain.gain.linearRampToValueAtTime(gainAmount, when + 0.006);
  if (playDur > 0.06) {
    gain.gain.setValueAtTime(gainAmount, when + playDur - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, when + playDur);
  }
  src.connect(gain).connect(destination);
  src.start(when, 0, playDur);
}

// Render 16-step beat pattern into an AudioBuffer for WAV export or DAW import
export async function renderPatternToBuffer(
  pattern: Record<string, boolean[]>,
  bpm: number,
  bars = 2,
  customPadBuffers?: Partial<Record<DrumPadId, AudioBuffer>>,
  kitId: GenreKitId = 'afrobeats'
): Promise<AudioBuffer> {
  const stepSec = 60 / bpm / 4;
  const totalSteps = 16 * bars;
  const durationSec = totalSteps * stepSec + 0.5;
  const sampleRate = 44100;
  const offline = new OfflineAudioContext(2, Math.ceil(durationSec * sampleRate), sampleRate);

  for (let step = 0; step < totalSteps; step++) {
    const stepIdx = step % 16;
    const time = step * stepSec;
    for (const [padId, steps] of Object.entries(pattern)) {
      if (steps[stepIdx]) {
        const customBuf = customPadBuffers?.[padId as DrumPadId];
        if (customBuf) {
          triggerBufferPad(offline, offline.destination, customBuf, time, 0.78, 1.8);
        } else {
          triggerSynthPad(offline, offline.destination, padId as DrumPadId, time, 0.78, kitId);
        }
      }
    }
  }
  return offline.startRendering();
}

// Generate a synthetic full groove AudioBuffer for Virtual DJ / Discover / DAW demos
export async function renderGrooveBuffer(
  style: 'afro' | 'house' | 'trap',
  bpm: number,
  bars = 4
): Promise<AudioBuffer> {
  const patterns: Record<'afro' | 'house' | 'trap', Record<string, boolean[]>> = {
    afro: {
      kick808: [true, false, false, false, false, false, true, false, false, false, true, false, false, false, false, false],
      logDrum: [false, false, false, true, false, false, false, false, false, false, false, true, false, true, false, false],
      rimshot: [false, false, true, false, false, true, false, false, false, false, true, false, false, true, false, false],
      shaker: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      rhodesC: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      rhodesF: [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    },
    house: {
      kick808: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      clap: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihatOpen: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      subBass: [true, false, false, true, false, false, true, false, true, false, false, true, false, false, true, false],
      rhodesG: [true, false, false, false, false, false, true, false, false, false, false, false, false, false, false, false],
    },
    trap: {
      kick808: [true, false, false, false, false, false, false, true, false, false, true, false, false, false, false, false],
      snare: [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
      hihatClosed: [true, true, true, true, true, false, true, true, true, true, true, true, true, true, true, false],
      subBass: [true, false, false, false, false, false, false, true, false, false, true, false, false, false, false, false],
      pluck: [true, false, false, true, false, false, true, false, false, false, true, false, true, false, false, false],
    },
  };
  return renderPatternToBuffer(patterns[style], bpm, bars);
}

// Extract a tight pad-ready AudioBuffer slice from any source AudioBuffer
export async function sliceAudioBuffer(
  source: AudioBuffer,
  startSec = 0,
  durationSec = 1.5
): Promise<AudioBuffer> {
  const safeStart = Math.max(0, Math.min(Math.max(0, source.duration - 0.1), startSec));
  const safeDur = Math.max(0.15, Math.min(durationSec, source.duration - safeStart));
  const sampleRate = source.sampleRate;
  const offline = new OfflineAudioContext(
    Math.min(2, source.numberOfChannels),
    Math.max(1, Math.ceil(safeDur * sampleRate)),
    sampleRate
  );
  const src = offline.createBufferSource();
  src.buffer = source;
  const gain = offline.createGain();
  gain.gain.setValueAtTime(0.001, 0);
  gain.gain.linearRampToValueAtTime(1.0, 0.008);
  if (safeDur > 0.06) {
    gain.gain.setValueAtTime(1.0, safeDur - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, safeDur);
  }
  src.connect(gain).connect(offline.destination);
  src.start(0, safeStart, safeDur);
  return offline.startRendering();
}

export async function renderDiscoverSampleSlice(
  style: 'afro' | 'house' | 'trap',
  bpm: number,
  startSec = 0,
  durationSec = 1.5
): Promise<AudioBuffer> {
  const full = await renderGrooveBuffer(style, bpm, 2);
  return sliceAudioBuffer(full, startSec, durationSec);
}

// Compact 22050Hz mono 16-bit WAV base64 encoder (~88KB for 2s) for Firestore persistence
export async function encodeAudioBufferSliceToBase64Wav(
  source: AudioBuffer,
  startSec = 0,
  maxDurationSec = 1.8
): Promise<string> {
  const targetRate = 22050;
  const safeStart = Math.max(0, Math.min(Math.max(0, source.duration - 0.1), startSec));
  const safeDur = Math.max(0.15, Math.min(maxDurationSec, source.duration - safeStart));
  const frameCount = Math.max(1, Math.floor(safeDur * targetRate));
  const offline = new OfflineAudioContext(1, frameCount, targetRate);
  const src = offline.createBufferSource();
  src.buffer = source;
  const gain = offline.createGain();
  gain.gain.setValueAtTime(0.001, 0);
  gain.gain.linearRampToValueAtTime(1.0, 0.008);
  if (safeDur > 0.06) {
    gain.gain.setValueAtTime(1.0, safeDur - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, safeDur);
  }
  src.connect(gain).connect(offline.destination);
  src.start(0, safeStart, safeDur);
  const resampled = await offline.startRendering();

  const wavBlob = audioBufferToWavBlob(resampled);
  const bytes = new Uint8Array(await wavBlob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function decodeBase64WavToBuffer(
  ctx: BaseAudioContext,
  base64: string
): Promise<AudioBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return ctx.decodeAudioData(bytes.buffer.slice(0));
}

// Convert AudioBuffer -> standard 16-bit PCM WAV Blob
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, length, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Analyze vocal AudioBuffer for peak onset timestamps (used by Voice Alignment AI)
export function detectVocalOnsetsMs(buffer: AudioBuffer): number[] {
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.04); // 40ms frames
  const onsets: number[] = [];
  let prevRms = 0;

  for (let i = 0; i < channel.length; i += windowSize) {
    let sum = 0;
    const end = Math.min(i + windowSize, channel.length);
    for (let j = i; j < end; j++) {
      sum += channel[j] * channel[j];
    }
    const rms = Math.sqrt(sum / Math.max(1, end - i));
    if (rms > 0.04 && rms > prevRms * 1.45) {
      const ms = Math.round((i / sampleRate) * 1000);
      if (onsets.length === 0 || ms - onsets[onsets.length - 1] > 180) {
        onsets.push(ms);
      }
    }
    prevRms = rms * 0.7 + prevRms * 0.3;
    if (onsets.length >= 24) break;
  }
  return onsets;
}

export type BeatSignature = '2/4' | '3/4' | '4/4' | '5/4' | '6/8';

export const BEAT_SIGNATURE_CONFIG: Record<
  BeatSignature,
  { beatsPerMeasure: number; subdivisionFactor: number; label: string }
> = {
  '2/4': { beatsPerMeasure: 2, subdivisionFactor: 1, label: '2/4' },
  '3/4': { beatsPerMeasure: 3, subdivisionFactor: 1, label: '3/4' },
  '4/4': { beatsPerMeasure: 4, subdivisionFactor: 1, label: '4/4' },
  '5/4': { beatsPerMeasure: 5, subdivisionFactor: 1, label: '5/4' },
  '6/8': { beatsPerMeasure: 6, subdivisionFactor: 0.5, label: '6/8' },
};

export function triggerMetronomeClick(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  isDownbeat: boolean,
  gainAmount = 0.55
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = isDownbeat ? 'triangle' : 'sine';
  const startFreq = isDownbeat ? 1760 : 840;
  const endFreq = isDownbeat ? 1180 : 600;
  const duration = isDownbeat ? 0.056 : 0.032;
  const peakGain = isDownbeat ? Math.min(1, gainAmount * 1.45) : gainAmount * 0.65;

  osc.frequency.setValueAtTime(startFreq, when);
  osc.frequency.exponentialRampToValueAtTime(endFreq, when + duration);

  gain.gain.setValueAtTime(0.001, when);
  gain.gain.linearRampToValueAtTime(peakGain, when + 0.0025);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

  osc.connect(gain).connect(destination);
  osc.start(when);
  osc.stop(when + duration + 0.005);

  // Distinct upper harmonic chime on beat 1 of the measure
  if (isDownbeat) {
    const overtone = ctx.createOscillator();
    const overtoneGain = ctx.createGain();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(3520, when);
    overtone.frequency.exponentialRampToValueAtTime(2400, when + 0.042);
    overtoneGain.gain.setValueAtTime(0.001, when);
    overtoneGain.gain.linearRampToValueAtTime(peakGain * 0.35, when + 0.002);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
    overtone.connect(overtoneGain).connect(destination);
    overtone.start(when);
    overtone.stop(when + 0.05);
  }
}
