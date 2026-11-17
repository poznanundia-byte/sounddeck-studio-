import { Gauge, Power, RotateCcw, Sliders, Sparkles, Timer, Waves } from 'lucide-react';
import {
  EFFECT_RACK_PRESETS,
  type TrackEffectsState,
} from '../../audio/effectRackNodes';

export interface EffectRackTrackOption {
  id: string;
  name: string;
  hasBuffer: boolean;
  effects: TrackEffectsState;
}

interface DawEffectRackProps {
  tracks: EffectRackTrackOption[];
  selectedTrackId: string;
  projectBpm: number;
  isPlaying: boolean;
  compressorReductionDb: number;
  bakingEffects: boolean;
  onSelectTrack: (trackId: string) => void;
  onUpdateTrackEffects: (
    trackId: string,
    updater: (prev: TrackEffectsState) => TrackEffectsState
  ) => void;
  onBakeTrackEffects: (trackId: string) => void;
}

export function DawEffectRack({
  tracks,
  selectedTrackId,
  projectBpm,
  isPlaying,
  compressorReductionDb,
  bakingEffects,
  onSelectTrack,
  onUpdateTrackEffects,
  onBakeTrackEffects,
}: DawEffectRackProps) {
  const activeTrack = tracks.find((t) => t.id === selectedTrackId) || tracks[0];
  if (!activeTrack) return null;

  const fx = activeTrack.effects;
  const activeModuleCount = [
    fx.compressor.enabled,
    fx.delay.enabled,
    fx.reverb.enabled,
  ].filter(Boolean).length;

  const eighthNoteSec = Math.max(0.06, Math.min(1.0, Number((60 / Math.max(40, projectBpm) / 2).toFixed(3))));
  const quarterNoteSec = Math.max(0.08, Math.min(1.0, Number((60 / Math.max(40, projectBpm)).toFixed(3))));

  const grAbsDb = Math.min(24, Math.max(0, Math.abs(compressorReductionDb)));
  const grPct = Math.round((grAbsDb / 24) * 100);

  return (
    <section
      aria-label="DAW Real-Time Effect Rack"
      className="rounded-xl bg-[#13161B] border border-[#232833] overflow-hidden shadow-xl"
    >
      {/* Rack Header Bar */}
      <div className="px-4 py-3 bg-[#0F1217] border-b border-[#232833] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm font-bold text-slate-100">
                  Real-Time Track Effect Rack
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1B2028] text-amber-300 border border-[#2A313E]">
                  Web Audio DSP · {activeModuleCount}/3 Active
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Adjust Reverb, Delay, and Compressor live during playback or offline mixdown export.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <span className="text-slate-500">Target Track:</span>
            <select
              value={activeTrack.id}
              onChange={(e) => onSelectTrack(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[#13161B] border border-[#2A313E] text-xs font-medium text-amber-300 focus:outline-none focus:border-amber-500 max-w-[220px]"
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onUpdateTrackEffects(activeTrack.id, (prev) => ({
                ...prev,
                bypassAll: !prev.bypassAll,
              }))
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
              fx.bypassAll
                ? 'bg-rose-500/20 border-rose-500/60 text-rose-300'
                : 'bg-[#1B2028] hover:bg-[#252B36] border-[#2A313E] text-emerald-300'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{fx.bypassAll ? 'Rack Bypassed' : 'Rack Live'}</span>
          </button>

          <button
            type="button"
            disabled={!activeTrack.hasBuffer || activeModuleCount === 0 || fx.bypassAll || bakingEffects}
            onClick={() => onBakeTrackEffects(activeTrack.id)}
            title="Render active Effect Rack settings directly into this track's audio waveform"
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{bakingEffects ? 'Baking...' : 'Bake to Clip'}</span>
          </button>
        </div>
      </div>

      {/* Preset Strip */}
      <div className="px-4 py-2 bg-[#0B0D10] border-b border-[#232833] flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mr-1">
          Rack Presets:
        </span>
        {EFFECT_RACK_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() =>
              onUpdateTrackEffects(activeTrack.id, () => ({
                bypassAll: preset.effects.bypassAll,
                compressor: { ...preset.effects.compressor },
                delay: { ...preset.effects.delay },
                reverb: { ...preset.effects.reverb },
              }))
            }
            className="px-2.5 py-1 rounded bg-[#13161B] hover:bg-[#1B2028] border border-[#232833] hover:border-amber-500/40 text-[11px] font-medium text-slate-300 hover:text-amber-300 transition-colors flex items-center gap-1"
          >
            {preset.id === 'clean' && <RotateCcw className="w-3 h-3 text-slate-400" />}
            <span>{preset.label}</span>
          </button>
        ))}
      </div>

      {/* 3 Hardware-Style Effect Rack Modules */}
      <div
        className={`p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 transition-opacity ${
          fx.bypassAll ? 'opacity-55' : 'opacity-100'
        }`}
      >
        {/* UNIT 1: DYNAMICS COMPRESSOR */}
        <div
          className={`rounded-xl bg-[#0B0D10] border p-4 space-y-3.5 transition-colors ${
            fx.compressor.enabled && !fx.bypassAll
              ? 'border-amber-500/50'
              : 'border-[#232833]'
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#1E232D]">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-xs font-bold text-slate-100">Dynamics Compressor</div>
                <div className="text-[10px] font-mono text-slate-500">DynamicsCompressorNode</div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={fx.compressor.enabled}
              aria-label="Toggle Compressor"
              onClick={() =>
                onUpdateTrackEffects(activeTrack.id, (prev) => ({
                  ...prev,
                  compressor: { ...prev.compressor, enabled: !prev.compressor.enabled },
                }))
              }
              className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                fx.compressor.enabled
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-[#13161B] text-slate-400 border-[#232833] hover:text-slate-200'
              }`}
            >
              {fx.compressor.enabled ? 'ON' : 'BYPASS'}
            </button>
          </div>

          {/* Live Gain Reduction Meter */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-slate-500">GAIN REDUCTION</span>
              <span className="text-amber-400 tabular-nums">
                {isPlaying && fx.compressor.enabled && !fx.bypassAll
                  ? `-${grAbsDb.toFixed(1)} dB`
                  : '0.0 dB'}
              </span>
            </div>
            <div className="h-2 rounded bg-[#161A22] overflow-hidden flex justify-end p-[1px]">
              <div
                className="h-full rounded-sm bg-gradient-to-l from-amber-500 to-rose-500 transition-all duration-75"
                style={{
                  width: `${isPlaying && fx.compressor.enabled && !fx.bypassAll ? grPct : 0}%`,
                }}
              />
            </div>
          </div>

          <div className="space-y-2.5 text-[11px]">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Threshold</span>
                <span className="font-mono text-amber-300 tabular-nums">
                  {fx.compressor.thresholdDb} dB
                </span>
              </div>
              <input
                type="range"
                min={-50}
                max={0}
                step={1}
                value={fx.compressor.thresholdDb}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateTrackEffects(activeTrack.id, (prev) => ({
                    ...prev,
                    compressor: { ...prev.compressor, enabled: true, thresholdDb: val },
                  }));
                }}
                className="studio-slider w-full"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Ratio</span>
                <span className="font-mono text-amber-300 tabular-nums">
                  {fx.compressor.ratio.toFixed(1)}:1
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                step={0.5}
                value={fx.compressor.ratio}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateTrackEffects(activeTrack.id, (prev) => ({
                    ...prev,
                    compressor: { ...prev.compressor, enabled: true, ratio: val },
                  }));
                }}
                className="studio-slider w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Attack</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {Math.round(fx.compressor.attackSec * 1000)}ms
                  </span>
                </div>
                <input
                  type="range"
                  min={0.001}
                  max={0.2}
                  step={0.002}
                  value={fx.compressor.attackSec}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onUpdateTrackEffects(activeTrack.id, (prev) => ({
                      ...prev,
                      compressor: { ...prev.compressor, enabled: true, attackSec: val },
                    }));
                  }}
                  className="studio-slider w-full"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Release</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {Math.round(fx.compressor.releaseSec * 1000)}ms
                  </span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={1.0}
                  step={0.01}
                  value={fx.compressor.releaseSec}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onUpdateTrackEffects(activeTrack.id, (prev) => ({
                      ...prev,
                      compressor: { ...prev.compressor, enabled: true, releaseSec: val },
                    }));
                  }}
                  className="studio-slider w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* UNIT 2: STEREO TAPE DELAY */}
        <div
          className={`rounded-xl bg-[#0B0D10] border p-4 space-y-3.5 transition-colors ${
            fx.delay.enabled && !fx.bypassAll
              ? 'border-cyan-500/50'
              : 'border-[#232833]'
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#1E232D]">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-cyan-400" />
              <div>
                <div className="text-xs font-bold text-slate-100">Stereo Tape Delay</div>
                <div className="text-[10px] font-mono text-slate-500">DelayNode + Tone Feedback</div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={fx.delay.enabled}
              aria-label="Toggle Delay"
              onClick={() =>
                onUpdateTrackEffects(activeTrack.id, (prev) => ({
                  ...prev,
                  delay: { ...prev.delay, enabled: !prev.delay.enabled },
                }))
              }
              className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                fx.delay.enabled
                  ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                  : 'bg-[#13161B] text-slate-400 border-[#232833] hover:text-slate-200'
              }`}
            >
              {fx.delay.enabled ? 'ON' : 'BYPASS'}
            </button>
          </div>

          {/* Tempo Sync Quick Buttons */}
          <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono">
            <span className="text-slate-500">SYNC ({projectBpm} BPM):</span>
            <div className="flex items-center gap-1">
              {[
                { label: 'Slap', sec: 0.11 },
                { label: '1/8', sec: eighthNoteSec },
                { label: '1/4', sec: quarterNoteSec },
              ].map((tap) => (
                <button
                  key={tap.label}
                  type="button"
                  onClick={() =>
                    onUpdateTrackEffects(activeTrack.id, (prev) => ({
                      ...prev,
                      delay: { ...prev.delay, enabled: true, timeSec: tap.sec },
                    }))
                  }
                  className="px-2 py-0.5 rounded bg-[#13161B] hover:bg-[#1B2028] border border-[#232833] text-cyan-300"
                >
                  {tap.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 text-[11px]">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Delay Time</span>
                <span className="font-mono text-cyan-300 tabular-nums">
                  {Math.round(fx.delay.timeSec * 1000)} ms
                </span>
              </div>
              <input
                type="range"
                min={0.04}
                max={1.0}
                step={0.01}
                value={fx.delay.timeSec}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateTrackEffects(activeTrack.id, (prev) => ({
                    ...prev,
                    delay: { ...prev.delay, enabled: true, timeSec: val },
                  }));
                }}
                className="studio-slider w-full"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Feedback</span>
                <span className="font-mono text-cyan-300 tabular-nums">
                  {Math.round(fx.delay.feedback * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.85}
                step={0.02}
                value={fx.delay.feedback}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateTrackEffects(activeTrack.id, (prev) => ({
                    ...prev,
                    delay: { ...prev.delay, enabled: true, feedback: val },
                  }));
                }}
                className="studio-slider w-full"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Wet Mix</span>
                <span className="font-mono text-cyan-300 tabular-nums">
                  {Math.round(fx.delay.mix * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={fx.delay.mix}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateTrackEffects(activeTrack.id, (prev) => ({
                    ...prev,
                    delay: { ...prev.delay, enabled: true, mix: val },
                  }));
                }}
                className="studio-slider w-full"
              />
            </div>
          </div>
        </div>

        {/* UNIT 3: CONVOLUTION REVERB */}
        <div
          className={`rounded-xl bg-[#0B0D10] border p-4 space-y-3.5 transition-colors ${
            fx.reverb.enabled && !fx.bypassAll
              ? 'border-emerald-500/50'
              : 'border-[#232833]'
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#1E232D]">
            <div className="flex items-center gap-2">
              <Waves className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-xs font-bold text-slate-100">Convolution Reverb</div>
                <div className="text-[10px] font-mono text-slate-500">ConvolverNode Stereo IR</div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={fx.reverb.enabled}
              aria-label="Toggle Reverb"
              onClick={() =>
                onUpdateTrackEffects(activeTrack.id, (prev) => ({
                  ...prev,
                  reverb: { ...prev.reverb, enabled: !prev.reverb.enabled },
                }))
              }
              className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                fx.reverb.enabled
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                  : 'bg-[#13161B] text-slate-400 border-[#232833] hover:text-slate-200'
              }`}
            >
              {fx.reverb.enabled ? 'ON' : 'BYPASS'}
            </button>
          </div>

          {/* Room Size Quick Buttons */}
          <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono">
            <span className="text-slate-500">SPACE:</span>
            <div className="flex items-center gap-1">
              {[
                { label: 'Room', decay: 0.9, damp: 6800, mix: 0.2 },
                { label: 'Plate', decay: 1.8, damp: 5600, mix: 0.28 },
                { label: 'Hall', decay: 3.4, damp: 4000, mix: 0.44 },
              ].map((space) => (
                <button
                  key={space.label}
                  type="button"
                  onClick={() =>
                    onUpdateTrackEffects(activeTrack.id, (prev) => ({
                      ...prev,
                      reverb: {
                        enabled: true,
                        decaySec: space.decay,
                        dampingHz: space.damp,
                        mix: space.mix,
                      },
                    }))
                  }
                  className="px-2 py-0.5 rounded bg-[#13161B] hover:bg-[#1B2028] border border-[#232833] text-emerald-300"
                >
                  {space.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 text-[11px]">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Room Decay</span>
                <span className="font-mono text-emerald-300 tabular-nums">
                  {fx.reverb.decaySec.toFixed(1)} s
                </span>
              </div>
              <input
                type="range"
                min={0.4}
                max={4.5}
                step={0.1}
                value={fx.reverb.decaySec}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateTrackEffects(activeTrack.id, (prev) => ({
                    ...prev,
                    reverb: { ...prev.reverb, enabled: true, decaySec: val },
                  }));
                }}
                className="studio-slider w-full"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Hi-Cut Damping</span>
                <span className="font-mono text-emerald-300 tabular-nums">
                  {(fx.reverb.dampingHz / 1000).toFixed(1)} kHz
                </span>
              </div>
              <input
                type="range"
                min={1200}
                max={12000}
                step={200}
                value={fx.reverb.dampingHz}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateTrackEffects(activeTrack.id, (prev) => ({
                    ...prev,
                    reverb: { ...prev.reverb, enabled: true, dampingHz: val },
                  }));
                }}
                className="studio-slider w-full"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Wet Mix</span>
                <span className="font-mono text-emerald-300 tabular-nums">
                  {Math.round(fx.reverb.mix * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={fx.reverb.mix}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateTrackEffects(activeTrack.id, (prev) => ({
                    ...prev,
                    reverb: { ...prev.reverb, enabled: true, mix: val },
                  }));
                }}
                className="studio-slider w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
