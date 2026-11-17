import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Laptop,
  Monitor,
  RefreshCw,
  Share2,
  Smartphone,
  Tablet,
  Wifi,
  X,
  Wrench,
  Sparkles,
  Check,
} from 'lucide-react';
import {
  type DeviceCategory,
  type DeviceOverride,
  type DeviceProfile,
} from '../hooks/useDeviceProfile';
import { getAudioContext } from '../audio/studioAudio';
import { getStudioAppBaseUrl, resolvePublicAsset } from '../assets/studioAssets';
import { getAppShellCacheUrls, safeApiFetch } from '../services/apiClient';

interface DevicePairSessionResponse {
  code: string;
  hostDevice: string;
  targetDevice: DeviceCategory;
  status: 'waiting' | 'connected' | 'developer_unlocked' | 'installed';
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  connectedInfo?: {
    category: string;
    osName: string;
    browserName: string;
    viewport: string;
  } | null;
}

interface DeviceInstallerModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceProfile: DeviceProfile;
  canTriggerNativeInstall: boolean;
  installing: boolean;
  isIOS: boolean;
  isInIframe: boolean;
  onNativeInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  onDownloadAppShortcut: () => Promise<void>;
  downloadedNotice: string | null;
  initialPairCode?: string | null;
  initialView?: 'about' | 'wireless' | 'adaptive';
}

function playDevUnlockChime(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.001, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.26);
    });
  } catch {
    // Ignore audio context restrictions
  }
}

function playTapTick(step: number): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340 + step * 55, now);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  } catch {
    // Ignore audio errors
  }
}

function DeviceCategoryIcon({
  category,
  className = 'w-4 h-4',
}: {
  category: DeviceCategory;
  className?: string;
}) {
  if (category === 'phone') return <Smartphone className={className} />;
  if (category === 'tablet') return <Tablet className={className} />;
  if (category === 'laptop') return <Laptop className={className} />;
  return <Monitor className={className} />;
}

function formatCategoryLabel(category: DeviceCategory): string {
  if (category === 'phone') return 'Phone';
  if (category === 'tablet') return 'Tablet';
  if (category === 'laptop') return 'Laptop';
  return 'Desktop';
}

export const DeviceInstallerModal: React.FC<DeviceInstallerModalProps> = ({
  isOpen,
  onClose,
  deviceProfile,
  canTriggerNativeInstall,
  installing,
  isIOS,
  isInIframe,
  onNativeInstall,
  onDownloadAppShortcut,
  downloadedNotice,
  initialPairCode = null,
  initialView = 'about',
}) => {
  const [view, setView] = useState<'about' | 'wireless' | 'adaptive'>(initialView);
  const [tapCount, setTapCount] = useState<number>(() =>
    deviceProfile.developerUnlocked ? 7 : 0
  );
  const [installedComplete, setInstalledComplete] = useState<boolean>(
    deviceProfile.isStandalone
  );

  // Wireless pairing host state
  const [targetDevice, setTargetDevice] = useState<DeviceCategory>('phone');
  const [pairSession, setPairSession] = useState<DevicePairSessionResponse | null>(null);
  const [creatingPair, setCreatingPair] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Incoming pair code (on receiving phone/tablet/laptop)
  const [activePairCode, setActivePairCode] = useState<string | null>(initialPairCode);
  const [manualPairInput, setManualPairInput] = useState('');
  const [pairError, setPairError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setView(initialView);
      if (deviceProfile.developerUnlocked) {
        setTapCount(7);
      }
    }
  }, [isOpen, initialView, deviceProfile.developerUnlocked]);

  useEffect(() => {
    if (initialPairCode) {
      setActivePairCode(initialPairCode.toUpperCase());
    }
  }, [initialPairCode]);

  const appOrigin = getStudioAppBaseUrl();
  const wirelessPairUrl = pairSession
    ? `${appOrigin}?pair=${encodeURIComponent(pairSession.code)}`
    : '';

  // Generate real QR code whenever pairing URL changes
  useEffect(() => {
    let cancelled = false;
    if (!wirelessPairUrl) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(wirelessPairUrl, {
      width: 220,
      margin: 2,
      color: {
        dark: '#0B0D10',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [wirelessPairUrl]);

  const handleCreatePairSession = async (chosenTarget: DeviceCategory = targetDevice) => {
    setCreatingPair(true);
    setPairError(null);
    try {
      const res = await safeApiFetch<DevicePairSessionResponse>('/api/device-pair/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostDevice: deviceProfile.deviceCategory,
          targetDevice: chosenTarget,
        }),
      });
      if (res.ok && res.data) {
        setPairSession(res.data);
        return;
      }
      if (res.isStaticFallback) {
        const now = Date.now();
        const staticCode = `SD${Math.floor(1000 + Math.random() * 9000)}`;
        setPairSession({
          code: staticCode,
          hostDevice: deviceProfile.deviceCategory,
          targetDevice: chosenTarget,
          status: 'waiting',
          createdAt: now,
          updatedAt: now,
          expiresAt: now + 30 * 60 * 1000,
          connectedInfo: null,
        });
        return;
      }
      throw new Error(res.error || 'Failed to create wireless pairing session');
    } catch (err) {
      setPairError(err instanceof Error ? err.message : 'Unable to start wireless bridge');
    } finally {
      setCreatingPair(false);
    }
  };

  // Auto-create pairing session when switching to Wireless Send view
  useEffect(() => {
    if (isOpen && view === 'wireless' && !pairSession && !creatingPair) {
      void handleCreatePairSession(targetDevice);
    }
  }, [isOpen, view]);

  // Poll host pairing session while in wireless view
  useEffect(() => {
    if (!isOpen || view !== 'wireless' || !pairSession?.code) return;
    const timer = window.setInterval(async () => {
      const res = await safeApiFetch<DevicePairSessionResponse>(
        `/api/device-pair/${encodeURIComponent(pairSession.code)}`
      );
      if (res.ok && res.data) {
        setPairSession(res.data);
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isOpen, view, pairSession?.code]);

  if (!isOpen) return null;

  const isDevUnlocked = deviceProfile.developerUnlocked || tapCount >= 7;

  const handleBuildNumberTap = async () => {
    if (isDevUnlocked) return;
    const nextCount = Math.min(7, tapCount + 1);
    setTapCount(nextCount);

    if (nextCount < 7) {
      playTapTick(nextCount);
      return;
    }

    // 7th tap reached — Boom! Activate Developer Mode!
    playDevUnlockChime();
    deviceProfile.unlockDeveloperMode();

    // Warm offline studio shell cache in the background
    try {
      if ('caches' in window) {
        const cache = await caches.open('sounddeck-app-shell');
        await cache.addAll(getAppShellCacheUrls());
      }
    } catch {
      // Service worker precache handles offline assets
    }

    if (activePairCode) {
      await safeApiFetch(`/api/device-pair/${encodeURIComponent(activePairCode)}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: deviceProfile.deviceCategory,
          osName: deviceProfile.osName,
          browserName: deviceProfile.browserName,
          viewport: deviceProfile.viewportLabel,
        }),
      });
    }
  };

  const notifyPairInstalled = async () => {
    if (!activePairCode) return;
    await safeApiFetch(`/api/device-pair/${encodeURIComponent(activePairCode)}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const handleTriggerInstall = async () => {
    if (canTriggerNativeInstall) {
      const outcome = await onNativeInstall();
      if (outcome === 'accepted') {
        setInstalledComplete(true);
        await notifyPairInstalled();
      }
      return;
    }
    await onDownloadAppShortcut();
    setInstalledComplete(true);
    await notifyPairInstalled();
  };

  const handleJoinManualCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualPairInput.trim().toUpperCase();
    if (!cleaned) return;
    setPairError(null);
    const res = await safeApiFetch(`/api/device-pair/${encodeURIComponent(cleaned)}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: deviceProfile.deviceCategory,
        osName: deviceProfile.osName,
        browserName: deviceProfile.browserName,
        viewport: deviceProfile.viewportLabel,
      }),
    });
    if (!res.ok && !res.isStaticFallback) {
      setPairError(res.error || 'Pairing code not found or expired.');
      return;
    }
    setActivePairCode(cleaned);
    setManualPairInput('');
    setView('about');
  };

  const getTapStatusText = () => {
    if (isDevUnlocked) {
      return 'Developer Options Activated! Wireless App Install is unlocked.';
    }
    if (tapCount === 0) {
      return 'Tap Build Number 7 times to activate Developer Install (online, no USB cable).';
    }
    const remaining = 7 - tapCount;
    if (tapCount < 3) {
      return `Build tap ${tapCount}/7 — keep tapping (${remaining} left).`;
    }
    return `You are now ${remaining} step${remaining === 1 ? '' : 's'} away from Developer Install.`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Online Device Installer and Adaptive Layout Settings"
    >
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-[#13161B] border border-[#232833] shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#232833] flex items-start justify-between gap-3 sticky top-0 bg-[#13161B]/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={resolvePublicAsset('pwa-192x192.png')}
              alt="SoundDeck Studio App Icon"
              className="w-11 h-11 rounded-xl border border-[#2A313E] shrink-0"
            />
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold text-slate-100 truncate">
                SoundDeck Wireless App Installer
              </h3>
              <p className="text-xs text-slate-400 truncate">
                Online 7-tap developer install · Auto-adapts to your device
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1B2028] flex items-center justify-center transition-colors shrink-0"
            aria-label="Close installer dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#0B0D10] border border-[#232833]">
            <button
              type="button"
              onClick={() => setView('about')}
              className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                view === 'about'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              About Device
            </button>
            <button
              type="button"
              onClick={() => setView('wireless')}
              className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                view === 'wireless'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Send Online
            </button>
            <button
              type="button"
              onClick={() => setView('adaptive')}
              className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                view === 'adaptive'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Device Design
            </button>
          </div>
        </div>

        {/* View 1: Settings -> About Device -> Build Number (7-Tap Activation) */}
        {view === 'about' && (
          <div className="p-5 space-y-4">
            {/* Quick Share & Open This Tab */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-[#0B0D10] to-[#0B0D10] border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <ExternalLink className="w-4 h-4 text-amber-400" />
                  <span>Open This Tab &amp; Share App Link</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                  Instant Access
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Open SoundDeck Studio in a dedicated browser tab or copy the shareable link to send to anyone instantly.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={appOrigin || '/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-amber-500/20"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open This Tab</span>
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(appOrigin || window.location.href);
                      setCopiedLink(true);
                      window.setTimeout(() => setCopiedLink(false), 2000);
                    } catch {
                      // ignore
                    }
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#1B2028] hover:bg-[#252B36] text-xs font-medium text-slate-100 border border-[#2A313E] flex items-center gap-2 transition-colors"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-amber-400" />}
                  <span>{copiedLink ? 'Link Copied!' : 'Copy Share Link'}</span>
                </button>
              </div>
            </div>

            {activePairCode && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/50 flex items-center justify-between gap-2 text-xs text-emerald-200">
                <div className="flex items-center gap-2 min-w-0">
                  <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">
                    Connected online without USB · Bridge{' '}
                    <strong className="font-mono text-emerald-300">{activePairCode}</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Realistic Settings -> About Device Hardware Panel */}
            <div className="rounded-xl bg-[#0B0D10] border border-[#232833] divide-y divide-[#1B2028] overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-400">Settings Path</div>
                <div className="text-xs font-medium text-slate-200">
                  Settings › About {formatCategoryLabel(deviceProfile.deviceCategory)}
                </div>
              </div>

              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-400">Detected Device</div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                  <DeviceCategoryIcon
                    category={deviceProfile.deviceCategory}
                    className="w-4 h-4 text-amber-400"
                  />
                  <span>
                    {formatCategoryLabel(deviceProfile.deviceCategory)} ({deviceProfile.osName})
                  </span>
                </div>
              </div>

              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-400">Auto UI Structure</div>
                <div className="text-xs font-medium text-amber-300">
                  {deviceProfile.layoutMode === 'mobile-app'
                    ? 'Mobile App Structure'
                    : 'Desktop Studio Structure'}
                </div>
              </div>

              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-400">Install Channel</div>
                <div className="text-xs text-emerald-400 font-medium">
                  Online Wireless Port (No USB)
                </div>
              </div>

              {/* Interactive Build Number 7-Tap Button */}
              <button
                type="button"
                onClick={handleBuildNumberTap}
                className={`w-full px-4 py-3.5 text-left transition-colors flex items-center justify-between gap-3 min-h-[60px] ${
                  isDevUnlocked
                    ? 'bg-emerald-950/25 hover:bg-emerald-950/35'
                    : 'hover:bg-[#161A22] active:bg-[#1B2028]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <span>Build Number</span>
                    {isDevUnlocked && (
                      <span className="text-[11px] font-mono text-emerald-400">
                        · Developer Mode Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-0.5 tabular-nums">
                    SD-STUDIO.2026.1116.07
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <span
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tabular-nums transition-colors ${
                      isDevUnlocked
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-amber-500 text-slate-950'
                    }`}
                  >
                    {isDevUnlocked ? '7 / 7 Unlocked' : `Tap (${tapCount}/7)`}
                  </span>
                </div>
              </button>
            </div>

            {/* 7-Segment Tap Progress Bar + Toast Feedback */}
            <div className="space-y-2">
              <div className="grid grid-cols-7 gap-1.5" aria-hidden="true">
                {Array.from({ length: 7 }).map((_, idx) => {
                  const filled = isDevUnlocked || idx < tapCount;
                  return (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-colors duration-150 ${
                        isDevUnlocked
                          ? 'bg-emerald-400'
                          : filled
                          ? 'bg-amber-400'
                          : 'bg-[#232833]'
                      }`}
                    />
                  );
                })}
              </div>
              <p
                className={`text-xs font-medium px-3 py-2 rounded-lg border ${
                  isDevUnlocked
                    ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-200'
                    : 'bg-[#0B0D10] border-[#232833] text-slate-300'
                }`}
              >
                {getTapStatusText()}
              </p>
            </div>

            {/* Unlocked Developer Install Actions */}
            {isDevUnlocked && (
              <div className="p-4 rounded-xl bg-[#0B0D10] border border-emerald-500/40 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <Wrench className="w-4 h-4" />
                    <span>Developer Wireless App Installer</span>
                  </div>
                  {installedComplete && (
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Installed
                    </span>
                  )}
                </div>

                {downloadedNotice && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-xs text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{downloadedNotice}</span>
                  </div>
                )}

                {deviceProfile.isStandalone ? (
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-700/50 text-xs text-emerald-200">
                    Running as an installed standalone app on{' '}
                    <strong>{formatCategoryLabel(deviceProfile.deviceCategory)}</strong>. Your
                    studio layout automatically adapted to{' '}
                    <strong>
                      {deviceProfile.layoutMode === 'mobile-app'
                        ? 'Mobile App Structure'
                        : 'Desktop Studio Structure'}
                    </strong>
                    .
                  </div>
                ) : canTriggerNativeInstall ? (
                  <button
                    type="button"
                    onClick={handleTriggerInstall}
                    disabled={installing}
                    className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {installing
                        ? 'Installing App...'
                        : `Install SoundDeck App (${formatCategoryLabel(deviceProfile.deviceCategory)})`}
                    </span>
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    {isInIframe && (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                        <p className="text-xs text-amber-200 leading-relaxed">
                          Open in a dedicated browser tab to run the one-click native app install:
                        </p>
                        <a
                          href={appOrigin || '/'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full min-h-[44px] py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open Standalone Tab &amp; Install</span>
                        </a>
                      </div>
                    )}

                    {isIOS ? (
                      <div className="p-3 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-300 space-y-1.5">
                        <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                          <Share2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>iPhone / iPad Safari Install</span>
                        </div>
                        <p>
                          Tap <strong className="text-amber-400">Share</strong> in Safari, then tap{' '}
                          <strong className="text-amber-400">Add to Home Screen</strong>. When
                          opened, it launches automatically in Mobile App Structure.
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-300 space-y-1">
                        <div className="font-semibold text-slate-100">
                          Browser Install or Offline Package
                        </div>
                        <p>
                          Use your browser menu (<strong className="text-amber-400">⋮</strong> ›{' '}
                          <strong className="text-amber-400">Install SoundDeck Studio</strong>) or
                          download the standalone launcher &amp; offline cache below:
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleTriggerInstall}
                      className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download App Package &amp; Cache Offline</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* View 2: Send to Another Device Online (No Physical USB Cable) */}
        {view === 'wireless' && (
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-300">
                1. Choose target device to install onto (online, no USB cable):
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(['phone', 'tablet', 'laptop', 'desktop'] as DeviceCategory[]).map((cat) => {
                  const active = targetDevice === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setTargetDevice(cat);
                        void handleCreatePairSession(cat);
                      }}
                      className={`min-h-[44px] p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center justify-center gap-1 transition-colors ${
                        active
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-[#0B0D10] border-[#232833] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <DeviceCategoryIcon category={cat} className="w-4 h-4" />
                      <span>{formatCategoryLabel(cat)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {pairError && (
              <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-700/60 text-xs text-rose-200">
                {pairError}
              </div>
            )}

            {pairSession && (
              <div className="p-4 rounded-xl bg-[#0B0D10] border border-[#232833] space-y-4">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-white shrink-0">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt={`QR Code for wireless pairing ${pairSession.code}`}
                        className="w-36 h-36 block"
                      />
                    ) : (
                      <div className="w-36 h-36 flex items-center justify-center text-xs text-slate-900">
                        Generating QR...
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2.5 text-center sm:text-left">
                    <div>
                      <div className="text-[11px] text-slate-400">Online Pairing Code</div>
                      <div className="font-mono text-2xl font-bold tracking-wider text-amber-400 tabular-nums">
                        {pairSession.code}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Scan this QR code with your{' '}
                      <strong className="text-slate-200">
                        {formatCategoryLabel(targetDevice)}
                      </strong>{' '}
                      or open the link, then tap Build Number 7 times to install wirelessly.
                    </p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(wirelessPairUrl);
                            setCopiedLink(true);
                            window.setTimeout(() => setCopiedLink(false), 2000);
                          } catch {
                            // Ignore clipboard fallback
                          }
                        }}
                        className="min-h-[40px] px-3 py-2 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-xs font-medium text-slate-100 border border-[#2A313E] flex items-center gap-1.5 transition-colors"
                      >
                        {copiedLink ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>{copiedLink ? 'Link Copied' : 'Copy Install Link'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleCreatePairSession(targetDevice)}
                        disabled={creatingPair}
                        className="min-h-[40px] px-3 py-2 rounded-lg bg-[#13161B] hover:bg-[#1B2028] text-xs text-slate-300 border border-[#232833] flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${creatingPair ? 'animate-spin' : ''}`}
                        />
                        <span>New Code</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Wireless Handshake Progress */}
                <div className="pt-3 border-t border-[#1B2028] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Wireless Bridge Status</span>
                    <span
                      className={`font-semibold ${
                        pairSession.status === 'installed'
                          ? 'text-emerald-400'
                          : pairSession.status === 'developer_unlocked'
                          ? 'text-amber-300'
                          : pairSession.status === 'connected'
                          ? 'text-sky-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {pairSession.status === 'installed'
                        ? 'Boom! Installed on Device'
                        : pairSession.status === 'developer_unlocked'
                        ? 'Developer 7-Tap Activated'
                        : pairSession.status === 'connected'
                        ? 'Target Device Connected Online'
                        : 'Waiting for target device...'}
                    </span>
                  </div>
                  {pairSession.connectedInfo && (
                    <div className="text-[11px] font-mono text-slate-400">
                      Detected target: {pairSession.connectedInfo.category} ·{' '}
                      {pairSession.connectedInfo.osName} · {pairSession.connectedInfo.browserName}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Join a host session manually by code */}
            <form
              onSubmit={handleJoinManualCode}
              className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] flex items-center gap-2"
            >
              <input
                type="text"
                value={manualPairInput}
                onChange={(e) => setManualPairInput(e.target.value)}
                placeholder="Have a code? e.g. SD4829"
                maxLength={10}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold whitespace-nowrap transition-colors"
              >
                Pair Online
              </button>
            </form>
          </div>
        )}

        {/* View 3: Adaptive Device Design (Auto-Detects Phone, Tablet, Laptop, Desktop) */}
        {view === 'adaptive' && (
          <div className="p-5 space-y-4">
            <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Auto-Detected Hardware</span>
                <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <DeviceCategoryIcon category={deviceProfile.detectedCategory} />
                  {formatCategoryLabel(deviceProfile.detectedCategory)} · {deviceProfile.osName}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Active UI Structure</span>
                <span className="font-semibold text-slate-100">
                  {deviceProfile.layoutMode === 'mobile-app'
                    ? 'Mobile App Structure (Bottom Nav & Touch Controls)'
                    : 'Desktop Studio Structure (Full Multi-Column Console)'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Select Layout Mode (Auto-Detect or Preview Device)</span>
              </div>

              <div className="space-y-2">
                {(
                  [
                    {
                      id: 'auto',
                      label: `Auto-Detect (${formatCategoryLabel(deviceProfile.detectedCategory)})`,
                      desc: 'Automatically switches layout when opened on Phone, Tablet, Laptop, or Desktop.',
                    },
                    {
                      id: 'phone',
                      label: 'Phone — Mobile App Structure',
                      desc: 'Compact top app bar, fixed thumb-zone bottom tab bar, 44px+ touch buttons.',
                    },
                    {
                      id: 'tablet',
                      label: 'Tablet — Mobile / Touch App Structure',
                      desc: 'Touch-first mobile app shell with bottom navigation and 2-column tablet cards.',
                    },
                    {
                      id: 'laptop',
                      label: 'Laptop — Desktop Studio Structure',
                      desc: 'Preserves the full desktop SoundDeck Studio workspace.',
                    },
                    {
                      id: 'desktop',
                      label: 'Desktop — Desktop Studio Structure',
                      desc: 'Preserves the full 1440px multi-panel desktop studio workspace.',
                    },
                  ] as { id: DeviceOverride; label: string; desc: string }[]
                ).map((opt) => {
                  const selected = deviceProfile.override === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => deviceProfile.setOverride(opt.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors flex items-start justify-between gap-3 min-h-[56px] ${
                        selected
                          ? 'bg-amber-500/15 border-amber-500 text-slate-100'
                          : 'bg-[#0B0D10] border-[#232833] text-slate-300 hover:border-[#343C4C]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100">{opt.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
                      </div>
                      {selected && (
                        <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#232833] flex items-center justify-between gap-3">
          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
            {deviceProfile.viewportLabel} · {deviceProfile.browserName}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] text-xs font-medium text-slate-300 hover:text-slate-100 border border-[#232833] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
