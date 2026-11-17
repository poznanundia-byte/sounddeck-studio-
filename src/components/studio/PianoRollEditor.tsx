import { useState } from 'react';
import { Play, Trash2, Sparkles, Grid, Layers } from 'lucide-react';
import type { InstrumentId, MidiNote } from '../../types/studioPro';
import {
  INSTRUMENT_CATALOG,
  auditionMidiNoteWithTone,
  auditionChordWithTone,
  midiToNoteName,
  renderMidiNotesToAudioBuffer,
} from '../../audio/toneInstruments';

interface PianoRollEditorProps {
  bpm: number;
  notes: MidiNote[];
  selectedInstrument: InstrumentId;
  onSelectInstrument: (inst: InstrumentId) => void;
  onChangeNotes: (notes: MidiNote[]) => void;
  onBounceToTimeline: (buffer: AudioBuffer, clipName: string) => void;
}

const PITCH_ROWS = Array.from({ length: 25 }, (_, i) => 76 - i); // E5 down to E3
const TOTAL_STEPS = 32;

const CHORD_PROGRESSIONS: {
  name: string;
  vibe: string;
  chords: { notes: number[]; step: number; dur: number }[];
}[] = [
  {
    name: 'Am -> F -> C -> G',
    vibe: 'Afropop / Gengetone Anthem',
    chords: [
      { notes: [57, 60, 64], step: 0, dur: 8 },
      { notes: [53, 57, 60], step: 8, dur: 8 },
      { notes: [60, 64, 67], step: 16, dur: 8 },
      { notes: [55, 59, 62], step: 24, dur: 8 },
    ],
  },
  {
    name: 'Dm9 -> Gm7 -> A7',
    vibe: 'Amapiano / Neo-Soul Pocket',
    chords: [
      { notes: [50, 53, 57, 60], step: 0, dur: 8 },
      { notes: [55, 58, 62, 65], step: 8, dur: 8 },
      { notes: [57, 61, 64, 67], step: 16, dur: 16 },
    ],
  },
  {
    name: 'Cm -> Ab -> G',
    vibe: 'Kenyan Drill Dark Minor',
    chords: [
      { notes: [48, 51, 55], step: 0, dur: 12 },
      { notes: [56, 60, 63], step: 12, dur: 10 },
      { notes: [55, 59, 62], step: 22, dur: 10 },
    ],
  },
];

export function PianoRollEditor({
  bpm,
  notes,
  selectedInstrument,
  onSelectInstrument,
  onChangeNotes,
  onBounceToTimeline,
}: PianoRollEditorProps) {
  const [noteDurationSteps, setNoteDurationSteps] = useState(2);
  const [noteVelocity, setNoteVelocity] = useState(0.85);
  const [quantizeDiv, setQuantizeDiv] = useState<1 | 2 | 4>(2);
  const [bouncing, setBouncing] = useState(false);
  const [auditioning, setAuditioning] = useState(false);

  const toggleCell = async (pitch: number, step: number) => {
    const existing = notes.find(
      (n) =>
        n.pitch === pitch &&
        step >= n.startStep &&
        step < n.startStep + n.durationSteps
    );

    if (existing) {
      onChangeNotes(notes.filter((n) => n.id !== existing.id));
    } else {
      const nextNote: MidiNote = {
        id: `midi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        pitch,
        startStep: step,
        durationSteps: noteDurationSteps,
        velocity: noteVelocity,
        instrument: selectedInstrument,
      };
      onChangeNotes([...notes, nextNote]);
      await auditionMidiNoteWithTone(pitch, selectedInstrument, 0.28, noteVelocity);
    }
  };

  const handleLoadChordProg = async (progIndex: number) => {
    const prog = CHORD_PROGRESSIONS[progIndex];
    if (!prog) return;
    const generated: MidiNote[] = [];
    prog.chords.forEach((c, cIdx) => {
      c.notes.forEach((pitch) => {
        generated.push({
          id: `ch_${progIndex}_${cIdx}_${pitch}_${Date.now()}`,
          pitch,
          startStep: c.step,
          durationSteps: c.dur,
          velocity: 0.78,
          instrument: selectedInstrument,
        });
      });
    });
    onChangeNotes(generated);
    await auditionChordWithTone(prog.chords[0].notes, selectedInstrument, 0.7);
  };

  const handleQuantize = () => {
    const quantized = notes.map((n) => ({
      ...n,
      startStep: Math.min(TOTAL_STEPS - 1, Math.round(n.startStep / quantizeDiv) * quantizeDiv),
      durationSteps: Math.max(quantizeDiv, Math.round(n.durationSteps / quantizeDiv) * quantizeDiv),
    }));
    onChangeNotes(quantized);
  };

  const handleAuditionAll = async () => {
    if (notes.length === 0 || auditioning) return;
    setAuditioning(true);
    try {
      const buf = await renderMidiNotesToAudioBuffer(notes, bpm, TOTAL_STEPS, 44100);
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      src.onended = () => {
        setAuditioning(false);
        ctx.close().catch(() => {});
      };
    } catch {
      setAuditioning(false);
    }
  };

  const handleBounceToTrack = async () => {
    if (notes.length === 0) return;
    setBouncing(true);
    try {
      const buf = await renderMidiNotesToAudioBuffer(notes, bpm, TOTAL_STEPS, 44100);
      const instName = INSTRUMENT_CATALOG.find((i) => i.id === selectedInstrument)?.name || 'MIDI Synth';
      onBounceToTimeline(buf, `${instName} (${notes.length} notes)`);
    } finally {
      setBouncing(false);
    }
  };

  return (
    <div className="rounded-xl bg-[#0F1219] border border-slate-800/80 p-4 space-y-3">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <h4 className="font-display text-sm font-semibold text-slate-100">
            Tone.js Virtual Instrument Piano Roll (32-Step / 2-Bar MIDI Grid)
          </h4>
          <p className="text-[11px] text-slate-400">
            Click cells to place or remove MIDI notes · Audition chords live via Tone.js · Bounce straight to Multitrack Timeline
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedInstrument}
            onChange={(e) => onSelectInstrument(e.target.value as InstrumentId)}
            aria-label="Virtual instrument"
            className="px-2.5 py-1.5 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-purple-200 focus:outline-none focus:border-purple-500"
          >
            {INSTRUMENT_CATALOG.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name} · {inst.category}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleAuditionAll}
            disabled={notes.length === 0 || auditioning}
            className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{auditioning ? 'Playing MIDI...' : 'Audition Loop'}</span>
          </button>

          <button
            type="button"
            onClick={handleBounceToTrack}
            disabled={notes.length === 0 || bouncing}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{bouncing ? 'Bouncing...' : 'Bounce to Timeline'}</span>
          </button>
        </div>
      </div>

      {/* Note Draw Settings + Quantize + Chord Progressions */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-slate-400">
            <span>Length</span>
            <select
              value={noteDurationSteps}
              onChange={(e) => setNoteDurationSteps(Number(e.target.value))}
              className="px-2 py-1 rounded bg-[#090B10] border border-slate-800 text-slate-200 font-mono"
            >
              <option value={1}>1/16 step</option>
              <option value={2}>1/8 (2 steps)</option>
              <option value={4}>1/4 (4 steps)</option>
              <option value={8}>1/2 (8 steps)</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-slate-400">
            <span>Vel</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={noteVelocity}
              onChange={(e) => setNoteVelocity(Number(e.target.value))}
              className="studio-slider w-16"
            />
            <span className="font-mono text-sky-300 tabular-nums">{Math.round(noteVelocity * 100)}%</span>
          </label>

          <div className="flex items-center gap-1">
            <select
              value={quantizeDiv}
              onChange={(e) => setQuantizeDiv(Number(e.target.value) as 1 | 2 | 4)}
              className="px-2 py-1 rounded bg-[#090B10] border border-slate-800 text-slate-300 font-mono"
            >
              <option value={1}>1/16</option>
              <option value={2}>1/8</option>
              <option value={4}>1/4</option>
            </select>
            <button
              type="button"
              onClick={handleQuantize}
              className="px-2.5 py-1 rounded bg-[#151923] hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center gap-1 whitespace-nowrap"
            >
              <Grid className="w-3 h-3 text-sky-400" />
              <span>Quantize</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CHORD_PROGRESSIONS.map((cp, i) => (
            <button
              key={cp.name}
              type="button"
              onClick={() => handleLoadChordProg(i)}
              title={cp.vibe}
              className="px-2.5 py-1 rounded bg-[#090B10] hover:bg-[#151923] border border-slate-800 text-[11px] text-purple-200 flex items-center gap-1 whitespace-nowrap"
            >
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>{cp.name}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChangeNotes([])}
            className="px-2 py-1 rounded bg-[#090B10] hover:bg-red-950/50 border border-slate-800 text-slate-400 hover:text-red-300 flex items-center gap-1"
            title="Clear all MIDI notes"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Piano Roll Matrix */}
      <div className="overflow-x-auto max-h-[340px] overflow-y-auto rounded-lg border border-slate-800 bg-[#090B10]">
        <div className="min-w-[820px]">
          {PITCH_ROWS.map((pitch) => {
            const label = midiToNoteName(pitch);
            const isBlackKey = label.includes('#');
            return (
              <div key={pitch} className="flex items-stretch border-b border-slate-900 h-5">
                <button
                  type="button"
                  onClick={() => auditionMidiNoteWithTone(pitch, selectedInstrument, 0.3, noteVelocity)}
                  className={`w-14 shrink-0 px-2 text-left text-[10px] font-mono border-r border-slate-800 flex items-center justify-between ${
                    isBlackKey
                      ? 'bg-[#0D1017] text-slate-400 hover:bg-slate-800'
                      : 'bg-[#141824] text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span>{label}</span>
                </button>
                <div className="flex-1 grid grid-cols-[repeat(32,minmax(0,1fr))]">
                  {Array.from({ length: TOTAL_STEPS }, (_, step) => {
                    const activeNote = notes.find(
                      (n) =>
                        n.pitch === pitch &&
                        step >= n.startStep &&
                        step < n.startStep + n.durationSteps
                    );
                    const isStart = activeNote?.startStep === step;
                    const isBarLine = step % 16 === 0;
                    const isBeatLine = step % 4 === 0;
                    return (
                      <button
                        key={step}
                        type="button"
                        onClick={() => toggleCell(pitch, step)}
                        className={`h-full border-r transition-colors ${
                          isBarLine
                            ? 'border-l border-l-purple-500/40 border-slate-900'
                            : isBeatLine
                            ? 'border-slate-800'
                            : 'border-slate-900/70'
                        } ${
                          activeNote
                            ? isStart
                              ? 'bg-gradient-to-r from-purple-500 to-sky-500'
                              : 'bg-sky-500/70'
                            : isBlackKey
                            ? 'bg-[#0A0C12] hover:bg-slate-800/60'
                            : 'bg-[#0D1018] hover:bg-slate-800/60'
                        }`}
                        aria-label={`${label} step ${step + 1}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
