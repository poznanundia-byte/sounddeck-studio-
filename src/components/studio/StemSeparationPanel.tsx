import { useEffect, useState } from 'react';
import { Upload, SplitSquareHorizontal, Download, Plus, AlertTriangle, Play } from 'lucide-react';
import { getAudioContext } from '../../audio/studioAudio';
import { triggerFileDownload } from '../../audio/exportEncoders';
import { safeApiFetch } from '../../services/apiClient';

interface StemSeparationPanelProps {
  onImportSeparatedStems: (stems: { label: string; buffer: AudioBuffer }[]) => void;
}

interface SeparatedStemOutput {
  key: 'vocals' | 'drums' | 'bass' | 'other';
  label: string;
  dataUrl: string;
  buffer: AudioBuffer | null;
}

export function StemSeparationPanel({ onImportSeparatedStems }: StemSeparationPanelProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [requiredSecrets, setRequiredSecrets] = useState<string[]>([
    'REPLICATE_API_TOKEN',
    'STEM_SEPARATION_API_URL',
  ]);
  const [fileName, setFileName] = useState('');
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stems, setStems] = useState<SeparatedStemOutput[]>([]);

  useEffect(() => {
    safeApiFetch<{ configured?: boolean; provider?: string | null; requiredSecrets?: string[] }>(
      '/api/audio/separate-stems/status'
    ).then((res) => {
      if (res.ok && res.data) {
        setConfigured(Boolean(res.data.configured));
        setProviderName(res.data.provider || null);
        if (Array.isArray(res.data.requiredSecrets)) setRequiredSecrets(res.data.requiredSecrets);
      } else {
        setConfigured(false);
      }
    });
  }, []);

  const handleUploadAndSeparate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setErrorMsg(null);
    setStems([]);
    setRunning(true);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read audio file.'));
        reader.readAsDataURL(file);
      });

      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx > -1 ? dataUrl.slice(commaIdx + 1) : '';

      const res = await safeApiFetch<{
        configured?: boolean;
        error?: string;
        stems?: Record<string, string>;
      }>('/api/audio/separate-stems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: file.type || 'audio/wav',
          fileName: file.name,
        }),
      });

      const payload = res.data || {};
      if (res.isStaticFallback) {
        setConfigured(false);
        setErrorMsg(
          'External Demucs stem separation requires a Node/Express server runtime. You can still chop, filter, and EQ tracks natively in the DAW & Virtual DJ consoles.'
        );
        return;
      }

      if (res.status === 501 || payload.configured === false) {
        setConfigured(false);
        setErrorMsg(payload.error || 'External Demucs stem separation API is not configured.');
        return;
      }

      if (!res.ok || !payload.stems) {
        throw new Error(res.error || payload.error || 'Stem separation failed.');
      }

      const ctx = getAudioContext();
      const labels: Record<'vocals' | 'drums' | 'bass' | 'other', string> = {
        vocals: 'Vocals',
        drums: 'Drums',
        bass: 'Bass',
        other: 'Other Instruments',
      };

      const decodedStems: SeparatedStemOutput[] = [];
      for (const k of ['vocals', 'drums', 'bass', 'other'] as const) {
        const url = payload.stems[k];
        if (!url) continue;
        let decoded: AudioBuffer | null = null;
        try {
          const resp = await fetch(url);
          const ab = await resp.arrayBuffer();
          decoded = await ctx.decodeAudioData(ab);
        } catch {
          decoded = null;
        }
        decodedStems.push({
          key: k,
          label: labels[k],
          dataUrl: url,
          buffer: decoded,
        });
      }

      setStems(decodedStems);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Stem separation error.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <SplitSquareHorizontal className="w-5 h-5 text-sky-400" />
          <div>
            <h4 className="font-display text-base font-semibold text-slate-100">
              AI Stem Separation (Vocals · Drums · Bass · Other)
            </h4>
            <p className="text-[11px] text-slate-400">
              Server-side Demucs neural source separation — never simulated or fabricated
            </p>
          </div>
        </div>

        <label
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap ${
            configured
              ? 'cursor-pointer bg-gradient-to-r from-purple-600 to-sky-500 text-white'
              : 'cursor-not-allowed bg-slate-800/70 text-slate-400 border border-slate-700'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{running ? 'Separating Stems...' : 'Upload Mix to Separate'}</span>
          <input
            type="file"
            accept="audio/*"
            disabled={!configured || running}
            onChange={handleUploadAndSeparate}
            className="hidden"
          />
        </label>
      </div>

      {configured === false && (
        <div className="p-4 rounded-xl bg-amber-950/25 border border-amber-700/50 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>External Stem Separation Integration Required</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Real 4-stem neural separation (Vocals, Drums, Bass, Other) requires a server-side separation model credential so audio keys remain protected on the backend. Add one of the following in your server Secrets panel:
          </p>
          <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-mono text-amber-200">
            {requiredSecrets.map((s) => (
              <span key={s} className="px-2.5 py-1 rounded bg-[#090B10] border border-amber-700/40">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {configured && providerName && (
        <div className="text-[11px] font-mono text-emerald-300">
          Connected Backend Separation Provider: {providerName}
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200">
          {errorMsg}
        </div>
      )}

      {stems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-300 font-medium">
              Separated Stems for {fileName}
            </span>
            <button
              type="button"
              onClick={() => {
                const valid = stems
                  .filter((s): s is SeparatedStemOutput & { buffer: AudioBuffer } => Boolean(s.buffer))
                  .map((s) => ({ label: s.label, buffer: s.buffer }));
                if (valid.length > 0) onImportSeparatedStems(valid);
              }}
              className="px-3 py-1.5 rounded-lg bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Import All Stems to DAW Tracks</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {stems.map((st) => (
              <div
                key={st.key}
                className="p-3 rounded-lg bg-[#090B10] border border-slate-800 flex items-center justify-between gap-2"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-100">{st.label}</div>
                  <div className="text-[10px] font-mono text-slate-400">
                    {st.buffer ? `${st.buffer.duration.toFixed(1)}s WAV` : 'Audio Stream'}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!st.buffer) return;
                      const ctx = getAudioContext();
                      const src = ctx.createBufferSource();
                      src.buffer = st.buffer;
                      src.connect(ctx.destination);
                      src.start();
                    }}
                    className="p-1.5 rounded bg-[#151923] hover:bg-slate-800 text-sky-300"
                    title={`Play ${st.label}`}
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const resp = await fetch(st.dataUrl);
                      const blob = await resp.blob();
                      triggerFileDownload(blob, `${st.key}-stem.wav`);
                    }}
                    className="p-1.5 rounded bg-[#151923] hover:bg-slate-800 text-slate-300"
                    title={`Download ${st.label}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
