import { STUDIO_IMAGES } from '../assets/studioAssets';

export interface DiscoverCatalogTrack {
  id: string;
  title: string;
  artist: string;
  role: 'artist' | 'creator' | 'dj';
  genre: string;
  bpm: number;
  durationLabel: string;
  coverUrl: string;
  sodaHandle: string;
  grooveStyle: 'afro' | 'house' | 'trap';
}

export const DISCOVER_CATALOG_TRACKS: DiscoverCatalogTrack[] = [
  {
    id: 'trk-1',
    title: 'Golden Hour Lagos',
    artist: 'Kairo & Nala',
    role: 'artist',
    genre: 'Afrobeats',
    bpm: 112,
    durationLabel: '03:18',
    coverUrl: STUDIO_IMAGES.coverAfro,
    sodaHandle: 'kaironala',
    grooveStyle: 'afro',
  },
  {
    id: 'trk-2',
    title: 'Bronze Resonance',
    artist: 'Studio Monolith',
    role: 'creator',
    genre: 'Electronic / Synth',
    bpm: 124,
    durationLabel: '04:05',
    coverUrl: STUDIO_IMAGES.coverSynth,
    sodaHandle: 'monolithsound',
    grooveStyle: 'house',
  },
  {
    id: 'trk-3',
    title: 'Afterhours Booth 92',
    artist: 'DJ Vesper',
    role: 'dj',
    genre: 'Club / Trap Remix',
    bpm: 140,
    durationLabel: '03:42',
    coverUrl: STUDIO_IMAGES.coverClub,
    sodaHandle: 'djvesper',
    grooveStyle: 'trap',
  },
];
