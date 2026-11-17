import { useCallback, useEffect, useState } from 'react';
import {
  clearOfflineAudioBlobs,
  deleteOfflineAudioBlob,
  getAllOfflineBlobSizes,
  OFFLINE_LIBRARY_EVENT,
  OFFLINE_LIBRARY_STORAGE_KEY,
  readOfflineLibraryMetadata,
  saveTrackToOfflineLibraryDb,
  writeOfflineLibraryMetadata,
} from '../audio/offlineLibraryDb';
import { getAudioContext } from '../audio/studioAudio';
import { type OfflineLibraryTrack } from '../types/discoverPlayer';

export function useOfflineLibrary() {
  const [tracks, setTracks] = useState<OfflineLibraryTrack[]>(() =>
    readOfflineLibraryMetadata()
  );
  const [blobSizes, setBlobSizes] = useState<Record<string, number>>({});
  const [loadingSizes, setLoadingSizes] = useState(true);

  const refreshBlobSizes = useCallback(async () => {
    setLoadingSizes(true);
    try {
      const sizes = await getAllOfflineBlobSizes();
      setBlobSizes(sizes);
    } finally {
      setLoadingSizes(false);
    }
  }, []);

  useEffect(() => {
    void refreshBlobSizes();

    const handleLibraryEvent = (ev: Event) => {
      const custom = ev as CustomEvent<OfflineLibraryTrack[] | undefined>;
      if (Array.isArray(custom.detail)) {
        setTracks(custom.detail);
      } else {
        setTracks(readOfflineLibraryMetadata());
      }
      void refreshBlobSizes();
    };

    const handleStorageEvent = (ev: StorageEvent) => {
      if (ev.key === OFFLINE_LIBRARY_STORAGE_KEY) {
        setTracks(readOfflineLibraryMetadata());
        void refreshBlobSizes();
      }
    };

    window.addEventListener(OFFLINE_LIBRARY_EVENT, handleLibraryEvent);
    window.addEventListener('storage', handleStorageEvent);
    return () => {
      window.removeEventListener(OFFLINE_LIBRARY_EVENT, handleLibraryEvent);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [refreshBlobSizes]);

  const saveTrack = useCallback(
    async (
      track: Parameters<typeof saveTrackToOfflineLibraryDb>[0],
      blob: Blob,
      resolvedFullUrl?: string
    ) => {
      const updated = await saveTrackToOfflineLibraryDb(track, blob, resolvedFullUrl);
      setTracks(updated);
      await refreshBlobSizes();
      return updated;
    },
    [refreshBlobSizes]
  );

  const removeTrack = useCallback(
    async (id: string) => {
      const next = readOfflineLibraryMetadata().filter((t) => t.id !== id);
      writeOfflineLibraryMetadata(next);
      setTracks(next);
      await deleteOfflineAudioBlob(id);
      await refreshBlobSizes();
    },
    [refreshBlobSizes]
  );

  const clearLibrary = useCallback(async () => {
    writeOfflineLibraryMetadata([]);
    setTracks([]);
    await clearOfflineAudioBlobs();
    setBlobSizes({});
  }, []);

  const importLocalAudioFile = useCallback(
    async (file: File): Promise<OfflineLibraryTrack> => {
      let durationSec = 0;
      try {
        const ab = await file.arrayBuffer();
        const ctx = getAudioContext();
        const decoded = await ctx.decodeAudioData(ab);
        durationSec = Math.round(decoded.duration);
      } catch {
        durationSec = 180;
      }

      const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
      const extMatch = file.name.match(/\.([^/.]+)$/);
      const format = extMatch ? extMatch[1].toLowerCase() : undefined;
      const trackId = `local_${Date.now()}_${cleanTitle.slice(0, 24).replace(/\s+/g, '_')}`;

      const updated = await saveTrackToOfflineLibraryDb(
        {
          id: trackId,
          title: cleanTitle,
          artist: 'Local Device Audio',
          album: 'Imported Offline Asset',
          genre: 'Local File',
          durationSec,
          source: 'local',
          format,
        },
        file
      );
      setTracks(updated);
      await refreshBlobSizes();
      return updated[0];
    },
    [refreshBlobSizes]
  );

  const totalBytes = tracks.reduce((sum, item) => {
    const size = blobSizes[item.id] ?? item.fileSizeBytes ?? 0;
    return sum + size;
  }, 0);

  return {
    tracks,
    blobSizes,
    totalBytes,
    loadingSizes,
    saveTrack,
    removeTrack,
    clearLibrary,
    importLocalAudioFile,
    refreshBlobSizes,
  };
}
