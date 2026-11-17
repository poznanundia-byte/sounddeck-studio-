import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  Square,
  Play,
  Upload,
  Scissors,
  Wand2,
  Save,
  Layers,
  Sliders,
  Plus,
  Trash2,
  Volume2,
  AlertCircle,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  saveVocalPreset,
  removeVocalPreset,
  uploadStudioAudioBlob,
  type SavedVocalPresetRecord,
} from '../../firebase';
import {
  BUILTIN_VOCAL_PRESETS,
  type VocalIntelligencePreset,
  type VocalPitchPoint,
  analyzeVocalPitchContour,
  generateVocalLayerDouble,
  processVocalWithPreset,
} from '../../audio/vocalIntelligence';
import {
  alignVocalToBeats,
  applyVocalAutoTune,
  applyVocalDenoiseAndGate,
  trimBufferToRange,
} from '../../audio/dawDsp';
import { encodeAudioBufferToWavBlob, triggerFileDownload } from '../../audio/exportEncoders';
import { detectVocalOnsetsMs, getAudioContext } from '../../audio/studioAudio';
import { safeApiFetch } from '../../services/apiClient';

export interface VocalTakeItem {
  id: string;
  label: string;
  buffer: AudioBuffer;
  punchInSec: number;
  createdAtIso: string;
  storageUrl?: string;
}

interface VocalIntelligencePanelProps {
  user: User | null;
  bpm: number;
  genre: string;
  vocalPresets: SavedVocalPresetRecord[];
  onAddVocalToTimeline: (take: VocalTakeItem) => void;
  onOpenAuth: () => void;
}

export function VocalIntelligencePanel({
  user,
  bpm,
  genre,
  vocalPresets,
  onAddVocalToTimeline,
  onOpenAuth,
}: VocalIntelligencePanelProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [countdownSec, setCountdownSec] = useState(3);
  const [countdownActive, setCountdownActive] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [inputLevelPct, setInputLevelPct] = useState(0);
  const [punchInSec, setPunchInSec] = useState(0);
  const [punchOutSec, setPunchOutSec] = useState(16);

  const [takes, setTakes] = useState<VocalTakeItem[]>([]);
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);
  const [trimStartSec, setTrimStartSec] = useState(0);
  const [trimEndSec, setTrimEndSec] = useState(0);

  // Vocal Intelligence State
  const [pitchPoints, setPitchPoints] = useState<VocalPitchPoint[]>([]);
  const [activePreset, setActivePreset] = useState<VocalIntelligencePreset>(BUILTIN_VOCAL_PRESETS[0]);
  const [customPresetName, setCustomPresetName] = useState('');
  const [processingMsg, setProcessingMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pitchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const meterStreamRef = useRef<MediaStream | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const previewSrcRef = useRef<AudioBufferSourceNode | null>(null);

  const activeTake = takes.find((t) => t.id === activeTakeId) || null;

  // Enumerate Microphones & External Audio Interfaces
  const refreshDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter((d) => d.kind === 'audioinput');
      setDevices(inputs);
      if (inputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(inputs[0].deviceId);
      }
    } catch {
      // ignore if permission not granted yet
    }
  };

  useEffect(() => {
    refreshDevices();
    return () => {
      if (meterRafRef.current) cancelAnimationFrame(meterRafRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      meterStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Re-analyze waveform + pitch contour whenever activeTake changes
  useEffect(() => {
    if (!activeTake) {
      setPitchPoints([]);
      return;
    }
    setTrimStartSec(0);
    setTrimEndSec(Number(activeTake.buffer.duration.toFixed(2)));
    const pts = analyzeVocalPitchContour(activeTake.buffer);
    setPitchPoints(pts);
  }, [activeTake?.id, activeTake?.buffer]);

  // Draw Waveform Canvas
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#090B10';
    ctx.fillRect(0, 0, w, h);

    if (!activeTake) return;
    const data = activeTake.buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / w));
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      let min = 1;
      let max = -1;
      const idx = x * step;
      for (let j = 0; j < step && idx + j < data.length; j++) {
        const v = data[idx + j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x, (0.5 - max * 0.45) * h);
      ctx.lineTo(x, (0.5 - min * 0.45) * h);
    }
    ctx.stroke();

    // Trim window overlay
    const dur = Math.max(0.1, activeTake.buffer.duration);
    const xStart = (trimStartSec / dur) * w;
    const xEnd = (trimEndSec / dur) * w;
    ctx.fillStyle = 'rgba(139, 92, 246, 0.14)';
    ctx.fillRect(xStart, 0, Math.max(2, xEnd - xStart), h);
    ctx.fillStyle = '#A855F7';
    ctx.fillRect(xStart, 0, 2, h);
    ctx.fillRect(Math.max(0, xEnd - 2), 0, 2, h);
  }, [activeTake, trimStartSec, trimEndSec]);

  // Draw Pitch Contour Graph
  useEffect(() => {
    const canvas = pitchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#090B10';
    ctx.fillRect(0, 0, w, h);

    // Semitone horizontal gridlines (MIDI 45..76)
    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 1;
    for (let m = 48; m <= 72; m += 4) {
      const y = h - ((m - 44) / 34) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (!activeTake || pitchPoints.length === 0) return;
    const dur = Math.max(0.5, activeTake.buffer.duration);
    ctx.strokeStyle = '#A855F7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pitchPoints.forEach((pt, idx) => {
      const x = (pt.timeSec / dur) * w;
      const y = h - ((Math.max(44, Math.min(78, pt.midi + pt.centsOff / 100)) - 44) / 34) * h;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw note dots
    ctx.fillStyle = '#38BDF8';
    pitchPoints.slice(0, 80).forEach((pt) => {
      const x = (pt.timeSec / dur) * w;
      const y = h - ((Math.max(44, Math.min(78, pt.midi)) - 44) / 34) * h;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    });
  }, [activeTake, pitchPoints]);

  const startLiveRecordingStream = async () => {
    setErrorMsg(null);
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId
          ? {
              deviceId: { exact: selectedDeviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      meterStreamRef.current = stream;
      await refreshDevices();

      // Real-time Input Meter + optional Monitoring
      const ctx = getAudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);

      if (monitorEnabled) {
        const monGain = ctx.createGain();
        monGain.gain.value = 0.65;
        src.connect(monGain).connect(ctx.destination);
      }

      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      const pumpMeter = () => {
        analyser.getByteTimeDomainData(dataArr);
        let peak = 0;
        for (let i = 0; i < dataArr.length; i++) {
          const amp = Math.abs((dataArr[i] - 128) / 128);
          if (amp > peak) peak = amp;
        }
        setInputLevelPct(Math.min(100, Math.round(peak * 140)));
        meterRafRef.current = requestAnimationFrame(pumpMeter);
      };
      pumpMeter();

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        if (meterRafRef.current) cancelAnimationFrame(meterRafRef.current);
        setInputLevelPct(0);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const ab = await blob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab);

        const newId = `vox_${Date.now()}`;
        const label = `Vocal Take ${takes.length + 1}`;
        let storageUrl: string | undefined;
        if (user) {
          const wavBlob = encodeAudioBufferToWavBlob(decoded, 16);
          const up = await uploadStudioAudioBlob(user.uid, `${label}.wav`, wavBlob);
          storageUrl = up?.downloadUrl;
        }

        const item: VocalTakeItem = {
          id: newId,
          label,
          buffer: decoded,
          punchInSec,
          createdAtIso: new Date().toISOString(),
          storageUrl,
        };
        setTakes((prev) => [item, ...prev]);
        setActiveTakeId(newId);
        setProcessingMsg(
          `Captured "${label}" (${decoded.duration.toFixed(1)}s)${storageUrl ? ' · backed up to Cloud Storage' : ''}.`
        );
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);

      // Punch-Out Auto-Stop
      const windowDurSec = Math.max(0, punchOutSec - punchInSec);
      if (windowDurSec > 0) {
        window.setTimeout(() => {
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
          }
        }, windowDurSec * 1000);
      }
    } catch {
      setErrorMsg('Microphone permission required. Connect USB mic / audio interface or upload an audio file.');
    }
  };

  const handleRecordClick = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    if (countdownSec <= 0) {
      startLiveRecordingStream();
      return;
    }
    let rem = countdownSec;
    setCountdownActive(rem);
    countdownTimerRef.current = window.setInterval(() => {
      rem -= 1;
      if (rem <= 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setCountdownActive(null);
        startLiveRecordingStream();
      } else {
        setCountdownActive(rem);
      }
    }, 1000);
  };

  const handleUploadTake = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const ctx = getAudioContext();
      const ab = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(ab);
      const id = `vox_${Date.now()}`;
      const label = file.name.replace(/\.[^/.]+$/, '').slice(0, 48);
      let storageUrl: string | undefined;
      if (user) {
        const up = await uploadStudioAudioBlob(user.uid, file.name, file);
        storageUrl = up?.downloadUrl;
      }
      const item: VocalTakeItem = {
        id,
        label,
        buffer: decoded,
        punchInSec,
        createdAtIso: new Date().toISOString(),
        storageUrl,
      };
      setTakes((prev) => [item, ...prev]);
      setActiveTakeId(id);
      setProcessingMsg(`Loaded "${label}" (${decoded.duration.toFixed(1)}s).`);
    } catch {
      setErrorMsg('Could not decode audio file. Please use a standard WAV or MP3 vocal file.');
    }
  };

  const handlePreviewTake = (take: VocalTakeItem) => {
    try {
      previewSrcRef.current?.stop();
    } catch {
      // ignore
    }
    const ctx = getAudioContext();
    const src = ctx.createBufferSource();
    src.buffer = take.buffer;
    src.connect(ctx.destination);
    previewSrcRef.current = src;
    src.start();
  };

  const handleTrimActiveTake = () => {
    if (!activeTake) return;
    const ctx = getAudioContext();
    const trimmed = trimBufferToRange(
      ctx,
      activeTake.buffer,
      trimStartSec,
      Math.max(trimStartSec + 0.15, trimEndSec)
    );
    setTakes((prev) => prev.map((t) => (t.id === activeTake.id ? { ...t, buffer: trimmed } : t)));
    setProcessingMsg(`Trimmed "${activeTake.label}" to ${trimmed.duration.toFixed(2)}s.`);
  };

  const handleApplyVocalChain = async () => {
    if (!activeTake) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const ctx = getAudioContext();
      let buf = await applyVocalDenoiseAndGate(ctx, activeTake.buffer, -40);
      buf = await processVocalWithPreset(ctx, buf, activePreset);
      if (activePreset.autoTuneEnabled) {
        buf = await applyVocalAutoTune(ctx, buf, activePreset.scale, activePreset.tuneSpeed);
      }
      const align = alignVocalToBeats(buf, activeTake.punchInSec, bpm);
      setTakes((prev) =>
        prev.map((t) =>
          t.id === activeTake.id ? { ...t, buffer: buf, punchInSec: align.newOffsetSec } : t
        )
      );
      setProcessingMsg(
        `Applied "${activePreset.name}" (${activePreset.autoTuneEnabled ? activePreset.scale : 'Natural Pitch'}) & snapped onset to Beat ${align.alignedBeat}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Vocal processing failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateHarmonyDouble = async () => {
    if (!activeTake) return;
    setBusy(true);
    try {
      const doubled = await generateVocalLayerDouble(activeTake.buffer, 14, 18);
      const id = `vox_dbl_${Date.now()}`;
      const newTake: VocalTakeItem = {
        id,
        label: `${activeTake.label} (Wide Double)`,
        buffer: doubled,
        punchInSec: activeTake.punchInSec,
        createdAtIso: new Date().toISOString(),
      };
      setTakes((prev) => [newTake, ...prev]);
      setActiveTakeId(id);
      setProcessingMsg(`Generated stereo vocal double "${newTake.label}" — ready to layer on timeline.`);
    } finally {
      setBusy(false);
    }
  };

  const handleAiVocalTimingCheck = async () => {
    if (!activeTake) return;
    setBusy(true);
    try {
      const onsets = detectVocalOnsetsMs(activeTake.buffer);
      const peakList = onsets.length > 0 ? onsets : [120, 640, 1180];
      const res = await safeApiFetch<{ pocketDiagnosis?: string; recommendedOffsetMs?: number }>(
        '/api/gemini/voice-align',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bpm,
            genre,
            durationSec: Number(activeTake.buffer.duration.toFixed(2)),
            peakOnsetsMs: peakList,
            vocalTakeLabel: activeTake.label,
          }),
        }
      );

      if (res.ok && res.data) {
        setProcessingMsg(
          `Timing Intelligence: ${res.data.pocketDiagnosis} (Recommended offset: ${res.data.recommendedOffsetMs}ms)`
        );
        return;
      }

      if (res.isStaticFallback) {
        const beatMs = 60000 / Math.max(40, bpm || 112);
        const sixteenthMs = beatMs / 4;
        const avgDrift =
          peakList.reduce((acc, ms) => {
            const mod = ms % sixteenthMs;
            const signed = mod > sixteenthMs / 2 ? mod - sixteenthMs : mod;
            return acc + signed;
          }, 0) / peakList.length;
        const recommendedOffsetMs = Math.round(-avgDrift);
        const diagnosis =
          Math.abs(recommendedOffsetMs) <= 12
            ? `Tight pocket alignment at ${bpm} BPM — transients sit close to the 16th-note grid.`
            : recommendedOffsetMs < 0
            ? `Vocal phrases arrive slightly behind the ${bpm} BPM beat — pull clip forward by ${Math.abs(recommendedOffsetMs)}ms.`
            : `Vocal phrases push ahead of the ${bpm} BPM beat — nudge clip back by ${recommendedOffsetMs}ms.`;
        setProcessingMsg(
          `Local Pocket Analysis: ${diagnosis} (Recommended offset: ${recommendedOffsetMs}ms)`
        );
        return;
      }

      throw new Error(res.error || 'Timing check failed');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI vocal timing failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCustomPreset = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const cleanName = customPresetName.trim();
    if (!cleanName) return;
    setBusy(true);
    try {
      await saveVocalPreset(user.uid, {
        name: cleanName,
        description: `HP ${activePreset.highPassHz}Hz · Comp ${activePreset.compRatio}:1 · ${
          activePreset.autoTuneEnabled ? activePreset.scale : 'Natural'
        }`,
        presetJson: JSON.stringify({ ...activePreset, id: `custom_${Date.now()}`, name: cleanName }),
      });
      setCustomPresetName('');
      setProcessingMsg(`Saved custom vocal preset "${cleanName}" to Firestore.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save preset.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {processingMsg && (
        <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-700/60 text-xs text-sky-200">
          {processingMsg}
        </div>
      )}

      {/* Recording Booth & Device Controls */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-5 rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <h4 className="font-display text-base font-semibold text-slate-100">
                Vocal Booth &amp; Interface Input
              </h4>
              <p className="text-[11px] text-slate-400">
                Supports external USB mics/audio interfaces, countdown &amp; punch-in/out windows
              </p>
            </div>
            <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-[#151923] hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 flex items-center gap-1.5 whitespace-nowrap">
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>Upload Take</span>
              <input type="file" accept="audio/*" onChange={handleUploadTake} className="hidden" />
            </label>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Audio Input Device</label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100"
              >
                {devices.length === 0 ? (
                  <option value="">Default System / Browser Microphone</option>
                ) : (
                  devices.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Audio Input ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Countdown</label>
                <select
                  value={countdownSec}
                  onChange={(e) => setCountdownSec(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg bg-[#090B10] border border-slate-800 text-xs font-mono text-slate-100"
                >
                  <option value={0}>0s (Instant)</option>
                  <option value={3}>3-2-1s</option>
                  <option value={5}>5s</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Punch In (s)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={punchInSec}
                  onChange={(e) => setPunchInSec(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg bg-[#090B10] border border-slate-800 text-xs font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Punch Out (s)</label>
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={punchOutSec}
                  onChange={(e) => setPunchOutSec(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg bg-[#090B10] border border-slate-800 text-xs font-mono text-slate-100"
                />
              </div>
            </div>

            {/* Real-Time Input Meter + Monitoring */}
            <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Live Input Level Meter</span>
                <span className="font-mono text-sky-400 tabular-nums">{inputLevelPct}%</span>
              </div>
              <div className="h-2 rounded bg-slate-900 overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 ${
                    inputLevelPct > 85 ? 'bg-red-500' : 'bg-gradient-to-r from-purple-500 to-sky-400'
                  }`}
                  style={{ width: `${inputLevelPct}%` }}
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={monitorEnabled}
                  onChange={(e) => setMonitorEnabled(e.target.checked)}
                />
                <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Real-time headphone monitoring (use headphones to avoid feedback)</span>
              </label>
            </div>

            <button
              type="button"
              onClick={handleRecordClick}
              disabled={countdownActive !== null}
              className={`w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-white'
              }`}
            >
              {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span>
                {countdownActive !== null
                  ? `Starting in ${countdownActive}...`
                  : isRecording
                  ? 'Stop Recording Take'
                  : 'Record Vocal Take'}
              </span>
            </button>
          </div>

          {/* Recorded Takes List */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400">
              Captured Vocal Takes ({takes.length})
            </div>
            {takes.length === 0 ? (
              <p className="text-xs text-slate-500">
                Record or upload a vocal take to inspect waveform, pitch curve, and send to multitrack.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {takes.map((take) => (
                  <div
                    key={take.id}
                    className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                      activeTake?.id === take.id
                        ? 'bg-[#151927] border-purple-500/60'
                        : 'bg-[#090B10] border-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveTakeId(take.id)}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="font-medium text-slate-100 truncate">{take.label}</div>
                      <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                        {take.buffer.duration.toFixed(2)}s · Punch @{take.punchInSec}s
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreviewTake(take)}
                      className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-sky-300"
                      title="Play take"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddVocalToTimeline(take)}
                      className="px-2 py-1 rounded bg-purple-600/25 hover:bg-purple-600/40 text-purple-200 text-[11px] font-medium flex items-center gap-1 whitespace-nowrap"
                    >
                      <Plus className="w-3 h-3" />
                      <span>To Track</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTakes((prev) => prev.filter((x) => x.id !== take.id))}
                      className="p-1.5 rounded bg-slate-900 hover:bg-red-950/60 text-slate-400 hover:text-red-400"
                      title="Delete take"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Vocal Waveform, Trimming & Pitch Intelligence Graph */}
        <div className="xl:col-span-7 rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div>
              <h4 className="font-display text-base font-semibold text-slate-100">
                Vocal Intelligence · Pitch Analysis, Trimming &amp; Layering
              </h4>
              <p className="text-[11px] text-slate-400">
                {activeTake
                  ? `Inspecting "${activeTake.label}" (${pitchPoints.length} pitched frames analyzed)`
                  : 'Select or record a vocal take to inspect waveform and pitch contour'}
              </p>
            </div>
            {activeTake && (
              <button
                type="button"
                onClick={() =>
                  triggerFileDownload(
                    encodeAudioBufferToWavBlob(activeTake.buffer, 16),
                    `${activeTake.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.wav`
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-[#151923] hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 whitespace-nowrap"
              >
                Download Take (.WAV)
              </button>
            )}
          </div>

          {/* Waveform + Trim Range */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Vocal Waveform &amp; Trim Bounds</span>
              <span className="font-mono tabular-nums">
                {trimStartSec.toFixed(2)}s — {trimEndSec.toFixed(2)}s
              </span>
            </div>
            <canvas
              ref={waveCanvasRef}
              width={640}
              height={92}
              className="w-full h-24 rounded-lg border border-slate-800 bg-[#090B10]"
            />
            {activeTake && (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-slate-400">
                  <span>Trim In</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.1, activeTake.buffer.duration - 0.2)}
                    step={0.05}
                    value={trimStartSec}
                    onChange={(e) => setTrimStartSec(Number(e.target.value))}
                    className="studio-slider w-24"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-slate-400">
                  <span>Trim Out</span>
                  <input
                    type="range"
                    min={0.2}
                    max={activeTake.buffer.duration}
                    step={0.05}
                    value={trimEndSec}
                    onChange={(e) => setTrimEndSec(Number(e.target.value))}
                    className="studio-slider w-24"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleTrimActiveTake}
                  className="px-3 py-1 rounded bg-[#151923] hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 flex items-center gap-1.5"
                >
                  <Scissors className="w-3.5 h-3.5 text-purple-400" />
                  <span>Crop Selection</span>
                </button>
              </div>
            )}
          </div>

          {/* Pitch Contour Graph */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Pitch Contour Detector (Purple Line = Detected Fundamental · Blue = Note Targets)</span>
              <span className="font-mono text-purple-300">
                {pitchPoints.length > 0
                  ? `Range: ${pitchPoints[0].noteName} .. ${pitchPoints[pitchPoints.length - 1].noteName}`
                  : 'No pitch frames'}
              </span>
            </div>
            <canvas
              ref={pitchCanvasRef}
              width={640}
              height={110}
              className="w-full h-28 rounded-lg border border-slate-800 bg-[#090B10]"
            />
          </div>

          {/* Preset Tuning + De-Ess + Auto-Tune + Layering Actions */}
          <div className="p-4 rounded-xl bg-[#090B10] border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                <span>Vocal Chain &amp; Custom Firestore Presets</span>
              </div>
              <select
                value={activePreset.id}
                onChange={(e) => {
                  const id = e.target.value;
                  const factory = BUILTIN_VOCAL_PRESETS.find((p) => p.id === id);
                  if (factory) {
                    setActivePreset(factory);
                    return;
                  }
                  const saved = vocalPresets.find((vp) => vp.id === id);
                  if (saved) {
                    try {
                      setActivePreset(JSON.parse(saved.presetJson) as VocalIntelligencePreset);
                    } catch {
                      // ignore malformed
                    }
                  }
                }}
                className="px-2.5 py-1.5 rounded bg-[#151923] border border-slate-800 text-xs text-slate-100"
              >
                <optgroup label="Factory Vocal Chains">
                  {BUILTIN_VOCAL_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
                {vocalPresets.length > 0 && (
                  <optgroup label="My Saved Firestore Presets">
                    {vocalPresets.map((vp) => (
                      <option key={vp.id} value={vp.id}>
                        ★ {vp.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
              <label className="space-y-1">
                <span className="text-slate-400 block">De-Esser ({activePreset.deEssDb} dB)</span>
                <input
                  type="range"
                  min={-9}
                  max={0}
                  step={0.5}
                  value={activePreset.deEssDb}
                  onChange={(e) =>
                    setActivePreset((p) => ({ ...p, deEssDb: Number(e.target.value) }))
                  }
                  className="studio-slider w-full"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400 block">Presence ({activePreset.presenceDb} dB)</span>
                <input
                  type="range"
                  min={-3}
                  max={8}
                  step={0.5}
                  value={activePreset.presenceDb}
                  onChange={(e) =>
                    setActivePreset((p) => ({ ...p, presenceDb: Number(e.target.value) }))
                  }
                  className="studio-slider w-full"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400 block">Comp Thresh ({activePreset.compThresholdDb}dB)</span>
                <input
                  type="range"
                  min={-36}
                  max={-6}
                  step={1}
                  value={activePreset.compThresholdDb}
                  onChange={(e) =>
                    setActivePreset((p) => ({ ...p, compThresholdDb: Number(e.target.value) }))
                  }
                  className="studio-slider w-full"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400 block">Pitch Scale</span>
                <select
                  value={activePreset.scale}
                  onChange={(e) =>
                    setActivePreset((p) => ({
                      ...p,
                      autoTuneEnabled: true,
                      scale: e.target.value as VocalIntelligencePreset['scale'],
                    }))
                  }
                  className="w-full px-2 py-1 rounded bg-[#151923] border border-slate-800 text-slate-200"
                >
                  <option value="A minor">A minor</option>
                  <option value="C major">C major</option>
                  <option value="D minor">D minor</option>
                  <option value="G major">G major</option>
                  <option value="Chromatic">Chromatic</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleApplyVocalChain}
                disabled={!activeTake || busy}
                className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Process Take (De-Noise, EQ, Pitch &amp; Timing)</span>
              </button>

              <button
                type="button"
                onClick={handleCreateHarmonyDouble}
                disabled={!activeTake || busy}
                className="px-3 py-2 rounded-lg bg-[#151923] hover:bg-slate-800 border border-slate-800 text-sky-300 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Generate Wide Vocal Double</span>
              </button>

              <button
                type="button"
                onClick={handleAiVocalTimingCheck}
                disabled={!activeTake || busy}
                className="px-3 py-2 rounded-lg bg-[#151923] hover:bg-slate-800 border border-slate-800 text-purple-300 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>AI Timing Check</span>
              </button>
            </div>

            {/* Save Custom Vocal Preset */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
              <input
                type="text"
                value={customPresetName}
                onChange={(e) => setCustomPresetName(e.target.value)}
                placeholder="Name your custom vocal preset..."
                className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg bg-[#151923] border border-slate-800 text-xs text-slate-100"
              />
              <button
                type="button"
                onClick={handleSaveCustomPreset}
                disabled={busy || !customPresetName.trim()}
                className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{user ? 'Save Preset' : 'Sign In to Save Preset'}</span>
              </button>
            </div>

            {vocalPresets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {vocalPresets.map((vp) => (
                  <div
                    key={vp.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#151923] border border-purple-500/30 text-[11px] text-purple-200"
                  >
                    <span>{vp.name}</span>
                    <button
                      type="button"
                      onClick={() => removeVocalPreset(vp.id)}
                      className="text-slate-500 hover:text-red-400"
                      title="Delete saved preset"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
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
