export type ProjectCategory = 'beat' | 'recording' | 'song';

export type StudioWorkspaceView =
  | 'dashboard'
  | 'daw'
  | 'african_library'
  | 'vocal_stems'
  | 'mastering'
  | 'assistant_collab';

export type InstrumentId =
  | '808_sub'
  | 'rhodes_ep'
  | 'synth_lead'
  | 'kalimba_log'
  | 'brass_stab'
  | 'gospel_organ';

export interface MidiNote {
  id: string;
  pitch: number; // MIDI 36..84
  startStep: number; // 16th-note grid position 0..31
  durationSteps: number; // >= 1
  velocity: number; // 0.1..1.0
  instrument: InstrumentId;
}

export interface AutomationPoint {
  timeSec: number;
  value: number; // 0..1 normalized (e.g. 0.5 = unity 0dB for volume, center 0 for pan)
}

export interface ProEffectsRackState {
  bypassAll: boolean;
  eq: {
    enabled: boolean;
    lowGainDb: number;
    lowFreqHz: number;
    midGainDb: number;
    midFreqHz: number;
    highGainDb: number;
    highFreqHz: number;
  };
  compressor: {
    enabled: boolean;
    thresholdDb: number;
    ratio: number;
    attackSec: number;
    releaseSec: number;
  };
  limiter: {
    enabled: boolean;
    ceilingDb: number;
    releaseSec: number;
  };
  reverb: {
    enabled: boolean;
    decaySec: number;
    dampingHz: number;
    mix: number;
  };
  delay: {
    enabled: boolean;
    timeSec: number;
    feedback: number;
    mix: number;
  };
  distortion: {
    enabled: boolean;
    drive: number; // 0..100
    toneHz: number;
    mix: number;
  };
  chorus: {
    enabled: boolean;
    rateHz: number;
    depthMs: number;
    mix: number;
  };
  noiseGate: {
    enabled: boolean;
    thresholdDb: number;
    attackMs: number;
    releaseMs: number;
  };
  pitchCorrection: {
    enabled: boolean;
    scale: 'A minor' | 'C major' | 'D minor' | 'G major' | 'Chromatic';
    speed: number; // 0.2..1.0
  };
}

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  startSec: number;
  offsetInSourceSec: number;
  durationSec: number;
  sourceDurationSec: number;
  buffer: AudioBuffer;
  color: string;
  licenseType: 'original_synth' | 'user_recording' | 'african_library_original' | 'imported_external_check_clearance';
  licenseNote: string;
  storageUrl?: string;
}

export interface StudioTrack {
  id: string;
  name: string;
  kind: 'drums' | 'instrument' | 'vocal' | 'audio';
  instrument?: InstrumentId;
  color: string;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  volumeGain: number; // 0..1.5
  pan: number; // -1..1
  effects: ProEffectsRackState;
  automation: AutomationPoint[];
  clips: TimelineClip[];
}

export interface MasterChainState {
  bypass: boolean;
  lowEqDb: number;
  midEqDb: number;
  highEqDb: number;
  multibandEnabled: boolean;
  lowThreshDb: number;
  midThreshDb: number;
  highThreshDb: number;
  stereoWidthPct: number; // 0..180 (100 = normal)
  limiterCeilingDb: number; // -6..-0.1
  outputGainDb: number; // -12..+9
}

export interface MasterTelemetryStats {
  peakDbfs: number;
  integratedLufsApprox: number;
  crestFactorDb: number;
  lowEnergyPct: number;
  midEnergyPct: number;
  highEnergyPct: number;
  stereoCorrelation: number;
  durationSec: number;
}

export interface ExportHistoryEntry {
  id: string;
  fileName: string;
  format: 'wav' | 'mp3' | 'stems' | 'backup_json';
  sampleRate: 44100 | 48000;
  bitDepth?: 16 | 24 | 32;
  createdAtIso: string;
  sizeBytes: number;
}

export interface SampleRightsLedgerItem {
  id: string;
  sourceName: string;
  category: string;
  licenseStatus: 'original_user' | 'original_studio_synth' | 'external_requires_clearance';
  attribution: string;
  verifiedRoyaltyFree: boolean;
}

export interface CollabRoleAssignment {
  id: string;
  email: string;
  displayName: string;
  role: 'producer' | 'artist' | 'engineer';
  splitPct: number;
  addedAtIso: string;
}

export interface TrackCommentItem {
  id: string;
  trackName: string;
  timestampSec: number;
  authorName: string;
  role: 'producer' | 'artist' | 'engineer';
  comment: string;
  createdAtIso: string;
}

export interface ProjectVersionSnapshot {
  id: string;
  label: string;
  summary: string;
  bpm: number;
  musicalKey: string;
  lyrics: string;
  createdBy: string;
  createdAtIso: string;
}
