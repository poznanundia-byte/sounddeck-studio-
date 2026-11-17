import { useCallback, useEffect, useState } from 'react';

export type DeviceCategory = 'phone' | 'tablet' | 'laptop' | 'desktop';
export type DeviceOverride = 'auto' | DeviceCategory;
export type AppLayoutMode = 'mobile-app' | 'desktop';

export interface DeviceProfile {
  detectedCategory: DeviceCategory;
  deviceCategory: DeviceCategory;
  layoutMode: AppLayoutMode;
  override: DeviceOverride;
  setOverride: (next: DeviceOverride) => void;
  osName: string;
  browserName: string;
  viewportLabel: string;
  isTouchCapable: boolean;
  isStandalone: boolean;
  developerUnlocked: boolean;
  unlockDeveloperMode: () => void;
  resetDeveloperMode: () => void;
}

const OVERRIDE_KEY = 'sounddeck_device_override';
const DEV_UNLOCKED_KEY = 'sounddeck_dev_mode_unlocked';

function detectOsAndBrowser(ua: string): { osName: string; browserName: string } {
  const lower = ua.toLowerCase();
  let osName = 'Desktop OS';
  if (/iphone|ipod/.test(lower)) osName = 'iOS';
  else if (/ipad/.test(lower) || (/macintosh/.test(lower) && navigator.maxTouchPoints > 1)) osName = 'iPadOS';
  else if (/android/.test(lower)) osName = 'Android';
  else if (/cros/.test(lower)) osName = 'ChromeOS';
  else if (/windows/.test(lower)) osName = 'Windows';
  else if (/mac os x|macintosh/.test(lower)) osName = 'macOS';
  else if (/linux/.test(lower)) osName = 'Linux';

  let browserName = 'Web Browser';
  if (/edg\//.test(lower)) browserName = 'Edge';
  else if (/opr\/|opera/.test(lower)) browserName = 'Opera';
  else if (/chrome|crios/.test(lower) && !/edg\//.test(lower)) browserName = 'Chrome';
  else if (/firefox|fxios/.test(lower)) browserName = 'Firefox';
  else if (/safari/.test(lower) && !/chrome|crios/.test(lower)) browserName = 'Safari';

  return { osName, browserName };
}

export function detectHardwareDeviceCategory(): DeviceCategory {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'desktop';
  }

  const ua = navigator.userAgent || '';
  const lower = ua.toLowerCase();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sw = window.screen?.width || vw;
  const sh = window.screen?.height || vh;
  const minScreen = Math.min(sw, sh);
  const maxTouch = navigator.maxTouchPoints || 0;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const uaMobile =
    (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile ??
    false;

  const isIPhoneOrPod = /iphone|ipod/.test(lower);
  const isIPad = /ipad/.test(lower) || (/macintosh/.test(lower) && maxTouch > 1);
  const isAndroid = /android/.test(lower);
  const isAndroidMobile = isAndroid && /mobile/.test(lower);
  const isAndroidTablet = isAndroid && !/mobile/.test(lower);
  const isGenericTablet = /tablet|kindle|playbook|silk/.test(lower);
  const isGenericMobile = /windows phone|blackberry|opera mini|iemobile/.test(lower);

  if (isIPhoneOrPod || isAndroidMobile || isGenericMobile || uaMobile) {
    if (vw < 768 || minScreen < 600) {
      return 'phone';
    }
  }

  if (isIPad || isAndroidTablet || isGenericTablet) {
    return 'tablet';
  }

  if (vw < 768) {
    return 'phone';
  }

  if ((coarsePointer || maxTouch > 1) && vw >= 768 && vw < 1200) {
    return 'tablet';
  }

  // Distinguish laptop vs desktop workstation
  // Laptops typically have compact screen resolutions (< 1536px wide) or battery support
  if (sw < 1536 || vw < 1536) {
    return 'laptop';
  }

  return 'desktop';
}

function readStoredOverride(): DeviceOverride {
  try {
    const params = new URLSearchParams(window.location.search);
    const paramDevice = params.get('device');
    if (
      paramDevice === 'phone' ||
      paramDevice === 'tablet' ||
      paramDevice === 'laptop' ||
      paramDevice === 'desktop'
    ) {
      return paramDevice;
    }
    const saved = localStorage.getItem(OVERRIDE_KEY);
    if (
      saved === 'phone' ||
      saved === 'tablet' ||
      saved === 'laptop' ||
      saved === 'desktop' ||
      saved === 'auto'
    ) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'auto';
}

export function useDeviceProfile(): DeviceProfile {
  const [detectedCategory, setDetectedCategory] = useState<DeviceCategory>(() =>
    detectHardwareDeviceCategory()
  );
  const [override, setOverrideState] = useState<DeviceOverride>(() => readStoredOverride());
  const [viewportLabel, setViewportLabel] = useState(() =>
    typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '1440×900'
  );
  const [isStandalone, setIsStandalone] = useState(false);
  const [developerUnlocked, setDeveloperUnlocked] = useState(() => {
    try {
      return localStorage.getItem(DEV_UNLOCKED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const updateMetrics = () => {
      setDetectedCategory(detectHardwareDeviceCategory());
      setViewportLabel(`${window.innerWidth}×${window.innerHeight}`);
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(standalone);
    };

    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    return () => window.removeEventListener('resize', updateMetrics);
  }, []);

  const setOverride = useCallback((next: DeviceOverride) => {
    setOverrideState(next);
    try {
      localStorage.setItem(OVERRIDE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const unlockDeveloperMode = useCallback(() => {
    setDeveloperUnlocked(true);
    try {
      localStorage.setItem(DEV_UNLOCKED_KEY, 'true');
    } catch {
      // ignore
    }
  }, []);

  const resetDeveloperMode = useCallback(() => {
    setDeveloperUnlocked(false);
    try {
      localStorage.removeItem(DEV_UNLOCKED_KEY);
    } catch {
      // ignore
    }
  }, []);

  const deviceCategory: DeviceCategory = override === 'auto' ? detectedCategory : override;
  const layoutMode: AppLayoutMode =
    deviceCategory === 'phone' || deviceCategory === 'tablet' ? 'mobile-app' : 'desktop';

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const { osName, browserName } = detectOsAndBrowser(ua);
  const isTouchCapable =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 0 ||
      (typeof window !== 'undefined' &&
        (window.matchMedia?.('(pointer: coarse)').matches ?? false)));

  return {
    detectedCategory,
    deviceCategory,
    layoutMode,
    override,
    setOverride,
    osName,
    browserName,
    viewportLabel,
    isTouchCapable,
    isStandalone,
    developerUnlocked,
    unlockDeveloperMode,
    resetDeveloperMode,
  };
}
