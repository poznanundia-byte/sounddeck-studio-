import { Power, Sliders, Sparkles, Waves } from 'lucide-react';

export interface DjEffectsRackState {
  filter: {
    enabled: boolean;
    type: 'lowpass' | 'highpass' | 'bandpass';
    frequencyHz: number; // 120 .. 14000
    q: number; // 0.7 .. 12
  };
  flanger: {
    enabled: boolean;
    rateHz: number; // 0.15 .. 4.5
    feedback: number; // 0 .. 0.75
    mix: number; // 0 .. 1
  };
  reverb: {
    enabled: boolean;
    decaySec: number; // 0.6 .. 4.2
    dampingHz: number; // 1800 .. 10000
    mix: number; // 0 .. 1
  };
}

export const INITIAL_DJ_EFFECTS_RACK: DjEffectsRackState = {
  filter: {
    enabled: false,
    type: 'lowpass',
    frequencyHz: 1400,
    q: 3.2,
  },
  flanger: {
    enabled: false,
    rateHz: 0.65,
    feedback: 0.48,
    mix: 0.6,
  },
  reverb: {
    enabled: false,
    decaySec: 2.2,
    dampingHz: 5400,
    mix: 0.42,
  },
};

interface DjEffectsRackPanelProps {
  rack: DjEffectsRackState;
  activeStreamLabel: string;
  onChangeRack: React.Dispatch<React.SetStateAction<DjEffectsRackState>>;
}

export function DjEffectsRackPanel({
  rack,
  activeStreamLabel,
  onChangeRack,
}: DjEffectsRackPanelProps) {
  const anyActive = rack.filter.enabled || rack.flanger.enabled || rack.reverb.enabled;

  return (
    <div className="rounded-xl bg-[#0f131a] border border-[#222834] p-4 space-y-3.5">
      {/* Header + Quick Toggle Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1b2230] pb-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Sliders className="w-4 h-4 text-amber-400" />
          <h3 className="font-display text-sm font-semibold text-slate-100">
            Real-Time Audio Effects Rack
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            · Stream: <span className="text-amber-300">{activeStreamLabel}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={rack.filter.enabled}
            onClick={() =>
              onChangeRack((prev) => ({
                ...prev,
                filter: { ...prev.filter, enabled: !prev.filter.enabled },
              }))
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              rack.filter.enabled
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-[#141820] text-slate-300 border-[#273042] hover:bg-[#1e2432]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Filter</span>
          </button>

          <button
            type="button"
            aria-pressed={rack.flanger.enabled}
            onClick={() =>
              onChangeRack((prev) => ({
                ...prev,
                flanger: { ...prev.flanger, enabled: !prev.flanger.enabled },
              }))
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              rack.flanger.enabled
                ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                : 'bg-[#141820] text-slate-300 border-[#273042] hover:bg-[#1e2432]'
            }`}
          >
            <Waves className="w-3.5 h-3.5" />
            <span>Flanger</span>
          </button>

          <button
            type="button"
            aria-pressed={rack.reverb.enabled}
            onClick={() =>
              onChangeRack((prev) => ({
                ...prev,
                reverb: { ...prev.reverb, enabled: !prev.reverb.enabled },
              }))
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              rack.reverb.enabled
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-[#141820] text-slate-300 border-[#273042] hover:bg-[#1e2432]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Reverb</span>
          </button>

          {anyActive && (
            <button
              type="button"
              onClick={() =>
                onChangeRack((prev) => ({
                  ...prev,
                  filter: { ...prev.filter, enabled: false },
                  flanger: { ...prev.flanger, enabled: false },
                  reverb: { ...prev.reverb, enabled: false },
                }))
              }
              className="px-2.5 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 text-xs font-mono font-semibold whitespace-nowrap flex items-center gap-1"
            >
              <Power className="w-3 h-3" />
              <span>Bypass All</span>
            </button>
          )}
        </div>
      </div>

      {/* 3-Unit Hardware Rack Modules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Unit 1: Resonant Filter */}
        <div
          className={`rounded-xl p-3 border space-y-2.5 transition-colors ${
            rack.filter.enabled
              ? 'bg-[#121722] border-amber-500/50'
              : 'bg-[#080a0f] border-[#1d2432]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono font-bold text-slate-100">01 · FILTER</span>
            <button
              type="button"
              onClick={() =>
                onChangeRack((prev) => ({
                  ...prev,
                  filter: { ...prev.filter, enabled: !prev.filter.enabled },
                }))
              }
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                rack.filter.enabled
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-[#141820] text-slate-400 border-[#252c3b] hover:text-slate-200'
              }`}
            >
              {rack.filter.enabled ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {(['lowpass', 'highpass', 'bandpass'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() =>
                  onChangeRack((prev) => ({
                    ...prev,
                    filter: { ...prev.filter, type: mode },
                  }))
                }
                className={`py-1 rounded text-[10px] font-mono uppercase border transition-colors ${
                  rack.filter.type === mode
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                    : 'bg-[#141820] border-[#252c3b] text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'lowpass' ? 'LPF' : mode === 'highpass' ? 'HPF' : 'BPF'}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="space-y-0.5">
              <div className="flex justify-between text-slate-300">
                <span>CUTOFF</span>
                <span className="text-amber-400 tabular-nums">
                  {rack.filter.frequencyHz >= 1000
                    ? `${(rack.filter.frequencyHz / 1000).toFixed(1)} kHz`
                    : `${rack.filter.frequencyHz} Hz`}
                </span>
              </div>
              <input
                type="range"
                min={120}
                max={14000}
                step={20}
                value={rack.filter.frequencyHz}
                onChange={(e) =>
                  onChangeRack((prev) => ({
                    ...prev,
                    filter: { ...prev.filter, frequencyHz: Number(e.target.value) },
                  }))
                }
                aria-label="Filter cutoff frequency"
                className="studio-slider w-full"
              />
            </div>

            <div className="space-y-0.5">
              <div className="flex justify-between text-slate-300">
                <span>RESONANCE (Q)</span>
                <span className="text-amber-400 tabular-nums">{rack.filter.q.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.7}
                max={12}
                step={0.1}
                value={rack.filter.q}
                onChange={(e) =>
                  onChangeRack((prev) => ({
                    ...prev,
                    filter: { ...prev.filter, q: Number(e.target.value) },
                  }))
                }
                aria-label="Filter resonance"
                className="studio-slider w-full"
              />
            </div>
          </div>
        </div>

        {/* Unit 2: LFO Stereo Flanger */}
        <div
          className={`rounded-xl p-3 border space-y-2.5 transition-colors ${
            rack.flanger.enabled
              ? 'bg-[#101822] border-cyan-500/50'
              : 'bg-[#080a0f] border-[#1d2432]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono font-bold text-slate-100">02 · FLANGER</span>
            <button
              type="button"
              onClick={() =>
                onChangeRack((prev) => ({
                  ...prev,
                  flanger: { ...prev.flanger, enabled: !prev.flanger.enabled },
                }))
              }
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                rack.flanger.enabled
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                  : 'bg-[#141820] text-slate-400 border-[#252c3b] hover:text-slate-200'
              }`}
            >
              {rack.flanger.enabled ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="space-y-0.5">
              <div className="flex justify-between text-slate-300">
                <span>LFO RATE</span>
                <span className="text-cyan-400 tabular-nums">{rack.flanger.rateHz.toFixed(2)} Hz</span>
              </div>
              <input
                type="range"
                min={0.15}
                max={4.5}
                step={0.05}
                value={rack.flanger.rateHz}
                onChange={(e) =>
                  onChangeRack((prev) => ({
                    ...prev,
                    flanger: { ...prev.flanger, rateHz: Number(e.target.value) },
                  }))
                }
                aria-label="Flanger LFO rate"
                className="studio-slider w-full"
              />
            </div>

            <div className="space-y-0.5">
              <div className="flex justify-between text-slate-300">
                <span>FEEDBACK</span>
                <span className="text-cyan-400 tabular-nums">
                  {Math.round(rack.flanger.feedback * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.75}
                step={0.05}
                value={rack.flanger.feedback}
                onChange={(e) =>
                  onChangeRack((prev) => ({
                    ...prev,
                    flanger: { ...prev.flanger, feedback: Number(e.target.value) },
                  }))
                }
                aria-label="Flanger feedback"
                className="studio-slider w-full"
              />
            </div>

            <div className="space-y-0.5">
              <div className="flex justify-between text-slate-300">
                <span>WET MIX</span>
                <span className="text-cyan-400 tabular-nums">
                  {Math.round(rack.flanger.mix * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={rack.flanger.mix}
                onChange={(e) =>
                  onChangeRack((prev) => ({
                    ...prev,
                    flanger: { ...prev.flanger, mix: Number(e.target.value) },
                  }))
                }
                aria-label="Flanger wet mix"
                className="studio-slider w-full"
              />
            </div>
          </div>
        </div>

        {/* Unit 3: Convolution Hall Reverb */}
        <div
          className={`rounded-xl p-3 border space-y-2.5 transition-colors ${
            rack.reverb.enabled
              ? 'bg-[#121722] border-amber-500/50'
              : 'bg-[#080a0f] border-[#1d2432]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono font-bold text-slate-100">03 · REVERB</span>
            <button
              type="button"
              onClick={() =>
                onChangeRack((prev) => ({
                  ...prev,
                  reverb: { ...prev.reverb, enabled: !prev.reverb.enabled },
                }))
              }
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                rack.reverb.enabled
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-[#141820] text-slate-400 border-[#252c3b] hover:text-slate-200'
              }`}
            >
              {rack.reverb.enabled ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="space-y-0.5">
              <div className="flex justify-between text-slate-300">
                <span>ROOM DECAY</span>
                <span className="text-amber-400 tabular-nums">{rack.reverb.decaySec.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={4.2}
                step={0.1}
                value={rack.reverb.decaySec}
                onChange={(e) =>
                  onChangeRack((prev) => ({
                    ...prev,
                    reverb: { ...prev.reverb, decaySec: Number(e.target.value) },
                  }))
                }
                aria-label="Reverb decay time"
                className="studio-slider w-full"
              />
            </div>

            <div className="space-y-0.5">
              <div className="flex justify-between text-slate-300">
                <span>TONE DAMP</span>
                <span className="text-amber-400 tabular-nums">
                  {(rack.reverb.dampingHz / 1000).toFixed(1)} kHz
                </span>
              </div>
              <input
                type="range"
                min={1800}
                max={10000}
                step={200}
                value={rack.reverb.dampingHz}
                onChange={(e) =>
                  onChangeRack((prev) => ({
                    ...prev,
                    reverb: { ...prev.reverb, dampingHz: Number(e.target.value) },
                  }))
                }
                aria-label="Reverb damping frequency"
                className="studio-slider w-full"
              />
            </div>

            <div className="space-y-0.5">
              <div className="flex justify-between text-slate-300">
                <span>WET MIX</span>
                <span className="text-amber-400 tabular-nums">
                  {Math.round(rack.reverb.mix * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={rack.reverb.mix}
                onChange={(e) =>
                  onChangeRack((prev) => ({
                    ...prev,
                    reverb: { ...prev.reverb, mix: Number(e.target.value) },
                  }))
                }
                aria-label="Reverb wet mix"
                className="studio-slider w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
