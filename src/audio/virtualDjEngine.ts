// Virtual DJ Pro Web Audio Engine: RGB Waveforms, Reverse Cache, Camelot Harmonic Engine,
// Beat-Synced FX, Live VU Analyser, Auto-BPM Estimator & SP-8 Performance Sampler

import { AFRICAN_SOUND_CATALOG, renderAfricanLibraryItemBuffer } from './africanSoundLibrary';
import { renderGrooveBuffer, createNoiseBuffer } from './studioAudio';

export type DeckId = 'A' | 'B';
export type FxTarget = 'A' | 'B' | 'MASTER';
export type FxMode = 'echo' | 'flanger' | 'filter' | 'roll';
export type CrossfaderCurve = 'blend' | 'cut';

export interface WaveformPeakBucket {
  low: number; // 0..1
  mid: number; // 0..1
  high: number; // 0..1
  peak: number; // 0..1
}

export interface DjCrateTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  camelotKey: string;
  durationSec: number;
  origin: 'club' | 'african' | 'offline';
  grooveStyle?: 'afro' | 'house' | 'trap';
  africanId?: string;
  offlineId?: string;
  fallbackUrl?: string;
}

export const CLUB_CRATE_TRACKS: DjCrateTrack[] = [
  {
    id: 'crate-afro-anthem',
    title: 'Afro-Tech Club Anthem',
    artist: 'SoundDeck Residents',
    genre: 'Afro-Tech',
    bpm: 122,
    camelotKey: '8A',
    durationSec: 12,
    origin: 'club',
    grooveStyle: 'afro',
  },
  {
    id: 'crate-tech-house',
    title: 'Peak Hour Tech-House Roller',
    artist: 'Booth 92 Collective',
    genre: 'Tech-House',
    bpm: 126,
    camelotKey: '9A',
    durationSec: 12,
    origin: 'club',
    grooveStyle: 'house',
  },
  {
    id: 'crate-midnight-trap',
    title: 'Afterhours 808 Warehouse',
    artist: 'DJ Vesper',
    genre: 'Trap / Club',
    bpm: 140,
    camelotKey: '8A',
    durationSec: 10,
    origin: 'club',
    grooveStyle: 'trap',
  },
  {
    id: 'crate-lagos-sunset',
    title: 'Lagos Rooftop Percussion',
    artist: 'Kairo & Nala',
    genre: 'Afrobeats',
    bpm: 114,
    camelotKey: '8B',
    durationSec: 12,
    origin: 'club',
    grooveStyle: 'afro',
  },
  ...AFRICAN_SOUND_CATALOG.slice(0, 8).map((item, idx): DjCrateTrack => {
    const keyMap: Record<string, string> = {
      'A minor': '8A',
      'C minor': '5A',
      'C major': '8B',
      'F minor': '4A',
      'G major': '9B',
      'D minor': '7A',
      'G minor': '6A',
    };
    return {
      id: `crate-${item.id}`,
      title: item.title,
      artist: item.regionOrigin,
      genre: item.genre,
      bpm: item.bpm,
      camelotKey: keyMap[item.musicalKey] || `${((idx + 7) % 12) + 1}A`,
      durationSec: item.durationSec,
      origin: 'african',
      africanId: item.id,
    };
  }),
];

export async function renderCrateTrackBuffer(track: DjCrateTrack): Promise<AudioBuffer> {
  if (track.africanId) {
    const asset = AFRICAN_SOUND_CATALOG.find((a) => a.id === track.africanId);
    if (asset) {
      return renderAfricanLibraryItemBuffer(asset);
    }
  }
  return renderGrooveBuffer(track.grooveStyle || 'afro', track.bpm, 6);
}

// WeakMap cache so each AudioBuffer only computes reversed samples once
const reversedBufferCache = new WeakMap<AudioBuffer, AudioBuffer>();

export function getReversedAudioBuffer(ctx: BaseAudioContext, source: AudioBuffer): AudioBuffer {
  const existing = reversedBufferCache.get(source);
  if (existing) return existing;

  const rev = ctx.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const srcData = source.getChannelData(ch);
    const dstData = rev.getChannelData(ch);
    const len = srcData.length;
    for (let i = 0; i < len; i++) {
      dstData[i] = srcData[len - 1 - i];
    }
  }
  reversedBufferCache.set(source, rev);
  return rev;
}

// Compute multi-band RGB waveform peaks for authentic Pioneer/Serato canvas display
const waveformCache = new WeakMap<AudioBuffer, WaveformPeakBucket[]>();

export function computeWaveformPeaks(buffer: AudioBuffer, bucketCount = 420): WaveformPeakBucket[] {
  const cached = waveformCache.get(buffer);
  if (cached && cached.length === bucketCount) return cached;

  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const totalSamples = ch0.length;
  const blockSize = Math.max(1, Math.floor(totalSamples / bucketCount));
  const buckets: WaveformPeakBucket[] = [];

  // Simple 1-pole filters to approximate low / mid / high energy per bucket
  let lpState = 0;
  let prevSample = 0;
  let globalMax = 0.001;

  for (let b = 0; b < bucketCount; b++) {
    const start = b * blockSize;
    const end = Math.min(totalSamples, start + blockSize);
    const step = Math.max(1, Math.floor((end - start) / 48));

    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;
    let peak = 0;
    let count = 0;

    for (let i = start; i < end; i += step) {
      const sample = (ch0[i] + ch1[i]) * 0.5;
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;

      lpState = lpState * 0.86 + sample * 0.14;
      const high = sample - prevSample;
      const mid = sample - lpState - high * 0.45;
      prevSample = sample;

      lowSum += Math.abs(lpState);
      midSum += Math.abs(mid);
      highSum += Math.abs(high);
      count++;
    }

    const inv = count > 0 ? 1 / count : 1;
    const low = lowSum * inv * 1.45;
    const mid = midSum * inv * 1.5;
    const high = highSum * inv * 1.35;
    if (peak > globalMax) globalMax = peak;

    buckets.push({ low, mid, high, peak });
  }

  // Normalize cleanly to [0..1]
  const norm = 1 / Math.max(0.1, globalMax);
  const normalized = buckets.map((bk) => ({
    low: Math.min(1, bk.low * norm * 1.6),
    mid: Math.min(1, bk.mid * norm * 1.7),
    high: Math.min(1, bk.high * norm * 1.7),
    peak: Math.min(1, bk.peak * norm),
  }));

  waveformCache.set(buffer, normalized);
  return normalized;
}

// Fast onset-autocorrelation BPM estimator for uploaded or offline audio
export function estimateAudioBpm(buffer: AudioBuffer, fallbackBpm = 120): number {
  try {
    const data = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const frameSize = Math.floor(sr * 0.02); // 20ms windows (50 Hz envelope)
    const maxFrames = Math.min(Math.floor(data.length / frameSize), 2000); // up to 40s window
    if (maxFrames < 100) return fallbackBpm;

    const env = new Float32Array(maxFrames);
    for (let f = 0; f < maxFrames; f++) {
      let sum = 0;
      const offset = f * frameSize;
      for (let i = 0; i < frameSize; i += 4) {
        const s = data[offset + i];
        sum += s * s;
      }
      env[f] = Math.sqrt(sum / (frameSize / 4));
    }

    // Half-wave rectified flux
    const flux = new Float32Array(maxFrames);
    for (let f = 1; f < maxFrames; f++) {
      flux[f] = Math.max(0, env[f] - env[f - 1]);
    }

    // Check lags corresponding to 80 BPM -> 165 BPM
    const envRate = sr / frameSize;
    const minLag = Math.floor((60 / 165) * envRate);
    const maxLag = Math.ceil((60 / 80) * envRate);

    let bestLag = Math.round((60 / fallbackBpm) * envRate);
    let bestScore = -1;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let score = 0;
      for (let i = 0; i < maxFrames - lag; i++) {
        score += flux[i] * flux[i + lag];
      }
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }

    const bpm = Math.round((60 * envRate) / bestLag);
    if (bpm >= 75 && bpm <= 170) return bpm;
    return fallbackBpm;
  } catch {
    return fallbackBpm;
  }
}

// Camelot Wheel Metadata & Harmonic Compatibility Engine
export const CAMELOT_WHEEL_SEGMENTS: {
  num: number;
  minorKey: string; // e.g., '8A'
  majorKey: string; // e.g., '8B'
  minorNote: string;
  majorNote: string;
}[] = [
  { num: 12, minorKey: '12A', majorKey: '12B', minorNote: 'Dbm', majorNote: 'E' },
  { num: 1, minorKey: '1A', majorKey: '1B', minorNote: 'Abm', majorNote: 'B' },
  { num: 2, minorKey: '2A', majorKey: '2B', minorNote: 'Ebm', majorNote: 'F#' },
  { num: 3, minorKey: '3A', majorKey: '3B', minorNote: 'Bbm', majorNote: 'Db' },
  { num: 4, minorKey: '4A', majorKey: '4B', minorNote: 'Fm', majorNote: 'Ab' },
  { num: 5, minorKey: '5A', majorKey: '5B', minorNote: 'Cm', majorNote: 'Eb' },
  { num: 6, minorKey: '6A', majorKey: '6B', minorNote: 'Gm', majorNote: 'Bb' },
  { num: 7, minorKey: '7A', majorKey: '7B', minorNote: 'Dm', majorNote: 'F' },
  { num: 8, minorKey: '8A', majorKey: '8B', minorNote: 'Am', majorNote: 'C' },
  { num: 9, minorKey: '9A', majorKey: '9B', minorNote: 'Em', majorNote: 'G' },
  { num: 10, minorKey: '10A', majorKey: '10B', minorNote: 'Bm', majorNote: 'D' },
  { num: 11, minorKey: '11A', majorKey: '11B', minorNote: 'F#m', majorNote: 'A' },
];

export function parseCamelotKey(key: string): { num: number; mode: 'A' | 'B' } | null {
  const m = /^(\d{1,2})([AB])$/i.exec(key.trim());
  if (!m) return null;
  const num = Number(m[1]);
  const mode = m[2].toUpperCase() as 'A' | 'B';
  if (num < 1 || num > 12) return null;
  return { num, mode };
}

export function getHarmonicRelation(
  keyA: string,
  keyB: string
): {
  compatible: boolean;
  label: string;
  tier: 'perfect' | 'smooth' | 'energy' | 'clash';
} {
  const a = parseCamelotKey(keyA);
  const b = parseCamelotKey(keyB);
  if (!a || !b) return { compatible: false, label: 'Unanalyzed', tier: 'clash' };

  const diff = (b.num - a.num + 12) % 12;
  if (diff === 0 && a.mode === b.mode) {
    return { compatible: true, label: 'Perfect Key Lock', tier: 'perfect' };
  }
  if (diff === 0 && a.mode !== b.mode) {
    return { compatible: true, label: 'Relative Major/Minor', tier: 'smooth' };
  }
  if ((diff === 1 || diff === 11) && a.mode === b.mode) {
    return { compatible: true, label: 'Smooth ±1 Blend', tier: 'smooth' };
  }
  if ((diff === 2 || diff === 7) && a.mode === b.mode) {
    return { compatible: true, label: `Energy Boost (+${diff})`, tier: 'energy' };
  }
  return { compatible: false, label: 'Key Clash (Use EQ/Filter)', tier: 'clash' };
}

export function stepCamelotKey(key: string, steps: number): string {
  const parsed = parseCamelotKey(key);
  if (!parsed) return '8A';
  const nextNum = ((parsed.num - 1 + steps + 120) % 12) + 1;
  return `${nextNum}${parsed.mode}`;
}

// SP-8 DJ Performance Sampler Bank (All Pure Procedural Web Audio)
export type SamplerDropId =
  | 'airhorn'
  | 'siren'
  | 'sub_drop'
  | 'spinback'
  | 'riser'
  | 'impact'
  | 'rim_roll'
  | 'hype_chord';

export interface SamplerDropPad {
  id: SamplerDropId;
  label: string;
  hotkey: string;
  accent: 'amber' | 'cyan' | 'red';
}

export const SAMPLER_DROP_PADS: SamplerDropPad[] = [
  { id: 'airhorn', label: 'Club Horn', hotkey: '1', accent: 'amber' },
  { id: 'siren', label: 'Dub Siren', hotkey: '2', accent: 'cyan' },
  { id: 'sub_drop', label: '808 Drop', hotkey: '3', accent: 'red' },
  { id: 'spinback', label: 'Spinback', hotkey: '4', accent: 'amber' },
  { id: 'riser', label: 'Tension Rise', hotkey: '5', accent: 'cyan' },
  { id: 'impact', label: 'Boom Hit', hotkey: '6', accent: 'red' },
  { id: 'rim_roll', label: 'Snare Roll', hotkey: '7', accent: 'amber' },
  { id: 'hype_chord', label: 'Stab Chord', hotkey: '8', accent: 'cyan' },
];

export function triggerSamplerDrop(
  ctx: AudioContext,
  destination: AudioNode,
  id: SamplerDropId,
  volume = 0.8
): void {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(volume, now);
  master.connect(destination);

  switch (id) {
    case 'airhorn': {
      [349.23, 440, 523.25].forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq * 0.96, now + 0.45);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(3400, now);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.24, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        osc.connect(lp).connect(g).connect(master);
        osc.start(now);
        osc.stop(now + 0.5);
      });
      break;
    }
    case 'siren': {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(720, now);
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(8, now);
      lfoGain.gain.setValueAtTime(220, now);
      lfo.connect(lfoGain).connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.38, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
      osc.connect(g).connect(master);
      lfo.start(now);
      osc.start(now);
      lfo.stop(now + 0.75);
      osc.stop(now + 0.75);
      break;
    }
    case 'sub_drop': {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.85);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.95, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 1.0);
      break;
    }
    case 'spinback': {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(780, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.16);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.25);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.42);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1250, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
      osc.connect(bp).connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 0.46);
      break;
    }
    case 'riser': {
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, 1.3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.setValueAtTime(4.5, now);
      bp.frequency.setValueAtTime(280, now);
      bp.frequency.exponentialRampToValueAtTime(5200, now + 1.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.04, now);
      g.gain.linearRampToValueAtTime(0.55, now + 1.05);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
      noise.connect(bp).connect(g).connect(master);
      noise.start(now);
      break;
    }
    case 'impact': {
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, 0.7);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1600, now);
      lp.frequency.exponentialRampToValueAtTime(120, now + 0.65);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.6, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
      noise.connect(lp).connect(ng).connect(master);
      noise.start(now);

      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(95, now);
      sub.frequency.exponentialRampToValueAtTime(36, now + 0.45);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.9, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
      sub.connect(sg).connect(master);
      sub.start(now);
      sub.stop(now + 0.55);
      break;
    }
    case 'rim_roll': {
      [0, 0.07, 0.14, 0.21, 0.26, 0.31, 0.36, 0.4].forEach((off, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240 + i * 18, now + off);
        osc.frequency.exponentialRampToValueAtTime(120, now + off + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.32 + i * 0.05, now + off);
        g.gain.exponentialRampToValueAtTime(0.001, now + off + 0.06);
        osc.connect(g).connect(master);
        osc.start(now + off);
        osc.stop(now + off + 0.07);
      });
      break;
    }
    case 'hype_chord': {
      [220, 261.63, 329.63, 440].forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(3200, now);
        lp.frequency.exponentialRampToValueAtTime(650, now + 0.35);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.22, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(lp).connect(g).connect(master);
        osc.start(now);
        osc.stop(now + 0.4);
      });
      break;
    }
  }
}

export function formatDjTime(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function getCrossfaderGains(x: number, curve: CrossfaderCurve): { gainA: number; gainB: number } {
  const clamped = Math.max(0, Math.min(1, x));
  if (curve === 'cut') {
    // Sharp battle/scratch curve: rapid cut near edges, both full in middle
    const gainA = clamped < 0.92 ? (clamped < 0.08 ? 1 : Math.min(1, (1 - clamped) * 1.45)) : 0;
    const gainB = clamped > 0.08 ? (clamped > 0.92 ? 1 : Math.min(1, clamped * 1.45)) : 0;
    return { gainA, gainB };
  }
  // Equal-power sinusoidal blend curve
  return {
    gainA: Math.cos(clamped * Math.PI * 0.5),
    gainB: Math.sin(clamped * Math.PI * 0.5),
  };
}
