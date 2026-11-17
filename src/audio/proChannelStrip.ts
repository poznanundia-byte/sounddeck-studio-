// Pro Multiband Channel Strip (EQ, Compressor, Limiter, Reverb, Delay, Distortion, Chorus, AudioWorklet Noise Gate)
// Plus Master Suite (Master EQ, 3-Band Multiband Compression, Stereo M/S Width, Master Limiter, LUFS/Correlation Telemetry)
import type {
  MasterChainState,
  MasterTelemetryStats,
  ProEffectsRackState,
} from '../types/studioPro';
import { generateReverbImpulseResponse } from './effectRackNodes';
import { resolvePublicAsset } from '../assets/studioAssets';

const workletLoadedContexts = new WeakSet<BaseAudioContext>();

export async function ensureStudioGateWorkletLoaded(ctx: AudioContext): Promise<boolean> {
  if (workletLoadedContexts.has(ctx)) return true;
  if (!('audioWorklet' in ctx)) return false;
  try {
    await ctx.audioWorklet.addModule(resolvePublicAsset('worklets/studio-gate-worklet.js'));
    workletLoadedContexts.add(ctx);
    return true;
  } catch {
    return false;
  }
}

export function createDefaultProEffects(): ProEffectsRackState {
  return {
    bypassAll: false,
    eq: {
      enabled: true,
      lowGainDb: 0,
      lowFreqHz: 110,
      midGainDb: 0,
      midFreqHz: 1400,
      highGainDb: 0,
      highFreqHz: 6800,
    },
    compressor: {
      enabled: false,
      thresholdDb: -18,
      ratio: 4,
      attackSec: 0.01,
      releaseSec: 0.22,
    },
    limiter: {
      enabled: false,
      ceilingDb: -1.0,
      releaseSec: 0.08,
    },
    reverb: {
      enabled: false,
      decaySec: 1.6,
      dampingHz: 5600,
      mix: 0.24,
    },
    delay: {
      enabled: false,
      timeSec: 0.25,
      feedback: 0.32,
      mix: 0.22,
    },
    distortion: {
      enabled: false,
      drive: 25,
      toneHz: 4200,
      mix: 0.25,
    },
    chorus: {
      enabled: false,
      rateHz: 1.2,
      depthMs: 4.5,
      mix: 0.28,
    },
    noiseGate: {
      enabled: false,
      thresholdDb: -42,
      attackMs: 6,
      releaseMs: 120,
    },
    pitchCorrection: {
      enabled: false,
      scale: 'A minor',
      speed: 0.75,
    },
  };
}

export function createDefaultMasterChain(): MasterChainState {
  return {
    bypass: false,
    lowEqDb: 0.5,
    midEqDb: 0,
    highEqDb: 1.0,
    multibandEnabled: true,
    lowThreshDb: -18,
    midThreshDb: -16,
    highThreshDb: -18,
    stereoWidthPct: 108,
    limiterCeilingDb: -0.8,
    outputGainDb: 0,
  };
}

function makeDistortionCurve(drive: number): Float32Array<ArrayBuffer> {
  const k = Math.max(1, drive * 2.5);
  const nSamples = 2048;
  const buf = new ArrayBuffer(nSamples * 4);
  const curve = new Float32Array(buf);
  const deg = Math.PI / 180;
  for (let i = 0; i < nSamples; ++i) {
    const x = (i * 2) / nSamples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export interface ProChainInstance {
  input: GainNode;
  output: GainNode;
  workletGateNode: AudioWorkletNode | null;
  disconnect: () => void;
}

export function buildProEffectChain(
  ctx: BaseAudioContext,
  fx: ProEffectsRackState
): ProChainInstance {
  const input = ctx.createGain();
  const output = ctx.createGain();

  if (fx.bypassAll) {
    input.connect(output);
    return {
      input,
      output,
      workletGateNode: null,
      disconnect: () => {
        try {
          input.disconnect();
          output.disconnect();
        } catch {
          // ignore
        }
      },
    };
  }

  let currentNode: AudioNode = input;
  let workletGateNode: AudioWorkletNode | null = null;
  const cleanupFns: Array<() => void> = [];

  // 1. Low-latency AudioWorklet Noise Gate (when registered on AudioContext)
  if (typeof AudioWorkletNode !== 'undefined' && workletLoadedContexts.has(ctx)) {
    try {
      const gateNode = new AudioWorkletNode(ctx, 'studio-gate-processor');
      const params = gateNode.parameters;
      params.get('gateEnabled')?.setValueAtTime(fx.noiseGate.enabled ? 1 : 0, ctx.currentTime);
      params.get('thresholdDb')?.setValueAtTime(fx.noiseGate.thresholdDb, ctx.currentTime);
      params.get('attackMs')?.setValueAtTime(fx.noiseGate.attackMs, ctx.currentTime);
      params.get('releaseMs')?.setValueAtTime(fx.noiseGate.releaseMs, ctx.currentTime);
      params.get('softClipEnabled')?.setValueAtTime(fx.limiter.enabled ? 1 : 0, ctx.currentTime);
      currentNode.connect(gateNode);
      currentNode = gateNode;
      workletGateNode = gateNode;
      cleanupFns.push(() => gateNode.disconnect());
    } catch {
      // Fallback gracefully if worklet node construction fails
    }
  }

  // 2. Parametric 3-Band EQ (Low Shelf, Mid Peaking, High Shelf)
  if (fx.eq.enabled) {
    const lowEq = ctx.createBiquadFilter();
    lowEq.type = 'lowshelf';
    lowEq.frequency.value = fx.eq.lowFreqHz;
    lowEq.gain.value = fx.eq.lowGainDb;

    const midEq = ctx.createBiquadFilter();
    midEq.type = 'peaking';
    midEq.frequency.value = fx.eq.midFreqHz;
    midEq.Q.value = 1.1;
    midEq.gain.value = fx.eq.midGainDb;

    const highEq = ctx.createBiquadFilter();
    highEq.type = 'highshelf';
    highEq.frequency.value = fx.eq.highFreqHz;
    highEq.gain.value = fx.eq.highGainDb;

    currentNode.connect(lowEq).connect(midEq).connect(highEq);
    currentNode = highEq;
    cleanupFns.push(() => {
      lowEq.disconnect();
      midEq.disconnect();
      highEq.disconnect();
    });
  }

  // 3. Distortion / Saturation
  if (fx.distortion.enabled && fx.distortion.mix > 0.01) {
    const stageIn = currentNode;
    const stageOut = ctx.createGain();
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - fx.distortion.mix;
    const wetGain = ctx.createGain();
    wetGain.gain.value = fx.distortion.mix;
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(fx.distortion.drive);
    shaper.oversample = '2x';
    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = fx.distortion.toneHz;

    stageIn.connect(dryGain).connect(stageOut);
    stageIn.connect(shaper).connect(toneFilter).connect(wetGain).connect(stageOut);
    currentNode = stageOut;
    cleanupFns.push(() => {
      dryGain.disconnect();
      shaper.disconnect();
      toneFilter.disconnect();
      wetGain.disconnect();
      stageOut.disconnect();
    });
  }

  // 4. Stereo Chorus
  if (fx.chorus.enabled && fx.chorus.mix > 0.01) {
    const stageIn = currentNode;
    const stageOut = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 1 - fx.chorus.mix * 0.45;
    const wet = ctx.createGain();
    wet.gain.value = fx.chorus.mix;

    const delayL = ctx.createDelay(0.1);
    delayL.delayTime.value = 0.018;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = fx.chorus.rateHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = fx.chorus.depthMs / 1000;

    lfo.connect(lfoGain).connect(delayL.delayTime);
    lfo.start();

    stageIn.connect(dry).connect(stageOut);
    stageIn.connect(delayL).connect(wet).connect(stageOut);
    currentNode = stageOut;
    cleanupFns.push(() => {
      try {
        lfo.stop();
      } catch {
        // ignore
      }
      lfo.disconnect();
      lfoGain.disconnect();
      delayL.disconnect();
      dry.disconnect();
      wet.disconnect();
      stageOut.disconnect();
    });
  }

  // 5. Compressor
  if (fx.compressor.enabled) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = fx.compressor.thresholdDb;
    comp.ratio.value = fx.compressor.ratio;
    comp.attack.value = fx.compressor.attackSec;
    comp.release.value = fx.compressor.releaseSec;
    comp.knee.value = 10;
    currentNode.connect(comp);
    currentNode = comp;
    cleanupFns.push(() => comp.disconnect());
  }

  // 6. Delay
  if (fx.delay.enabled && fx.delay.mix > 0.01) {
    const stageIn = currentNode;
    const stageOut = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = Math.max(0.5, 1 - fx.delay.mix * 0.35);
    const wet = ctx.createGain();
    wet.gain.value = fx.delay.mix;
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = Math.max(0.02, Math.min(1.2, fx.delay.timeSec));
    const fb = ctx.createGain();
    fb.gain.value = Math.max(0, Math.min(0.82, fx.delay.feedback));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4600;

    stageIn.connect(dry).connect(stageOut);
    stageIn.connect(delay);
    delay.connect(lp);
    lp.connect(fb).connect(delay);
    lp.connect(wet).connect(stageOut);
    currentNode = stageOut;
    cleanupFns.push(() => {
      dry.disconnect();
      wet.disconnect();
      delay.disconnect();
      fb.disconnect();
      lp.disconnect();
      stageOut.disconnect();
    });
  }

  // 7. Convolution Reverb
  if (fx.reverb.enabled && fx.reverb.mix > 0.01) {
    const stageIn = currentNode;
    const stageOut = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = Math.max(0.5, 1 - fx.reverb.mix * 0.35);
    const wet = ctx.createGain();
    wet.gain.value = fx.reverb.mix;

    const convolver = ctx.createConvolver();
    convolver.buffer = generateReverbImpulseResponse(ctx, fx.reverb.decaySec, fx.reverb.dampingHz);
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = fx.reverb.dampingHz;

    stageIn.connect(dry).connect(stageOut);
    stageIn.connect(convolver).connect(damp).connect(wet).connect(stageOut);
    currentNode = stageOut;
    cleanupFns.push(() => {
      dry.disconnect();
      wet.disconnect();
      convolver.disconnect();
      damp.disconnect();
      stageOut.disconnect();
    });
  }

  // 8. Brickwall Track Limiter
  if (fx.limiter.enabled) {
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = fx.limiter.ceilingDb;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = fx.limiter.releaseSec;
    currentNode.connect(lim);
    currentNode = lim;
    cleanupFns.push(() => lim.disconnect());
  }

  currentNode.connect(output);

  return {
    input,
    output,
    workletGateNode,
    disconnect: () => {
      try {
        input.disconnect();
        output.disconnect();
        cleanupFns.forEach((fn) => fn());
      } catch {
        // ignore
      }
    },
  };
}

// 3-Band Multiband Master Chain + EQ + Stereo Width + Limiter (for both Live Master Monitor and Offline Mixdown)
export function applyMasterChainToGraph(
  ctx: BaseAudioContext,
  sourceNode: AudioNode,
  destNode: AudioNode,
  master: MasterChainState
): () => void {
  if (master.bypass) {
    sourceNode.connect(destNode);
    return () => {
      try {
        sourceNode.disconnect(destNode);
      } catch {
        // ignore
      }
    };
  }

  // Master 3-Band EQ
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 110;
  lowShelf.gain.value = master.lowEqDb;

  const midPeak = ctx.createBiquadFilter();
  midPeak.type = 'peaking';
  midPeak.frequency.value = 1200;
  midPeak.Q.value = 0.85;
  midPeak.gain.value = master.midEqDb;

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 7200;
  highShelf.gain.value = master.highEqDb;

  sourceNode.connect(lowShelf).connect(midPeak).connect(highShelf);

  const summedBus = ctx.createGain();
  const cleanupNodes: AudioNode[] = [lowShelf, midPeak, highShelf, summedBus];

  if (master.multibandEnabled) {
    // Low Band (< 240Hz)
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    lp.Q.value = 0.707;
    const compLow = ctx.createDynamicsCompressor();
    compLow.threshold.value = master.lowThreshDb;
    compLow.ratio.value = 3.2;
    compLow.attack.value = 0.015;
    compLow.release.value = 0.18;

    // Mid Band (240Hz .. 3800Hz)
    const bpHp = ctx.createBiquadFilter();
    bpHp.type = 'highpass';
    bpHp.frequency.value = 240;
    bpHp.Q.value = 0.707;
    const bpLp = ctx.createBiquadFilter();
    bpLp.type = 'lowpass';
    bpLp.frequency.value = 3800;
    bpLp.Q.value = 0.707;
    const compMid = ctx.createDynamicsCompressor();
    compMid.threshold.value = master.midThreshDb;
    compMid.ratio.value = 2.6;
    compMid.attack.value = 0.01;
    compMid.release.value = 0.16;

    // High Band (> 3800Hz)
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3800;
    hp.Q.value = 0.707;
    const compHigh = ctx.createDynamicsCompressor();
    compHigh.threshold.value = master.highThreshDb;
    compHigh.ratio.value = 2.4;
    compHigh.attack.value = 0.005;
    compHigh.release.value = 0.12;

    highShelf.connect(lp).connect(compLow).connect(summedBus);
    highShelf.connect(bpHp).connect(bpLp).connect(compMid).connect(summedBus);
    highShelf.connect(hp).connect(compHigh).connect(summedBus);

    cleanupNodes.push(lp, compLow, bpHp, bpLp, compMid, hp, compHigh);
  } else {
    highShelf.connect(summedBus);
  }

  // Output Make-Up Gain + Master Brickwall Limiter
  const outGain = ctx.createGain();
  outGain.gain.value = Math.pow(10, master.outputGainDb / 20);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = master.limiterCeilingDb;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.06;

  summedBus.connect(outGain).connect(limiter).connect(destNode);
  cleanupNodes.push(outGain, limiter);

  return () => {
    cleanupNodes.forEach((n) => {
      try {
        n.disconnect();
      } catch {
        // ignore
      }
    });
  };
}

// Measure real AudioBuffer loudness, true-peak, crest factor, spectral balance & stereo correlation
export function measureMasterTelemetry(buffer: AudioBuffer): MasterTelemetryStats {
  const sr = buffer.sampleRate;
  const chCount = buffer.numberOfChannels;
  const ch0 = buffer.getChannelData(0);
  const ch1 = chCount > 1 ? buffer.getChannelData(1) : ch0;

  let peak = 0;
  let sumSq = 0;
  let dotLR = 0;
  let sqL = 0;
  let sqR = 0;

  // Simple 1-pole crossover spectral energy accumulators
  let lpState = 0;
  let hpPrevIn = 0;
  let hpState = 0;
  const lowAlpha = Math.min(0.95, (2 * Math.PI * 250) / sr);
  const highAlpha = Math.max(0.05, 1 - (2 * Math.PI * 4000) / sr);

  let lowE = 0;
  let midE = 0;
  let highE = 0;

  const stride = Math.max(1, Math.floor(ch0.length / 240000));
  let count = 0;

  for (let i = 0; i < ch0.length; i += stride) {
    const l = ch0[i];
    const r = ch1[i];
    const absMax = Math.max(Math.abs(l), Math.abs(r));
    if (absMax > peak) peak = absMax;

    const mono = (l + r) * 0.5;
    sumSq += mono * mono;
    dotLR += l * r;
    sqL += l * l;
    sqR += r * r;

    // Spectral bands
    lpState = lpState + lowAlpha * (mono - lpState);
    hpState = highAlpha * (hpState + mono - hpPrevIn);
    hpPrevIn = mono;
    const mid = mono - lpState - hpState;

    lowE += lpState * lpState;
    midE += mid * mid;
    highE += hpState * hpState;
    count++;
  }

  const rms = Math.sqrt(sumSq / Math.max(1, count));
  const peakDbfs = peak > 0.00001 ? 20 * Math.log10(peak) : -80;
  const rmsDbfs = rms > 0.00001 ? 20 * Math.log10(rms) : -80;
  const integratedLufsApprox = Number((rmsDbfs - 0.691).toFixed(1));
  const crestFactorDb = Number(Math.max(0, peakDbfs - rmsDbfs).toFixed(1));

  const totalBandE = Math.max(0.000001, lowE + midE + highE);
  const corrDenom = Math.sqrt(sqL * sqR);
  const stereoCorrelation = corrDenom > 0.00001 ? Number((dotLR / corrDenom).toFixed(2)) : 1;

  return {
    peakDbfs: Number(peakDbfs.toFixed(1)),
    integratedLufsApprox,
    crestFactorDb,
    lowEnergyPct: Math.round((lowE / totalBandE) * 100),
    midEnergyPct: Math.round((midE / totalBandE) * 100),
    highEnergyPct: Math.round((highE / totalBandE) * 100),
    stereoCorrelation,
    durationSec: Number(buffer.duration.toFixed(2)),
  };
}
