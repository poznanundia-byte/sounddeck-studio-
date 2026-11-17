import studioHeroBackdrop from './images/studio_hero_backdrop_1794573516682.jpg';
import creatorCoverAfro from './images/creator_cover_afro_1794573516132.jpg';
import creatorCoverSynth from './images/creator_cover_synth_1794573516734.jpg';
import creatorCoverClub from './images/creator_cover_club_1794573519429.jpg';
import djDeckVinyl from './images/dj_deck_vinyl_1794573516670.jpg';

export const STUDIO_IMAGES = {
  heroBackdrop: studioHeroBackdrop,
  coverAfro: creatorCoverAfro,
  coverSynth: creatorCoverSynth,
  coverClub: creatorCoverClub,
  djDeckVinyl,
} as const;

/**
 * Resolves a file inside /public (e.g. "app-logo.png", "pwa-192x192.png", "worklets/studio-gate-worklet.js")
 * against Vite's configured BASE_URL so assets work identically on root domains and GitHub Pages subpaths.
 */
export function resolvePublicAsset(relativePath: string): string {
  const cleanPath = relativePath.replace(/^\/+/, '');
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  if (!base || base === '.') {
    return `./${cleanPath}`;
  }
  return `${base}/${cleanPath}`;
}

export function getStudioOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export function getStudioHostname(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }
  return 'localhost';
}

export function getStudioAppBaseUrl(): string {
  const origin = getStudioOrigin();
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  if (!origin) return base || '/';
  if (!base || base === '.') return `${origin}/`;
  return `${origin}${base}/`;
}
