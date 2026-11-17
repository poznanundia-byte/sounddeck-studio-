import { useState } from 'react';
import {
  Sparkles,
  Send,
  Play,
  Check,
  Music,
  Volume2,
  Edit3,
} from 'lucide-react';
import type { MidiNote } from '../../types/studioPro';
import { auditionChordWithTone } from '../../audio/toneInstruments';
import { safeApiFetch } from '../../services/apiClient';

interface ChordSuggestion {
  symbol: string;
  midiNotes: number[];
  durationBeats: number;
}

interface AssistantStructuredResponse {
  reply: string;
  languageUsed: string;
  songConcept: {
    title: string;
    hookIdea: string;
    vibeSummary: string;
  };
  recommendedBpm: number;
  recommendedKey: string;
  rhymeScheme: string;
  chordProgression: ChordSuggestion[];
  lyrics: { section: string; lines: string[] }[];
  instrumentationSuggestions: string[];
  arrangementFeedback: string;
  mixingSuggestions: string[];
}

interface AiProducerAssistantProps {
  projectTitle: string;
  genre: string;
  bpm: number;
  musicalKey: string;
  trackNames: string[];
  hasVocals: boolean;
  existingLyrics: string;
  onApplyTempoAndKey: (nextBpm: number, nextKey: string) => void;
  onApplyLyrics: (lyricsText: string) => void;
  onInsertChordsToPianoRoll: (notes: MidiNote[]) => void;
  onImportLyriaAudio?: (audioDataUrl: string, title: string) => Promise<void>;
}

export function AiProducerAssistant({
  projectTitle,
  genre,
  bpm,
  musicalKey,
  trackNames,
  hasVocals,
  existingLyrics,
  onApplyTempoAndKey,
  onApplyLyrics,
  onInsertChordsToPianoRoll,
  onImportLyriaAudio,
}: AiProducerAssistantProps) {
  const [languagePref, setLanguagePref] = useState<'auto' | 'english' | 'kiswahili' | 'sheng'>('auto');
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [latestData, setLatestData] = useState<AssistantStructuredResponse | null>(null);
  const [editableLyrics, setEditableLyrics] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Lyria Real AI Audio Synthesis controls (explicitly distinct from text assistant)
  const [lyriaPrompt, setLyriaPrompt] = useState('Midnight Nairobi Afropop instrumental groove with warm kalimba, sub bass, and rimshot pocket');
  const [lyriaAudioUrl, setLyriaAudioUrl] = useState<string | null>(null);
  const [lyriaLoading, setLyriaLoading] = useState(false);

  const sendAssistantPrompt = async (customText?: string) => {
    const query = (customText ?? prompt).trim();
    if (!query || loading) return;
    setLoading(true);
    setErrorMsg(null);
    if (!customText) setPrompt('');

    const nextHistory = [...history, { role: 'user' as const, text: query }];
    setHistory(nextHistory);

    try {
      const res = await safeApiFetch<AssistantStructuredResponse>('/api/gemini/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          languagePreference: languagePref,
          genre,
          bpm,
          musicalKey,
          projectSummary: {
            title: projectTitle,
            trackCount: trackNames.length,
            trackNames,
            hasVocals,
            existingLyrics: existingLyrics.slice(0, 600),
          },
          history: nextHistory,
        }),
      });

      let parsed: AssistantStructuredResponse;
      if (res.ok && res.data) {
        parsed = res.data;
      } else if (res.isStaticFallback) {
        const langLabel =
          languagePref === 'kiswahili'
            ? 'Kiswahili'
            : languagePref === 'sheng'
            ? 'Kenyan Sheng'
            : 'English';
        parsed = {
          reply: `Static Studio Blueprint generated for "${projectTitle}" (${bpm} BPM, ${musicalKey}). Connect the Node backend with GEMINI_API_KEY for live Gemini synthesis, or apply these interactive chords & lyrics directly below.`,
          languageUsed: langLabel,
          songConcept: {
            title: `${projectTitle || genre} Blueprint`,
            hookIdea:
              languagePref === 'kiswahili'
                ? 'Piga hatua mbele, sauti yetu inasikika usiku kucha.'
                : languagePref === 'sheng'
                ? 'Vibe ni safi Nairobi usiku, bass inabamba mpaka asubuhi.'
                : 'Turn the studio lights low, let the 808 pocket carry the hook.',
            vibeSummary: `Groove-focused ${genre} arrangement at ${bpm} BPM in ${musicalKey}.`,
          },
          recommendedBpm: bpm,
          recommendedKey: musicalKey,
          rhymeScheme: 'AABB / Syncopated 4-bar call & response',
          chordProgression: [
            { symbol: 'Am9', midiNotes: [57, 60, 64, 67, 71], durationBeats: 4 },
            { symbol: 'Fmaj7', midiNotes: [53, 57, 60, 64], durationBeats: 4 },
            { symbol: 'C6', midiNotes: [60, 64, 67, 69], durationBeats: 4 },
            { symbol: 'Em7', midiNotes: [52, 55, 59, 62], durationBeats: 4 },
          ],
          lyrics: [
            {
              section: 'Chorus Hook',
              lines:
                languagePref === 'kiswahili'
                  ? [
                      'Mdundo unashika, usiku ni wetu leo',
                      'Tunaweka alama, sauti iko juu sana',
                    ]
                  : languagePref === 'sheng'
                  ? [
                      'Mtaa inasikia bass ikidunda kwa speaker',
                      'Hakuna kulala leo, tunakimbiza beat bila pressure',
                    ]
                  : [
                      'Dial in the pocket, let the sub-bass breathe',
                      'Late-night studio glow, writing melodies underneath',
                    ],
            },
          ],
          instrumentationSuggestions: ['Warm Rhodes EP', 'Sub-808 Log Drum', 'Crisp Rimshot', 'Kalimba Pluck'],
          arrangementFeedback: `Keep ${trackNames.length || 4} core elements focused: carve 250Hz mud from the chords so vocals & drums cut cleanly.`,
          mixingSuggestions: [
            'High-pass non-bass tracks at 90Hz',
            'Sidechain pad bus lightly to kick transient',
            'Keep master ceiling at -1.0 dBTP for streaming headroom',
          ],
        };
      } else {
        throw new Error(res.error || 'AI Assistant error');
      }

      setLatestData(parsed);
      setHistory((prev) => [...prev, { role: 'model', text: parsed.reply }]);
      const formattedLyrics = parsed.lyrics
        .map((sec) => `[${sec.section}]\n${sec.lines.join('\n')}`)
        .join('\n\n');
      setEditableLyrics(formattedLyrics);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach AI Music Assistant.');
    } finally {
      setLoading(false);
    }
  };

  const handleInsertChords = () => {
    if (!latestData?.chordProgression?.length) return;
    const notes: MidiNote[] = [];
    let currentStep = 0;
    latestData.chordProgression.forEach((ch, cIdx) => {
      const steps = Math.max(2, Math.min(16, (ch.durationBeats || 2) * 2));
      ch.midiNotes.forEach((pitch) => {
        if (pitch >= 36 && pitch <= 84) {
          notes.push({
            id: `ai_ch_${cIdx}_${pitch}_${Date.now()}`,
            pitch,
            startStep: currentStep % 32,
            durationSteps: steps,
            velocity: 0.78,
            instrument: 'rhodes_ep',
          });
        }
      });
      currentStep += steps;
    });
    onInsertChordsToPianoRoll(notes);
  };

  const handleGenerateLyriaAudio = async () => {
    setLyriaLoading(true);
    setErrorMsg(null);
    try {
      const res = await safeApiFetch<{ audioDataUrl?: string; error?: string }>('/api/gemini/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: lyriaPrompt,
          mode: 'clip',
          genre,
          bpm,
        }),
      });
      if (res.isStaticFallback) {
        throw new Error(
          'Lyria AI Audio API requires the Node/Express server runtime with GEMINI_API_KEY configured. Use the DAW Step Sequencer or Piano Roll to synthesize beats directly in your browser!'
        );
      }
      if (!res.ok || !res.data?.audioDataUrl) {
        throw new Error(res.error || 'Lyria generation error');
      }
      setLyriaAudioUrl(res.data.audioDataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lyria audio synthesis failed.');
    } finally {
      setLyriaLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Multilingual Chat & Quick Prompts */}
        <div className="xl:col-span-5 rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <div>
                  <h4 className="font-display text-base font-semibold text-slate-100">
                    AI Music Assistant
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    English · Kiswahili · Sheng · Editable suggestions only
                  </p>
                </div>
              </div>
              <select
                value={languagePref}
                onChange={(e) => setLanguagePref(e.target.value as typeof languagePref)}
                aria-label="Assistant language"
                className="px-2.5 py-1.5 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-sky-300"
              >
                <option value="auto">Auto (EN / SW / Sheng)</option>
                <option value="english">English</option>
                <option value="kiswahili">Kiswahili</option>
                <option value="sheng">Kenyan Sheng</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                'Suggest an original Gengetone hook & Sheng chorus',
                'Andika mistari ya Bongo Flava na chord progression',
                'Analyze my arrangement & suggest mixing fixes',
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendAssistantPrompt(q)}
                  className="px-2.5 py-1 rounded bg-[#090B10] hover:bg-[#151923] border border-slate-800 text-[11px] text-slate-300 text-left"
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="rounded-lg bg-[#090B10] border border-slate-800 p-3 h-64 overflow-y-auto space-y-2.5">
              {history.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-16">
                  Ask in English, Kiswahili, or Sheng for concepts, hooks, rhyme schemes, chord progressions, or mix critique. Nothing edits your session unless you click Apply.
                </p>
              ) : (
                history.map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-purple-600/20 border border-purple-500/30 text-purple-100 ml-6'
                        : 'bg-[#151923] border border-slate-800 text-slate-200 mr-4'
                    }`}
                  >
                    {m.text}
                  </div>
                ))
              )}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendAssistantPrompt();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask in English, Kiswahili, or Sheng..."
              className="flex-1 px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? '...' : 'Ask'}</span>
            </button>
          </form>
        </div>

        {/* Editable Suggestions + Apply Controls + Lyria Audio Generation */}
        <div className="xl:col-span-7 space-y-5">
          {latestData ? (
            <div className="rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div>
                  <div className="text-[11px] font-mono text-sky-400">
                    {latestData.languageUsed} · {latestData.recommendedBpm} BPM · {latestData.recommendedKey}
                  </div>
                  <h4 className="font-display text-base font-bold text-slate-100">
                    {latestData.songConcept.title}
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onApplyTempoAndKey(latestData.recommendedBpm, latestData.recommendedKey)}
                    className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-medium flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply BPM &amp; Key</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertChords}
                    className="px-3 py-1.5 rounded-lg bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 text-xs font-medium flex items-center gap-1"
                  >
                    <Music className="w-3.5 h-3.5" />
                    <span>Load Chords to Piano Roll</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-1.5">
                  <div className="font-semibold text-purple-300">Concept, Hook &amp; Rhyme Scheme</div>
                  <p className="text-slate-300">{latestData.songConcept.hookIdea}</p>
                  <div className="text-[11px] font-mono text-slate-400">
                    Rhyme Scheme: {latestData.rhymeScheme}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800 space-y-1.5">
                  <div className="font-semibold text-sky-300">Chord Progression (Click to Audition)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {latestData.chordProgression.map((c, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => auditionChordWithTone(c.midiNotes, 'rhodes_ep', 0.75)}
                        className="px-2.5 py-1 rounded bg-[#151923] hover:bg-slate-800 border border-slate-700 text-slate-200 font-mono text-[11px] flex items-center gap-1"
                      >
                        <Play className="w-2.5 h-2.5 text-sky-400" />
                        <span>{c.symbol}</span>
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Instruments: {latestData.instrumentationSuggestions.join(', ')}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-purple-400" />
                    <span>Editable Lyrics &amp; Hooks Draft</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onApplyLyrics(editableLyrics)}
                    className="px-3 py-1 rounded bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 text-xs font-semibold"
                  >
                    Save Draft to Project Lyrics
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={editableLyrics}
                  onChange={(e) => setEditableLyrics(e.target.value)}
                  className="w-full p-3 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-200 font-sans leading-relaxed focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800">
                  <div className="font-semibold text-slate-200 mb-1">Arrangement Feedback</div>
                  <p className="text-slate-400 leading-relaxed">{latestData.arrangementFeedback}</p>
                </div>
                <div className="p-3 rounded-lg bg-[#090B10] border border-slate-800">
                  <div className="font-semibold text-slate-200 mb-1">Mixing Improvements</div>
                  <ul className="list-disc pl-4 text-slate-400 space-y-0.5">
                    {latestData.mixingSuggestions.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-[#0F1219] border border-slate-800/80 p-6 text-xs text-slate-400">
              Send a message to inspect editable lyrics, interactive chords, BPM/key recommendations, and arrangement critique here. Text guidance never poses as synthesized audio.
            </div>
          )}

          {/* Genuine Lyria AI Audio Synthesis Block */}
          <div className="rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-sky-400" />
                <div>
                  <h4 className="font-display text-sm font-semibold text-slate-100">
                    Lyria AI Instrumental Audio Generator (Real Audio API)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Calls server-side Google Lyria model to synthesize actual playable audio clips
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={lyriaPrompt}
                onChange={(e) => setLyriaPrompt(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100"
              />
              <button
                type="button"
                onClick={handleGenerateLyriaAudio}
                disabled={lyriaLoading}
                className="px-4 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
              >
                {lyriaLoading ? 'Synthesizing Audio...' : 'Generate 30s Audio'}
              </button>
            </div>
            {lyriaAudioUrl && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <audio controls src={lyriaAudioUrl} className="flex-1 h-9" />
                {onImportLyriaAudio && (
                  <button
                    type="button"
                    onClick={() => onImportLyriaAudio(lyriaAudioUrl, `Lyria ${genre} ${bpm}BPM`)}
                    className="px-3 py-1.5 rounded-lg bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 text-xs font-semibold"
                  >
                    Import Audio to Timeline
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
