// Dedicated African Music Production Center Catalog (11 Genres, Procedural Web Audio Synthesis + MIDI Patterns)
// Every audio element is procedurally synthesized inside Web Audio API (100% Original, Cleared for Creator Use)
import type { MidiNote, InstrumentId } from '../types/studioPro';
import type { DrumPadId } from './studioAudio';

export type AfricanLibraryGenre =
  | 'Gengetone'
  | 'Kenyan Drill'
  | 'Afrobeat'
  | 'Afropop'
  | 'Amapiano'
  | 'Bongo Flava'
  | 'Dancehall'
  | 'Trap'
  | 'Hip-Hop'
  | 'Gospel'
  | 'R&B';

export type AfricanAssetCategory =
  | 'African Percussion'
  | 'Drum Kits'
  | 'Bass Sounds'
  | 'Synthesizers'
  | 'Melodies'
  | 'Vocal Samples'
  | 'Instrument Loops'
  | 'MIDI Patterns';

export interface AfricanSoundAsset {
  id: string;
  title: string;
  genre: AfricanLibraryGenre;
  regionOrigin: string;
  category: AfricanAssetCategory;
  bpm: number;
  musicalKey: string;
  durationSec: number;
  licenseLabel: string;
  description: string;
  synthRecipe:
    | 'kengele_perc'
    | 'kayamba_shaker'
    | 'amapiano_log'
    | 'genge_kit'
    | 'drill_slide_808'
    | 'afro_rim_loop'
    | 'bongo_marimba'
    | 'gospel_brass'
    | 'rnb_rhodes'
    | 'vocal_chant_synth'
    | 'dancehall_bass'
    | 'trap_bell_lead'
    | 'afropop_guitar';
  instrumentHint: InstrumentId;
  midiPattern?: Omit<MidiNote, 'id'>[];
  stepPatternPreset?: Partial<Record<DrumPadId, boolean[]>>;
}

export const AFRICAN_LIBRARY_GENRES: AfricanLibraryGenre[] = [
  'Gengetone',
  'Kenyan Drill',
  'Afrobeat',
  'Afropop',
  'Amapiano',
  'Bongo Flava',
  'Dancehall',
  'Trap',
  'Hip-Hop',
  'Gospel',
  'R&B',
];

export const AFRICAN_ASSET_CATEGORIES: AfricanAssetCategory[] = [
  'African Percussion',
  'Drum Kits',
  'Bass Sounds',
  'Synthesizers',
  'Melodies',
  'Vocal Samples',
  'Instrument Loops',
  'MIDI Patterns',
];

export const AFRICAN_SOUND_CATALOG: AfricanSoundAsset[] = [
  {
    id: 'af_genge_dembow_kit',
    title: 'Nairobi Street Bounce Kit',
    genre: 'Gengetone',
    regionOrigin: 'Kenya · Nairobi',
    category: 'Drum Kits',
    bpm: 106,
    musicalKey: 'A minor',
    durationSec: 4.5,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Punchy Nairobi 808 kick, dembow snare pocket, wood rim, and bounce log pattern.',
    synthRecipe: 'genge_kit',
    instrumentHint: '808_sub',
    stepPatternPreset: {
      kick808: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, true, false, false, true, false, false, false, false, true, false, false, true, false],
      logDrum: [false, false, true, false, false, false, false, true, false, false, true, false, false, false, false, false],
      rimshot: [false, false, false, false, false, false, true, false, false, false, false, false, false, false, true, true],
    },
  },
  {
    id: 'af_kenyan_drill_808',
    title: 'Westlands Sliding 808 Glide',
    genre: 'Kenyan Drill',
    regionOrigin: 'Kenya · Nairobi',
    category: 'Bass Sounds',
    bpm: 142,
    musicalKey: 'C minor',
    durationSec: 3.4,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Pitch-gliding sub 808 tail tuned in C minor with octave slides for Kenyan & UK Drill.',
    synthRecipe: 'drill_slide_808',
    instrumentHint: '808_sub',
    midiPattern: [
      { pitch: 36, startStep: 0, durationSteps: 6, velocity: 0.95, instrument: '808_sub' },
      { pitch: 48, startStep: 6, durationSteps: 2, velocity: 0.85, instrument: '808_sub' },
      { pitch: 43, startStep: 8, durationSteps: 4, velocity: 0.9, instrument: '808_sub' },
      { pitch: 39, startStep: 12, durationSteps: 4, velocity: 0.92, instrument: '808_sub' },
    ],
  },
  {
    id: 'af_kengele_perc',
    title: 'Coastal Kengele & Kayamba Loop',
    genre: 'Afrobeat',
    regionOrigin: 'East Africa · Coastal Kenya',
    category: 'African Percussion',
    bpm: 112,
    musicalKey: 'C major',
    durationSec: 4.3,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Metallic Kengele bell groove layered over high-density woven Kayamba shaker pocket.',
    synthRecipe: 'kengele_perc',
    instrumentHint: 'kalimba_log',
  },
  {
    id: 'af_amapiano_log_bass',
    title: 'Soweto Deep Log Drum & Sub',
    genre: 'Amapiano',
    regionOrigin: 'South & East Africa',
    category: 'Bass Sounds',
    bpm: 113,
    musicalKey: 'F minor',
    durationSec: 4.2,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Signature rubbery Amapiano log-drum transient fused with warm sine sub fundamental.',
    synthRecipe: 'amapiano_log',
    instrumentHint: 'kalimba_log',
    midiPattern: [
      { pitch: 41, startStep: 0, durationSteps: 2, velocity: 0.9, instrument: 'kalimba_log' },
      { pitch: 41, startStep: 3, durationSteps: 2, velocity: 0.78, instrument: 'kalimba_log' },
      { pitch: 44, startStep: 6, durationSteps: 2, velocity: 0.88, instrument: 'kalimba_log' },
      { pitch: 48, startStep: 10, durationSteps: 2, velocity: 0.92, instrument: 'kalimba_log' },
      { pitch: 46, startStep: 13, durationSteps: 3, velocity: 0.85, instrument: 'kalimba_log' },
    ],
  },
  {
    id: 'af_bongo_flava_marimba',
    title: 'Dar Es Salaam Sunset Marimba',
    genre: 'Bongo Flava',
    regionOrigin: 'Tanzania · East Africa',
    category: 'Melodies',
    bpm: 98,
    musicalKey: 'G major',
    durationSec: 4.9,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Warm coastal marimba & kalimba melodic hook ideal for romantic Bongo Flava verses.',
    synthRecipe: 'bongo_marimba',
    instrumentHint: 'kalimba_log',
    midiPattern: [
      { pitch: 67, startStep: 0, durationSteps: 2, velocity: 0.85, instrument: 'kalimba_log' },
      { pitch: 71, startStep: 3, durationSteps: 2, velocity: 0.8, instrument: 'kalimba_log' },
      { pitch: 74, startStep: 6, durationSteps: 3, velocity: 0.88, instrument: 'kalimba_log' },
      { pitch: 72, startStep: 10, durationSteps: 2, velocity: 0.8, instrument: 'kalimba_log' },
      { pitch: 69, startStep: 12, durationSteps: 4, velocity: 0.85, instrument: 'kalimba_log' },
    ],
  },
  {
    id: 'af_afropop_guitar_loop',
    title: 'Highlife Pluck Guitar Pattern',
    genre: 'Afropop',
    regionOrigin: 'West & East Africa',
    category: 'Instrument Loops',
    bpm: 108,
    musicalKey: 'A minor',
    durationSec: 4.4,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Crisp palm-muted electric pluck arpeggio sitting naturally behind lead vocals.',
    synthRecipe: 'afropop_guitar',
    instrumentHint: 'rhodes_ep',
    midiPattern: [
      { pitch: 69, startStep: 0, durationSteps: 2, velocity: 0.82, instrument: 'rhodes_ep' },
      { pitch: 72, startStep: 2, durationSteps: 2, velocity: 0.78, instrument: 'rhodes_ep' },
      { pitch: 76, startStep: 4, durationSteps: 2, velocity: 0.86, instrument: 'rhodes_ep' },
      { pitch: 74, startStep: 8, durationSteps: 2, velocity: 0.8, instrument: 'rhodes_ep' },
      { pitch: 72, startStep: 10, durationSteps: 2, velocity: 0.76, instrument: 'rhodes_ep' },
      { pitch: 71, startStep: 12, durationSteps: 4, velocity: 0.84, instrument: 'rhodes_ep' },
    ],
  },
  {
    id: 'af_dancehall_riddim_bass',
    title: 'Kingston-Nairobi Riddim Sub',
    genre: 'Dancehall',
    regionOrigin: 'Caribbean · Kenya',
    category: 'Bass Sounds',
    bpm: 96,
    musicalKey: 'D minor',
    durationSec: 5.0,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Syncopated Dancehall bassline with sub harmonic saturation for sound-system clarity.',
    synthRecipe: 'dancehall_bass',
    instrumentHint: '808_sub',
  },
  {
    id: 'af_trap_bell_arp',
    title: 'Midnight Neon Trap Bells',
    genre: 'Trap',
    regionOrigin: 'Global',
    category: 'Synthesizers',
    bpm: 140,
    musicalKey: 'A minor',
    durationSec: 3.4,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Dark crystalline FM bell arp tuned to A harmonic minor.',
    synthRecipe: 'trap_bell_lead',
    instrumentHint: 'synth_lead',
    midiPattern: [
      { pitch: 69, startStep: 0, durationSteps: 2, velocity: 0.8, instrument: 'synth_lead' },
      { pitch: 72, startStep: 2, durationSteps: 2, velocity: 0.75, instrument: 'synth_lead' },
      { pitch: 76, startStep: 4, durationSteps: 2, velocity: 0.85, instrument: 'synth_lead' },
      { pitch: 77, startStep: 6, durationSteps: 2, velocity: 0.82, instrument: 'synth_lead' },
      { pitch: 76, startStep: 8, durationSteps: 4, velocity: 0.88, instrument: 'synth_lead' },
    ],
  },
  {
    id: 'af_hiphop_boom_perc',
    title: 'Golden Era Rim & Shaker Pocket',
    genre: 'Hip-Hop',
    regionOrigin: 'Global',
    category: 'African Percussion',
    bpm: 92,
    musicalKey: 'G minor',
    durationSec: 5.2,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Organic swung shaker and tight woody rim pocket for conscious Hip-Hop storytelling.',
    synthRecipe: 'kayamba_shaker',
    instrumentHint: 'kalimba_log',
  },
  {
    id: 'af_gospel_praise_brass',
    title: 'Jubilee Praise Brass & Organ MIDI',
    genre: 'Gospel',
    regionOrigin: 'East Africa · Global',
    category: 'MIDI Patterns',
    bpm: 114,
    musicalKey: 'C major',
    durationSec: 4.2,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Classic I-IV-V-vi gospel praise turnaround chords ready for Organ or Brass Stab.',
    synthRecipe: 'gospel_brass',
    instrumentHint: 'gospel_organ',
    midiPattern: [
      { pitch: 60, startStep: 0, durationSteps: 4, velocity: 0.85, instrument: 'gospel_organ' },
      { pitch: 64, startStep: 0, durationSteps: 4, velocity: 0.8, instrument: 'gospel_organ' },
      { pitch: 67, startStep: 0, durationSteps: 4, velocity: 0.8, instrument: 'gospel_organ' },
      { pitch: 65, startStep: 4, durationSteps: 4, velocity: 0.85, instrument: 'gospel_organ' },
      { pitch: 69, startStep: 4, durationSteps: 4, velocity: 0.8, instrument: 'gospel_organ' },
      { pitch: 72, startStep: 4, durationSteps: 4, velocity: 0.8, instrument: 'gospel_organ' },
      { pitch: 67, startStep: 8, durationSteps: 4, velocity: 0.88, instrument: 'gospel_organ' },
      { pitch: 71, startStep: 8, durationSteps: 4, velocity: 0.82, instrument: 'gospel_organ' },
      { pitch: 74, startStep: 8, durationSteps: 4, velocity: 0.82, instrument: 'gospel_organ' },
      { pitch: 69, startStep: 12, durationSteps: 4, velocity: 0.84, instrument: 'gospel_organ' },
      { pitch: 72, startStep: 12, durationSteps: 4, velocity: 0.8, instrument: 'gospel_organ' },
      { pitch: 76, startStep: 12, durationSteps: 4, velocity: 0.8, instrument: 'gospel_organ' },
    ],
  },
  {
    id: 'af_rnb_velvet_chords',
    title: 'Velvet Late-Night Rhodes Neo-Soul',
    genre: 'R&B',
    regionOrigin: 'Global',
    category: 'Instrument Loops',
    bpm: 84,
    musicalKey: 'D minor',
    durationSec: 5.7,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Lush Dm9 -> Gm9 -> C13 -> A7alt Rhodes chord progression loop.',
    synthRecipe: 'rnb_rhodes',
    instrumentHint: 'rhodes_ep',
    midiPattern: [
      { pitch: 62, startStep: 0, durationSteps: 6, velocity: 0.78, instrument: 'rhodes_ep' },
      { pitch: 65, startStep: 0, durationSteps: 6, velocity: 0.75, instrument: 'rhodes_ep' },
      { pitch: 69, startStep: 0, durationSteps: 6, velocity: 0.75, instrument: 'rhodes_ep' },
      { pitch: 72, startStep: 0, durationSteps: 6, velocity: 0.72, instrument: 'rhodes_ep' },
      { pitch: 67, startStep: 8, durationSteps: 8, velocity: 0.8, instrument: 'rhodes_ep' },
      { pitch: 70, startStep: 8, durationSteps: 8, velocity: 0.75, instrument: 'rhodes_ep' },
      { pitch: 74, startStep: 8, durationSteps: 8, velocity: 0.75, instrument: 'rhodes_ep' },
      { pitch: 77, startStep: 8, durationSteps: 8, velocity: 0.72, instrument: 'rhodes_ep' },
    ],
  },
  {
    id: 'af_vocal_chop_pad',
    title: 'Formant Vocal Choir Texture',
    genre: 'Afropop',
    regionOrigin: 'Pan-African',
    category: 'Vocal Samples',
    bpm: 110,
    musicalKey: 'A minor',
    durationSec: 4.3,
    licenseLabel: 'Original SoundDeck Procedural Formant Synth',
    description: 'Synthesized formant-filtered vocal "Ah/Eh" atmospheric chop loop (no external recordings).',
    synthRecipe: 'vocal_chant_synth',
    instrumentHint: 'synth_lead',
  },
  {
    id: 'af_afrobeat_rim_pocket',
    title: 'Lagos-Nairobi Afro Rimshot Stem',
    genre: 'Afrobeat',
    regionOrigin: 'West & East Africa',
    category: 'Drum Kits',
    bpm: 112,
    musicalKey: 'A minor',
    durationSec: 4.3,
    licenseLabel: 'Original SoundDeck Procedural Audio',
    description: 'Classic 3-2 clave Afro rimshot & conga-style tom stem.',
    synthRecipe: 'afro_rim_loop',
    instrumentHint: 'kalimba_log',
  },
];

// Procedural Web Audio synthesis for every item in the African Sound Library
export async function renderAfricanLibraryItemBuffer(
  item: AfricanSoundAsset,
  sampleRate = 44100
): Promise<AudioBuffer> {
  const dur = Math.max(2.0, item.durationSec);
  const offline = new OfflineAudioContext(2, Math.ceil(dur * sampleRate), sampleRate);
  const master = offline.createGain();
  master.gain.value = 0.82;
  master.connect(offline.destination);

  const stepSec = 60 / item.bpm / 4;
  const totalSteps = Math.floor(dur / stepSec);

  const makeNoise = (lenSec: number) => {
    const b = offline.createBuffer(1, Math.max(1, Math.floor(sampleRate * lenSec)), sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };

  for (let s = 0; s < totalSteps; s++) {
    const t = s * stepSec;

    if (item.synthRecipe === 'genge_kit' || item.synthRecipe === 'afro_rim_loop') {
      if (s % 4 === 0 && item.synthRecipe === 'genge_kit') {
        const osc = offline.createOscillator();
        const g = offline.createGain();
        osc.frequency.setValueAtTime(155, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.16);
        g.gain.setValueAtTime(0.95, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 0.28);
      }
      if (s % 8 === 3 || s % 8 === 6) {
        const osc = offline.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(280, t + 0.04);
        const bp = offline.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1650;
        const g = offline.createGain();
        g.gain.setValueAtTime(0.55, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(bp).connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 0.07);
      }
    }

    if (item.synthRecipe === 'kengele_perc' || item.synthRecipe === 'kayamba_shaker') {
      // Shaker on every 16th with accent dynamics
      const n = offline.createBufferSource();
      n.buffer = makeNoise(0.06);
      const bp = offline.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = item.synthRecipe === 'kengele_perc' ? 6800 : 7600;
      bp.Q.value = 2.2;
      const g = offline.createGain();
      g.gain.setValueAtTime(s % 2 === 0 ? 0.34 : 0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      n.connect(bp).connect(g).connect(master);
      n.start(t);

      // Kengele bell metallic hit
      if (item.synthRecipe === 'kengele_perc' && (s % 8 === 0 || s % 8 === 3 || s % 8 === 6)) {
        const osc1 = offline.createOscillator();
        const osc2 = offline.createOscillator();
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(840, t);
        osc2.frequency.setValueAtTime(1260, t);
        const bg = offline.createGain();
        bg.gain.setValueAtTime(0.32, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        osc1.connect(bg).connect(master);
        osc2.connect(bg);
        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.12);
        osc2.stop(t + 0.12);
      }
    }

    if (item.synthRecipe === 'amapiano_log' && (s % 16 === 0 || s % 16 === 3 || s % 16 === 6 || s % 16 === 10 || s % 16 === 13)) {
      const notes = [69, 69, 77, 87, 73];
      const freq = notes[s % notes.length];
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 2.6, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.075);
      const g = offline.createGain();
      g.gain.setValueAtTime(0.95, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.34);
    }

    if ((item.synthRecipe === 'drill_slide_808' || item.synthRecipe === 'dancehall_bass') && (s % 16 === 0 || s % 16 === 6 || s % 16 === 10)) {
      const osc = offline.createOscillator();
      osc.type = 'sine';
      const baseHz = s % 16 === 6 ? 98 : 49;
      osc.frequency.setValueAtTime(baseHz, t);
      if (item.synthRecipe === 'drill_slide_808' && s % 16 === 6) {
        osc.frequency.exponentialRampToValueAtTime(65.4, t + 0.25);
      }
      const g = offline.createGain();
      g.gain.setValueAtTime(0.92, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + stepSec * 4.5);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + stepSec * 4.6);
    }

    if (
      (item.synthRecipe === 'bongo_marimba' ||
        item.synthRecipe === 'afropop_guitar' ||
        item.synthRecipe === 'trap_bell_lead') &&
      (s % 4 === 0 || s % 8 === 3 || s % 8 === 6)
    ) {
      const scale = [392, 440, 493.88, 587.33, 659.25];
      const f = scale[s % scale.length];
      const osc = offline.createOscillator();
      osc.type = item.synthRecipe === 'trap_bell_lead' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, t);
      const lp = offline.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      const g = offline.createGain();
      g.gain.setValueAtTime(0.42, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(lp).connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.3);
    }

    if ((item.synthRecipe === 'gospel_brass' || item.synthRecipe === 'rnb_rhodes') && s % 8 === 0) {
      const chord = item.synthRecipe === 'gospel_brass' ? [261.63, 329.63, 392, 493.88] : [293.66, 349.23, 440, 523.25];
      chord.forEach((freq) => {
        const osc = offline.createOscillator();
        osc.type = item.synthRecipe === 'gospel_brass' ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(freq, t);
        const lp = offline.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = item.synthRecipe === 'gospel_brass' ? 2400 : 1900;
        const g = offline.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.025);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepSec * 7.2);
        osc.connect(lp).connect(g).connect(master);
        osc.start(t);
        osc.stop(t + stepSec * 7.5);
      });
    }

    if (item.synthRecipe === 'vocal_chant_synth' && s % 8 === 0) {
      const osc = offline.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(s % 16 === 0 ? 220 : 261.63, t);
      const formant1 = offline.createBiquadFilter();
      formant1.type = 'bandpass';
      formant1.frequency.value = s % 16 === 0 ? 730 : 540;
      formant1.Q.value = 3.5;
      const g = offline.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.48, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + stepSec * 6.5);
      osc.connect(formant1).connect(g).connect(master);
      osc.start(t);
      osc.stop(t + stepSec * 6.8);
    }
  }

  return offline.startRendering();
}
