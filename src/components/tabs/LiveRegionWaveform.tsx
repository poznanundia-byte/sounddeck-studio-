import { useEffect, useRef, useState } from 'react';
import { Activity, Mic, Radio } from 'lucide-react';

export interface VisualizerTrackInfo {
  id: string;
  name: string;
  buffer: AudioBuffer | null;
  offsetSec: number;
  gainDb: number;
  rate: number;
  muted: boolean;
}

interface LiveRegionWaveformProps {
  track: VisualizerTrackInfo | undefined;
  selectionStart: number;
  selectionEnd: number;
  playheadSec: number;
  isPlaying: boolean;
  isRecording: boolean;
  playStartWallMs: number;
  playStartSec: number;
  recStartWallMs: number;
  playbackAnalyser: AnalyserNode | null;
  recordAnalyser: AnalyserNode | null;
}

interface PeakSample {
  min: number;
  max: number;
  rms: number;
}

function formatVizTime(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const remSec = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);
  return `${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function LiveRegionWaveform({
  track,
  selectionStart,
  selectionEnd,
  playheadSec,
  isPlaying,
  isRecording,
  playStartWallMs,
  playStartSec,
  recStartWallMs,
  playbackAnalyser,
  recordAnalyser,
}: LiveRegionWaveformProps) {
  const [vizMode, setVizMode] = useState<'region' | 'tape'>('region');
  const [liveDb, setLiveDb] = useState<number>(-60);
  const [liveElapsedSec, setLiveElapsedSec] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tapeHistoryRef = useRef<PeakSample[]>([]);
  const recHistoryRef = useRef<PeakSample[]>([]);
  const timeDomainRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const hasSubSelection = selectionEnd - selectionStart > 0.03;
  const trackDur = track?.buffer ? track.buffer.duration / Math.max(0.25, track.rate) : 0;
  const regionStartSec = hasSubSelection ? selectionStart : track?.offsetSec ?? 0;
  const regionEndSec = hasSubSelection
    ? selectionEnd
    : track?.buffer
    ? (track.offsetSec + trackDur)
    : 0;
  const regionSpanSec = Math.max(0, regionEndSec - regionStartSec);

  // Reset live recording history whenever a new recording starts
  useEffect(() => {
    if (isRecording) {
      recHistoryRef.current = [];
      setLiveElapsedSec(0);
    }
  }, [isRecording]);

  // Reset rolling playback tape when playback starts fresh
  useEffect(() => {
    if (isPlaying) {
      tapeHistoryRef.current = [];
    }
  }, [isPlaying]);

  // Keep canvas crisp with container width & devicePixelRatio
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const syncSize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(320, Math.floor(container.clientWidth));
      const h = 112;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Main real-time render loop (60fps during play/record, single crisp render when idle)
  useEffect(() => {
    let rafId = 0;
    let lastUiUpdate = 0;

    const drawFrame = (nowMs: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = '#080A0D';
      ctx.fillRect(0, 0, w, h);

      // Subtle horizontal amplitude grid (-6dB, 0, +6dB)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      [0.25, 0.5, 0.75].forEach((ratio) => {
        const gy = Math.round(h * ratio) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      });

      // Vertical quarter grid divisions
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
      [0.25, 0.5, 0.75].forEach((ratio) => {
        const gx = Math.round(w * ratio) + 0.5;
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      });

      // Sample active AnalyserNode if playing or recording
      const activeAnalyser = isRecording ? recordAnalyser : isPlaying ? playbackAnalyser : null;
      let frameMin = 0;
      let frameMax = 0;
      let frameRms = 0;
      let scopeData: Float32Array<ArrayBuffer> | null = null;

      if (activeAnalyser) {
        if (!timeDomainRef.current || timeDomainRef.current.length !== activeAnalyser.fftSize) {
          timeDomainRef.current = new Float32Array(new ArrayBuffer(activeAnalyser.fftSize * 4));
        }
        scopeData = timeDomainRef.current;
        activeAnalyser.getFloatTimeDomainData(scopeData);

        let sumSq = 0;
        for (let i = 0; i < scopeData.length; i++) {
          const v = scopeData[i];
          if (v < frameMin) frameMin = v;
          if (v > frameMax) frameMax = v;
          sumSq += v * v;
        }
        frameRms = Math.sqrt(sumSq / Math.max(1, scopeData.length));
        const peakAmp = Math.max(Math.abs(frameMin), Math.abs(frameMax));

        if (isRecording) {
          recHistoryRef.current.push({ min: frameMin, max: frameMax, rms: frameRms });
          const maxSamples = Math.max(240, Math.floor(w * 1.5));
          if (recHistoryRef.current.length > maxSamples) {
            recHistoryRef.current.shift();
          }
        } else if (isPlaying) {
          tapeHistoryRef.current.push({ min: frameMin, max: frameMax, rms: frameRms });
          const maxSamples = Math.max(240, Math.floor(w));
          if (tapeHistoryRef.current.length > maxSamples) {
            tapeHistoryRef.current.shift();
          }
        }

        if (nowMs - lastUiUpdate > 65) {
          const db = peakAmp > 0.001 ? Math.max(-60, Math.round(20 * Math.log10(peakAmp))) : -60;
          setLiveDb(db);
          if (isRecording && recStartWallMs > 0) {
            setLiveElapsedSec(Math.max(0, (nowMs - recStartWallMs) / 1000));
          }
          lastUiUpdate = nowMs;
        }
      } else if (nowMs - lastUiUpdate > 100) {
        setLiveDb(-60);
        lastUiUpdate = nowMs;
      }

      const yMid = h / 2;
      const ampScale = h * 0.43;

      if (isRecording) {
        // MODE 1: Live Microphone Recording Waveform (growing left-to-right + leading oscilloscope)
        const history = recHistoryRef.current;
        const barStep = 2;
        const maxBars = Math.floor((w * 0.72) / barStep);
        const visible = history.slice(-maxBars);

        // Recorded peak envelope
        ctx.strokeStyle = '#F43F5E';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        visible.forEach((sample, idx) => {
          const x = idx * barStep + 1;
          const yTop = yMid - Math.min(1, Math.max(0.015, Math.abs(sample.max) * 1.6)) * ampScale;
          const yBot = yMid + Math.min(1, Math.max(0.015, Math.abs(sample.min) * 1.6)) * ampScale;
          ctx.moveTo(x, yTop);
          ctx.lineTo(x, yBot);
        });
        ctx.stroke();

        // Inner RMS energy core
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        visible.forEach((sample, idx) => {
          const x = idx * barStep + 1;
          const rmsH = Math.min(1, sample.rms * 2.2) * ampScale;
          ctx.moveTo(x, yMid - rmsH);
          ctx.lineTo(x, yMid + rmsH);
        });
        ctx.stroke();

        // Record write head divider
        const writeX = Math.max(12, visible.length * barStep + 2);
        ctx.strokeStyle = '#FB7185';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(writeX + 0.5, 0);
        ctx.lineTo(writeX + 0.5, h);
        ctx.stroke();

        // Right-side instantaneous mic oscilloscope trace
        if (scopeData && w - writeX > 24) {
          const scopeW = w - writeX - 6;
          ctx.strokeStyle = '#FDA4AF';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          const step = Math.max(1, Math.floor(scopeData.length / scopeW));
          for (let px = 0; px < scopeW; px++) {
            const sIdx = Math.min(scopeData.length - 1, px * step);
            const y = yMid - Math.max(-1, Math.min(1, scopeData[sIdx] * 1.8)) * ampScale;
            if (px === 0) ctx.moveTo(writeX + 4 + px, y);
            else ctx.lineTo(writeX + 4 + px, y);
          }
          ctx.stroke();
        }
      } else if (vizMode === 'tape' && isPlaying) {
        // MODE 2: Rolling Tape Waveform during playback
        const history = tapeHistoryRef.current;
        const barStep = 2;
        const maxBars = Math.floor(w / barStep);
        const visible = history.slice(-maxBars);
        const startX = Math.max(0, w - visible.length * barStep);

        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        visible.forEach((sample, idx) => {
          const x = startX + idx * barStep + 0.5;
          const yTop = yMid - Math.min(1, Math.abs(sample.max)) * ampScale;
          const yBot = yMid + Math.min(1, Math.abs(sample.min)) * ampScale;
          ctx.moveTo(x, yTop);
          ctx.lineTo(x, yBot);
        });
        ctx.stroke();

        ctx.strokeStyle = '#F59E0B';
        ctx.beginPath();
        visible.forEach((sample, idx) => {
          const x = startX + idx * barStep + 0.5;
          const rmsH = Math.min(1, sample.rms * 1.5) * ampScale;
          ctx.moveTo(x, yMid - rmsH);
          ctx.lineTo(x, yMid + rmsH);
        });
        ctx.stroke();

        if (scopeData) {
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const step = Math.max(1, Math.floor(scopeData.length / w));
          for (let px = 0; px < w; px++) {
            const sIdx = Math.min(scopeData.length - 1, px * step);
            const y = yMid - Math.max(-1, Math.min(1, scopeData[sIdx])) * ampScale;
            if (px === 0) ctx.moveTo(px, y);
            else ctx.lineTo(px, y);
          }
          ctx.stroke();
        }
      } else {
        // MODE 3: Selected Audio Region Waveform + Progressive Playhead Sweep + Live Oscilloscope
        const livePlayhead = isPlaying
          ? playStartSec + Math.max(0, (nowMs - playStartWallMs) / 1000)
          : playheadSec;

        if (track?.buffer && regionSpanSec > 0.01) {
          const buf = track.buffer;
          const channel = buf.getChannelData(0);
          const gainLin = Math.pow(10, track.gainDb / 20);
          const rate = Math.max(0.25, track.rate);

          // Progress fraction inside selected region (0..1)
          const progressRatio = Math.max(
            0,
            Math.min(1, (livePlayhead - regionStartSec) / regionSpanSec)
          );
          const playheadX = Math.round(progressRatio * w);

          // Highlight played region backdrop when playing or positioned mid-region
          if (playheadX > 0) {
            ctx.fillStyle = isPlaying
              ? 'rgba(56, 189, 248, 0.08)'
              : 'rgba(245, 158, 11, 0.05)';
            ctx.fillRect(0, 0, playheadX, h);
          }

          // Draw peak & RMS bars mapped strictly to [regionStartSec, regionEndSec]
          const cols = Math.floor(w);
          for (let x = 0; x < cols; x++) {
            const t0 = regionStartSec + (x / cols) * regionSpanSec;
            const t1 = regionStartSec + ((x + 1) / cols) * regionSpanSec;
            const local0 = (t0 - track.offsetSec) * rate;
            const local1 = (t1 - track.offsetSec) * rate;

            if (local1 <= 0 || local0 >= buf.duration) continue;

            const s0 = Math.max(0, Math.floor(local0 * buf.sampleRate));
            const s1 = Math.min(channel.length, Math.max(s0 + 1, Math.ceil(local1 * buf.sampleRate)));
            const stride = Math.max(1, Math.floor((s1 - s0) / 48));

            let min = 0;
            let max = 0;
            let sumSq = 0;
            let count = 0;
            for (let i = s0; i < s1; i += stride) {
              const v = channel[i];
              if (v < min) min = v;
              if (v > max) max = v;
              sumSq += v * v;
              count++;
            }
            const rms = Math.sqrt(sumSq / Math.max(1, count));
            const isPlayed = x <= playheadX;

            const yTop = yMid - Math.min(1, Math.max(0, max * gainLin)) * ampScale;
            const yBot = yMid - Math.max(-1, Math.min(0, min * gainLin)) * ampScale;

            ctx.strokeStyle = track.muted
              ? '#475569'
              : isPlayed
              ? '#7DD3FC'
              : 'rgba(56, 189, 248, 0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, yTop);
            ctx.lineTo(x + 0.5, yBot);
            ctx.stroke();

            const rmsAmp = Math.min(1, rms * gainLin) * ampScale;
            ctx.strokeStyle = track.muted
              ? '#64748B'
              : isPlayed
              ? '#F59E0B'
              : 'rgba(245, 158, 11, 0.4)';
            ctx.beginPath();
            ctx.moveTo(x + 0.5, yMid - rmsAmp);
            ctx.lineTo(x + 0.5, yMid + rmsAmp);
            ctx.stroke();
          }

          // Real-time live oscilloscope waveform overlaid during playback
          if (isPlaying && scopeData) {
            ctx.strokeStyle = '#34D399';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const step = Math.max(1, Math.floor(scopeData.length / w));
            for (let px = 0; px < w; px++) {
              const sIdx = Math.min(scopeData.length - 1, px * step);
              const y = yMid - Math.max(-1, Math.min(1, scopeData[sIdx])) * ampScale;
              if (px === 0) ctx.moveTo(px, y);
              else ctx.lineTo(px, y);
            }
            ctx.stroke();
          }

          // Crisp vertical playhead cursor inside the region
          ctx.strokeStyle = isPlaying ? '#10B981' : '#F59E0B';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(playheadX + 0.5, 0);
          ctx.lineTo(playheadX + 0.5, h);
          ctx.stroke();
        } else {
          // Empty selected track placeholder state
          ctx.fillStyle = '#475569';
          ctx.font = '11px JetBrains Mono, monospace';
          ctx.fillText(
            'No audio in selected track — Load stem, highlight a region, or press R to record live.',
            16,
            yMid + 4
          );
        }
      }

      ctx.restore();

      if (isPlaying || isRecording) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, [
    track,
    regionStartSec,
    regionEndSec,
    regionSpanSec,
    playheadSec,
    isPlaying,
    isRecording,
    playStartWallMs,
    playStartSec,
    recStartWallMs,
    playbackAnalyser,
    recordAnalyser,
    vizMode,
  ]);

  return (
    <div className="bg-[#0F1217] border-b border-[#232833] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {isRecording ? (
            <Mic className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          ) : isPlaying ? (
            <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span className="text-xs font-semibold text-slate-200 truncate">
            {isRecording
              ? 'Live Microphone Capture Waveform'
              : hasSubSelection
              ? `Selected Region Scope · ${track?.name || 'Track'}`
              : `Active Track Scope · ${track?.name || 'No Track'}`}
          </span>
          <span className="font-mono text-[11px] text-slate-400 tabular-nums hidden sm:inline">
            {isRecording
              ? `REC ${formatVizTime(liveElapsedSec)}`
              : regionSpanSec > 0
              ? `${formatVizTime(regionStartSec)} → ${formatVizTime(regionEndSec)} (${regionSpanSec.toFixed(2)}s)`
              : '00:00.000'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-slate-300 tabular-nums px-2 py-0.5 rounded bg-[#080A0D] border border-[#232833]">
            Peak {isPlaying || isRecording ? `${liveDb} dB` : '-∞ dB'}
          </span>

          {!isRecording && (
            <div className="flex items-center rounded bg-[#080A0D] border border-[#232833] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setVizMode('region')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  vizMode === 'region'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Region + Scope
              </button>
              <button
                type="button"
                onClick={() => setVizMode('tape')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  vizMode === 'tape'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Live Tape
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full rounded-lg overflow-hidden border border-[#232833] bg-[#080A0D]"
      >
        <canvas ref={canvasRef} className="block w-full h-[112px]" />
      </div>
    </div>
  );
}
