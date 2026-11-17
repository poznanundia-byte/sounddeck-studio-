// Tone.js Virtual Instruments & Offline MIDI-to-AudioBuffer Renderer
import * as Tone from 'tone';
import type { InstrumentId, MidiNote } from '../types/studioPro';

export const INSTRUMENT_CATALOG: {
  id: InstrumentId;
  name: string;
  subtitle: string;
  category: 'bass' | 'keys' | 'lead' | 'african_perc' | 'brass';
}[] = [
  { id: '808_sub', name: '808 Sub Glide', subtitle: 'Deep Nairobi Drill / Trap bass', category: 'bass' },
  { id: 'rhodes_ep', name: 'Midnight Rhodes EP', subtitle: 'Warm Afro / R&B electric piano', category: 'keys' },
  { id: 'synth_lead', name: 'Neon Synth Lead', subtitle: 'Futuristic poly / pluck lead', category: 'lead' },
  { id: 'kalimba_log', name: 'African Kalimba & Log', subtitle: 'Amapiano log drum & coastal thumb piano', category: 'african_perc' },
  { id: 'brass_stab', name: 'Studio Brass Stab', subtitle: 'Gengetone / Dancehall / Gospel horns', category: 'brass' },
  { id: 'gospel_organ', name: 'Gospel Drawbar Organ', subtitle: 'Warm harmonic organ sustains', category: 'keys' },
];

export function midiToNoteName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const note = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function buildToneInstrumentForPlayback(instrument: InstrumentId): {
  trigger: (noteName: string, durSec: number, velocity: number, time?: number) => void;
  dispose: () => void;
} {
  switch (instrument) {
    case '808_sub': {
      const synth = new Tone.MonoSynth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.008, decay: 0.45, sustain: 0.35, release: 0.35 },
        filter: { Q: 2, type: 'lowpass', rolloff: -24 },
        filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.3, baseFrequency: 95, octaves: 2.5 },
      }).toDestination();
      synth.volume.value = -4;
      return {
        trigger: (n, d, v, t) => synth.triggerAttackRelease(n, d, t, v),
        dispose: () => synth.dispose(),
      };
    }
    case 'rhodes_ep': {
      const synth = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2,
        modulationIndex: 2.2,
        envelope: { attack: 0.012, decay: 0.5, sustain: 0.3, release: 0.65 },
        modulationEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.1, release: 0.3 },
      }).toDestination();
      synth.volume.value = -7;
      return {
        trigger: (n, d, v, t) => synth.triggerAttackRelease(n, d, t, v),
        dispose: () => synth.dispose(),
      };
    }
    case 'synth_lead': {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.015, decay: 0.22, sustain: 0.45, release: 0.35 },
      }).toDestination();
      synth.volume.value = -9;
      return {
        trigger: (n, d, v, t) => synth.triggerAttackRelease(n, d, t, v),
        dispose: () => synth.dispose(),
      };
    }
    case 'kalimba_log': {
      const synth = new Tone.PolySynth(Tone.MembraneSynth, {
        pitchDecay: 0.055,
        octaves: 3.2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.004, decay: 0.36, sustain: 0.04, release: 0.28 },
      }).toDestination();
      synth.volume.value = -5;
      return {
        trigger: (n, d, v, t) => synth.triggerAttackRelease(n, d, t, v),
        dispose: () => synth.dispose(),
      };
    }
    case 'brass_stab': {
      const synth = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 1.5,
        envelope: { attack: 0.03, decay: 0.25, sustain: 0.5, release: 0.25 },
      }).toDestination();
      synth.volume.value = -7;
      return {
        trigger: (n, d, v, t) => synth.triggerAttackRelease(n, d, t, v),
        dispose: () => synth.dispose(),
      };
    }
    case 'gospel_organ':
    default: {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle8' },
        envelope: { attack: 0.025, decay: 0.2, sustain: 0.78, release: 0.4 },
      }).toDestination();
      synth.volume.value = -7;
      return {
        trigger: (n, d, v, t) => synth.triggerAttackRelease(n, d, t, v),
        dispose: () => synth.dispose(),
      };
    }
  }
}

export async function auditionMidiNoteWithTone(
  midiPitch: number,
  instrument: InstrumentId,
  durationSec = 0.35,
  velocity = 0.85
): Promise<void> {
  await Tone.start();
  const voice = buildToneInstrumentForPlayback(instrument);
  const noteName = midiToNoteName(midiPitch);
  voice.trigger(noteName, durationSec, velocity);
  window.setTimeout(() => {
    voice.dispose();
  }, Math.round((durationSec + 1.1) * 1000));
}

export async function auditionChordWithTone(
  midiNotes: number[],
  instrument: InstrumentId = 'rhodes_ep',
  durationSec = 0.85
): Promise<void> {
  if (midiNotes.length === 0) return;
  await Tone.start();
  const voice = buildToneInstrumentForPlayback(instrument);
  const now = Tone.now();
  midiNotes.forEach((m) => {
    voice.trigger(midiToNoteName(m), durationSec, 0.75, now);
  });
  window.setTimeout(() => {
    voice.dispose();
  }, Math.round((durationSec + 1.2) * 1000));
}

// Offline Web Audio polyphonic renderer (deterministic & fast for timeline bouncing and export)
export async function renderMidiNotesToAudioBuffer(
  notes: MidiNote[],
  bpm: number,
  totalSteps = 32,
  sampleRate = 44100
): Promise<AudioBuffer> {
  const stepSec = 60 / Math.max(40, Math.min(240, bpm)) / 4;
  const totalDur = Math.max(1.0, totalSteps * stepSec + 0.65);
  const offline = new OfflineAudioContext(2, Math.ceil(totalDur * sampleRate), sampleRate);

  const master = offline.createGain();
  master.gain.value = 0.82;
  master.connect(offline.destination);

  notes.forEach((note) => {
    const startSec = note.startStep * stepSec;
    const durSec = Math.max(0.08, note.durationSteps * stepSec);
    const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);
    const vel = Math.max(0.1, Math.min(1, note.velocity));

    if (note.instrument === '808_sub') {
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 1.45, startSec);
      osc.frequency.exponentialRampToValueAtTime(Math.max(28, freq), startSec + 0.045);

      const g = offline.createGain();
      g.gain.setValueAtTime(0.001, startSec);
      g.gain.linearRampToValueAtTime(0.95 * vel, startSec + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, startSec + durSec + 0.18);

      osc.connect(g).connect(master);
      osc.start(startSec);
      osc.stop(startSec + durSec + 0.2);
    } else if (note.instrument === 'kalimba_log') {
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 1.9, startSec);
      osc.frequency.exponentialRampToValueAtTime(Math.max(45, freq), startSec + 0.06);

      const g = offline.createGain();
      g.gain.setValueAtTime(0.85 * vel, startSec);
      g.gain.exponentialRampToValueAtTime(0.001, startSec + Math.min(0.45, durSec + 0.12));

      osc.connect(g).connect(master);
      osc.start(startSec);
      osc.stop(startSec + Math.min(0.48, durSec + 0.15));
    } else if (note.instrument === 'rhodes_ep' || note.instrument === 'gospel_organ') {
      const carrier = offline.createOscillator();
      const overtone = offline.createOscillator();
      carrier.type = note.instrument === 'gospel_organ' ? 'triangle' : 'sine';
      overtone.type = note.instrument === 'gospel_organ' ? 'sine' : 'triangle';
      carrier.frequency.setValueAtTime(freq, startSec);
      overtone.frequency.setValueAtTime(freq * 2, startSec);

      const filter = offline.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(note.instrument === 'gospel_organ' ? 3200 : 2400, startSec);

      const g = offline.createGain();
      g.gain.setValueAtTime(0.001, startSec);
      g.gain.linearRampToValueAtTime(0.38 * vel, startSec + 0.018);
      g.gain.exponentialRampToValueAtTime(0.001, startSec + durSec + 0.25);

      const overGain = offline.createGain();
      overGain.gain.value = 0.24;

      carrier.connect(filter);
      overtone.connect(overGain).connect(filter);
      filter.connect(g).connect(master);

      carrier.start(startSec);
      overtone.start(startSec);
      carrier.stop(startSec + durSec + 0.28);
      overtone.stop(startSec + durSec + 0.28);
    } else {
      // synth_lead or brass_stab
      const osc1 = offline.createOscillator();
      const osc2 = offline.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, startSec);
      osc2.frequency.setValueAtTime(freq * 1.005, startSec);

      const lp = offline.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(note.instrument === 'brass_stab' ? 2800 : 4200, startSec);
      lp.frequency.exponentialRampToValueAtTime(1100, startSec + durSec);

      const g = offline.createGain();
      g.gain.setValueAtTime(0.001, startSec);
      g.gain.linearRampToValueAtTime(0.28 * vel, startSec + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, startSec + durSec + 0.14);

      osc1.connect(lp);
      osc2.connect(lp);
      lp.connect(g).connect(master);

      osc1.start(startSec);
      osc2.start(startSec);
      osc1.stop(startSec + durSec + 0.16);
      osc2.stop(startSec + durSec + 0.16);
    }
  });

  return offline.startRendering();
}
