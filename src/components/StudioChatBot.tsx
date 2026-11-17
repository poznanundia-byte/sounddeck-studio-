import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MessageSquare,
  Send,
  X,
  Trash2,
  Sparkles,
  Plus,
  History,
  SlidersHorizontal,
  Paperclip,
  Mic,
  MicOff,
  Square,
  Volume2,
  VolumeX,
  Copy,
  Check,
  RotateCcw,
  Maximize2,
  Minimize2,
  Globe,
  Download,
  ExternalLink,
  Pencil,
  FileAudio,
  Image as ImageIcon,
  FileText,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import {
  getCachedBackendAvailability,
  resolveApiUrl,
  safeApiFetch,
} from '../services/apiClient';

export type ChatPersona = 'general' | 'producer' | 'mixing' | 'dj' | 'songwriter' | 'growth';
export type ChatModelTier = 'general' | 'fast' | 'complex' | 'deep';
export type ThinkingMode = 'auto' | 'low' | 'high';
export type StudioTabId = 'social' | 'creation' | 'daw' | 'vdj' | 'discover' | 'offline';

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: number;
  modelUsed?: string;
  fallbackNote?: string;
  attachments?: ChatAttachment[];
  sources?: GroundingSource[];
}

interface ChatThread {
  id: string;
  title: string;
  persona: ChatPersona;
  updatedAt: number;
  messages: ChatMessage[];
}

interface StudioChatBotProps {
  activeTab: StudioTabId;
  bpm: number;
  beatSignature?: string;
  activeTrackTitle: string;
  projectCount?: number;
  creatorName?: string;
  creatorRole?: string;
  nowPlayingTitle?: string;
  onApplyBpm?: (nextBpm: number) => void;
  onNavigateTab?: (tab: StudioTabId) => void;
  hidden?: boolean;
  hasFloatingPlayer?: boolean;
  isMobileAppLayout?: boolean;
}

const STORAGE_KEY = 'sounddeck_studio_ai_threads_v2';
const PREFS_KEY = 'sounddeck_studio_ai_prefs_v2';
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

const PERSONA_OPTIONS: {
  id: ChatPersona;
  label: string;
  shortDesc: string;
  starters: string[];
}[] = [
  {
    id: 'general',
    label: 'Studio All-Rounder',
    shortDesc: 'Flexible studio, creative & technical helper',
    starters: [
      'Give me a full production & rollout plan for this session.',
      'Suggest 3 chord progressions & drum groove ideas for my tempo.',
      'Help me troubleshoot vocal clarity and headroom in the DAW.',
    ],
  },
  {
    id: 'producer',
    label: 'Producer AI',
    shortDesc: 'Beats, chords, arrangement & Lyria prompts',
    starters: [
      'Suggest an Afrobeats chord progression & Lyria prompt for this BPM.',
      'Design a 16-bar beat arrangement with drop tension cues.',
      'What bassline rhythm locks best with syncopated shakers?',
    ],
  },
  {
    id: 'mixing',
    label: 'Mix Engineer',
    shortDesc: 'EQ, compression, vocal pocket & mastering',
    starters: [
      'How should I EQ and compress vocals over a heavy 808 sub bass?',
      'Give me mastering targets (LUFS, true peak, stereo width) for streaming.',
      'Fix muddy low-mids between my synth pad and snare.',
    ],
  },
  {
    id: 'dj',
    label: 'DJ Selector',
    shortDesc: 'Virtual DJ transitions, Camelot keys & FX',
    starters: [
      'How do I smoothly transition from 112 BPM Afrobeats into 124 BPM House?',
      'Suggest Filter, Flanger & Reverb phrasing for a high-energy drop.',
      'Explain Camelot wheel harmonic mixing for a 45-minute club set.',
    ],
  },
  {
    id: 'songwriter',
    label: 'Songwriter',
    shortDesc: 'Hooks, rhyme schemes, English / Kiswahili / Sheng',
    starters: [
      'Write a catchy 8-bar chorus hook matching my active BPM.',
      'Blend English and Sheng lines smoothly for an East African club anthem.',
      'Improve the rhythm and syllable count of a verse I paste here.',
    ],
  },
  {
    id: 'growth',
    label: 'Creator Growth',
    shortDesc: 'TikTok, IG Reels, YouTube & BuymeSoda',
    starters: [
      'Build a 3-day TikTok, IG Reels & BuymeSoda teaser rollout for my new drop.',
      'Write 5 short-form video hook captions for a studio clip.',
      'Plan a fan-club premiere message for WhatsApp & Instagram.',
    ],
  },
];

const MODEL_OPTIONS: { id: ChatModelTier; label: string }[] = [
  { id: 'general', label: 'Gemini 4 Hydrogen (Reliable Default)' },
  { id: 'fast', label: 'Gemini 3.1 Flash Lite (Ultra Fast)' },
  { id: 'complex', label: 'Gemini 4 Argon (Auto-Fallback)' },
  { id: 'deep', label: 'Gemini 4 Carbon (Deep / Fallback)' },
];

const LANGUAGE_OPTIONS = [
  { id: 'auto', label: 'Auto Match' },
  { id: 'english', label: 'English' },
  { id: 'kiswahili', label: 'Kiswahili' },
  { id: 'sheng', label: 'Sheng' },
  { id: 'french', label: 'Français' },
  { id: 'spanish', label: 'Español' },
];

function createWelcomeMessage(persona: ChatPersona, bpm: number, trackTitle: string): ChatMessage {
  const personaInfo = PERSONA_OPTIONS.find((p) => p.id === persona) || PERSONA_OPTIONS[0];
  return {
    id: `welcome_${Date.now()}`,
    role: 'model',
    text: `Ready in **${personaInfo.label}** mode for **"${trackTitle}"** (${bpm} BPM). Ask anything, attach an audio clip or screenshot, use voice dictation, or toggle Web Search for real-time lookup.`,
    createdAt: Date.now(),
    modelUsed: 'gemini-4-hydrogen',
  };
}

function createFreshThread(persona: ChatPersona, bpm: number, trackTitle: string): ChatThread {
  return {
    id: `thr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: 'New Studio Session',
    persona,
    updatedAt: Date.now(),
    messages: [createWelcomeMessage(persona, bpm, trackTitle)],
  };
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

function buildLocalStudioChatReply(params: {
  prompt: string;
  persona: ChatPersona;
  bpm: number;
  beatSignature: string;
  activeTab: StudioTabId;
  activeTrackTitle: string;
}): string {
  const { prompt, persona, bpm, beatSignature, activeTab, activeTrackTitle } = params;
  const halfBpm = Math.max(50, Math.round(bpm / 2));
  const beatMs = Math.round(60000 / Math.max(40, bpm));
  const eighthDelay = Math.round(beatMs / 2);

  if (persona === 'dj') {
    return [
      `**Local DJ Booth Cheat Sheet** (${bpm} BPM · ${beatSignature})`,
      `- **Harmonic Blend**: Keep phrasing locked on 16-bar boundaries (~${Math.round((64 * 60) / Math.max(40, bpm))}s at ${bpm} BPM).`,
      `- **EQ Swap**: Roll Deck B low EQ down -9 dB before raising the crossfader, then swap lows cleanly on bar 1.`,
      `- **Half-Time Drop**: Drop from ${bpm} BPM into a ${halfBpm} BPM breakdown using 1/8 delay (${eighthDelay} ms) + high-pass filter sweep.`,
      `\n*Note: Static hosting mode is active (no live Gemini server route at \`/api\`). Deploy with \`npm start\` + \`GEMINI_API_KEY\` for live cloud chat.*`,
    ].join('\n');
  }

  if (persona === 'mixing') {
    return [
      `**Local Mixing & Mastering Pocket** for **"${activeTrackTitle}"** (${bpm} BPM)`,
      `- **Low-End Headroom**: High-pass instruments above 90 Hz so sub-bass & kick stay clean.`,
      `- **Reverb / Delay Math**: Quarter-note delay = \`${beatMs} ms\`, dotted 1/8th = \`${Math.round(beatMs * 0.75)} ms\`.`,
      `- **Master Limiter**: Target \`-14 LUFS\` integrated with ceiling at \`-1.0 dBTP\`.`,
      `\n*Static hosting mode active: connect Node backend with \`GEMINI_API_KEY\` for live audio/file AI analysis.*`,
    ].join('\n');
  }

  if (persona === 'songwriter') {
    return [
      `**Songwriting Scaffold** (${bpm} BPM · ${beatSignature})`,
      `- **Prompt Focus**: "${prompt.slice(0, 100)}"`,
      `- **Hook Rhythm**: Try a 2-bar call-and-response phrase starting on beat 1 and answering on the '&' of beat 3.`,
      `- **Structure**: 8-bar Intro → 16-bar Verse → 8-bar Hook → 4-bar Drop.`,
      `\n*Static hosting mode active: open the DAW AI Producer panel or connect \`GEMINI_API_KEY\` on Node for full lyric generation.*`,
    ].join('\n');
  }

  if (persona === 'growth') {
    return [
      `**Release Rollout Plan** for **"${activeTrackTitle}"**`,
      `- **Teaser Clip**: Export a crisp 15-second chorus hook from the **DAW** or **Offline Library** tab.`,
      `- **Social Hub Post**: Publish your track preview + link your **BuymeSoda** handle so fans can tip directly.`,
      `- **Cross-Device Preview**: Use **Install -> Wirelessly Pair Device** so collaborators can test your mix on phones & tablets.`,
    ].join('\n');
  }

  return [
    `**Studio Assistant (Offline/Static Mode)** · Workspace: \`${activeTab.toUpperCase()}\` · **${bpm} BPM** (${beatSignature})`,
    `- **Timing Math**: 1 beat = \`${beatMs} ms\`, 1 bar = \`${beatMs * 4} ms\`.`,
    `- **Quick Tip for "${activeTrackTitle}"**: Layer a crisp snare/clap on beats 2 & 4, test chord voicings in the **DAW Piano Roll**, and save finished bounces straight to your **Offline Library**.`,
    `- **Live Cloud Gemini**: Available automatically whenever running the full-stack Node server (\`npm start\`) with \`GEMINI_API_KEY\`.`,
  ].join('\n');
}

function formatInlineMarkdown(line: string, keyPrefix: string): ReactNode[] {
  const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return (
        <strong key={`${keyPrefix}_b_${i}`} className="font-semibold text-slate-100">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
      return (
        <code
          key={`${keyPrefix}_c_${i}`}
          className="px-1.5 py-0.5 rounded bg-[#0B0D10] border border-[#2A313E] font-mono text-[11px] text-amber-300"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${keyPrefix}_t_${i}`}>{tok}</span>;
  });
}

function FormattedAssistantMessage({
  text,
  onCopyBlock,
}: {
  text: string;
  onCopyBlock: (codeText: string) => void;
}) {
  const [copiedBlockIdx, setCopiedBlockIdx] = useState<number | null>(null);
  const segments = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-xs leading-relaxed text-slate-200 break-words">
      {segments.map((seg, segIdx) => {
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const inner = seg.slice(3, -3).replace(/^[a-zA-Z0-9_-]+\n/, '').trim();
          return (
            <div
              key={`code_${segIdx}`}
              className="rounded-lg bg-[#0B0D10] border border-[#2A313E] overflow-hidden my-1.5"
            >
              <div className="px-2.5 py-1 bg-[#161A22] border-b border-[#232833] flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400">Studio Snippet</span>
                <button
                  type="button"
                  onClick={() => {
                    onCopyBlock(inner);
                    setCopiedBlockIdx(segIdx);
                    setTimeout(() => setCopiedBlockIdx(null), 1500);
                  }}
                  className="inline-flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-200"
                >
                  {copiedBlockIdx === segIdx ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-2.5 overflow-x-auto font-mono text-[11px] text-slate-200 whitespace-pre-wrap">
                {inner}
              </pre>
            </div>
          );
        }

        const lines = seg.split('\n');
        return (
          <div key={`txt_${segIdx}`} className="space-y-1.5">
            {lines.map((rawLine, lineIdx) => {
              const trimmed = rawLine.trim();
              if (!trimmed) return <div key={`sp_${lineIdx}`} className="h-0.5" />;

              if (/^#{1,3}\s+/.test(trimmed)) {
                const headingText = trimmed.replace(/^#{1,3}\s+/, '');
                return (
                  <h4 key={`h_${lineIdx}`} className="font-semibold text-amber-300 text-[13px] pt-1">
                    {formatInlineMarkdown(headingText, `h_${segIdx}_${lineIdx}`)}
                  </h4>
                );
              }

              if (/^[-*]\s+/.test(trimmed)) {
                const bulletText = trimmed.replace(/^[-*]\s+/, '');
                return (
                  <div key={`li_${lineIdx}`} className="flex items-start gap-2 pl-1">
                    <span className="text-amber-400 select-none mt-0.5">•</span>
                    <div className="flex-1">
                      {formatInlineMarkdown(bulletText, `li_${segIdx}_${lineIdx}`)}
                    </div>
                  </div>
                );
              }

              const numMatch = trimmed.match(/^(\d+\.)\s+(.*)$/);
              if (numMatch) {
                return (
                  <div key={`ol_${lineIdx}`} className="flex items-start gap-2 pl-1">
                    <span className="font-mono text-amber-400 tabular-nums shrink-0">
                      {numMatch[1]}
                    </span>
                    <div className="flex-1">
                      {formatInlineMarkdown(numMatch[2], `ol_${segIdx}_${lineIdx}`)}
                    </div>
                  </div>
                );
              }

              return (
                <p key={`p_${lineIdx}`}>
                  {formatInlineMarkdown(rawLine, `p_${segIdx}_${lineIdx}`)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function detectStudioActions(
  text: string,
  currentBpm: number,
  activeTab: StudioTabId
): { bpms: number[]; tabs: { id: StudioTabId; label: string }[] } {
  const bpms: number[] = [];
  const bpmMatches = text.matchAll(/\b(\d{2,3})\s*BPM\b/gi);
  for (const m of bpmMatches) {
    const val = Number(m[1]);
    if (val >= 55 && val <= 200 && val !== currentBpm && !bpms.includes(val)) {
      bpms.push(val);
    }
  }

  const tabs: { id: StudioTabId; label: string }[] = [];
  const lower = text.toLowerCase();
  if ((lower.includes('virtual dj') || lower.includes('virtualdj') || lower.includes('camelot')) && activeTab !== 'vdj') {
    tabs.push({ id: 'vdj', label: 'Open Virtual DJ' });
  }
  if ((lower.includes('daw') || lower.includes('mastering') || lower.includes('vocal pocket')) && activeTab !== 'daw') {
    tabs.push({ id: 'daw', label: 'Open DAW' });
  }
  if ((lower.includes('lyria') || lower.includes('beat pad') || lower.includes('lyrics')) && activeTab !== 'creation') {
    tabs.push({ id: 'creation', label: 'Open Music Creation' });
  }
  if ((lower.includes('tiktok') || lower.includes('instagram') || lower.includes('buymesoda')) && activeTab !== 'social') {
    tabs.push({ id: 'social', label: 'Open Social Hub' });
  }

  return { bpms: bpms.slice(0, 2), tabs: tabs.slice(0, 2) };
}

export function StudioChatBot({
  activeTab,
  bpm,
  beatSignature = '4/4',
  activeTrackTitle,
  projectCount = 0,
  creatorName,
  creatorRole,
  nowPlayingTitle,
  onApplyBpm,
  onNavigateTab,
  hidden = false,
  hasFloatingPlayer = false,
  isMobileAppLayout = false,
}: StudioChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [starterMenuOpen, setStarterMenuOpen] = useState(false);

  // Preferences persisted cleanly
  const [persona, setPersona] = useState<ChatPersona>('general');
  const [modelTier, setModelTier] = useState<ChatModelTier>('general');
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>('auto');
  const [languagePreference, setLanguagePreference] = useState('auto');
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [includeStudioContext, setIncludeStudioContext] = useState(true);
  const [customSystemInstruction, setCustomSystemInstruction] = useState('');

  // Multi-thread state persisted cleanly
  const [threads, setThreads] = useState<ChatThread[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatThread[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore corrupted cache
    }
    return [createFreshThread('general', bpm, activeTrackTitle)];
  });

  const [activeThreadId, setActiveThreadId] = useState<string>(() => threads[0]?.id || '');

  // Load saved prefs once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<{
          persona: ChatPersona;
          modelTier: ChatModelTier;
          thinkingMode: ThinkingMode;
          languagePreference: string;
          enableWebSearch: boolean;
          includeStudioContext: boolean;
          customSystemInstruction: string;
        }>;
        if (p.persona) setPersona(p.persona);
        if (p.modelTier) setModelTier(p.modelTier);
        if (p.thinkingMode) setThinkingMode(p.thinkingMode);
        if (p.languagePreference) setLanguagePreference(p.languagePreference);
        if (typeof p.enableWebSearch === 'boolean') setEnableWebSearch(p.enableWebSearch);
        if (typeof p.includeStudioContext === 'boolean') setIncludeStudioContext(p.includeStudioContext);
        if (typeof p.customSystemInstruction === 'string') {
          setCustomSystemInstruction(p.customSystemInstruction);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Save prefs
  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          persona,
          modelTier,
          thinkingMode,
          languagePreference,
          enableWebSearch,
          includeStudioContext,
          customSystemInstruction,
        })
      );
    } catch {
      // ignore quota errors
    }
  }, [
    persona,
    modelTier,
    thinkingMode,
    languagePreference,
    enableWebSearch,
    includeStudioContext,
    customSystemInstruction,
  ]);

  // Save lightweight thread history (strip heavy base64 attachments from localStorage so quota never breaks)
  useEffect(() => {
    try {
      const slim = threads.slice(0, 15).map((t) => ({
        ...t,
        messages: t.messages.slice(-40).map((m) => ({
          ...m,
          attachments: m.attachments?.map((a) => ({ ...a, dataBase64: '' })),
        })),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      // ignore storage quota errors
    }
  }, [threads]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) || threads[0],
    [threads, activeThreadId]
  );

  useEffect(() => {
    if (activeThread && activeThread.id !== activeThreadId) {
      setActiveThreadId(activeThread.id);
    }
  }, [activeThread, activeThreadId]);

  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeThread?.messages, isOpen, streamingMsgId]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      ttsAudioRef.current?.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (hidden || !activeThread) return null;

  const activePersonaObj = PERSONA_OPTIONS.find((p) => p.id === persona) || PERSONA_OPTIONS[0];
  const messages = activeThread.messages;

  const updateThreadMessages = (
    threadId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
    newTitle?: string
  ) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? {
              ...t,
              title: newTitle || t.title,
              persona,
              updatedAt: Date.now(),
              messages: updater(t.messages),
            }
          : t
      )
    );
  };

  const handleStopGenerating = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setSending(false);
    setStreamingMsgId(null);
  };

  const handleStopSpeaking = () => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMsgId(null);
  };

  const handleSpeakMessage = async (msg: ChatMessage) => {
    if (speakingMsgId === msg.id) {
      handleStopSpeaking();
      return;
    }
    handleStopSpeaking();
    setSpeakingMsgId(msg.id);

    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const clean = msg.text
          .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
          .replace(/[#*_`>]/g, '')
          .slice(0, 1400);
        const utter = new SpeechSynthesisUtterance(clean);
        utter.rate = 1.0;
        utter.pitch = 1.0;
        utter.onend = () => setSpeakingMsgId(null);
        utter.onerror = () => setSpeakingMsgId(null);
        window.speechSynthesis.speak(utter);
      } else {
        setSpeakingMsgId(null);
      }
    } catch {
      setSpeakingMsgId(null);
    }
  };

  const handleToggleVoiceDictation = async () => {
    if (isRecordingVoice) {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        setIsRecordingVoice(false);
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Microphone recording is not supported in this browser.');
      return;
    }

    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      voiceChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) voiceChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecordingVoice(false);
        const blob = new Blob(voiceChunksRef.current, { type: mimeType });
        if (blob.size < 400) return;

        setTranscribingVoice(true);
        try {
          const base64 = await fileToBase64(blob);
          const res = await safeApiFetch<{ transcript?: string; error?: string }>(
            '/api/gemini/transcribe',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64, mimeType }),
            }
          );
          if (res.isStaticFallback) {
            throw new Error(
              'Voice transcription requires the Node/Express server runtime. Type your studio question below.'
            );
          }
          if (!res.ok) throw new Error(res.error || 'Transcription failed');
          if (res.data?.transcript) {
            setInputText((prev) =>
              prev.trim() ? `${prev.trim()} ${res.data!.transcript}` : res.data!.transcript!
            );
          }
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to transcribe voice prompt.');
        } finally {
          setTranscribingVoice(false);
        }
      };

      recorder.start();
      setIsRecordingVoice(true);
    } catch {
      setErrorMsg('Microphone permission was denied. Allow mic access or type your message.');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setErrorMsg(null);
    const added: ChatAttachment[] = [];
    for (const file of files.slice(0, 3)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setErrorMsg(`"${file.name}" exceeds 6 MB limit for instant chat analysis.`);
        continue;
      }
      try {
        const dataBase64 = await fileToBase64(file);
        added.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          name: file.name,
          mimeType: file.type || 'text/plain',
          sizeBytes: file.size,
          dataBase64,
        });
      } catch {
        setErrorMsg(`Could not read "${file.name}".`);
      }
    }
    if (added.length > 0) {
      setPendingAttachments((prev) => [...prev, ...added].slice(0, 4));
    }
  };

  const executeChatRequest = async (threadId: string, fullThreadMessages: ChatMessage[]) => {
    setSending(true);
    setErrorMsg(null);

    const apiMessages = fullThreadMessages
      .filter((m) => !m.id.startsWith('welcome_'))
      .map((m) => ({
        role: m.role,
        text: m.text,
        attachments: m.attachments
          ?.filter((a) => Boolean(a.dataBase64))
          .map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            dataBase64: a.dataBase64,
          })),
      }));

    const assistantMsgId = `m_${Date.now()}`;
    setStreamingMsgId(assistantMsgId);

    updateThreadMessages(threadId, (prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: 'model',
        text: '',
        createdAt: Date.now(),
      },
    ]);

    const payload = {
      messages: apiMessages,
      persona,
      modelTier,
      thinkingMode,
      languagePreference,
      enableWebSearch,
      customSystemInstruction,
      studioContext: includeStudioContext
        ? {
            activeTab,
            bpm,
            beatSignature,
            activeTrackTitle,
            projectCount,
            creatorName,
            creatorRole,
            nowPlayingTitle,
          }
        : undefined,
    };

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let receivedAnyChunk = false;

    try {
      if (getCachedBackendAvailability() === false) {
        throw new Error('Static host mode');
      }
      const res = await fetch(resolveApiUrl('/api/gemini/chat/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const streamContentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || !res.body || streamContentType.includes('text/html')) {
        throw new Error(`Stream unavailable (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'chunk';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const rawJson = line.slice(5).trim();
            try {
              const parsed = JSON.parse(rawJson) as {
                text?: string;
                modelUsed?: string;
                fallbackUsed?: boolean;
                fallbackFrom?: string;
                sources?: GroundingSource[];
                error?: string;
              };

              if (currentEvent === 'meta') {
                updateThreadMessages(threadId, (prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          modelUsed: parsed.modelUsed,
                          fallbackNote: parsed.fallbackUsed
                            ? `Auto-switched from ${parsed.fallbackFrom} to ${parsed.modelUsed}`
                            : undefined,
                        }
                      : m
                  )
                );
              } else if (currentEvent === 'chunk' && parsed.text) {
                receivedAnyChunk = true;
                updateThreadMessages(threadId, (prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, text: m.text + parsed.text } : m
                  )
                );
              } else if (currentEvent === 'done') {
                updateThreadMessages(threadId, (prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          modelUsed: parsed.modelUsed || m.modelUsed,
                          sources: parsed.sources || [],
                          fallbackNote: parsed.fallbackUsed
                            ? `Auto-switched from ${parsed.fallbackFrom} to ${parsed.modelUsed}`
                            : m.fallbackNote,
                        }
                      : m
                  )
                );
              } else if (currentEvent === 'error') {
                throw new Error(parsed.error || 'Streaming error occurred.');
              }
            } catch (parseErr) {
              if (currentEvent === 'error' && parseErr instanceof Error) {
                throw parseErr;
              }
            }
          }
        }
      }
    } catch (streamErr) {
      if ((streamErr as { name?: string })?.name === 'AbortError') {
        updateThreadMessages(threadId, (prev) =>
          prev.map((m) =>
            m.id === assistantMsgId && !m.text.trim()
              ? { ...m, text: '*(Generation stopped)*' }
              : m
          )
        );
        return;
      }

      // Reliable non-streaming fallback if stream drops before chunks arrive
      if (!receivedAnyChunk) {
        try {
          const fallbackRes = await safeApiFetch<{
            reply?: string;
            modelUsed?: string;
            fallbackUsed?: boolean;
            fallbackFrom?: string;
            sources?: GroundingSource[];
            error?: string;
          }>('/api/gemini/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          if (fallbackRes.isStaticFallback) {
            const latestUserText =
              [...fullThreadMessages].reverse().find((m) => m.role === 'user')?.text || '';
            const offlineText = buildLocalStudioChatReply({
              prompt: latestUserText,
              persona,
              bpm,
              beatSignature,
              activeTab,
              activeTrackTitle,
            });
            updateThreadMessages(threadId, (prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      text: offlineText,
                      modelUsed: 'sounddeck-local-guide',
                      fallbackNote: 'Static / Offline Studio Helper',
                    }
                  : m
              )
            );
            return;
          }

          if (!fallbackRes.ok || !fallbackRes.data) {
            throw new Error(fallbackRes.error || 'Unable to reach Gemini assistant.');
          }
          const data = fallbackRes.data;
          updateThreadMessages(threadId, (prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    text: data.reply || 'No response returned.',
                    modelUsed: data.modelUsed,
                    sources: data.sources || [],
                    fallbackNote: data.fallbackUsed
                      ? `Auto-switched from ${data.fallbackFrom} to ${data.modelUsed}`
                      : undefined,
                  }
                : m
            )
          );
          return;
        } catch (fallbackErr) {
          updateThreadMessages(threadId, (prev) => prev.filter((m) => m.id !== assistantMsgId));
          setErrorMsg(
            fallbackErr instanceof Error ? fallbackErr.message : 'Assistant request failed.'
          );
          return;
        }
      }

      setErrorMsg(streamErr instanceof Error ? streamErr.message : 'Chat stream interrupted.');
    } finally {
      abortControllerRef.current = null;
      setSending(false);
      setStreamingMsgId(null);
    }
  };

  const handleSendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? inputText).trim();
    const attsToSend = overrideText ? [] : pendingAttachments;
    if ((!text && attsToSend.length === 0) || sending) return;

    const isFirstUserMessage = !messages.some((m) => m.role === 'user');
    const autoTitle = isFirstUserMessage
      ? (text || attsToSend[0]?.name || 'Studio Session').slice(0, 40)
      : undefined;

    let baseMessages = messages;
    if (editingMsgId) {
      const idx = messages.findIndex((m) => m.id === editingMsgId);
      if (idx >= 0) {
        baseMessages = messages.slice(0, idx);
      }
      setEditingMsgId(null);
    }

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: text || `Analyze ${attsToSend.map((a) => a.name).join(', ')}`,
      createdAt: Date.now(),
      attachments: attsToSend.length > 0 ? attsToSend : undefined,
    };

    const nextThreadMessages = [...baseMessages, userMsg];
    updateThreadMessages(activeThread.id, () => nextThreadMessages, autoTitle);
    if (!overrideText) {
      setInputText('');
      setPendingAttachments([]);
    }
    setStarterMenuOpen(false);

    await executeChatRequest(activeThread.id, nextThreadMessages);
  };

  const handleRegenerateFromMessage = async (assistantMsgId: string) => {
    if (sending) return;
    const idx = messages.findIndex((m) => m.id === assistantMsgId);
    if (idx <= 0) return;
    const trimmedMessages = messages.slice(0, idx);
    updateThreadMessages(activeThread.id, () => trimmedMessages);
    await executeChatRequest(activeThread.id, trimmedMessages);
  };

  const handleNewThread = () => {
    if (sending) handleStopGenerating();
    const fresh = createFreshThread(persona, bpm, activeTrackTitle);
    setThreads((prev) => [fresh, ...prev]);
    setActiveThreadId(fresh.id);
    setShowHistory(false);
    setErrorMsg(null);
  };

  const handleDeleteThread = (threadId: string) => {
    setThreads((prev) => {
      const remaining = prev.filter((t) => t.id !== threadId);
      if (remaining.length === 0) {
        const fresh = createFreshThread(persona, bpm, activeTrackTitle);
        setActiveThreadId(fresh.id);
        return [fresh];
      }
      if (activeThreadId === threadId) {
        setActiveThreadId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleExportThread = () => {
    const md = [
      `# SoundDeck Studio AI Session: ${activeThread.title}`,
      `Track: ${activeTrackTitle} | Tempo: ${bpm} BPM | Role: ${activePersonaObj.label}`,
      '',
      ...messages.map((m) => `### ${m.role === 'user' ? 'You' : 'Studio AI'}\n${m.text}\n`),
    ].join('\n');

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeThread.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'studio-chat'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`fixed right-3 sm:right-5 z-30 flex flex-col items-end transition-all duration-150 ${
        isMobileAppLayout
          ? hasFloatingPlayer
            ? 'bottom-[152px]'
            : 'bottom-[76px]'
          : hasFloatingPlayer
          ? 'bottom-24'
          : 'bottom-5'
      }`}
    >
      {isOpen ? (
        <div
          className={`rounded-xl bg-[#13161B] border border-[#2A313E] shadow-2xl flex flex-col overflow-hidden transition-all duration-150 ${
            isExpanded
              ? 'w-[94vw] sm:w-[700px] h-[82vh] max-h-[760px]'
              : 'w-[93vw] sm:w-[440px] h-[590px] max-h-[84vh]'
          }`}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-[#0B0D10] border-b border-[#232833] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-slate-100 leading-none truncate">
                  Studio AI Assistant
                </h3>
                <p className="text-[11px] font-mono text-slate-400 mt-1 truncate tabular-nums">
                  {activeTrackTitle} · {bpm} BPM · {activePersonaObj.label}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleNewThread}
                title="New chat thread"
                aria-label="New chat thread"
                className="p-1.5 rounded-lg text-slate-300 hover:text-amber-300 hover:bg-[#1B2028] transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowHistory((v) => !v);
                  setShowSettings(false);
                }}
                title="Saved sessions"
                aria-label="Saved sessions"
                className={`p-1.5 rounded-lg transition-colors ${
                  showHistory
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#1B2028]'
                }`}
              >
                <History className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSettings((v) => !v);
                  setShowHistory(false);
                }}
                title="Assistant settings & tools"
                aria-label="Assistant settings & tools"
                className={`p-1.5 rounded-lg transition-colors ${
                  showSettings
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#1B2028]'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleExportThread}
                title="Export chat as Markdown"
                aria-label="Export chat"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1B2028] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                title={isExpanded ? 'Compact view' : 'Expand workspace'}
                aria-label={isExpanded ? 'Compact view' : 'Expand workspace'}
                className="hidden sm:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1B2028] transition-colors"
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close Studio AI Assistant"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1B2028] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Role & Quick Tool Strip */}
          <div className="px-3 py-2 bg-[#0F1217] border-b border-[#232833] flex flex-wrap items-center gap-2">
            <select
              value={persona}
              onChange={(e) => setPersona(e.target.value as ChatPersona)}
              aria-label="Specialist Role"
              className="flex-1 min-w-[140px] px-2.5 py-1.5 rounded bg-[#0B0D10] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            >
              {PERSONA_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setEnableWebSearch((v) => !v)}
              className={`px-2.5 py-1.5 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                enableWebSearch
                  ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                  : 'bg-[#0B0D10] border-[#232833] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Web Search</span>
            </button>

            <select
              value={languagePreference}
              onChange={(e) => setLanguagePreference(e.target.value)}
              aria-label="Response Language"
              className="px-2 py-1.5 rounded bg-[#0B0D10] border border-[#232833] text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {/* Collapsible Settings Drawer */}
          {showSettings && (
            <div className="p-3 bg-[#101319] border-b border-[#232833] space-y-2.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Gemini Engine
                  </label>
                  <select
                    value={modelTier}
                    onChange={(e) => setModelTier(e.target.value as ChatModelTier)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#0B0D10] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Reasoning Depth
                  </label>
                  <div className="grid grid-cols-3 gap-1 p-0.5 rounded bg-[#0B0D10] border border-[#232833]">
                    {(
                      [
                        { id: 'low', label: 'Fast' },
                        { id: 'auto', label: 'Balanced' },
                        { id: 'high', label: 'Deep' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setThinkingMode(opt.id)}
                        className={`py-1 rounded text-[11px] font-medium transition-colors ${
                          thinkingMode === opt.id
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-mono text-slate-400">
                    Custom Assistant Instructions
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeStudioContext}
                      onChange={(e) => setIncludeStudioContext(e.target.checked)}
                      className="accent-amber-500"
                    />
                    <span>Sync Live Studio Context</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={customSystemInstruction}
                  onChange={(e) => setCustomSystemInstruction(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Always suggest Camelot keys and concise step-by-step EQ numbers..."
                  className="w-full px-2.5 py-1.5 rounded bg-[#0B0D10] border border-[#232833] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* Collapsible Thread History Drawer */}
          {showHistory && (
            <div className="max-h-56 overflow-y-auto p-3 bg-[#101319] border-b border-[#232833] space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pb-1">
                <span>Saved Conversations ({threads.length})</span>
                <button
                  type="button"
                  onClick={handleNewThread}
                  className="text-amber-400 hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Session</span>
                </button>
              </div>
              {threads.map((thr) => {
                const isSelected = thr.id === activeThread.id;
                return (
                  <div
                    key={thr.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-200'
                        : 'bg-[#0B0D10] border-[#232833] text-slate-300 hover:bg-[#1B2028]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveThreadId(thr.id);
                        setPersona(thr.persona);
                        setShowHistory(false);
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="truncate font-medium">{thr.title}</div>
                      <div className="text-[10px] font-mono text-slate-500 tabular-nums">
                        {thr.messages.length} msgs · {new Date(thr.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteThread(thr.id)}
                      aria-label={`Delete ${thr.title}`}
                      className="p-1 text-slate-500 hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Message Thread */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-[#0B0D10]">
            {messages.map((msg) => {
              const actions =
                msg.role === 'model' && msg.text && streamingMsgId !== msg.id
                  ? detectStudioActions(msg.text, bpm, activeTab)
                  : { bpms: [], tabs: [] };

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-xl px-3.5 py-2.5 ${
                      msg.role === 'user'
                        ? 'bg-amber-500 text-slate-950 font-medium text-xs leading-relaxed whitespace-pre-wrap'
                        : 'bg-[#13161B] border border-[#232833] w-full sm:w-auto'
                    }`}
                  >
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {msg.attachments.map((att) => (
                          <span
                            key={att.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono ${
                              msg.role === 'user'
                                ? 'bg-slate-950/15 text-slate-950'
                                : 'bg-[#0B0D10] text-slate-300 border border-[#232833]'
                            }`}
                          >
                            {att.mimeType.startsWith('audio/') ? (
                              <FileAudio className="w-3 h-3" />
                            ) : att.mimeType.startsWith('image/') ? (
                              <ImageIcon className="w-3 h-3" />
                            ) : (
                              <FileText className="w-3 h-3" />
                            )}
                            <span className="max-w-[140px] truncate">{att.name}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {msg.role === 'user' ? (
                      <span>{msg.text}</span>
                    ) : msg.text ? (
                      <FormattedAssistantMessage
                        text={msg.text}
                        onCopyBlock={(code) => navigator.clipboard?.writeText(code)}
                      />
                    ) : (
                      <div className="text-xs text-slate-400">Thinking and streaming reply...</div>
                    )}

                    {/* Grounding Web Sources */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-[#232833] space-y-1">
                        <div className="text-[10px] font-mono text-slate-400">Web Sources</div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((src) => (
                            <a
                              key={src.uri}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0B0D10] hover:bg-[#1B2028] border border-[#232833] text-[10px] text-amber-300 max-w-[200px] truncate"
                            >
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{src.title}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Executable Studio Action Buttons */}
                    {(actions.bpms.length > 0 || actions.tabs.length > 0) && (
                      <div className="mt-2.5 pt-2 border-t border-[#232833] flex flex-wrap gap-1.5">
                        {onApplyBpm &&
                          actions.bpms.map((targetBpm) => (
                            <button
                              key={`bpm_${targetBpm}`}
                              type="button"
                              onClick={() => onApplyBpm(targetBpm)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-[11px] font-medium text-amber-300 transition-colors"
                            >
                              <span>Apply {targetBpm} BPM</span>
                            </button>
                          ))}
                        {onNavigateTab &&
                          actions.tabs.map((tabAct) => (
                            <button
                              key={`tab_${tabAct.id}`}
                              type="button"
                              onClick={() => onNavigateTab(tabAct.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#1B2028] hover:bg-[#252B36] border border-[#2A313E] text-[11px] font-medium text-slate-200 transition-colors"
                            >
                              <span>{tabAct.label}</span>
                              <ArrowRight className="w-3 h-3 text-amber-400" />
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Message Metadata & Quick Actions */}
                  <div className="flex flex-wrap items-center gap-2 mt-1 px-1 text-[10px] font-mono text-slate-500">
                    {msg.modelUsed && <span>{msg.modelUsed}</span>}
                    {msg.fallbackNote && (
                      <span className="text-amber-400">· {msg.fallbackNote}</span>
                    )}
                    {msg.role === 'model' && msg.text && streamingMsgId !== msg.id && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(msg.text);
                            setCopiedMsgId(msg.id);
                            setTimeout(() => setCopiedMsgId(null), 1500);
                          }}
                          className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200"
                          title="Copy reply"
                        >
                          {copiedMsgId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSpeakMessage(msg)}
                          className={`inline-flex items-center gap-1 ${
                            speakingMsgId === msg.id
                              ? 'text-amber-300'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title={speakingMsgId === msg.id ? 'Stop reading' : 'Read aloud'}
                        >
                          {speakingMsgId === msg.id ? (
                            <VolumeX className="w-3 h-3" />
                          ) : (
                            <Volume2 className="w-3 h-3" />
                          )}
                          <span>{speakingMsgId === msg.id ? 'Stop' : 'Listen'}</span>
                        </button>
                        {!msg.id.startsWith('welcome_') && (
                          <button
                            type="button"
                            onClick={() => handleRegenerateFromMessage(msg.id)}
                            disabled={sending}
                            className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 disabled:opacity-40"
                            title="Regenerate reply"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                      </>
                    )}
                    {msg.role === 'user' && !sending && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMsgId(msg.id);
                          setInputText(msg.text);
                        }}
                        className="inline-flex items-center gap-1 text-slate-400 hover:text-amber-300"
                        title="Edit and resend"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {errorMsg && (
            <div className="px-3.5 py-2 bg-red-950/60 border-t border-red-800/60 text-[11px] text-red-200 flex items-center justify-between gap-2">
              <span className="truncate">{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-red-300 hover:text-white shrink-0"
                aria-label="Dismiss error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Composer Footer */}
          <div className="p-3 bg-[#13161B] border-t border-[#232833] space-y-2">
            {/* Quick Prompt Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setStarterMenuOpen((v) => !v)}
                className="w-full px-2.5 py-1.5 rounded bg-[#0B0D10] hover:bg-[#1B2028] border border-[#232833] text-[11px] text-slate-300 flex items-center justify-between gap-2 transition-colors"
              >
                <span className="truncate">Prompts: {activePersonaObj.starters[0]}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
                    starterMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {starterMenuOpen && (
                <div className="absolute left-0 right-0 bottom-full mb-1.5 rounded-lg bg-[#161A22] border border-[#2A313E] shadow-xl divide-y divide-[#232833] z-20 overflow-hidden">
                  {activePersonaObj.starters.map((promptText) => (
                    <button
                      key={promptText}
                      type="button"
                      onClick={() => handleSendMessage(promptText)}
                      disabled={sending}
                      className="w-full px-3 py-2 text-left text-[11px] text-slate-200 hover:bg-[#1E2430] transition-colors"
                    >
                      {promptText}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Multimodal Attachment Chips */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingAttachments.map((att) => (
                  <span
                    key={att.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#0B0D10] border border-amber-500/40 text-[11px] text-amber-200"
                  >
                    <span className="max-w-[160px] truncate">{att.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAttachments((prev) => prev.filter((p) => p.id !== att.id))
                      }
                      aria-label={`Remove ${att.name}`}
                      className="text-slate-400 hover:text-red-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {editingMsgId && (
              <div className="flex items-center justify-between text-[11px] text-amber-300 px-1">
                <span>Editing earlier message (sending replaces replies after it)</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMsgId(null);
                    setInputText('');
                  }}
                  className="hover:underline"
                >
                  Cancel
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="audio/*,image/*,.txt,.md,.lrc,.json"
              onChange={handleFileSelect}
              className="hidden"
            />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-end gap-1.5"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                title="Attach audio clip, image, or lyrics file"
                aria-label="Attach file"
                className="p-2 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] border border-[#232833] text-slate-300 hover:text-amber-300 transition-colors disabled:opacity-40 shrink-0"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleToggleVoiceDictation}
                disabled={sending || transcribingVoice}
                title={isRecordingVoice ? 'Stop voice prompt' : 'Record voice prompt'}
                aria-label={isRecordingVoice ? 'Stop recording' : 'Voice prompt'}
                className={`p-2 rounded-lg border transition-colors shrink-0 ${
                  isRecordingVoice
                    ? 'bg-red-500/20 border-red-500 text-red-300'
                    : 'bg-[#0B0D10] hover:bg-[#1B2028] border-[#232833] text-slate-300 hover:text-amber-300'
                }`}
              >
                {isRecordingVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <textarea
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  transcribingVoice
                    ? 'Transcribing voice memo...'
                    : isRecordingVoice
                    ? 'Listening... tap mic to finish'
                    : `Ask ${activePersonaObj.label} (Shift+Enter for new line)...`
                }
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 resize-none max-h-24"
              />

              {sending ? (
                <button
                  type="button"
                  onClick={handleStopGenerating}
                  aria-label="Stop generating"
                  title="Stop generating"
                  className="p-2 rounded-lg bg-red-500 hover:bg-red-400 text-slate-950 transition-colors shrink-0"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputText.trim() && pendingAttachments.length === 0}
                  aria-label="Send message"
                  className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors disabled:opacity-40 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </form>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs shadow-xl flex items-center gap-2 transition-colors whitespace-nowrap"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Studio AI Assistant</span>
        </button>
      )}
    </div>
  );
}
