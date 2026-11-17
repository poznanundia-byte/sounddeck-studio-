// Offline & Real-Time AudioBuffer DSP Operations for the Wavacity-Style Multitrack DAW
import { createTrackEffectChain, type TrackEffectsState } from './effectRackNodes';

export function cloneAudioBuffer(ctx: BaseAudioContext, source: AudioBuffer): AudioBuffer {
  const copy = ctx.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    copy.getChannelData(ch).set(source.getChannelData(ch));
  }
  return copy;
}

export function extractBufferRange(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const sr = source.sampleRate;
  const startSample = Math.max(0, Math.min(source.length - 1, Math.floor(startSec * sr)));
  const endSample = Math.max(startSample + 1, Math.min(source.length, Math.floor(endSec * sr)));
  const len = endSample - startSample;
  const out = ctx.createBuffer(source.numberOfChannels, len, sr);
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    out.getChannelData(ch).set(source.getChannelData(ch).subarray(startSample, endSample));
  }
  return out;
}

export function deleteBufferRange(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer | null {
  const sr = source.sampleRate;
  const s0 = Math.max(0, Math.min(source.length, Math.floor(startSec * sr)));
  const s1 = Math.max(s0, Math.min(source.length, Math.floor(endSec * sr)));
  const cutLen = s1 - s0;
  if (cutLen <= 0) return cloneAudioBuffer(ctx, source);
  const newLen = source.length - cutLen;
  if (newLen < 64) return null;

  const out = ctx.createBuffer(source.numberOfChannels, newLen, sr);
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const src = source.getChannelData(ch);
    const dst = out.getChannelData(ch);
    if (s0 > 0) dst.set(src.subarray(0, s0), 0);
    if (s1 < source.length) dst.set(src.subarray(s1), s0);
  }
  return out;
}

export function trimBufferToRange(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  return extractBufferRange(ctx, source, startSec, endSec);
}

export function insertBufferAtSec(
  ctx: BaseAudioContext,
  target: AudioBuffer | null,
  clip: AudioBuffer,
  atSec: number
): AudioBuffer {
  if (!target) return cloneAudioBuffer(ctx, clip);
  const sr = target.sampleRate;
  const pos = Math.max(0, Math.min(target.length, Math.floor(atSec * sr)));
  const channels = Math.max(target.numberOfChannels, clip.numberOfChannels);
  const newLen = target.length + clip.length;
  const out = ctx.createBuffer(channels, newLen, sr);

  for (let ch = 0; ch < channels; ch++) {
    const tData = target.getChannelData(Math.min(ch, target.numberOfChannels - 1));
    const cData = clip.getChannelData(Math.min(ch, clip.numberOfChannels - 1));
    const dst = out.getChannelData(ch);
    if (pos > 0) dst.set(tData.subarray(0, pos), 0);
    dst.set(cData, pos);
    if (pos < target.length) dst.set(tData.subarray(pos), pos + clip.length);
  }
  return out;
}

export function silenceBufferRange(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const out = cloneAudioBuffer(ctx, source);
  const sr = out.sampleRate;
  const s0 = Math.max(0, Math.floor(startSec * sr));
  const s1 = Math.min(out.length, Math.floor(endSec * sr));
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    out.getChannelData(ch).fill(0, s0, s1);
  }
  return out;
}

export function applyFadeRange(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number,
  direction: 'in' | 'out'
): AudioBuffer {
  const out = cloneAudioBuffer(ctx, source);
  const sr = out.sampleRate;
  const s0 = Math.max(0, Math.floor(startSec * sr));
  const s1 = Math.min(out.length, Math.floor(endSec * sr));
  const len = Math.max(1, s1 - s0);
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const data = out.getChannelData(ch);
    for (let i = s0; i < s1; i++) {
      const progress = (i - s0) / len;
      const factor = direction === 'in' ? progress : 1 - progress;
      data[i] *= factor;
    }
  }
  return out;
}

export function applyReverseRange(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const out = cloneAudioBuffer(ctx, source);
  const sr = out.sampleRate;
  const s0 = Math.max(0, Math.floor(startSec * sr));
  const s1 = Math.min(out.length, Math.floor(endSec * sr));
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const data = out.getChannelData(ch);
    let left = s0;
    let right = s1 - 1;
    while (left < right) {
      const tmp = data[left];
      data[left] = data[right];
      data[right] = tmp;
      left++;
      right--;
    }
  }
  return out;
}

export function applyInvertRange(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const out = cloneAudioBuffer(ctx, source);
  const sr = out.sampleRate;
  const s0 = Math.max(0, Math.floor(startSec * sr));
  const s1 = Math.min(out.length, Math.floor(endSec * sr));
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const data = out.getChannelData(ch);
    for (let i = s0; i < s1; i++) {
      data[i] = -data[i];
    }
  }
  return out;
}

export function applyNormalizeOrAmplify(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number,
  mode: 'normalize' | 'amplify',
  gainDb = 3
): AudioBuffer {
  const out = cloneAudioBuffer(ctx, source);
  const sr = out.sampleRate;
  const s0 = Math.max(0, Math.floor(startSec * sr));
  const s1 = Math.min(out.length, Math.floor(endSec * sr));

  let multiplier = Math.pow(10, gainDb / 20);
  if (mode === 'normalize') {
    let maxPeak = 0;
    for (let ch = 0; ch < out.numberOfChannels; ch++) {
      const data = out.getChannelData(ch);
      for (let i = s0; i < s1; i++) {
        const v = Math.abs(data[i]);
        if (v > maxPeak) maxPeak = v;
      }
    }
    const targetPeak = Math.pow(10, -1 / 20); // -1 dBFS ceiling
    multiplier = maxPeak > 0.0001 ? targetPeak / maxPeak : 1;
  }

  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const data = out.getChannelData(ch);
    for (let i = s0; i < s1; i++) {
      data[i] = Math.max(-1, Math.min(1, data[i] * multiplier));
    }
  }
  return out;
}

export async function applyEchoToRange(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number,
  delaySec = 0.26,
  feedback = 0.35
): Promise<AudioBuffer> {
  const out = cloneAudioBuffer(ctx, source);
  const sr = out.sampleRate;
  const s0 = Math.max(0, Math.floor(startSec * sr));
  const s1 = Math.min(out.length, Math.floor(endSec * sr));
  const sliceLen = s1 - s0;
  if (sliceLen <= 0) return out;

  const offline = new OfflineAudioContext(out.numberOfChannels, sliceLen, sr);
  const srcBuf = offline.createBuffer(out.numberOfChannels, sliceLen, sr);
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    srcBuf.getChannelData(ch).set(out.getChannelData(ch).subarray(s0, s1));
  }

  const srcNode = offline.createBufferSource();
  srcNode.buffer = srcBuf;
  const delayNode = offline.createDelay(1.0);
  delayNode.delayTime.value = delaySec;
  const fbGain = offline.createGain();
  fbGain.gain.value = feedback;

  srcNode.connect(offline.destination);
  srcNode.connect(delayNode);
  delayNode.connect(fbGain);
  fbGain.connect(delayNode);
  delayNode.connect(offline.destination);

  srcNode.start(0);
  const processed = await offline.startRendering();
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const dst = out.getChannelData(ch);
    const pData = processed.getChannelData(ch);
    for (let i = 0; i < sliceLen; i++) {
      dst[s0 + i] = Math.max(-1, Math.min(1, pData[i]));
    }
  }
  return out;
}

export async function applyEqToRange(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number,
  filterType: BiquadFilterType,
  frequency: number,
  gainDb: number
): Promise<AudioBuffer> {
  const out = cloneAudioBuffer(ctx, source);
  const sr = out.sampleRate;
  const s0 = Math.max(0, Math.floor(startSec * sr));
  const s1 = Math.min(out.length, Math.floor(endSec * sr));
  const sliceLen = s1 - s0;
  if (sliceLen <= 0) return out;

  const offline = new OfflineAudioContext(out.numberOfChannels, sliceLen, sr);
  const srcBuf = offline.createBuffer(out.numberOfChannels, sliceLen, sr);
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    srcBuf.getChannelData(ch).set(out.getChannelData(ch).subarray(s0, s1));
  }

  const srcNode = offline.createBufferSource();
  srcNode.buffer = srcBuf;
  const filter = offline.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.gain.value = gainDb;

  srcNode.connect(filter).connect(offline.destination);
  srcNode.start(0);
  const processed = await offline.startRendering();
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const dst = out.getChannelData(ch);
    const pData = processed.getChannelData(ch);
    for (let i = 0; i < sliceLen; i++) {
      dst[s0 + i] = Math.max(-1, Math.min(1, pData[i]));
    }
  }
  return out;
}

export function generateSynthesizedClip(
  ctx: BaseAudioContext,
  kind: 'sine' | 'chirp' | 'noise' | 'silence',
  durationSec = 2.0,
  freqHz = 440,
  amplitude = 0.65
): AudioBuffer {
  const sr = ctx.sampleRate || 44100;
  const len = Math.max(1, Math.floor(sr * durationSec));
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let val = 0;
      if (kind === 'sine') {
        val = Math.sin(2 * Math.PI * freqHz * t) * amplitude;
      } else if (kind === 'chirp') {
        const instFreq = freqHz + (880 - freqHz) * (i / len);
        val = Math.sin(2 * Math.PI * instFreq * t) * amplitude;
      } else if (kind === 'noise') {
        val = (Math.random() * 2 - 1) * (amplitude * 0.45);
      }
      data[i] = val;
    }
  }
  return buf;
}

export interface MixdownTrackInput {
  buffer: AudioBuffer | null;
  offsetSec: number;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  rate: number;
  effects?: TrackEffectsState;
}

export async function mixdownMultitrackToBuffer(
  tracks: MixdownTrackInput[],
  sampleRate = 44100
): Promise<AudioBuffer | null> {
  const anySolo = tracks.some((t) => t.solo);
  const playable = tracks.filter((t) => t.buffer && !t.muted && (!anySolo || t.solo));
  if (playable.length === 0) return null;

  const extraTail = playable.reduce((maxTail, t) => {
    if (!t.effects || t.effects.bypassAll) return maxTail;
    const revTail = t.effects.reverb.enabled ? Math.min(3.5, t.effects.reverb.decaySec * 0.85) : 0;
    const delTail = t.effects.delay.enabled ? Math.min(2.0, t.effects.delay.timeSec * 3) : 0;
    return Math.max(maxTail, revTail, delTail);
  }, 0.25);

  const totalDur = Math.max(
    1,
    ...playable.map((t) => t.offsetSec + t.buffer!.duration / Math.max(0.25, t.rate))
  );
  const offline = new OfflineAudioContext(2, Math.ceil((totalDur + extraTail) * sampleRate), sampleRate);

  playable.forEach((track) => {
    const src = offline.createBufferSource();
    src.buffer = track.buffer!;
    src.playbackRate.value = track.rate;

    const gain = offline.createGain();
    gain.gain.value = Math.pow(10, track.gainDb / 20);

    const panner = offline.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, track.pan));

    src.connect(gain).connect(panner);

    if (track.effects && !track.effects.bypassAll) {
      const fxChain = createTrackEffectChain(offline, track.effects);
      panner.connect(fxChain.input);
      fxChain.output.connect(offline.destination);
    } else {
      panner.connect(offline.destination);
    }

    src.start(Math.max(0, track.offsetSec));
  });

  return offline.startRendering();
}

// =========================================================================
// AI Vocal Studio Polish & Auto-Alignment Engine
// Specifically engineered for vocals with background noise, hoarse/bass timbre,
// off-pitch singing, and timing alignment with instrumentals (e.g. "Time" by Toxic Lyrikali)
// =========================================================================

export interface VocalPolishOptions {
  denoise: boolean;
  denoiseThresholdDb?: number; // default -40 dB
  clarifyHoarseVoice: boolean; // low-mid de-mud (-5dB @ 240Hz), presence (+5dB @ 3.4kHz), air (+3.5dB @ 10kHz)
  autoTune: boolean;
  scale?: 'A minor' | 'C major' | 'D minor' | 'G major' | 'Chromatic';
  tuneSpeed?: number; // 0.1 (subtle) to 1.0 (hard-tune)
  beatAlign: boolean;
  bpm?: number; // e.g. 112 for "Time" by Toxic Lyrikali
  normalizeVolume: boolean;
}

// 1. Remove background noise, mic rumble & room hiss using highpass + smooth-knee noise gate
export async function applyVocalDenoiseAndGate(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  gateThresholdDb = -40
): Promise<AudioBuffer> {
  const sr = source.sampleRate;
  const numCh = source.numberOfChannels;
  const len = source.length;

  // Step A: Steep 85Hz High-Pass Rumble Filter via OfflineAudioContext
  const offline = new OfflineAudioContext(numCh, len, sr);
  const srcNode = offline.createBufferSource();
  srcNode.buffer = source;

  const hpFilter = offline.createBiquadFilter();
  hpFilter.type = 'highpass';
  hpFilter.frequency.value = 85;
  hpFilter.Q.value = 0.707;

  // 2nd stage highpass for 24dB/oct rumble attenuation
  const hpFilter2 = offline.createBiquadFilter();
  hpFilter2.type = 'highpass';
  hpFilter2.frequency.value = 75;
  hpFilter2.Q.value = 0.707;

  srcNode.connect(hpFilter);
  hpFilter.connect(hpFilter2);
  hpFilter2.connect(offline.destination);
  srcNode.start(0);

  const filtered = await offline.startRendering();

  // Step B: Soft-Knee Expander Noise Gate to eliminate room hiss between phrases
  const out = cloneAudioBuffer(ctx, filtered);
  const thresholdLinear = Math.pow(10, gateThresholdDb / 20);
  const windowSize = Math.max(16, Math.floor(sr * 0.015)); // 15ms analysis windows
  const attackCoeff = Math.exp(-1 / (sr * 0.008)); // 8ms attack
  const releaseCoeff = Math.exp(-1 / (sr * 0.09)); // 90ms release

  for (let ch = 0; ch < numCh; ch++) {
    const data = out.getChannelData(ch);
    let gateGain = 1.0;

    for (let i = 0; i < len; i += windowSize) {
      const end = Math.min(i + windowSize, len);
      let sumSq = 0;
      for (let j = i; j < end; j++) {
        sumSq += data[j] * data[j];
      }
      const rms = Math.sqrt(sumSq / Math.max(1, end - i));

      // Calculate target gate gain (smooth knee)
      let targetGain = 1.0;
      if (rms < thresholdLinear * 0.4) {
        targetGain = 0.04; // -28 dB attenuation in silent pauses
      } else if (rms < thresholdLinear) {
        const ratio = (rms - thresholdLinear * 0.4) / (thresholdLinear * 0.6);
        targetGain = 0.04 + 0.96 * Math.max(0, Math.min(1, ratio));
      }

      // Smooth envelope over window
      for (let j = i; j < end; j++) {
        if (targetGain < gateGain) {
          gateGain = releaseCoeff * gateGain + (1 - releaseCoeff) * targetGain;
        } else {
          gateGain = attackCoeff * gateGain + (1 - attackCoeff) * targetGain;
        }
        data[j] *= gateGain;
      }
    }
  }

  return out;
}

// 2. Clarity & De-Mud for Hoarse / Bass Vocals (Presence, Air, Mud Scoop, Dynamic Levelling)
export async function applyHoarseVocalClarifier(
  ctx: BaseAudioContext,
  source: AudioBuffer
): Promise<AudioBuffer> {
  const sr = source.sampleRate;
  const numCh = source.numberOfChannels;
  const len = source.length;

  const offline = new OfflineAudioContext(numCh, len, sr);
  const srcNode = offline.createBufferSource();
  srcNode.buffer = source;

  // Band 1: Scoop muddy chest buildup (230Hz - 260Hz) where hoarse/bass voices resonate
  const mudFilter = offline.createBiquadFilter();
  mudFilter.type = 'peaking';
  mudFilter.frequency.value = 240;
  mudFilter.Q.value = 1.3;
  mudFilter.gain.value = -5.0; // -5 dB de-mud

  // Band 2: Clean up nasal / lower-mid throat congestion (460Hz)
  const throatFilter = offline.createBiquadFilter();
  throatFilter.type = 'peaking';
  throatFilter.frequency.value = 460;
  throatFilter.Q.value = 1.4;
  throatFilter.gain.value = -2.5;

  // Band 3: Vocal Presence & Diction boost (3.4kHz) - makes every word intelligible
  const presenceFilter = offline.createBiquadFilter();
  presenceFilter.type = 'peaking';
  presenceFilter.frequency.value = 3400;
  presenceFilter.Q.value = 1.0;
  presenceFilter.gain.value = 5.0; // +5 dB clarity

  // Band 4: Vocal Air & High-End Sheen (10.5kHz high-shelf) for modern pro sheen
  const airFilter = offline.createBiquadFilter();
  airFilter.type = 'highshelf';
  airFilter.frequency.value = 10500;
  airFilter.gain.value = 3.5; // +3.5 dB air

  // Band 5: Gentle De-Esser Notch (7.0kHz) to prevent harsh sibilance
  const deEssFilter = offline.createBiquadFilter();
  deEssFilter.type = 'peaking';
  deEssFilter.frequency.value = 7000;
  deEssFilter.Q.value = 2.8;
  deEssFilter.gain.value = -3.0;

  // Connect EQ chain
  srcNode.connect(mudFilter);
  mudFilter.connect(throatFilter);
  throatFilter.connect(presenceFilter);
  presenceFilter.connect(airFilter);
  airFilter.connect(deEssFilter);
  deEssFilter.connect(offline.destination);

  srcNode.start(0);
  const eqRendered = await offline.startRendering();

  // Gentle transparent dynamic leveler / vocal compressor
  const out = cloneAudioBuffer(ctx, eqRendered);
  for (let ch = 0; ch < numCh; ch++) {
    const data = out.getChannelData(ch);
    // Find peak
    let max = 0;
    for (let i = 0; i < len; i++) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
    // Transparent soft-clip / leveler
    const targetCeiling = 0.88;
    const gainFactor = max > 0.05 ? Math.min(2.2, targetCeiling / max) : 1.0;
    for (let i = 0; i < len; i++) {
      let sample = data[i] * gainFactor;
      // Soft saturation curve for warmth
      if (sample > 0.9) sample = 0.9 + 0.1 * Math.tanh((sample - 0.9) * 4);
      else if (sample < -0.9) sample = -0.9 + 0.1 * Math.tanh((sample + 0.9) * 4);
      data[i] = sample;
    }
  }

  return out;
}

// 3. Auto-Tune Pitch Correction (Autocorrelation fundamental detection & scale snapping)
const SCALE_SEMITONES: Record<string, number[]> = {
  'A minor': [9, 11, 0, 2, 4, 5, 7], // A, B, C, D, E, F, G (Key of "Time" by Toxic Lyrikali!)
  'C major': [0, 2, 4, 5, 7, 9, 11],
  'D minor': [2, 4, 5, 7, 9, 10, 0],
  'G major': [7, 9, 11, 0, 2, 4, 6],
  'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// Autocorrelation pitch estimator
function detectFundamentalFreq(
  buffer: Float32Array,
  start: number,
  len: number,
  sampleRate: number
): number | null {
  const minLag = Math.floor(sampleRate / 800); // 800 Hz max vocal frequency
  const maxLag = Math.floor(sampleRate / 65);  // 65 Hz min vocal frequency (deep bass)

  let bestLag = -1;
  let maxCorr = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    let norm1 = 0;
    let norm2 = 0;
    const end = Math.min(start + len - lag, buffer.length - lag);
    for (let i = start; i < end; i += 2) {
      const a = buffer[i];
      const b = buffer[i + lag];
      corr += a * b;
      norm1 += a * a;
      norm2 += b * b;
    }
    const denom = Math.sqrt(norm1 * norm2);
    const normalizedCorr = denom > 0.0001 ? corr / denom : 0;
    if (normalizedCorr > 0.55 && normalizedCorr > maxCorr) {
      maxCorr = normalizedCorr;
      bestLag = lag;
    }
  }

  if (bestLag > 0 && maxCorr > 0.58) {
    return sampleRate / bestLag;
  }
  return null;
}

function findNearestScalePitch(freq: number, scaleName: string): number {
  const validNotes = SCALE_SEMITONES[scaleName] || SCALE_SEMITONES['A minor'];
  const midi = 12 * Math.log2(freq / 440) + 69;
  const currentNote = Math.round(midi);
  const currentOctave = Math.floor(currentNote / 12);
  const semitoneInOctave = ((currentNote % 12) + 12) % 12;

  // Find closest note in scale
  let minDiff = 999;
  let targetNote = currentNote;
  for (const scaleSemi of validNotes) {
    const candidateMidi = currentOctave * 12 + scaleSemi;
    const diff = Math.abs(candidateMidi - midi);
    if (diff < minDiff) {
      minDiff = diff;
      targetNote = candidateMidi;
    }
    // Check adjacent octave if near boundary
    const candAbove = (currentOctave + 1) * 12 + scaleSemi;
    if (Math.abs(candAbove - midi) < minDiff) {
      minDiff = Math.abs(candAbove - midi);
      targetNote = candAbove;
    }
  }

  return 440 * Math.pow(2, (targetNote - 69) / 12);
}

export async function applyVocalAutoTune(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  scale: 'A minor' | 'C major' | 'D minor' | 'G major' | 'Chromatic' = 'A minor',
  tuneSpeed = 0.85
): Promise<AudioBuffer> {
  const sr = source.sampleRate;
  const numCh = source.numberOfChannels;
  const len = source.length;
  const out = cloneAudioBuffer(ctx, source);

  const frameSize = 2048;
  const hopSize = 512;
  const monoData = source.getChannelData(0);

  // Pitch-shift voiced frames towards closest note in scale
  for (let ch = 0; ch < numCh; ch++) {
    const dst = out.getChannelData(ch);
    for (let i = 0; i < len - frameSize; i += hopSize) {
      const f0 = detectFundamentalFreq(monoData, i, frameSize, sr);
      if (f0 && f0 >= 65 && f0 <= 800) {
        const targetFreq = findNearestScalePitch(f0, scale);
        const pitchRatio = targetFreq / f0;
        // Interpolate ratio based on tuneSpeed (natural vs hard auto-tune)
        const effectiveRatio = 1 + (pitchRatio - 1) * Math.max(0.2, Math.min(1.0, tuneSpeed));

        // Resample frame with pitch correction factor
        const safeWindow = Math.min(hopSize, len - i);
        for (let j = 0; j < safeWindow; j++) {
          const readOffset = j * effectiveRatio;
          const idx0 = Math.floor(i + readOffset);
          const idx1 = Math.min(len - 1, idx0 + 1);
          const frac = readOffset - Math.floor(readOffset);
          if (idx0 < len) {
            const interpolated = dst[idx0] * (1 - frac) + dst[idx1] * frac;
            // Crossfade into destination
            dst[i + j] = dst[i + j] * 0.25 + interpolated * 0.75;
          }
        }
      }
    }
  }

  return out;
}

// 4. Beat & Instrumental Alignment (Snaps vocal phrase attacks to project beat grid)
export function alignVocalToBeats(
  buffer: AudioBuffer,
  currentOffsetSec: number,
  bpm = 112,
  toleranceSec = 1.2
): {
  newOffsetSec: number;
  shiftMs: number;
  alignedBeat: number;
  firstVocalOnsetSec: number;
} {
  const sr = buffer.sampleRate;
  const channel = buffer.getChannelData(0);
  const frameSize = Math.floor(sr * 0.025); // 25ms frames
  let firstOnsetInClipSec = 0;

  // Energy derivative onset detection to find the exact attack of the first vocal word
  let prevEnergy = 0;
  for (let i = 0; i < channel.length - frameSize; i += frameSize) {
    let energy = 0;
    for (let j = 0; j < frameSize; j++) {
      energy += Math.abs(channel[i + j]);
    }
    energy /= frameSize;
    if (energy > 0.035 && energy > prevEnergy * 1.6) {
      firstOnsetInClipSec = i / sr;
      break;
    }
    prevEnergy = energy * 0.7 + prevEnergy * 0.3;
  }

  const secondsPerBeat = 60 / Math.max(40, Math.min(240, bpm));
  const absoluteOnsetSec = currentOffsetSec + firstOnsetInClipSec;

  // Find closest beat grid position
  const nearestBeatIdx = Math.round(absoluteOnsetSec / secondsPerBeat);
  const targetBeatSec = nearestBeatIdx * secondsPerBeat;
  const deltaSec = targetBeatSec - absoluteOnsetSec;

  let newOffsetSec = currentOffsetSec;
  // If difference is within tolerance window, snap to beat
  if (Math.abs(deltaSec) <= toleranceSec) {
    newOffsetSec = Math.max(0, currentOffsetSec + deltaSec);
  }

  const shiftMs = Math.round((newOffsetSec - currentOffsetSec) * 1000);

  return {
    newOffsetSec: Number(newOffsetSec.toFixed(3)),
    shiftMs,
    alignedBeat: nearestBeatIdx + 1,
    firstVocalOnsetSec: Number(firstOnsetInClipSec.toFixed(2)),
  };
}

// 5. Full Vocal Mastering Pipeline: Denoise + Clarify/De-Mud + Auto-Tune + Beat Alignment
export async function runVocalMasteringPipeline(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  currentOffsetSec: number,
  options: VocalPolishOptions
): Promise<{
  processedBuffer: AudioBuffer;
  newOffsetSec: number;
  summary: string;
}> {
  let buf = cloneAudioBuffer(ctx, source);
  const logSteps: string[] = [];

  // Step 1: Remove background noise & mic rumble
  if (options.denoise) {
    buf = await applyVocalDenoiseAndGate(ctx, buf, options.denoiseThresholdDb ?? -40);
    logSteps.push('Noise & rumble removed (-28dB room gate)');
  }

  // Step 2: Clarify hoarse / heavy bass voice (de-mud, presence, air, leveler)
  if (options.clarifyHoarseVoice) {
    buf = await applyHoarseVocalClarifier(ctx, buf);
    logSteps.push('Hoarse bass de-muddled (-5dB @ 240Hz, +5dB clarity @ 3.4kHz)');
  }

  // Step 3: Pitch Correction / Auto-Tune
  if (options.autoTune) {
    const scale = options.scale || 'A minor';
    buf = await applyVocalAutoTune(ctx, buf, scale, options.tuneSpeed ?? 0.85);
    logSteps.push(`Pitch auto-tuned to ${scale}`);
  }

  // Step 4: Beat & Instrumental Grid Alignment
  let newOffset = currentOffsetSec;
  if (options.beatAlign) {
    const bpm = options.bpm || 112;
    const alignResult = alignVocalToBeats(buf, currentOffsetSec, bpm);
    newOffset = alignResult.newOffsetSec;
    if (Math.abs(alignResult.shiftMs) > 5) {
      logSteps.push(`Beat-aligned (${alignResult.shiftMs > 0 ? '+' : ''}${alignResult.shiftMs}ms to Beat ${alignResult.alignedBeat} @ ${bpm} BPM)`);
    } else {
      logSteps.push(`Beat-locked on Beat ${alignResult.alignedBeat} @ ${bpm} BPM`);
    }
  }

  // Step 5: Master Volume Normalization
  if (options.normalizeVolume) {
    buf = applyNormalizeOrAmplify(ctx, buf, 0, buf.duration, 'normalize');
    logSteps.push('Normalized to -1 dBFS');
  }

  const summary = logSteps.length > 0 ? logSteps.join(' · ') : 'Vocal polish completed.';
  return {
    processedBuffer: buf,
    newOffsetSec: newOffset,
    summary,
  };
}

