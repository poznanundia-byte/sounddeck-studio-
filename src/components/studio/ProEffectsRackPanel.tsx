import { Sliders, Power, RotateCcw } from 'lucide-react';
import type { ProEffectsRackState } from '../../types/studioPro';
import { createDefaultProEffects } from '../../audio/proChannelStrip';

interface ProEffectsRackPanelProps {
  trackName: string;
  effects: ProEffectsRackState;
  pan: number;
  onChangePan: (nextPan: number) => void;
  onChangeEffects: (next: ProEffectsRackState) => void;
}

export function ProEffectsRackPanel({
  trackName,
  effects,
  pan,
  onChangePan,
  onChangeEffects,
}: ProEffectsRackPanelProps) {
  const patch = <K extends keyof ProEffectsRackState>(
    key: K,
    val: Partial<ProEffectsRackState[K]>
  ) => {
    const current = effects[key];
    if (typeof current === 'object' && current !== null) {
      onChangeEffects({
        ...effects,
        [key]: { ...current, ...val },
      });
    }
  };

  return (
    <div className="rounded-xl bg-[#0F1219] border border-slate-800/80 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-purple-400" />
          <div>
            <h4 className="font-display text-sm font-semibold text-slate-100">
              Channel Effects Rack · {trackName}
            </h4>
            <p className="text-[11px] text-slate-400">
              Real-time Web Audio &amp; AudioWorklet DSP chain (active during track playback &amp; mixdown)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#090B10] border border-slate-800 text-xs">
            <span className="text-slate-400">Stereo Pan</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={pan}
              onChange={(e) => onChangePan(Number(e.target.value))}
              className="studio-slider w-20"
            />
            <span className="font-mono text-sky-300 w-10 text-right tabular-nums">
              {pan === 0 ? 'C' : pan < 0 ? `${Math.round(Math.abs(pan) * 100)}L` : `${Math.round(pan * 100)}R`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onChangeEffects({ ...effects, bypassAll: !effects.bypassAll })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors whitespace-nowrap ${
              effects.bypassAll
                ? 'bg-red-950/50 border-red-700/60 text-red-300'
                : 'bg-purple-600/20 border-purple-500/40 text-purple-200'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{effects.bypassAll ? 'Bypassed' : 'Rack Active'}</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeEffects(createDefaultProEffects())}
            className="p-1.5 rounded-lg bg-[#090B10] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200"
            title="Reset track FX chain"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3x3 Pro Rack Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
        {/* 1. Parametric EQ */}
        <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Parametric 3-Band EQ</span>
            <button
              type="button"
              onClick={() => patch('eq', { enabled: !effects.eq.enabled })}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                effects.eq.enabled ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {effects.eq.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Low ({effects.eq.lowFreqHz}Hz)</span>
              <span className="font-mono text-slate-200 tabular-nums">{effects.eq.lowGainDb > 0 ? `+${effects.eq.lowGainDb}` : effects.eq.lowGainDb} dB</span>
            </div>
            <input type="range" min={-12} max={12} step={0.5} value={effects.eq.lowGainDb} onChange={(e) => patch('eq', { lowGainDb: Number(e.target.value) })} className="studio-slider w-full" />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Mid ({effects.eq.midFreqHz}Hz)</span>
              <span className="font-mono text-slate-200 tabular-nums">{effects.eq.midGainDb > 0 ? `+${effects.eq.midGainDb}` : effects.eq.midGainDb} dB</span>
            </div>
            <input type="range" min={-12} max={12} step={0.5} value={effects.eq.midGainDb} onChange={(e) => patch('eq', { midGainDb: Number(e.target.value) })} className="studio-slider w-full" />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">High ({effects.eq.highFreqHz}Hz)</span>
              <span className="font-mono text-slate-200 tabular-nums">{effects.eq.highGainDb > 0 ? `+${effects.eq.highGainDb}` : effects.eq.highGainDb} dB</span>
            </div>
            <input type="range" min={-12} max={12} step={0.5} value={effects.eq.highGainDb} onChange={(e) => patch('eq', { highGainDb: Number(e.target.value) })} className="studio-slider w-full" />
          </div>
        </div>

        {/* 2. Compressor */}
        <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Dynamics Compressor</span>
            <button
              type="button"
              onClick={() => patch('compressor', { enabled: !effects.compressor.enabled })}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                effects.compressor.enabled ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {effects.compressor.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Threshold</span>
              <span className="font-mono text-slate-200 tabular-nums">{effects.compressor.thresholdDb} dB</span>
            </div>
            <input type="range" min={-48} max={0} step={1} value={effects.compressor.thresholdDb} onChange={(e) => patch('compressor', { thresholdDb: Number(e.target.value) })} className="studio-slider w-full" />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Ratio</span>
              <span className="font-mono text-slate-200 tabular-nums">{effects.compressor.ratio}:1</span>
            </div>
            <input type="range" min={1} max={16} step={0.5} value={effects.compressor.ratio} onChange={(e) => patch('compressor', { ratio: Number(e.target.value) })} className="studio-slider w-full" />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Release</span>
              <span className="font-mono text-slate-200 tabular-nums">{Math.round(effects.compressor.releaseSec * 1000)} ms</span>
            </div>
            <input type="range" min={0.05} max={0.8} step={0.02} value={effects.compressor.releaseSec} onChange={(e) => patch('compressor', { releaseSec: Number(e.target.value) })} className="studio-slider w-full" />
          </div>
        </div>

        {/* 3. Brickwall Limiter */}
        <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Track Limiter</span>
            <button
              type="button"
              onClick={() => patch('limiter', { enabled: !effects.limiter.enabled })}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                effects.limiter.enabled ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {effects.limiter.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Ceiling</span>
              <span className="font-mono text-slate-200 tabular-nums">{effects.limiter.ceilingDb} dBFS</span>
            </div>
            <input type="range" min={-12} max={-0.1} step={0.1} value={effects.limiter.ceilingDb} onChange={(e) => patch('limiter', { ceilingDb: Number(e.target.value) })} className="studio-slider w-full" />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Release</span>
              <span className="font-mono text-slate-200 tabular-nums">{Math.round(effects.limiter.releaseSec * 1000)} ms</span>
            </div>
            <input type="range" min={0.02} max={0.4} step={0.01} value={effects.limiter.releaseSec} onChange={(e) => patch('limiter', { releaseSec: Number(e.target.value) })} className="studio-slider w-full" />
          </div>
        </div>

        {/* 4. Convolution Reverb */}
        <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Space Reverb</span>
            <button
              type="button"
              onClick={() => patch('reverb', { enabled: !effects.reverb.enabled })}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                effects.reverb.enabled ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {effects.reverb.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Mix</span>
              <span className="font-mono text-slate-200 tabular-nums">{Math.round(effects.reverb.mix * 100)}%</span>
            </div>
            <input type="range" min={0} max={0.9} step={0.02} value={effects.reverb.mix} onChange={(e) => patch('reverb', { mix: Number(e.target.value) })} className="studio-slider w-full" />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Decay Time</span>
              <span className="font-mono text-slate-200 tabular-nums">{effects.reverb.decaySec.toFixed(1)}s</span>
            </div>
            <input type="range" min={0.4} max={4.5} step={0.1} value={effects.reverb.decaySec} onChange={(e) => patch('reverb', { decaySec: Number(e.target.value) })} className="studio-slider w-full" />
          </div>
        </div>

        {/* 5. Sync Delay */}
        <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Studio Delay</span>
            <button
              type="button"
              onClick={() => patch('delay', { enabled: !effects.delay.enabled })}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                effects.delay.enabled ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {effects.delay.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Time</span>
              <span className="font-mono text-slate-200 tabular-nums">{Math.round(effects.delay.timeSec * 1000)} ms</span>
            </div>
            <input type="range" min={0.05} max={0.9} step={0.02} value={effects.delay.timeSec} onChange={(e) => patch('delay', { timeSec: Number(e.target.value) })} className="studio-slider w-full" />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Feedback / Mix</span>
              <span className="font-mono text-slate-200 tabular-nums">{Math.round(effects.delay.feedback * 100)}% / {Math.round(effects.delay.mix * 100)}%</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="range" min={0} max={0.8} step={0.02} value={effects.delay.feedback} onChange={(e) => patch('delay', { feedback: Number(e.target.value) })} className="studio-slider w-full" />
              <input type="range" min={0} max={0.8} step={0.02} value={effects.delay.mix} onChange={(e) => patch('delay', { mix: Number(e.target.value) })} className="studio-slider w-full" />
            </div>
          </div>
        </div>

        {/* 6. Saturation / Distortion */}
        <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Analog Distortion</span>
            <button
              type="button"
              onClick={() => patch('distortion', { enabled: !effects.distortion.enabled })}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                effects.distortion.enabled ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {effects.distortion.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Drive</span>
              <span className="font-mono text-slate-200 tabular-nums">{effects.distortion.drive}%</span>
            </div>
            <input type="range" min={1} max={100} step={1} value={effects.distortion.drive} onChange={(e) => patch('distortion', { drive: Number(e.target.value) })} className="studio-slider w-full" />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Wet Mix</span>
              <span className="font-mono text-slate-200 tabular-nums">{Math.round(effects.distortion.mix * 100)}%</span>
            </div>
            <input type="range" min={0} max={0.9} step={0.05} value={effects.distortion.mix} onChange={(e) => patch('distortion', { mix: Number(e.target.value) })} className="studio-slider w-full" />
          </div>
        </div>

        {/* 7. Stereo Chorus */}
        <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Modulation Chorus</span>
            <button
              type="button"
              onClick={() => patch('chorus', { enabled: !effects.chorus.enabled })}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                effects.chorus.enabled ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {effects.chorus.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">LFO Rate</span>
              <span className="font-mono text-slate-200 tabular-nums">{effects.chorus.rateHz.toFixed(1)} Hz</span>
            </div>
            <input type="range" min={0.2} max={5.0} step={0.1} value={effects.chorus.rateHz} onChange={(e) => patch('chorus', { rateHz: Number(e.target.value) })} className="studio-slider w-full" />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Mix</span>
              <span className="font-mono text-slate-200 tabular-nums">{Math.round(effects.chorus.mix * 100)}%</span>
            </div>
            <input type="range" min={0} max={0.85} step={0.05} value={effects.chorus.mix} onChange={(e) => patch('chorus', { mix: Number(e.target.value) })} className="studio-slider w-full" />
          </div>
        </div>

        {/* 8. Noise Gate (AudioWorklet) */}
        <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Noise Gate (AudioWorklet)</span>
            <button
              type="button"
              onClick={() => patch('noiseGate', { enabled: !effects.noiseGate.enabled })}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                effects.noiseGate.enabled ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {effects.noiseGate.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Gate Threshold</span>
              <span className="font-mono text-slate-200 tabular-nums">{effects.noiseGate.thresholdDb} dB</span>
            </div>
            <input type="range" min={-75} max={-12} step={1} value={effects.noiseGate.thresholdDb} onChange={(e) => patch('noiseGate', { thresholdDb: Number(e.target.value) })} className="studio-slider w-full" />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Release</span>
              <span className="font-mono text-slate-200 tabular-nums">{effects.noiseGate.releaseMs} ms</span>
            </div>
            <input type="range" min={30} max={450} step={10} value={effects.noiseGate.releaseMs} onChange={(e) => patch('noiseGate', { releaseMs: Number(e.target.value) })} className="studio-slider w-full" />
          </div>
        </div>

        {/* 9. Pitch Correction */}
        <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Pitch Correction (Mixdown DSP)</span>
            <button
              type="button"
              onClick={() => patch('pitchCorrection', { enabled: !effects.pitchCorrection.enabled })}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                effects.pitchCorrection.enabled ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {effects.pitchCorrection.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="space-y-1.5">
            <select
              value={effects.pitchCorrection.scale}
              onChange={(e) =>
                patch('pitchCorrection', {
                  scale: e.target.value as ProEffectsRackState['pitchCorrection']['scale'],
                })
              }
              className="w-full px-2 py-1 rounded bg-[#151923] border border-slate-800 text-[11px] text-slate-200"
            >
              <option value="A minor">A minor</option>
              <option value="C major">C major</option>
              <option value="D minor">D minor</option>
              <option value="G major">G major</option>
              <option value="Chromatic">Chromatic</option>
            </select>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Correction Speed</span>
              <span className="font-mono text-slate-200 tabular-nums">{Math.round(effects.pitchCorrection.speed * 100)}%</span>
            </div>
            <input type="range" min={0.2} max={1} step={0.05} value={effects.pitchCorrection.speed} onChange={(e) => patch('pitchCorrection', { speed: Number(e.target.value) })} className="studio-slider w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
