import { useState } from 'react';
import {
  Activity,
  Download,
  Wand2,
  Sliders,
  Check,
  FileAudio,
  Layers,
  HardDriveDownload,
  RotateCcw,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  logStudioExport,
  type StudioExportLogRecord,
} from '../../firebase';
import type {
  MasterChainState,
  MasterTelemetryStats,
  StudioTrack,
} from '../../types/studioPro';
import {
  createDefaultMasterChain,
  measureMasterTelemetry,
} from '../../audio/proChannelStrip';
import {
  encodeAudioBufferToMp3Blob,
  encodeAudioBufferToWavBlob,
  renderStudioMixOffline,
  triggerFileDownload,
} from '../../audio/exportEncoders';
import { getAudioContext } from '../../audio/studioAudio';
import { safeApiFetch } from '../../services/apiClient';

interface MasteringAndExportPanelProps {
  user: User | null;
  projectTitle: string;
  genre: string;
  bpm: number;
  musicalKey: string;
  lyrics: string;
  tracks: StudioTrack[];
  masterChain: MasterChainState;
  exportLogs: StudioExportLogRecord[];
  onChangeMasterChain: (next: MasterChainState) => void;
  onBuildBackupJson: () => string;
}

interface AiMasteringAdvice {
  summary: string;
  targetLufs: number;
  recommendedLowEqDb: number;
  recommendedMidEqDb: number;
  recommendedHighEqDb: number;
  multibandLowThresholdDb: number;
  multibandMidThresholdDb: number;
  multibandHighThresholdDb: number;
  limiterCeilingDb: number;
  stereoWidthRecommendation: string;
  warnings: string[];
}

export function MasteringAndExportPanel({
  user,
  projectTitle,
  genre,
  bpm,
  musicalKey,
  lyrics,
  tracks,
  masterChain,
  exportLogs,
  onChangeMasterChain,
  onBuildBackupJson,
}: MasteringAndExportPanelProps) {
  const [sampleRate, setSampleRate] = useState<44100 | 48000>(44100);
  const [wavBitDepth, setWavBitDepth] = useState<16 | 24 | 32>(24);
  const [mp3Kbps, setMp3Kbps] = useState<192 | 320>(320);
  const [targetPlatform, setTargetPlatform] = useState('Spotify / Apple Music (-14 LUFS)');

  const [telemetry, setTelemetry] = useState<MasterTelemetryStats | null>(null);
  const [aiAdvice, setAiAdvice] = useState<AiMasteringAdvice | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [auditioningMaster, setAuditioningMaster] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const patch = (updates: Partial<MasterChainState>) => {
    onChangeMasterChain({ ...masterChain, ...updates });
  };

  const handleAnalyzeTelemetryAndAi = async () => {
    setAnalyzing(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const mixBuf = await renderStudioMixOffline(tracks, masterChain, {
        sampleRate,
        includeMasterChain: true,
      });
      if (!mixBuf) {
        setErrorMsg('No active audio clips on the timeline yet. Add a beat, MIDI bounce, or vocal track first.');
        return;
      }

      const stats = measureMasterTelemetry(mixBuf);
      setTelemetry(stats);

      const res = await safeApiFetch<AiMasteringAdvice>('/api/gemini/mastering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats,
          genre,
          targetPlatform,
        }),
      });

      if (res.ok && res.data) {
        setAiAdvice(res.data);
        setStatusMsg('Measured real mix telemetry & retrieved AI mastering recommendations (review below before applying).');
        return;
      }

      if (res.isStaticFallback) {
        const targetLufs = targetPlatform.includes('-9') ? -9 : targetPlatform.includes('-16') ? -16 : -14;
        const lufsDelta = targetLufs - stats.integratedLufsApprox;
        const warnings: string[] = [];
        if (stats.peakDbfs > -0.5) {
          warnings.push(`Peak level (${stats.peakDbfs.toFixed(1)} dBFS) is close to digital clipping; keep ceiling at -1.0 dBTP.`);
        }
        if (stats.crestFactorDb < 6) {
          warnings.push('Crest factor is compressed (<6 dB); ease limiter drive to preserve punch.');
        }
        setAiAdvice({
          summary: `Local DSP Telemetry Analysis (${stats.integratedLufsApprox.toFixed(1)} LUFS integrated, ${stats.crestFactorDb.toFixed(1)} dB crest factor) tuned for ${targetPlatform}.`,
          targetLufs,
          recommendedLowEqDb: genre.toLowerCase().includes('afro') || genre.toLowerCase().includes('trap') ? 1.2 : 0.6,
          recommendedMidEqDb: -0.4,
          recommendedHighEqDb: 1.0,
          multibandLowThresholdDb: -18,
          multibandMidThresholdDb: -16,
          multibandHighThresholdDb: -15,
          limiterCeilingDb: -1.0,
          stereoWidthRecommendation:
            lufsDelta > 3
              ? 'Keep sub below 120Hz mono and add +10% high-shelf width for perceived loudness.'
              : 'Dynamic range sits cleanly in target pocket; preserve stereo imaging.',
          warnings,
        });
        setStatusMsg('Measured real DSP mix telemetry & generated local mastering curve (review below before applying).');
        return;
      }

      throw new Error(res.error || 'AI mastering advisor request failed');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to analyze master mix.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyAiRecommendations = () => {
    if (!aiAdvice) return;
    onChangeMasterChain({
      ...masterChain,
      bypass: false,
      lowEqDb: Number(aiAdvice.recommendedLowEqDb.toFixed(1)),
      midEqDb: Number(aiAdvice.recommendedMidEqDb.toFixed(1)),
      highEqDb: Number(aiAdvice.recommendedHighEqDb.toFixed(1)),
      multibandEnabled: true,
      lowThreshDb: Math.round(aiAdvice.multibandLowThresholdDb),
      midThreshDb: Math.round(aiAdvice.multibandMidThresholdDb),
      highThreshDb: Math.round(aiAdvice.multibandHighThresholdDb),
      limiterCeilingDb: Math.min(-0.1, Math.max(-6, Number(aiAdvice.limiterCeilingDb.toFixed(1)))),
    });
    setStatusMsg('Applied AI recommended Master EQ, Multiband thresholds, and Limiter ceiling.');
  };

  const handleAuditionMaster = async () => {
    setAuditioningMaster(true);
    setErrorMsg(null);
    try {
      const mixBuf = await renderStudioMixOffline(tracks, masterChain, {
        sampleRate,
        includeMasterChain: true,
      });
      if (!mixBuf) {
        setErrorMsg('Timeline is empty — nothing to audition.');
        setAuditioningMaster(false);
        return;
      }
      setTelemetry(measureMasterTelemetry(mixBuf));
      const ctx = getAudioContext();
      const src = ctx.createBufferSource();
      src.buffer = mixBuf;
      src.connect(ctx.destination);
      src.onended = () => setAuditioningMaster(false);
      src.start();
    } catch {
      setAuditioningMaster(false);
    }
  };

  const handleExportMaster = async (format: 'wav' | 'mp3') => {
    setExporting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const mixBuf = await renderStudioMixOffline(tracks, masterChain, {
        sampleRate,
        includeMasterChain: true,
      });
      if (!mixBuf) {
        setErrorMsg('No tracks with audio clips found to export.');
        return;
      }

      setTelemetry(measureMasterTelemetry(mixBuf));
      const slug = projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'sounddeck-mix';

      if (format === 'wav') {
        const blob = encodeAudioBufferToWavBlob(mixBuf, wavBitDepth);
        const fileName = `${slug}-master-${sampleRate}hz-${wavBitDepth}bit.wav`;
        triggerFileDownload(blob, fileName);
        if (user) {
          await logStudioExport(user.uid, {
            projectTitle,
            fileName,
            format: 'wav',
            sampleRate,
            bitDepth: wavBitDepth,
            sizeBytes: blob.size,
          });
        }
        setStatusMsg(`Exported ${fileName} (${(blob.size / (1024 * 1024)).toFixed(2)} MB).`);
      } else {
        const blob = encodeAudioBufferToMp3Blob(mixBuf, mp3Kbps);
        const fileName = `${slug}-master-${mp3Kbps}kbps.mp3`;
        triggerFileDownload(blob, fileName);
        if (user) {
          await logStudioExport(user.uid, {
            projectTitle,
            fileName,
            format: 'mp3',
            sampleRate,
            sizeBytes: blob.size,
          });
        }
        setStatusMsg(`Exported real MP3: ${fileName} (${(blob.size / 1024).toFixed(0)} KB).`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportIndividualStems = async () => {
    const nonEmptyTracks = tracks.filter((t) => t.clips.length > 0 && !t.muted);
    if (nonEmptyTracks.length === 0) {
      setErrorMsg('No active tracks with audio clips to export as stems.');
      return;
    }
    setExporting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      let exportedCount = 0;
      const slug = projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'session';
      for (const tr of nonEmptyTracks) {
        const stemBuf = await renderStudioMixOffline(tracks, masterChain, {
          sampleRate,
          onlyTrackId: tr.id,
          includeMasterChain: false,
        });
        if (!stemBuf) continue;
        const blob = encodeAudioBufferToWavBlob(stemBuf, wavBitDepth);
        const stemSlug = tr.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileName = `${slug}-stem-${stemSlug}-${wavBitDepth}bit.wav`;
        triggerFileDownload(blob, fileName);
        exportedCount += 1;
        if (user) {
          await logStudioExport(user.uid, {
            projectTitle,
            fileName,
            format: 'stems',
            sampleRate,
            bitDepth: wavBitDepth,
            sizeBytes: blob.size,
          });
        }
      }
      setStatusMsg(`Downloaded ${exportedCount} individual WAV stems at ${sampleRate}Hz / ${wavBitDepth}-bit.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Stem export failed.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportBackupJson = async () => {
    const jsonStr = onBuildBackupJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const slug = projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'project';
    const fileName = `${slug}.sounddeck.json`;
    triggerFileDownload(blob, fileName);
    if (user) {
      await logStudioExport(user.uid, {
        projectTitle,
        fileName,
        format: 'backup_json',
        sampleRate,
        sizeBytes: blob.size,
      });
    }
    setStatusMsg(`Saved project backup "${fileName}" (${bpm} BPM · ${musicalKey} · ${lyrics ? 'includes lyrics' : 'metadata'}).`);
  };

  return (
    <div className="space-y-5">
      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200">
          {errorMsg}
        </div>
      )}
      {statusMsg && (
        <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200">
          {statusMsg}
        </div>
      )}

      {/* Mastering Controls + Real Acoustic Metering */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              <div>
                <h4 className="font-display text-base font-semibold text-slate-100">
                  Mastering Suite (Master EQ · 3-Band Multiband · Limiter)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Active Linkwitz-Riley 3-band crossover dynamics &amp; brickwall peak ceiling
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAuditionMaster}
                disabled={auditioningMaster}
                className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-medium whitespace-nowrap"
              >
                {auditioningMaster ? 'Playing Master...' : 'Audition Master'}
              </button>
              <button
                type="button"
                onClick={() => onChangeMasterChain(createDefaultMasterChain())}
                className="p-1.5 rounded-lg bg-[#090B10] hover:bg-slate-800 border border-slate-800 text-slate-400"
                title="Reset master chain"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* Master EQ */}
            <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200">Master 3-Band EQ</div>
              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Low (110Hz)</span>
                  <span className="font-mono text-slate-200">{masterChain.lowEqDb} dB</span>
                </div>
                <input type="range" min={-6} max={6} step={0.5} value={masterChain.lowEqDb} onChange={(e) => patch({ lowEqDb: Number(e.target.value) })} className="studio-slider w-full" />
              </label>
              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Mid (1.2kHz)</span>
                  <span className="font-mono text-slate-200">{masterChain.midEqDb} dB</span>
                </div>
                <input type="range" min={-6} max={6} step={0.5} value={masterChain.midEqDb} onChange={(e) => patch({ midEqDb: Number(e.target.value) })} className="studio-slider w-full" />
              </label>
              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Air (7.2kHz)</span>
                  <span className="font-mono text-slate-200">{masterChain.highEqDb} dB</span>
                </div>
                <input type="range" min={-6} max={6} step={0.5} value={masterChain.highEqDb} onChange={(e) => patch({ highEqDb: Number(e.target.value) })} className="studio-slider w-full" />
              </label>
            </div>

            {/* 3-Band Multiband Compression */}
            <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">Multiband Comp</span>
                <button
                  type="button"
                  onClick={() => patch({ multibandEnabled: !masterChain.multibandEnabled })}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                    masterChain.multibandEnabled ? 'bg-purple-500/25 text-purple-300' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {masterChain.multibandEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Low &lt;240Hz</span>
                  <span className="font-mono text-slate-200">{masterChain.lowThreshDb} dB</span>
                </div>
                <input type="range" min={-36} max={-4} step={1} value={masterChain.lowThreshDb} onChange={(e) => patch({ lowThreshDb: Number(e.target.value) })} className="studio-slider w-full" />
              </label>
              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Mid 240-3.8k</span>
                  <span className="font-mono text-slate-200">{masterChain.midThreshDb} dB</span>
                </div>
                <input type="range" min={-36} max={-4} step={1} value={masterChain.midThreshDb} onChange={(e) => patch({ midThreshDb: Number(e.target.value) })} className="studio-slider w-full" />
              </label>
              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>High &gt;3.8kHz</span>
                  <span className="font-mono text-slate-200">{masterChain.highThreshDb} dB</span>
                </div>
                <input type="range" min={-36} max={-4} step={1} value={masterChain.highThreshDb} onChange={(e) => patch({ highThreshDb: Number(e.target.value) })} className="studio-slider w-full" />
              </label>
            </div>

            {/* Stereo & Brickwall Limiter */}
            <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200">Limiter &amp; Gain</div>
              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Ceiling</span>
                  <span className="font-mono text-sky-300">{masterChain.limiterCeilingDb} dBFS</span>
                </div>
                <input type="range" min={-6} max={-0.1} step={0.1} value={masterChain.limiterCeilingDb} onChange={(e) => patch({ limiterCeilingDb: Number(e.target.value) })} className="studio-slider w-full" />
              </label>
              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Drive / Make-up</span>
                  <span className="font-mono text-slate-200">{masterChain.outputGainDb > 0 ? `+${masterChain.outputGainDb}` : masterChain.outputGainDb} dB</span>
                </div>
                <input type="range" min={-9} max={9} step={0.5} value={masterChain.outputGainDb} onChange={(e) => patch({ outputGainDb: Number(e.target.value) })} className="studio-slider w-full" />
              </label>
              <label className="block space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Stereo Target</span>
                  <span className="font-mono text-slate-200">{masterChain.stereoWidthPct}%</span>
                </div>
                <input type="range" min={50} max={150} step={2} value={masterChain.stereoWidthPct} onChange={(e) => patch({ stereoWidthPct: Number(e.target.value) })} className="studio-slider w-full" />
              </label>
            </div>
          </div>

          {/* Acoustic Telemetry + AI Advisory Mastering */}
          <div className="p-4 rounded-xl bg-[#090B10] border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Activity className="w-4 h-4 text-sky-400" />
                <span>Measured Loudness, Peak &amp; Stereo Analysis</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={targetPlatform}
                  onChange={(e) => setTargetPlatform(e.target.value)}
                  className="px-2.5 py-1.5 rounded bg-[#151923] border border-slate-800 text-[11px] text-slate-300"
                >
                  <option>Spotify / Apple Music (-14 LUFS)</option>
                  <option>Club / Sound System (-9 LUFS)</option>
                  <option>YouTube / TikTok (-13 LUFS)</option>
                </select>
                <button
                  type="button"
                  onClick={handleAnalyzeTelemetryAndAi}
                  disabled={analyzing}
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>{analyzing ? 'Measuring Audio...' : 'Measure & Get AI Advice'}</span>
                </button>
              </div>
            </div>

            {telemetry ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
                <div className="p-2.5 rounded-lg bg-[#151923] border border-slate-800">
                  <div className="text-[10px] text-slate-400">Loudness Est.</div>
                  <div className="text-sm font-mono font-bold text-purple-300 tabular-nums">
                    {telemetry.integratedLufsApprox} LUFS
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#151923] border border-slate-800">
                  <div className="text-[10px] text-slate-400">True Peak</div>
                  <div className={`text-sm font-mono font-bold tabular-nums ${telemetry.peakDbfs > -0.3 ? 'text-red-400' : 'text-sky-300'}`}>
                    {telemetry.peakDbfs} dBFS
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#151923] border border-slate-800">
                  <div className="text-[10px] text-slate-400">Crest Factor</div>
                  <div className="text-sm font-mono font-bold text-slate-200 tabular-nums">
                    {telemetry.crestFactorDb} dB
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#151923] border border-slate-800">
                  <div className="text-[10px] text-slate-400">Correlation</div>
                  <div className="text-sm font-mono font-bold text-emerald-300 tabular-nums">
                    {telemetry.stereoCorrelation}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#151923] border border-slate-800">
                  <div className="text-[10px] text-slate-400">L / M / H</div>
                  <div className="text-xs font-mono font-semibold text-slate-200 mt-1 tabular-nums">
                    {telemetry.lowEnergyPct}/{telemetry.midEnergyPct}/{telemetry.highEnergyPct}%
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Click "Measure &amp; Get AI Advice" or "Audition Master" to render and compute real LUFS loudness, True Peak, Crest Factor, and Stereo Phase Correlation.
              </p>
            )}

            {aiAdvice && (
              <div className="p-3.5 rounded-lg bg-purple-950/20 border border-purple-500/35 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-purple-300">
                    AI Recommendations Only (Not Applied Until Approved)
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyAiRecommendations}
                    className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply Recommended Curve</span>
                  </button>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">{aiAdvice.summary}</p>
                <div className="text-[11px] font-mono text-sky-300">
                  Suggested EQ: Low {aiAdvice.recommendedLowEqDb}dB · Mid {aiAdvice.recommendedMidEqDb}dB · High {aiAdvice.recommendedHighEqDb}dB · Ceiling {aiAdvice.limiterCeilingDb}dBFS
                </div>
                {aiAdvice.warnings?.length > 0 && (
                  <div className="text-[11px] text-amber-300">
                    Notes: {aiAdvice.warnings.join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Real Audio Export Center & Export History */}
        <div className="xl:col-span-5 rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-4">
          <div className="border-b border-slate-800/80 pb-3">
            <h4 className="font-display text-base font-semibold text-slate-100">
              Real Export Engine &amp; Project Backup
            </h4>
            <p className="text-[11px] text-slate-400">
              Actual offline PCM WAV, real MP3 (@breezystack/lamejs), multi-stem bounce, and JSON backup
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Sample Rate</label>
              <select
                value={sampleRate}
                onChange={(e) => setSampleRate(Number(e.target.value) as 44100 | 48000)}
                className="w-full px-2.5 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs font-mono text-slate-100"
              >
                <option value={44100}>44.1 kHz</option>
                <option value={48000}>48.0 kHz</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">WAV Depth</label>
              <select
                value={wavBitDepth}
                onChange={(e) => setWavBitDepth(Number(e.target.value) as 16 | 24 | 32)}
                className="w-full px-2.5 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs font-mono text-slate-100"
              >
                <option value={16}>16-bit PCM</option>
                <option value={24}>24-bit PCM</option>
                <option value={32}>32-bit Float</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">MP3 Bitrate</label>
              <select
                value={mp3Kbps}
                onChange={(e) => setMp3Kbps(Number(e.target.value) as 192 | 320)}
                className="w-full px-2.5 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs font-mono text-slate-100"
              >
                <option value={192}>192 kbps</option>
                <option value={320}>320 kbps</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleExportMaster('wav')}
              disabled={exporting}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-white text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{exporting ? 'Rendering Offline...' : `Export Stereo Master (.WAV ${wavBitDepth}-bit)`}</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleExportMaster('mp3')}
                disabled={exporting}
                className="py-2 px-3 rounded-lg bg-[#151923] hover:bg-slate-800 border border-slate-800 text-sky-300 text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <FileAudio className="w-3.5 h-3.5" />
                <span>Export .MP3 ({mp3Kbps}k)</span>
              </button>

              <button
                type="button"
                onClick={handleExportIndividualStems}
                disabled={exporting}
                className="py-2 px-3 rounded-lg bg-[#151923] hover:bg-slate-800 border border-slate-800 text-purple-300 text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Export All Stems</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportBackupJson}
              className="w-full py-2 px-3 rounded-lg bg-[#090B10] hover:bg-[#151923] border border-slate-800 text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <HardDriveDownload className="w-3.5 h-3.5 text-slate-400" />
              <span>Download Full Project Backup (.sounddeck.json)</span>
            </button>
          </div>

          {/* Export History Audit Ledger */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <div className="text-[11px] font-mono text-slate-400">
              Export History &amp; Release Log ({exportLogs.length})
            </div>
            {exportLogs.length === 0 ? (
              <p className="text-xs text-slate-500">
                Your exported WAV, MP3, stem, and backup files will be logged here.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {exportLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-lg bg-[#090B10] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-200 truncate">{log.fileName}</div>
                      <div className="text-[10px] font-mono text-slate-500 tabular-nums">
                        {log.format.toUpperCase()} · {log.sampleRate}Hz{log.bitDepth ? ` · ${log.bitDepth}-bit` : ''} · {(log.sizeBytes / 1024).toFixed(0)} KB
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
