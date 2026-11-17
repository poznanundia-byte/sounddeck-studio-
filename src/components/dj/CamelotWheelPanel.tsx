import { ArrowRightLeft, Compass, Sparkles } from 'lucide-react';
import {
  CAMELOT_WHEEL_SEGMENTS,
  getHarmonicRelation,
  stepCamelotKey,
  type DeckId,
} from '../../audio/virtualDjEngine';

interface CamelotWheelPanelProps {
  deckAKey: string;
  deckBKey: string;
  automixActive: boolean;
  automixBeats: 8 | 16;
  automixBassSwap: boolean;
  onChangeDeckKey: (id: DeckId, nextKey: string) => void;
  onSetAutomixBeats: (beats: 8 | 16) => void;
  onSetAutomixBassSwap: (enabled: boolean) => void;
  onTriggerAutomix: (direction: 'AtoB' | 'BtoA') => void;
}

export function CamelotWheelPanel({
  deckAKey,
  deckBKey,
  automixActive,
  automixBeats,
  automixBassSwap,
  onChangeDeckKey,
  onSetAutomixBeats,
  onSetAutomixBassSwap,
  onTriggerAutomix,
}: CamelotWheelPanelProps) {
  const relation = getHarmonicRelation(deckAKey, deckBKey);

  const badgeTone =
    relation.tier === 'perfect'
      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
      : relation.tier === 'smooth'
      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
      : relation.tier === 'energy'
      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
      : 'bg-red-500/15 border-red-500/40 text-red-300';

  return (
    <div className="rounded-xl bg-[#0f131a] border border-[#222834] p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-amber-400" />
          <h3 className="font-display text-sm font-semibold text-slate-100">
            Camelot Harmonic Wheel &amp; Phrase Automix
          </h3>
        </div>
        <span className={`px-2.5 py-0.5 rounded border text-[11px] font-mono font-semibold ${badgeTone}`}>
          {relation.label}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Interactive 12-Sector Harmonic Matrix */}
        <div className="md:col-span-7 space-y-2">
          <div className="grid grid-cols-6 gap-1">
            {CAMELOT_WHEEL_SEGMENTS.map((seg) => {
              const aMinor = deckAKey === seg.minorKey;
              const bMinor = deckBKey === seg.minorKey;
              const aMajor = deckAKey === seg.majorKey;
              const bMajor = deckBKey === seg.majorKey;

              return (
                <div
                  key={seg.num}
                  className="rounded-md bg-[#080a0f] border border-[#1c2331] p-1 space-y-1 text-center"
                >
                  <button
                    type="button"
                    onClick={() => onChangeDeckKey('B', seg.minorKey)}
                    className={`w-full py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                      aMinor && bMinor
                        ? 'bg-emerald-500 text-slate-950'
                        : aMinor
                        ? 'bg-amber-500 text-slate-950'
                        : bMinor
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-[#131822] text-slate-300 hover:bg-[#1c2331]'
                    }`}
                    title={`Set Deck 2 Key to ${seg.minorKey} (${seg.minorNote})`}
                  >
                    {seg.minorKey}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeDeckKey('B', seg.majorKey)}
                    className={`w-full py-0.5 rounded text-[10px] font-mono transition-colors ${
                      aMajor && bMajor
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : aMajor
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : bMajor
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-[#0e121a] text-slate-400 hover:bg-[#1c2331] hover:text-slate-200'
                    }`}
                    title={`Set Deck 2 Key to ${seg.majorKey} (${seg.majorNote})`}
                  >
                    {seg.majorKey}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="text-amber-400 font-semibold">D1: {deckAKey}</span>
              <span className="text-slate-500">·</span>
              <span className="text-cyan-400 font-semibold">D2: {deckBKey}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChangeDeckKey('B', deckAKey)}
                className="px-2 py-1 rounded bg-[#141820] hover:bg-[#1f2634] text-slate-200 border border-[#273042] text-[10px]"
              >
                Key-Lock D2 → D1
              </button>
              <button
                type="button"
                onClick={() => onChangeDeckKey('B', stepCamelotKey(deckAKey, 1))}
                className="px-2 py-1 rounded bg-[#141820] hover:bg-[#1f2634] text-amber-300 border border-[#273042] text-[10px]"
              >
                +1 Energy Shift
              </button>
            </div>
          </div>
        </div>

        {/* AI Phrase Automix Panel */}
        <div className="md:col-span-5 bg-[#080a0f] border border-[#1d2432] rounded-lg p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-semibold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>AUTO-MIX PHRASE ENGINE</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {automixActive ? 'TRANSITIONING...' : 'STANDBY'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {([8, 16] as const).map((beats) => (
              <button
                key={beats}
                type="button"
                onClick={() => onSetAutomixBeats(beats)}
                className={`flex-1 py-1 rounded text-[11px] font-mono border transition-colors ${
                  automixBeats === beats
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                    : 'bg-[#141820] border-[#252d3d] text-slate-400 hover:text-slate-200'
                }`}
              >
                {beats} Beats
              </button>
            ))}
            <button
              type="button"
              onClick={() => onSetAutomixBassSwap(!automixBassSwap)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors whitespace-nowrap ${
                automixBassSwap
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-semibold'
                  : 'bg-[#141820] border-[#252d3d] text-slate-400'
              }`}
              title="Swap low-end bass EQ mid-transition to avoid low-frequency mud"
            >
              Bass Swap
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={automixActive}
              onClick={() => onTriggerAutomix('AtoB')}
              className="py-2 px-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Mix D1 → D2</span>
            </button>
            <button
              type="button"
              disabled={automixActive}
              onClick={() => onTriggerAutomix('BtoA')}
              className="py-2 px-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Mix D2 → D1</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
