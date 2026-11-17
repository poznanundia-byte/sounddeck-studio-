import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import {
  computeWaveformPeaks,
  formatDjTime,
  type DeckId,
} from '../../audio/virtualDjEngine';

export interface WaveformDeckSummary {
  id: DeckId;
  title: string;
  baseBpm: number;
  pitchPct: number;
  camelotKey: string;
  playing: boolean;
  loopBeats: number | null;
  loopStartSec: number | null;
  slipMode: boolean;
  hotCues: (number | null)[];
  buffer: AudioBuffer | null;
}

interface DualWaveformDisplayProps {
  deckA: WaveformDeckSummary;
  deckB: WaveformDeckSummary;
  getDeckPositionSec: (id: DeckId) => number;
  getSlipPositionSec: (id: DeckId) => number | null;
  onSeekDeck: (id: DeckId, targetSec: number) => void;
  onNudgeDeck: (id: DeckId, deltaSec: number) => void;
  onPhaseAlign: (targetId: DeckId) => void;
}

export function DualWaveformDisplay({
  deckA,
  deckB,
  getDeckPositionSec,
  getSlipPositionSec,
  onSeekDeck,
  onNudgeDeck,
  onPhaseAlign,
}: DualWaveformDisplayProps) {
  const scrollCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overviewARef = useRef<HTMLCanvasElement | null>(null);
  const overviewBRef = useRef<HTMLCanvasElement | null>(null);
  const phaseBarRef = useRef<HTMLDivElement | null>(null);
  const posAReadoutRef = useRef<HTMLSpanElement | null>(null);
  const posBReadoutRef = useRef<HTMLSpanElement | null>(null);

  const peaksA = deckA.buffer ? computeWaveformPeaks(deckA.buffer, 560) : [];
  const peaksB = deckB.buffer ? computeWaveformPeaks(deckB.buffer, 560) : [];

  // Render live 60fps stacked waveforms + playhead + beatgrid + overview playheads
  useEffect(() => {
    let rafId = 0;

    const drawScrollingDeck = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      yOffset: number,
      deck: WaveformDeckSummary,
      peaks: ReturnType<typeof computeWaveformPeaks>,
      posSec: number,
      slipSec: number | null,
      accentHex: string,
      lowHex: string
    ) => {
      const centerX = Math.floor(width * 0.5);
      const midY = yOffset + height * 0.5;
      const maxAmp = height * 0.42;

      // Subtle deck lane background
      ctx.fillStyle = deck.id === 'A' ? 'rgba(245,158,11,0.03)' : 'rgba(6,182,212,0.03)';
      ctx.fillRect(0, yOffset, width, height);

      if (!deck.buffer || peaks.length === 0) {
        ctx.fillStyle = '#475569';
        ctx.font = '11px JetBrains Mono, monospace';
        ctx.fillText(`DECK ${deck.id === 'A' ? '1' : '2'} — NO AUDIO LOADED`, 14, midY + 4);
        return;
      }

      const duration = deck.buffer.duration;
      const windowSec = 8.0; // 8 seconds visible across canvas (4s behind, 4s ahead)
      const pxPerSec = width / windowSec;

      // Active loop region shading
      if (deck.loopBeats && deck.loopStartSec !== null) {
        const beatDur = 60 / deck.baseBpm;
        const loopDur = beatDur * deck.loopBeats;
        const x1 = centerX + (deck.loopStartSec - posSec) * pxPerSec;
        const x2 = centerX + (deck.loopStartSec + loopDur - posSec) * pxPerSec;
        if (x2 >= 0 && x1 <= width) {
          ctx.fillStyle = deck.id === 'A' ? 'rgba(245,158,11,0.14)' : 'rgba(6,182,212,0.14)';
          ctx.fillRect(Math.max(0, x1), yOffset, Math.min(width, x2) - Math.max(0, x1), height);
          ctx.strokeStyle = accentHex;
          ctx.lineWidth = 1;
          ctx.strokeRect(x1, yOffset + 1, x2 - x1, height - 2);
        }
      }

      // Beatgrid vertical lines aligned to live tempo
      const beatSec = 60 / Math.max(40, deck.baseBpm);
      const startTime = Math.max(0, posSec - windowSec * 0.5);
      const endTime = Math.min(duration, posSec + windowSec * 0.5);
      const firstBeatIndex = Math.floor(startTime / beatSec);

      for (let b = firstBeatIndex; b * beatSec <= endTime; b++) {
        if (b < 0) continue;
        const beatTime = b * beatSec;
        const x = centerX + (beatTime - posSec) * pxPerSec;
        const isBar = b % 4 === 0;
        ctx.strokeStyle = isBar ? 'rgba(226,232,240,0.22)' : 'rgba(148,163,184,0.09)';
        ctx.lineWidth = isBar ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x, yOffset);
        ctx.lineTo(x, yOffset + height);
        ctx.stroke();

        if (isBar && x > 10 && x < width - 24) {
          ctx.fillStyle = 'rgba(226,232,240,0.45)';
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillText(`${Math.floor(b / 4) + 1}`, x + 3, yOffset + 10);
        }
      }

      // Waveform bars (RGB blended height from low + mid + high energy)
      const barStep = 3;
      for (let px = 0; px < width; px += barStep) {
        const sampleTime = posSec + (px - centerX) / pxPerSec;
        if (sampleTime < 0 || sampleTime > duration) continue;
        const bucketIdx = Math.min(
          peaks.length - 1,
          Math.max(0, Math.floor((sampleTime / duration) * peaks.length))
        );
        const bk = peaks[bucketIdx];
        const totalH = Math.max(2, bk.peak * maxAmp);
        const lowH = Math.max(1.5, bk.low * maxAmp * 0.85);
        const isPast = px < centerX;

        ctx.globalAlpha = isPast ? 0.55 : 0.95;
        // High/Mid outer envelope
        ctx.fillStyle = accentHex;
        ctx.fillRect(px, midY - totalH, 2, totalH * 2);
        // Bass inner energy punch
        ctx.fillStyle = lowHex;
        ctx.fillRect(px, midY - lowH, 2, lowH * 2);
      }
      ctx.globalAlpha = 1;

      // Hot Cue markers along visible waveform window
      deck.hotCues.forEach((cueTime, idx) => {
        if (cueTime === null) return;
        const x = centerX + (cueTime - posSec) * pxPerSec;
        if (x < -12 || x > width + 12) return;
        ctx.fillStyle = accentHex;
        ctx.fillRect(x - 1, yOffset, 2, height);
        ctx.fillRect(x, yOffset + 2, 16, 12);
        ctx.fillStyle = '#080a0f';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillText(`C${idx + 1}`, x + 2, yOffset + 11);
      });

      // Phantom Slip Playhead indicator
      if (deck.slipMode && slipSec !== null && Math.abs(slipSec - posSec) > 0.04) {
        const sx = centerX + (slipSec - posSec) * pxPerSec;
        if (sx >= 0 && sx <= width) {
          ctx.strokeStyle = '#f87171';
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(sx, yOffset);
          ctx.lineTo(sx, yOffset + height);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    };

    const drawOverviewStrip = (
      canvas: HTMLCanvasElement | null,
      deck: WaveformDeckSummary,
      peaks: ReturnType<typeof computeWaveformPeaks>,
      posSec: number,
      accentHex: string
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#080a0f';
      ctx.fillRect(0, 0, w, h);

      if (!deck.buffer || peaks.length === 0) return;

      const dur = deck.buffer.duration;
      const progressX = (posSec / Math.max(0.01, dur)) * w;
      const stepX = w / peaks.length;

      for (let i = 0; i < peaks.length; i++) {
        const x = i * stepX;
        const barH = Math.max(2, peaks[i].peak * (h * 0.86));
        ctx.fillStyle = x <= progressX ? accentHex : '#334155';
        ctx.fillRect(x, h - barH, Math.max(1, stepX - 0.5), barH);
      }

      // Cue ticks on overview
      deck.hotCues.forEach((cueTime) => {
        if (cueTime === null) return;
        const cx = (cueTime / Math.max(0.01, dur)) * w;
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(cx - 1, 0, 2, 5);
      });

      // White playhead needle
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.max(0, Math.min(w - 2, progressX - 1)), 0, 2, h);
    };

    const renderFrame = () => {
      const posA = getDeckPositionSec('A');
      const posB = getDeckPositionSec('B');
      const slipA = getSlipPositionSec('A');
      const slipB = getSlipPositionSec('B');

      if (posAReadoutRef.current && deckA.buffer) {
        posAReadoutRef.current.textContent = `${formatDjTime(posA)} / ${formatDjTime(deckA.buffer.duration)}`;
      }
      if (posBReadoutRef.current && deckB.buffer) {
        posBReadoutRef.current.textContent = `${formatDjTime(posB)} / ${formatDjTime(deckB.buffer.duration)}`;
      }

      // Phase meter bar offset calculation (-0.5 beat .. +0.5 beat)
      if (phaseBarRef.current) {
        const beatDurA = 60 / Math.max(40, deckA.baseBpm * (1 + deckA.pitchPct / 100));
        const beatDurB = 60 / Math.max(40, deckB.baseBpm * (1 + deckB.pitchPct / 100));
        const phaseA = (posA % beatDurA) / beatDurA;
        const phaseB = (posB % beatDurB) / beatDurB;
        let diff = phaseB - phaseA;
        if (diff > 0.5) diff -= 1;
        if (diff < -0.5) diff += 1;
        const pct = 50 + diff * 80; // center 50%
        phaseBarRef.current.style.left = `${Math.max(6, Math.min(94, pct))}%`;
      }

      const canvas = scrollCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = '#07090d';
          ctx.fillRect(0, 0, w, h);

          const halfH = Math.floor(h / 2) - 1;
          drawScrollingDeck(ctx, w, halfH, 0, deckA, peaksA, posA, slipA, '#f59e0b', '#fbbf24');
          ctx.fillStyle = '#1f2634';
          ctx.fillRect(0, halfH, w, 2);
          drawScrollingDeck(ctx, w, halfH, halfH + 2, deckB, peaksB, posB, slipB, '#06b6d4', '#67e8f9');

          // Center Master Playhead Needle
          const cx = Math.floor(w * 0.5);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - 1, 0, 2, h);
        }
      }

      drawOverviewStrip(overviewARef.current, deckA, peaksA, posA, '#f59e0b');
      drawOverviewStrip(overviewBRef.current, deckB, peaksB, posB, '#06b6d4');

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [deckA, deckB, peaksA, peaksB, getDeckPositionSec, getSlipPositionSec]);

  const handleOverviewClick = (
    id: DeckId,
    deck: WaveformDeckSummary,
    e: React.MouseEvent<HTMLCanvasElement>
  ) => {
    if (!deck.buffer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeekDeck(id, ratio * deck.buffer.duration);
  };

  const liveBpmA = (deckA.baseBpm * (1 + deckA.pitchPct / 100)).toFixed(1);
  const liveBpmB = (deckB.baseBpm * (1 + deckB.pitchPct / 100)).toFixed(1);

  return (
    <div className="rounded-xl bg-[#0f131a] border border-[#222834] p-3.5 space-y-3">
      {/* Top Bar: Deck Readouts + Phase Alignment Bridge */}
      <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-3">
        <div className="lg:col-span-4 flex items-center justify-between gap-2 bg-[#080a0f] border border-[#1d2432] rounded-lg px-3 py-1.5">
          <div className="min-w-0">
            <div className="text-[11px] font-mono text-amber-400 font-semibold tabular-nums">
              D1 · {liveBpmA} BPM · {deckA.camelotKey}
            </div>
            <div className="text-xs text-slate-200 font-medium truncate">{deckA.title}</div>
          </div>
          <span
            ref={posAReadoutRef}
            className="text-[11px] font-mono text-slate-300 tabular-nums shrink-0"
          >
            00:00.0 / 00:00.0
          </span>
        </div>

        {/* Central Phase Alignment Bridge */}
        <div className="lg:col-span-4 flex items-center gap-2 bg-[#080a0f] border border-[#1d2432] rounded-lg px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => onNudgeDeck('B', -0.025)}
            className="p-1 rounded bg-[#141820] hover:bg-[#1e2432] text-slate-300 border border-[#273042]"
            title="Nudge Deck 2 phase earlier (-25ms)"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span className="text-amber-400">D1 GRID</span>
              <span>PHASE LOCK</span>
              <span className="text-cyan-400">D2 GRID</span>
            </div>
            <div className="h-2 rounded bg-[#141820] border border-[#252c3b] relative overflow-hidden">
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/50 -translate-x-1/2" />
              <div
                ref={phaseBarRef}
                className="absolute top-0 bottom-0 w-2 rounded-sm bg-emerald-400 -translate-x-1/2"
                style={{ left: '50%' }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNudgeDeck('B', 0.025)}
            className="p-1 rounded bg-[#141820] hover:bg-[#1e2432] text-slate-300 border border-[#273042]"
            title="Nudge Deck 2 phase later (+25ms)"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onPhaseAlign('B')}
            className="px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-semibold flex items-center gap-1 whitespace-nowrap"
            title="Snap Deck 2 phase + BPM strictly to Deck 1 beatgrid"
          >
            <Lock className="w-3 h-3" />
            <span>PHASE</span>
          </button>
        </div>

        <div className="lg:col-span-4 flex items-center justify-between gap-2 bg-[#080a0f] border border-[#1d2432] rounded-lg px-3 py-1.5">
          <div className="min-w-0">
            <div className="text-[11px] font-mono text-cyan-400 font-semibold tabular-nums">
              D2 · {liveBpmB} BPM · {deckB.camelotKey}
            </div>
            <div className="text-xs text-slate-200 font-medium truncate">{deckB.title}</div>
          </div>
          <span
            ref={posBReadoutRef}
            className="text-[11px] font-mono text-slate-300 tabular-nums shrink-0"
          >
            00:00.0 / 00:00.0
          </span>
        </div>
      </div>

      {/* Main Stacked 60fps RGB Scrolling Waveform Canvas */}
      <div className="rounded-lg overflow-hidden border border-[#1f2634] bg-[#07090d]">
        <canvas
          ref={scrollCanvasRef}
          width={1100}
          height={148}
          className="w-full h-[148px] block"
        />
      </div>

      {/* Click-to-Seek Full-Track Overview Strips */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="text-amber-400">DECK 1 OVERVIEW (CLICK TO NEEDLE DROP)</span>
            <span className="tabular-nums">
              {deckA.loopBeats ? `LOOP ${deckA.loopBeats}B` : deckA.slipMode ? 'SLIP ARMED' : 'NORMAL'}
            </span>
          </div>
          <canvas
            ref={overviewARef}
            width={520}
            height={28}
            onClick={(e) => handleOverviewClick('A', deckA, e)}
            className="w-full h-7 rounded border border-[#1d2432] cursor-pointer block"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="text-cyan-400">DECK 2 OVERVIEW (CLICK TO NEEDLE DROP)</span>
            <span className="tabular-nums">
              {deckB.loopBeats ? `LOOP ${deckB.loopBeats}B` : deckB.slipMode ? 'SLIP ARMED' : 'NORMAL'}
            </span>
          </div>
          <canvas
            ref={overviewBRef}
            width={520}
            height={28}
            onClick={(e) => handleOverviewClick('B', deckB, e)}
            className="w-full h-7 rounded border border-[#1d2432] cursor-pointer block"
          />
        </div>
      </div>
    </div>
  );
}
