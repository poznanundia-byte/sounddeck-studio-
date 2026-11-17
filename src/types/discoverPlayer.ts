export interface GlobalSearchTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  durationSec: number;
  coverUrl: string;
  previewUrl: string;
  fullAudioUrl?: string;
  youtubeVideoId?: string;
  soundcloudPermalink?: string;
  soundcloudTrackId?: number;
  playbackCount?: number;
  likesCount?: number;
  soundcloudUserUrl?: string;
  source: 'deezer' | 'itunes' | 'audius' | 'youtube' | 'soundcloud' | 'mdundo' | 'catalog';
  score: number;
}

export interface OfflineLibraryTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  durationSec: number;
  coverUrl: string;
  downloadedAt: string;
  source: string;
  previewUrl?: string;
  fullAudioUrl?: string;
  youtubeVideoId?: string;
  soundcloudPermalink?: string;
  soundcloudTrackId?: number;
  hasLocalBlob?: boolean;
  fileSizeBytes?: number;
  mimeType?: string;
  format?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface SoundCloudArtistProfile {
  id: number;
  username: string;
  fullName: string;
  city: string;
  country: string;
  followersCount: number;
  trackCount: number;
  permalinkUrl: string;
  avatarUrl: string;
  verified: boolean;
}

export interface YoutubeMatchItem {
  videoId: string;
  title: string;
  channel: string;
  durationLabel: string;
  views: string;
  thumbnailUrl: string;
  category?: 'music_video' | 'lyrics_video' | 'audio';
}

export interface PersistentPlayerState {
  track: GlobalSearchTrack;
  mode: 'preview' | 'full';
  youtubeVersions: YoutubeMatchItem[];
  activeYoutubeVideoId: string | null;
  activeSoundCloudPermalink?: string | null;
  activeStreamProvider?: 'audio' | 'youtube' | 'soundcloud';
  loadingFullStream: boolean;
  queue?: GlobalSearchTrack[];
  queueIndex?: number;
  queueLabel?: string;
  playNonce?: number;
}
