// Real Offline Multitrack Rendering + WAV (16-bit, 24-bit, 32-bit Float) + Real MP3 Encoding + Project Backup
import { Mp3Encoder } from '@breezystack/lamejs';
import type { MasterChainState, StudioTrack } from '../types/studioPro';
import { applyMasterChainToGraph, buildProEffectChain } from './proChannelStrip';
import { applyVocalAutoTune } from './dawDsp';

export function encodeAudioBufferToWavBlob(
  buffer: AudioBuffer,
  bitDepth: 16 | 24 | 32 = 16
): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteLength = buffer.length * blockAlign;
  const arrayBuf = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(arrayBuf);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // 3 = IEEE Float, 1 = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, dataByteLength, true);

  const chData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    chData.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, chData[c][i] || 0));
      if (bitDepth === 16) {
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      } else if (bitDepth === 24) {
        const val = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
        view.setUint8(offset, val & 0xff);
        view.setUint8(offset + 1, (val >> 8) & 0xff);
        view.setUint8(offset + 2, (val >> 16) & 0xff);
        offset += 3;
      } else {
        view.setFloat32(offset, sample, true);
        offset += 4;
      }
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

export function encodeAudioBufferToMp3Blob(buffer: AudioBuffer, kbps = 192): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const encoder = new Mp3Encoder(numChannels, sampleRate, kbps);

  const leftFloat = buffer.getChannelData(0);
  const rightFloat = numChannels > 1 ? buffer.getChannelData(1) : leftFloat;

  const toInt16 = (src: Float32Array): Int16Array => {
    const out = new Int16Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const s = Math.max(-1, Math.min(1, src[i]));
      out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    }
    return out;
  };

  const leftI16 = toInt16(leftFloat);
  const rightI16 = numChannels > 1 ? toInt16(rightFloat) : undefined;

  const mp3Chunks: BlobPart[] = [];
  const blockSize = 1152;
  for (let i = 0; i < leftI16.length; i += blockSize) {
    const leftSlice = leftI16.subarray(i, i + blockSize);
    const rightSlice = rightI16 ? rightI16.subarray(i, i + blockSize) : undefined;
    const buf = encoder.encodeBuffer(leftSlice, rightSlice);
    if (buf.length > 0) {
      mp3Chunks.push(new Uint8Array(buf));
    }
  }
  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3Chunks.push(new Uint8Array(flushBuf));
  }

  return new Blob(mp3Chunks, { type: 'audio/mpeg' });
}

export async function renderStudioMixOffline(
  tracks: StudioTrack[],
  masterChain: MasterChainState,
  options: {
    sampleRate?: 44100 | 48000;
    onlyTrackId?: string;
    includeMasterChain?: boolean;
  } = {}
): Promise<AudioBuffer | null> {
  const sr = options.sampleRate || 44100;
  const anySolo = !options.onlyTrackId && tracks.some((t) => t.solo);
  const activeTracks = tracks.filter((t) => {
    if (t.clips.length === 0) return false;
    if (options.onlyTrackId) return t.id === options.onlyTrackId;
    return !t.muted && (!anySolo || t.solo);
  });

  if (activeTracks.length === 0) return null;

  let maxEndSec = 2;
  activeTracks.forEach((tr) => {
    tr.clips.forEach((cl) => {
      maxEndSec = Math.max(maxEndSec, cl.startSec + cl.durationSec);
    });
  });

  const tailSec = 1.6;
  const totalFrames = Math.ceil((maxEndSec + tailSec) * sr);
  const offline = new OfflineAudioContext(2, totalFrames, sr);

  const masterBus = offline.createGain();
  masterBus.gain.value = 1;

  if (options.includeMasterChain !== false) {
    applyMasterChainToGraph(offline, masterBus, offline.destination, masterChain);
  } else {
    masterBus.connect(offline.destination);
  }

  for (const track of activeTracks) {
    const trackGain = offline.createGain();
    trackGain.gain.setValueAtTime(Math.max(0, Math.min(1.5, track.volumeGain)), 0);

    // Apply volume automation envelope points linearly across timeline
    if (track.automation.length > 0) {
      const sorted = [...track.automation].sort((a, b) => a.timeSec - b.timeSec);
      sorted.forEach((pt, idx) => {
        const gainVal = Math.max(0, Math.min(1.5, pt.value * 1.5));
        if (idx === 0) {
          trackGain.gain.setValueAtTime(gainVal, Math.max(0, pt.timeSec));
        } else {
          trackGain.gain.linearRampToValueAtTime(gainVal, Math.max(0, pt.timeSec));
        }
      });
    }

    const panner = offline.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, track.pan));

    const fxChain = buildProEffectChain(offline, track.effects);
    trackGain.connect(panner);
    panner.connect(fxChain.input);
    fxChain.output.connect(masterBus);

    for (const clip of track.clips) {
      let clipBuf = clip.buffer;
      if (track.effects.pitchCorrection.enabled && !track.effects.bypassAll) {
        clipBuf = await applyVocalAutoTune(
          offline,
          clip.buffer,
          track.effects.pitchCorrection.scale,
          track.effects.pitchCorrection.speed
        );
      }
      const src = offline.createBufferSource();
      src.buffer = clipBuf;
      src.connect(trackGain);
      const startAt = Math.max(0, clip.startSec);
      const offsetInSrc = Math.max(0, Math.min(clipBuf.duration - 0.05, clip.offsetInSourceSec));
      const playDur = Math.max(0.05, Math.min(clip.durationSec, clipBuf.duration - offsetInSrc));
      src.start(startAt, offsetInSrc, playDur);
    }
  }

  return offline.startRendering();
}

export function triggerFileDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function isValidAudioBlobForExtension(
  blob: Blob,
  ext: 'mp3' | 'wav' | 'ogg' | 'm4a'
): Promise<boolean> {
  if (!blob || blob.size < 1024) return false;
  try {
    const head = new Uint8Array(await blob.slice(0, 2048).arrayBuffer());
    if (ext === 'mp3') {
      if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true; // ID3
      for (let i = 0; i < head.length - 1; i++) {
        if (head[i] === 0xff && (head[i + 1] & 0xe0) === 0xe0) return true;
      }
      return false;
    }
    if (ext === 'wav') {
      return (
        head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
        head[8] === 0x57 && head[9] === 0x41 && head[10] === 0x56 && head[11] === 0x45
      );
    }
    if (ext === 'ogg') {
      return head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53;
    }
    if (ext === 'm4a') {
      return head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
    }
    return false;
  } catch {
    return false;
  }
}

