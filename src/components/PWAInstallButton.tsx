import React, { useState } from 'react';
import { Download, X, Smartphone, Laptop, Tablet, Monitor } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { type DeviceProfile } from '../hooks/useDeviceProfile';
import { DeviceInstallerModal } from './DeviceInstallerModal';
import { getStudioAppBaseUrl, resolvePublicAsset } from '../assets/studioAssets';
import { getAppShellCacheUrls } from '../services/apiClient';

export function triggerAppLauncherDownload(deviceCategory: string): void {
  const origin = getStudioAppBaseUrl();
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SoundDeck Studio</title>
  <meta http-equiv="refresh" content="0;url=${origin}" />
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #0B0D10; color: #F1F5F9; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { text-align: center; padding: 32px; border: 1px solid #232833; border-radius: 16px; background: #13161B; max-width: 380px; }
    a { display: inline-block; margin-top: 16px; padding: 12px 20px; border-radius: 10px; background: #F59E0B; color: #0B0D10; font-weight: 700; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <h2>SoundDeck Studio</h2>
    <p>Launching SoundDeck Studio (${deviceCategory} layout)...</p>
    <a href="${origin}">Open SoundDeck Studio</a>
  </div>
  <script>window.location.replace(${JSON.stringify(origin)});</script>
</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SoundDeck-Studio-${deviceCategory}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function cacheStudioOfflineAssets(): Promise<void> {
  try {
    if ('caches' in window) {
      const cache = await caches.open('sounddeck-app-shell');
      await cache.addAll(getAppShellCacheUrls());
    }
  } catch {
    // Service worker precache handles offline assets
  }
}

export const PWAInstallButton: React.FC<{
  deviceProfile?: DeviceProfile;
  onOpenInstaller?: () => void;
}> = ({ deviceProfile, onOpenInstaller }) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, installing, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [downloadedNotice, setDownloadedNotice] = useState<string | null>(null);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = () => {
    if (onOpenInstaller) {
      onOpenInstaller();
      return;
    }
    setShowGuide(true);
  };

  const handleDownloadLauncher = async () => {
    triggerAppLauncherDownload(deviceProfile?.deviceCategory || 'app');
    await cacheStudioOfflineAssets();
    setDownloadedNotice(
      'App package downloaded and offline studio shell cached for your device!'
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        disabled={installing}
        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-md shadow-amber-500/20 disabled:opacity-60 shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{installing ? 'Installing...' : 'Install App'}</span>
      </button>

      {!onOpenInstaller && deviceProfile && (
        <DeviceInstallerModal
          isOpen={showGuide}
          onClose={() => setShowGuide(false)}
          deviceProfile={deviceProfile}
          canTriggerNativeInstall={isInstallable}
          installing={installing}
          isIOS={isIOS}
          isInIframe={isInIframe}
          onNativeInstall={install}
          onDownloadAppShortcut={handleDownloadLauncher}
          downloadedNotice={downloadedNotice}
        />
      )}
    </>
  );
};

export const PWAInstallBanner: React.FC<{
  deviceProfile: DeviceProfile;
  onOpenInstaller: (initialView?: 'about' | 'wireless' | 'adaptive') => void;
}> = ({ deviceProfile, onOpenInstaller }) => {
  const { isInstalled, installing } = usePWAInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('sounddeck_install_banner_dismissed') === '1';
    } catch {
      return false;
    }
  });

  if (isInstalled || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('sounddeck_install_banner_dismissed', '1');
    } catch {
      // ignore
    }
  };

  const DeviceIcon =
    deviceProfile.deviceCategory === 'phone'
      ? Smartphone
      : deviceProfile.deviceCategory === 'tablet'
      ? Tablet
      : deviceProfile.deviceCategory === 'laptop'
      ? Laptop
      : Monitor;

  return (
    <div className="rounded-xl bg-[#13161B] border border-amber-500/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <img
          src={resolvePublicAsset('pwa-192x192.png')}
          alt="SoundDeck App"
          className="w-10 h-10 rounded-lg border border-[#2A313E] shrink-0"
        />
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-semibold text-slate-100 flex items-center gap-1.5">
            <span>Install SoundDeck Studio App</span>
          </div>
          <p className="text-xs text-slate-400">
            Install wirelessly online (no USB cable): open About Device, tap Build Number 7 times, and auto-adapt to{' '}
            <span className="text-amber-300 font-medium inline-flex items-center gap-1">
              <DeviceIcon className="w-3 h-3 inline" />
              {deviceProfile.deviceCategory}
            </span>
            .
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onOpenInstaller('about')}
          disabled={installing}
          className="min-h-[40px] px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{deviceProfile.developerUnlocked ? 'Install App' : '7-Tap Install'}</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenInstaller('wireless')}
          className="min-h-[40px] px-3 py-2 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] text-slate-200 text-xs font-medium border border-[#232833] whitespace-nowrap transition-colors"
        >
          Send to Device
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="min-h-[40px] min-w-[40px] p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1B2028] flex items-center justify-center transition-colors"
          aria-label="Dismiss install banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
