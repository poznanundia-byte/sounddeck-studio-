import { useRef, useState } from 'react';
import { Sliders, Volume2, Zap } from 'lucide-react';
import {
  SAMPLER_DROP_PADS,
  type FxMode,
  type FxTarget,
  type SamplerDropId,
} from '../../audio/virtualDjEngine';

interface KaossFxSamplerPanelProps {
  fxMode: FxMode;
  fxTarget: FxTarget;
  fxX: number; // 0..1 (frequency / beat subdivision)
  fxY: number; // 0..1 (wet / resonance / feedback)
  fxActive: boolean;
  samplerVolume: number;
  onChangeFxMode: (mode: FxMode) => void;
  onChangeFxTarget: (target: FxTarget) => void;
  onUpdateFxPad: (x: number, y: number, active: boolean) => void;
  onChangeSamplerVolume: (vol: number) => void;
  onTriggerDrop: (id: SamplerDropId) => void;
}

const BEAT_DIVISION_LABELS = ['1/8 Beat', '1/4 Beat', '1/2 Beat', '1 Beat'];

export function KaossFxSamplerPanel({
  fxMode,
  fxTarget,
  fxX,
  fxY,
  fxActive,
  samplerVolume,
  onChangeFxMode,
  onChangeFxTarget,
  onUpdateFxPad,
  onChangeSamplerVolume,
  onTriggerDrop,
}: KaossFxSamplerPanelProps) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [lastTriggeredDrop, setLastTriggeredDrop] = useState<SamplerDropId | null>(null);

  const computeCoords = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return { x: fxX, y: fxY };
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    const { x, y } = computeCoords(e.clientX, e.clientY);
    onUpdateFxPad(x, y, true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const { x, y } = computeCoords(e.clientX, e.clientY);
    onUpdateFxPad(x, y, true);
  };

  const handlePointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    onUpdateFxPad(fxX, fxY, false);
  };

  const divIdx = Math.min(3, Math.floor(fxX * 4));
  const xReadout =
    fxMode === 'filter'
      ? `${Math.round(120 * Math.pow(110, fxX))} Hz`
      : BEAT_DIVISION_LABELS[divIdx];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* 2D XY Kaoss Beat-FX Touchpad */}
      <div className="lg:col-span-6 rounded-xl bg-[#0f131a] border border-[#222834] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h3 className="font-display text-sm font-semibold text-slate-100">
              XY Kaoss Beat-FX Touchpad
            </h3>
          </div>

          {/* Target Deck Selector */}
          <div className="flex items-center rounded-lg bg-[#080a0f] border border-[#1d2432] p-0.5">
            {(['A', 'MASTER', 'B'] as const).map((tgt) => (
              <button
                key={tgt}
                type="button"
                onClick={() => onChangeFxTarget(tgt)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                  fxTarget === tgt
                    ? tgt === 'A'
                      ? 'bg-amber-500 text-slate-950'
                      : tgt === 'B'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-200 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tgt === 'A' ? 'D1' : tgt === 'B' ? 'D2' : 'MST'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {(['echo', 'flanger', 'filter', 'roll'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeFxMode(mode)}
              className={`py-1.5 rounded-lg text-[11px] font-mono uppercase font-semibold border transition-colors ${
                fxMode === mode
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-[#141820] border-[#252c3b] text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Touch Surface */}
        <div
          ref={padRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative h-36 rounded-xl border touch-none select-none overflow-hidden cursor-crosshair transition-colors ${
            fxActive
              ? 'bg-[#0b1018] border-amber-400 shadow-[inset_0_0_24px_rgba(245,158,11,0.18)]'
              : 'bg-[#080a0f] border-[#1f2634]'
          }`}
        >
          {/* Reference crosshair grid */}
          <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 pointer-events-none">
            {Array.from({ length: 16 }).map((_, idx) => (
              <div key={idx} className="border-r border-b border-[#181f2c]/80" />
            ))}
          </div>

          {/* Active Crosshair Lines */}
          <div
            className="absolute top-0 bottom-0 w-px bg-amber-400/50 pointer-events-none"
            style={{ left: `${fxX * 100}%` }}
          />
          <div
            className="absolute left-0 right-0 h-px bg-cyan-400/50 pointer-events-none"
            style={{ bottom: `${fxY * 100}%` }}
          />

          {/* Touch Puck */}
          <div
            className={`absolute w-5 h-5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 pointer-events-none transition-transform ${
              fxActive
                ? 'bg-amber-400 border-white scale-125 shadow-[0_0_14px_rgba(245,158,11,0.9)]'
                : 'bg-amber-500/40 border-amber-300 scale-100'
            }`}
            style={{ left: `${fxX * 100}%`, bottom: `${fxY * 100}%` }}
          />

          <div className="absolute top-2 left-2.5 text-[10px] font-mono text-slate-400 pointer-events-none">
            {fxActive ? `HOLD ACTIVE · ${fxMode.toUpperCase()}` : 'TOUCH & DRAG XY PAD'}
          </div>
          <div className="absolute bottom-2 right-2.5 text-[10px] font-mono text-amber-300 tabular-nums pointer-events-none">
            X: {xReadout} · WET: {Math.round(fxY * 100)}%
          </div>
        </div>
      </div>

      {/* SP-8 Club Drop Performance Sampler Bank */}
      <div className="lg:col-span-6 rounded-xl bg-[#0f131a] border border-[#222834] p-4 space-y-3 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h3 className="font-display text-sm font-semibold text-slate-100">
              SP-8 Performance Drop Bank
            </h3>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300">
            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={samplerVolume}
              onChange={(e) => onChangeSamplerVolume(Number(e.target.value))}
              aria-label="SP-8 sampler volume"
              className="studio-slider w-20"
            />
            <span className="tabular-nums text-cyan-300 w-8 text-right">
              {Math.round(samplerVolume * 100)}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
          {SAMPLER_DROP_PADS.map((pad) => {
            const isFlash = lastTriggeredDrop === pad.id;
            const ringStyle =
              pad.accent === 'amber'
                ? 'border-amber-500/40 hover:border-amber-400 text-amber-300'
                : pad.accent === 'cyan'
                ? 'border-cyan-500/40 hover:border-cyan-400 text-cyan-300'
                : 'border-red-500/40 hover:border-red-400 text-red-300';

            return (
              <button
                key={pad.id}
                type="button"
                onClick={() => {
                  onTriggerDrop(pad.id);
                  setLastTriggeredDrop(pad.id);
                  window.setTimeout(() => {
                    setLastTriggeredDrop((prev) => (prev === pad.id ? null : prev));
                  }, 180);
                }}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[68px] ${
                  isFlash
                    ? 'bg-amber-500 text-slate-950 border-white scale-95'
                    : `bg-[#080a0f] hover:bg-[#141820] ${ringStyle}`
                }`}
              >
                <span className="text-[10px] font-mono opacity-75">PAD {pad.hotkey}</span>
                <span className="text-xs font-semibold tracking-tight">{pad.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
