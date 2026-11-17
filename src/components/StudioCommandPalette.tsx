import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Music,
  SlidersHorizontal,
  Disc3,
  Compass,
  HardDrive,
  Users,
  Clock4,
  Box,
  Smartphone,
  ShieldCheck,
  X,
  ArrowRight,
  Command,
} from 'lucide-react';

export type CommandTabId = 'social' | 'creation' | 'daw' | 'vdj' | 'discover' | 'offline';

interface StudioCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: CommandTabId;
  studioBpm: number;
  metronomeOn: boolean;
  onSelectTab: (tab: CommandTabId) => void;
  onSetBpm: (bpm: number) => void;
  onToggleMetronome: () => void;
  onOpenStage3D: () => void;
  onOpenInstaller: () => void;
  onOpenAuth: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  subtitle: string;
  group: 'Workspaces' | 'Tempo & Transport' | 'Studio Tools';
  badge?: string;
  icon: typeof Music;
  action: () => void;
}

export function StudioCommandPalette({
  isOpen,
  onClose,
  activeTab,
  studioBpm,
  metronomeOn,
  onSelectTab,
  onSetBpm,
  onToggleMetronome,
  onOpenStage3D,
  onOpenInstaller,
  onOpenAuth,
}: StudioCommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: 'tab-creation',
        label: 'Open Music Creation & Beat Pads',
        subtitle: 'Drum pads, AI vocal cadence alignment, genre grooves',
        group: 'Workspaces',
        badge: activeTab === 'creation' ? 'Active' : undefined,
        icon: Music,
        action: () => onSelectTab('creation'),
      },
      {
        id: 'tab-daw',
        label: 'Open Multi-Track DAW',
        subtitle: 'Timeline arrangement, Piano Roll, Vocal Intelligence, Mastering & Export',
        group: 'Workspaces',
        badge: activeTab === 'daw' ? 'Active' : undefined,
        icon: SlidersHorizontal,
        action: () => onSelectTab('daw'),
      },
      {
        id: 'tab-vdj',
        label: 'Open Virtual DJ Console',
        subtitle: 'Dual decks, vinyl scratch, Camelot harmonic wheel, FX rack',
        group: 'Workspaces',
        badge: activeTab === 'vdj' ? 'Active' : undefined,
        icon: Disc3,
        action: () => onSelectTab('vdj'),
      },
      {
        id: 'tab-discover',
        label: 'Open Global Discover & MP3 Converter',
        subtitle: 'Search tracks, preview audio, download & save offline',
        group: 'Workspaces',
        badge: activeTab === 'discover' ? 'Active' : undefined,
        icon: Compass,
        action: () => onSelectTab('discover'),
      },
      {
        id: 'tab-offline',
        label: 'Open Offline Library Vault',
        subtitle: 'Play cached tracks without internet & chop onto Beat Pads',
        group: 'Workspaces',
        badge: activeTab === 'offline' ? 'Active' : undefined,
        icon: HardDrive,
        action: () => onSelectTab('offline'),
      },
      {
        id: 'tab-social',
        label: 'Open Social Hub & Creator Campaigns',
        subtitle: 'Publish drops, BuymeSoda tipping, community activity feed',
        group: 'Workspaces',
        badge: activeTab === 'social' ? 'Active' : undefined,
        icon: Users,
        action: () => onSelectTab('social'),
      },
      {
        id: 'toggle-metronome',
        label: metronomeOn ? 'Stop Studio Metronome' : 'Start Studio Metronome',
        subtitle: `Global click track currently at ${studioBpm} BPM`,
        group: 'Tempo & Transport',
        badge: metronomeOn ? 'On' : 'Off',
        icon: Clock4,
        action: onToggleMetronome,
      },
      {
        id: 'bpm-92',
        label: 'Set Tempo: 92 BPM (Boom Bap / R&B)',
        subtitle: 'Update studio master clock to 92 BPM',
        group: 'Tempo & Transport',
        icon: Clock4,
        action: () => onSetBpm(92),
      },
      {
        id: 'bpm-112',
        label: 'Set Tempo: 112 BPM (Afrobeat / Amapiano)',
        subtitle: 'Update studio master clock to 112 BPM',
        group: 'Tempo & Transport',
        icon: Clock4,
        action: () => onSetBpm(112),
      },
      {
        id: 'bpm-126',
        label: 'Set Tempo: 126 BPM (House / EDM)',
        subtitle: 'Update studio master clock to 126 BPM',
        group: 'Tempo & Transport',
        icon: Clock4,
        action: () => onSetBpm(126),
      },
      {
        id: 'bpm-140',
        label: 'Set Tempo: 140 BPM (Drill / Trap)',
        subtitle: 'Update studio master clock to 140 BPM',
        group: 'Tempo & Transport',
        icon: Clock4,
        action: () => onSetBpm(140),
      },
      {
        id: 'open-3d-stage',
        label: 'Launch 3D Studio Visualizer Stage',
        subtitle: 'Three.js interactive audio-reactive studio environment',
        group: 'Studio Tools',
        icon: Box,
        action: onOpenStage3D,
      },
      {
        id: 'open-installer',
        label: 'Open Wireless Device Installer & Layout Mode',
        subtitle: '7-tap Developer Mode, QR pairing & Phone/Tablet/Laptop/Desktop layout',
        group: 'Studio Tools',
        icon: Smartphone,
        action: onOpenInstaller,
      },
      {
        id: 'open-auth',
        label: 'Open Account, Sign Up & Security Shield',
        subtitle: 'Create account, manage profile backup JSON & Human Security Shield',
        group: 'Studio Tools',
        icon: ShieldCheck,
        action: onOpenAuth,
      },
    ],
    [
      activeTab,
      metronomeOn,
      studioBpm,
      onSelectTab,
      onToggleMetronome,
      onSetBpm,
      onOpenStage3D,
      onOpenInstaller,
      onOpenAuth,
    ]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleRunItem = (item: CommandItem) => {
    item.action();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center p-4 pt-16 sm:pt-24"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Studio Quick Command Palette"
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-[#13161B] border border-[#2A313E] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#232833] bg-[#0B0D10]">
          <Search className="w-4 h-4 text-amber-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) =>
                  filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0
                );
              } else if (e.key === 'Enter' && filtered[selectedIndex]) {
                e.preventDefault();
                handleRunItem(filtered[selectedIndex]);
              }
            }}
            placeholder="Jump to workspace, set BPM, open installer or account..."
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick command palette"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1B2028]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No studio command matches &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => handleRunItem(item)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    isSelected
                      ? 'bg-amber-500/15 border border-amber-500/40 text-slate-100'
                      : 'border border-transparent hover:bg-[#181C23] text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          : 'bg-[#0B0D10] border-[#232833] text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-100 truncate">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                        {item.badge}
                      </span>
                    )}
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2.5 bg-[#0B0D10] border-t border-[#232833] flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <Command className="w-3 h-3 text-amber-400" />
            <span>Press Ctrl+K or Cmd+K anywhere in the studio</span>
          </span>
          <span className="font-mono text-[10px]">↑↓ Navigate · Enter Run · Esc Close</span>
        </div>
      </div>
    </div>
  );
}
