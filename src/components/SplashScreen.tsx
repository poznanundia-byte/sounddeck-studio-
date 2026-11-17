import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { resolvePublicAsset } from '../assets/studioAssets';

interface SplashScreenProps {
  onComplete: () => void;
}

const APP_LOGO_IMG = resolvePublicAsset('app-logo.png');

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const duration = 1500;
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);
      if (pct < 100) {
        rafId = requestAnimationFrame(tick);
      } else {
        setFading(true);
        setTimeout(onComplete, 320);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onComplete]);

  const handleSkip = () => {
    setFading(true);
    setTimeout(onComplete, 200);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0B0D10] px-6 transition-opacity duration-300 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      role="dialog"
      aria-label="Loading SoundDeck Studio"
    >
      <div className="w-full max-w-md flex flex-col items-center text-center">
        {/* SoundDeck Studio App Logo */}
        <div className="relative w-32 h-32 rounded-3xl overflow-hidden border border-purple-500/40 shadow-2xl shadow-purple-500/20 mb-8 bg-[#101226] flex items-center justify-center">
          <img
            src={APP_LOGO_IMG}
            alt="SoundDeck Studio app logo"
            className="w-full h-full object-cover"
          />
        </div>

        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-100 mb-2">
          SoundDeck Studio
        </h1>
        <p className="text-sm text-slate-400 mb-8">
          Music creation, DAW mastering, Virtual DJ decks, and creator hub
        </p>

        {/* Precision VU Loading Meter */}
        <div className="w-full mb-3">
          <div className="h-1.5 w-full bg-[#161A22] rounded-full overflow-hidden border border-[#232833]">
            <div
              className="h-full bg-amber-500 transition-[width] duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="w-full flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums mb-8">
          <span>Initializing Web Audio DSP</span>
          <span>{progress}%</span>
        </div>

        {/* Dynamic Equalizer Bars */}
        <div className="flex items-end justify-center gap-1.5 h-7 mb-8" aria-hidden="true">
          {[0.45, 0.85, 0.6, 1.0, 0.72, 0.92, 0.5, 0.8, 0.65].map((scale, idx) => (
            <span
              key={idx}
              className="w-1 rounded-sm bg-amber-500/80 transition-transform duration-150"
              style={{
                height: `${Math.round(scale * 100)}%`,
                transform: `scaleY(${0.4 + 0.6 * Math.abs(Math.sin((progress / 12) + idx))})`,
                transformOrigin: 'bottom',
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleSkip}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-amber-400 transition-colors py-2 px-4 rounded-lg border border-[#232833] hover:border-amber-500/40 whitespace-nowrap"
        >
          <span>Enter Studio</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
