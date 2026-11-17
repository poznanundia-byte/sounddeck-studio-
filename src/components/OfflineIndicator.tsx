import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const OfflineIndicator: React.FC<{ isMobileAppLayout?: boolean }> = ({
  isMobileAppLayout = false,
}) => {
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (isOnline) {
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      className={`fixed left-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium shadow-xl border transition-all duration-300 ${
        isMobileAppLayout ? 'bottom-[76px]' : 'bottom-4'
      } ${
        isOnline
          ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700/60'
          : 'bg-amber-950/90 text-amber-200 border-amber-700/60'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="w-4 h-4 text-emerald-400" />
          <span>Back Online — Cloud synced</span>
        </>
      ) : (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <WifiOff className="w-4 h-4 text-amber-400 ml-0.5" />
          <span>Offline Mode — Studio cached locally</span>
        </>
      )}
    </div>
  );
};
