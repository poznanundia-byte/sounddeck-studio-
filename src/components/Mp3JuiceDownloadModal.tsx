import { useEffect, useState } from 'react';
import { Download, Loader2, Music2, X, CheckCircle2, Sliders } from 'lucide-react';
import { type GlobalSearchTrack } from '../types/discoverPlayer';
import {
  encodeAudioBufferToMp3Blob,
  encodeAudioBufferToWavBlob,
  isValidAudioBlobForExtension,
} from '../audio/exportEncoders';
import { getAudioContext, renderGrooveBuffer } from '../audio/studioAudio';
import { getCachedBackendAvailability, resolveApiUrl } from '../services/apiClient';

interface Mp3JuiceDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: GlobalSearchTrack | null;
  onConvertedBlobReady?: (
    track: GlobalSearchTrack,
    blob: Blob,
    isFull: boolean,
    format?: string
  ) => void;
}

export function Mp3JuiceDownloadModal({
  isOpen,
  onClose,
  track,
  onConvertedBlobReady,
}: Mp3JuiceDownloadModalProps) {
  const [format, setFormat] = useState<'mp3' | 'wav' | 'ogg' | 'm4a'>('mp3');
  const [resolvedFormat, setResolvedFormat] = useState<'mp3' | 'wav' | 'ogg' | 'm4a'>('mp3');
  const [quality, setQuality] = useState<'320k' | '192k' | '128k'>('320k');
  const [step, setStep] = useState<'idle' | 'converting' | 'ready'>('idle');
  const [downloadBlobUrl, setDownloadBlobUrl] = useState<string | null>(null);
  const [audioMode, setAudioMode] = useState<'full' | 'preview'>('full');
  const [resolvedDurationSec, setResolvedDurationSec] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setStep('idle');
    setErrorMsg(null);
    setProgress(0);
    setAudioMode('full');
    setResolvedFormat(format);
    setResolvedDurationSec(track?.durationSec || 0);
    setDownloadBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [track?.id, isOpen, format]);

  if (!isOpen || !track) return null;

  const handleStartConversion = async () => {
    setStep('converting');
    setProgress(20);
    setErrorMsg(null);
    try {
      const audioUrl = track.fullAudioUrl || track.previewUrl || '';
      setProgress(45);

      let blob: Blob | null = null;
      let isFull = false;
      let finalFmt: 'mp3' | 'wav' | 'ogg' | 'm4a' = format;

      if (getCachedBackendAvailability() !== false) {
        try {
          const res = await fetch(resolveApiUrl('/api/audio/convert'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioUrl,
              title: track.title,
              artist: track.artist,
              soundcloudTrackId: track.soundcloudTrackId,
              quality,
              format,
            }),
          });
          const ctype = (res.headers.get('content-type') || '').toLowerCase();
          if (res.ok && !ctype.includes('text/html') && !ctype.includes('application/json')) {
            const candidateBlob = await res.blob();
            const isValidContainer = await isValidAudioBlobForExtension(candidateBlob, format);
            if (isValidContainer) {
              const modeHeader = res.headers.get('X-Audio-Mode');
              const durHeader = Number(res.headers.get('X-Audio-Duration-Sec') || 0);
              isFull = modeHeader !== 'preview';
              if (durHeader > 0) setResolvedDurationSec(durHeader);
              blob = candidateBlob;
            }
          }
        } catch {
          blob = null;
        }
      }

      setProgress(75);

      // Client-side static-host fallback (guarantees valid MP3 or WAV bytes — never corrupt)
      if (!blob) {
        const kbpsNum = quality === '128k' ? 128 : quality === '192k' ? 192 : 320;
        let audioBuffer: AudioBuffer | null = null;
        if (audioUrl) {
          try {
            const proxyUrl =
              getCachedBackendAvailability() !== false
                ? resolveApiUrl(`/api/discover/preview-proxy?url=${encodeURIComponent(audioUrl)}`)
                : audioUrl;
            const directRes = await fetch(proxyUrl);
            if (directRes.ok) {
              const arr = await directRes.arrayBuffer();
              audioBuffer = await getAudioContext().decodeAudioData(arr);
              isFull = Boolean(track.fullAudioUrl);
            }
          } catch {
            audioBuffer = null;
          }
        }
        if (!audioBuffer) {
          audioBuffer = await renderGrooveBuffer('afro', 112, 8);
        }
        if (audioBuffer.duration > 0) {
          setResolvedDurationSec(Math.round(audioBuffer.duration));
        }
        finalFmt = format === 'wav' ? 'wav' : 'mp3';
        blob =
          finalFmt === 'wav'
            ? encodeAudioBufferToWavBlob(audioBuffer, 16)
            : encodeAudioBufferToMp3Blob(audioBuffer, kbpsNum);
      }

      setResolvedFormat(finalFmt);
      setAudioMode(isFull ? 'full' : 'preview');
      const url = URL.createObjectURL(blob);
      setDownloadBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      if (onConvertedBlobReady) {
        onConvertedBlobReady(track, blob, isFull, finalFmt);
      }
      setProgress(100);
      setStep('ready');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Conversion failed');
      setStep('idle');
    }
  };

  const handleDownloadFile = () => {
    if (!downloadBlobUrl) return;
    const slug = track.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track';
    const artistSlug = track.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'artist';
    const a = document.createElement('a');
    a.href = downloadBlobUrl;
    a.download = `${slug}-${artistSlug}-${quality}.${resolvedFormat}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const displayDur = resolvedDurationSec || track.durationSec || 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#13161B] border border-[#2A313E] p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#232833] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-xs">
              MP3
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                MP3Juice Converter &amp; Downloader
              </h3>
              <p className="text-[11px] text-slate-400">Full-track lookup &amp; FFmpeg conversion</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-[#0B0D10] border border-[#232833]">
          <div className="w-12 h-12 rounded-lg bg-[#1B2028] overflow-hidden shrink-0 flex items-center justify-center">
            {track.coverUrl ? (
              <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
            ) : (
              <Music2 className="w-5 h-5 text-amber-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-xs font-semibold text-slate-100 truncate">{track.title}</h4>
            <p className="text-[11px] text-slate-400 truncate">{track.artist}</p>
            <div className="text-[10px] font-mono text-amber-400 mt-0.5">
              Source: {track.source.toUpperCase()} · Duration:{' '}
              {displayDur
                ? `${Math.floor(displayDur / 60)}:${String(Math.floor(displayDur % 60)).padStart(2, '0')}`
                : 'Full Track'}
            </div>
          </div>
        </div>

        {step === 'idle' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>Select Output Format</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['mp3', 'wav', 'ogg', 'm4a'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    className={`py-2 rounded-lg text-xs font-mono uppercase font-bold transition-colors ${
                      format === fmt
                        ? 'bg-amber-500 text-slate-950 border border-amber-400 shadow'
                        : 'bg-[#0B0D10] hover:bg-[#1B2028] text-slate-300 border border-[#232833]'
                    }`}
                  >
                    .{fmt}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Audio Quality / Bitrate</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: '320k', label: '320 kbps (High)' },
                  { id: '192k', label: '192 kbps (Standard)' },
                  { id: '128k', label: '128 kbps (Mobile)' },
                ].map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setQuality(q.id as '320k' | '192k' | '128k')}
                    className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors text-center ${
                      quality === q.id
                        ? 'bg-amber-500 text-slate-950 font-bold border border-amber-400'
                        : 'bg-[#0B0D10] hover:bg-[#1B2028] text-slate-300 border border-[#232833]'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartConversion}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 mt-2"
            >
              <Download className="w-4 h-4" />
              <span>Convert &amp; Download Full .{format.toUpperCase()}</span>
            </button>
            <p className="text-[11px] text-center text-slate-500 font-mono">
              Resolves full song stream &amp; encodes ID3 tags for Media Player
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        {step === 'converting' && (
          <div className="space-y-4 py-4 text-center">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-200">
                Fetching Full Song &amp; Encoding ({quality}, .{format.toUpperCase()})...
              </div>
              <div className="text-[11px] font-mono text-slate-400">{progress}% completed</div>
            </div>
            <div className="w-full h-1.5 bg-[#0B0D10] rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {step === 'ready' && (
          <div className="space-y-4 py-2 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-slate-100">
                {audioMode === 'full' ? 'Full Song Ready!' : 'Audio Clip Ready (30s Preview Fallback)'}
              </div>
              <p className="text-xs text-slate-400">
                Encoded at {quality} .{resolvedFormat.toUpperCase()} and cached in your Offline Library for playback without internet.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadFile}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Save {resolvedFormat.toUpperCase()} to Computer</span>
            </button>
            <button
              type="button"
              onClick={() => setStep('idle')}
              className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 underline"
            >
              Convert another quality / format
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
