import { useState } from 'react';
import { Play, Square, RotateCcw, Sparkles, Volume2, VolumeX, Sliders } from 'lucide-react';
import { DRUM_PADS, type DrumPadId } from '../audio/studioAudio';
import type { GenreKitDefinition } from '../audio/genreKits';
import type { PadSampleAssignment } from '../firebase';

interface StepSequencerGridProps {
  activeKit: GenreKitDefinition;
  pattern: Record<string, boolean[]>;
  onToggleStep: (laneId: string, stepIdx: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentStep: number;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  swingPct: number;
  onSwingChange: (swing: number) => void;
  masterVol: number;
  onVolChange: (vol: number) => void;
  padAssignments: PadSampleAssignment[];
  assignmentByPad: Map<string, PadSampleAssignment>;
  onClearPattern: () => void;
  onRandomizePattern: () => void;
  onTriggerPad: (padId: DrumPadId) => void;
  isMidiRecording?: boolean;
  onToggleMidiRecord?: () => void;
}

export function StepSequencerGrid({
  activeKit,
  pattern,
  onToggleStep,
  isPlaying,
  onTogglePlay,
  currentStep,
  bpm,
  onBpmChange,
  swingPct,
  onSwingChange,
  masterVol,
  onVolChange,
  padAssignments,
  assignmentByPad,
  onClearPattern,
  onRandomizePattern,
  onTriggerPad,
  isMidiRecording = false,
  onToggleMidiRecord,
}: StepSequencerGridProps) {
  const [stepCount, setStepCount] = useState<16 | 32>(16);
  const [mutedLanes, setMutedLanes] = useState<Record<string, boolean>>({});
  const [soloLane, setSoloLane] = useState<string | null>(null);

  const toggleMute = (laneId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMutedLanes((prev) => ({ ...prev, [laneId]: !prev[laneId] }));
  };

  const toggleSolo = (laneId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSoloLane((prev) => (prev === laneId ? null : laneId));
  };

  const lanes = [
    ...activeKit.sequencerLanes.map((padId) => ({
      id: padId,
      label: activeKit.padLabels[padId] || DRUM_PADS.find((p) => p.id === padId)?.label || padId,
      category: DRUM_PADS.find((p) => p.id === padId)?.category || 'drums',
    })),
    ...padAssignments
      .filter((a) => !activeKit.sequencerLanes.includes(a.padId as DrumPadId))
      .map((a) => ({
        id: a.padId as DrumPadId,
        label: a.sampleName,
        category: 'sample',
      })),
  ];

  return (
    <div className="rounded-xl bg-[#13161B] border border-[#232833] p-5 space-y-4">
      {/* Sequencer Header & Transport */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#232833] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-slate-100">
              Interactive Step Sequencer
            </h3>
            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-mono border border-amber-500/30">
              {activeKit.name} Kit
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Sequence selected pad samples &amp; synth hits into a looping groove synchronized at {bpm} BPM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onToggleMidiRecord && (
            <button
              type="button"
              onClick={onToggleMidiRecord}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isMidiRecording
                  ? 'bg-red-600 text-white border border-red-400 animate-pulse'
                  : 'bg-[#1B2028] hover:bg-[#252B36] text-red-300 border border-red-500/40'
              }`}
              title="Record pad hits in real-time into the step sequencer"
            >
              <div className={`w-2 h-2 rounded-full ${isMidiRecording ? 'bg-white' : 'bg-red-500'}`} />
              <span>{isMidiRecording ? 'MIDI Recording...' : 'Record Pad MIDI'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onTogglePlay}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              isPlaying
                ? 'bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse'
                : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
            }`}
          >
            {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Stop Sequencer' : 'Play Loop'}</span>
          </button>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0D10] border border-[#232833]">
            <button
              type="button"
              onClick={() => setStepCount(16)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                stepCount === 16 ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              16 Steps
            </button>
            <button
              type="button"
              onClick={() => setStepCount(32)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                stepCount === 32 ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              32 Steps
            </button>
          </div>

          <button
            type="button"
            onClick={onRandomizePattern}
            className="px-3 py-2 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-amber-300 text-xs font-medium border border-amber-500/30 flex items-center gap-1.5"
            title="Randomize groove pattern"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Randomize</span>
          </button>

          <button
            type="button"
            onClick={onClearPattern}
            className="px-3 py-2 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] text-slate-400 hover:text-slate-200 text-xs font-medium border border-[#232833]"
            title="Clear all steps"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sequencer Live Controls Strip */}
      <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-[#0B0D10] border border-[#232833] text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">BPM</span>
          <input
            type="range"
            min={50}
            max={200}
            value={bpm}
            onChange={(e) => onBpmChange(Number(e.target.value))}
            className="studio-slider w-28"
          />
          <span className="font-mono text-amber-400 w-8 tabular-nums">{bpm}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Swing</span>
          <input
            type="range"
            min={0}
            max={25}
            value={swingPct}
            onChange={(e) => onSwingChange(Number(e.target.value))}
            className="studio-slider w-20"
          />
          <span className="font-mono text-slate-300 w-8 tabular-nums">{swingPct}%</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Master Gain</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={masterVol}
            onChange={(e) => onVolChange(Number(e.target.value))}
            className="studio-slider w-20"
          />
        </div>

        <div className="ml-auto flex items-center gap-2 text-[11px] font-mono text-slate-400">
          <Sliders className="w-3.5 h-3.5 text-amber-400" />
          <span>Step {currentStep + 1} / {stepCount}</span>
        </div>
      </div>

      {/* Step Sequencer Grid Lanes */}
      <div className="space-y-1.5 overflow-x-auto pt-2 pb-1">
        {lanes.map((lane) => {
          const row = pattern[lane.id] || Array(32).fill(false);
          const assigned = assignmentByPad.get(lane.id);
          const isMuted = mutedLanes[lane.id];
          const isSoloed = soloLane === lane.id;
          const isEffectivelyMuted = (soloLane !== null && !isSoloed) || isMuted;

          return (
            <div
              key={lane.id}
              className={`flex items-center gap-2 min-w-[720px] p-1.5 rounded-md transition-colors ${
                isEffectivelyMuted ? 'opacity-40 bg-[#0B0D10]' : 'bg-[#0B0D10]/80 hover:bg-[#11141A]'
              }`}
            >
              <div className="w-36 flex items-center justify-between gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onTriggerPad(lane.id)}
                  className="text-left truncate flex-1 text-xs font-mono text-slate-200 hover:text-amber-300 transition-colors"
                  title="Preview pad sound"
                >
                  {assigned ? assigned.sampleName : lane.label}
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => toggleMute(lane.id, e)}
                    className={`p-1 rounded text-[10px] transition-colors ${
                      isMuted ? 'bg-red-500/20 text-red-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                    title={isMuted ? 'Unmute lane' : 'Mute lane'}
                  >
                    {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => toggleSolo(lane.id, e)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                      isSoloed ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-slate-300 bg-[#171C25]'
                    }`}
                    title={isSoloed ? 'Unsolo lane' : 'Solo lane'}
                  >
                    S
                  </button>
                </div>
              </div>

              <div className={`grid ${stepCount === 32 ? 'grid-cols-32' : 'grid-cols-16'} gap-1 flex-1`}>
                {row.slice(0, stepCount).map((active, stepIdx) => {
                  const isCurrent = isPlaying && currentStep === stepIdx;
                  const isBeatMarker = stepIdx % 4 === 0;

                  return (
                    <button
                      key={stepIdx}
                      type="button"
                      onClick={() => onToggleStep(lane.id, stepIdx)}
                      aria-label={`${lane.label} step ${stepIdx + 1}`}
                      className={`h-7 rounded-sm border transition-transform active:scale-95 ${
                        active
                          ? isCurrent
                            ? 'bg-amber-300 border-white shadow-sm shadow-amber-300/50'
                            : 'bg-amber-500 border-amber-400'
                          : isCurrent
                          ? 'bg-[#252B36] border-amber-500/60'
                          : isBeatMarker
                          ? 'bg-[#161B23] border-[#262D3A] hover:bg-[#1C2330]'
                          : 'bg-[#0B0D10] border-[#181D27] hover:bg-[#151A23]'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
