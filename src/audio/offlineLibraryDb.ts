import { type OfflineLibraryTrack } from '../types/discoverPlayer';

const DB_NAME = 'sounddeck_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_blobs';
export const OFFLINE_LIBRARY_STORAGE_KEY = 'sounddeck_offline_library_songs';
export const OFFLINE_LIBRARY_EVENT = 'sounddeck-offline-library-updated';

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open offline DB'));
  });
}

export async function saveOfflineAudioBlob(trackId: string, blob: Blob): Promise<boolean> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function getOfflineAudioBlob(trackId: string): Promise<Blob | null> {
  try {
    const db = await openOfflineDb();
    const result = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(trackId);
      req.onsuccess = () => resolve((req.result as Blob | undefined) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function getAllOfflineBlobSizes(): Promise<Record<string, number>> {
  try {
    const db = await openOfflineDb();
    const map: Record<string, number> = {};
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const val = cursor.value as Blob | undefined;
          if (val && typeof val.size === 'number') {
            map[String(cursor.key)] = val.size;
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return map;
  } catch {
    return {};
  }
}

export async function deleteOfflineAudioBlob(trackId: string): Promise<void> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore cleanup failure
  }
}

export async function clearOfflineAudioBlobs(): Promise<void> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore cleanup failure
  }
}

export function readOfflineLibraryMetadata(): OfflineLibraryTrack[] {
  try {
    const raw = localStorage.getItem(OFFLINE_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineLibraryTrack[]) : [];
  } catch {
    return [];
  }
}

export function writeOfflineLibraryMetadata(tracks: OfflineLibraryTrack[]): void {
  try {
    localStorage.setItem(OFFLINE_LIBRARY_STORAGE_KEY, JSON.stringify(tracks));
  } catch {
    // ignore quota errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_LIBRARY_EVENT, { detail: tracks }));
  }
}

function inferFormatFromMime(mime?: string): string {
  if (!mime) return 'mp3';
  const lower = mime.toLowerCase();
  if (lower.includes('wav')) return 'wav';
  if (lower.includes('ogg') || lower.includes('opus')) return 'ogg';
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'm4a';
  if (lower.includes('flac')) return 'flac';
  if (lower.includes('webm')) return 'webm';
  return 'mp3';
}

export async function saveTrackToOfflineLibraryDb(
  track: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    genre?: string;
    durationSec?: number;
    coverUrl?: string;
    previewUrl?: string | null;
    fullAudioUrl?: string | null;
    youtubeVideoId?: string;
    soundcloudPermalink?: string;
    soundcloudTrackId?: number;
    source?: string;
    format?: string;
  },
  blob: Blob,
  resolvedFullUrl?: string
): Promise<OfflineLibraryTrack[]> {
  const savedToIndexedDb = await saveOfflineAudioBlob(track.id, blob);
  const newRecord: OfflineLibraryTrack = {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album || 'SoundDeck Offline Audio',
    genre: track.genre || 'Music',
    durationSec: track.durationSec || 180,
    coverUrl: track.coverUrl || '',
    downloadedAt:
      new Date().toLocaleDateString() +
      ' ' +
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    source: track.source || 'global',
    previewUrl: track.previewUrl || undefined,
    fullAudioUrl: resolvedFullUrl || track.fullAudioUrl || undefined,
    youtubeVideoId: track.youtubeVideoId,
    soundcloudPermalink: track.soundcloudPermalink,
    soundcloudTrackId: track.soundcloudTrackId,
    hasLocalBlob: savedToIndexedDb,
    fileSizeBytes: blob.size,
    mimeType: blob.type || 'audio/mpeg',
    format: track.format || inferFormatFromMime(blob.type),
  };

  const existing = readOfflineLibraryMetadata();
  const next = [newRecord, ...existing.filter((item) => item.id !== track.id)];
  writeOfflineLibraryMetadata(next);
  return next;
}
