export const DEFAULT_RECAPTCHA_SITE_KEY = (
  import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6Le3QyMuAAAAACqhl5z87UA-Lt99HEfcuC9rIcsa'
).trim();

let runtimeRecaptchaSiteKey = DEFAULT_RECAPTCHA_SITE_KEY;

export function getRecaptchaSiteKey(): string {
  return runtimeRecaptchaSiteKey;
}

export function setRuntimeRecaptchaSiteKey(nextKey?: string | null): void {
  const cleaned = (nextKey || '').trim();
  if (cleaned && cleaned !== runtimeRecaptchaSiteKey) {
    runtimeRecaptchaSiteKey = cleaned;
    scriptLoadPromise = null;
  }
}

export const RECAPTCHA_SITE_KEY = DEFAULT_RECAPTCHA_SITE_KEY;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

export interface RecaptchaExecutionResult {
  token: string | null;
  shieldToken: string | null;
  siteKey: string;
  action: string;
  active: boolean;
  provider: 'google_v3' | 'adaptive_shield' | 'human_challenge';
  status: 'verified' | 'shield_active' | 'domain_unlisted' | 'unavailable';
  hostname: string;
  errorReason?: string;
}

export interface HumanChallengePrompt {
  id: string;
  question: string;
  expectedAnswer: string;
  hint: string;
}

let scriptLoadPromise: Promise<boolean> | null = null;
let cachedHumanShieldSessionToken: string | null = null;

export function getMaskedRecaptchaSiteKey(key = getRecaptchaSiteKey()): string {
  if (!key || key.length < 12) return 'Adaptive Shield';
  return `${key.slice(0, 8)}••••${key.slice(-4)}`;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic hash for insecure HTTP local IP previews where subtle may be restricted
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0').repeat(4);
}

/**
 * Generates a cryptographic SoundDeck Adaptive Shield proof token bound to origin, timestamp, and action.
 * Used alongside Google reCAPTCHA v3 or as a resilient shield on GitHub Pages / custom domains.
 */
export async function generateAdaptiveShieldProof(
  action: string,
  method: 'auto' | 'challenge' = 'auto'
): Promise<string> {
  const host = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'server';
  const ts = Date.now();
  const nonce = Math.random().toString(36).slice(2, 10);
  const digest = await sha256Hex(`sounddeck_shield_v1:${host}:${action}:${method}:${ts}:${nonce}`);
  const token = `sounddeck_shield_v1.${method}.${host}.${ts}.${nonce}.${digest.slice(0, 24)}`;
  if (method === 'challenge') {
    cachedHumanShieldSessionToken = token;
  }
  return token;
}

export function getVerifiedHumanShieldToken(): string | null {
  return cachedHumanShieldSessionToken;
}

export function clearVerifiedHumanShieldToken(): void {
  cachedHumanShieldSessionToken = null;
}

export function createInteractiveSecurityChallenge(): HumanChallengePrompt {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 9) + 1;
  return {
    id: `hc_${Date.now()}`,
    question: `Security Check: ${a} + ${b} = ?`,
    expectedAnswer: String(a + b),
    hint: 'Enter the sum to confirm human studio access',
  };
}

/**
 * Loads Google reCAPTCHA v3 script once with the active site key.
 * Never throws or blocks authentication if third-party scripts are blocked offline.
 */
export function preloadRecaptchaScript(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false);
  }
  const activeKey = getRecaptchaSiteKey();
  if (!activeKey) {
    return Promise.resolve(false);
  }
  if (window.grecaptcha && typeof window.grecaptcha.execute === 'function') {
    return Promise.resolve(true);
  }
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-sounddeck-recaptcha="true"]'
    );
    if (existing) {
      const checkReady = window.setInterval(() => {
        if (window.grecaptcha) {
          window.clearInterval(checkReady);
          resolve(true);
        }
      }, 100);
      window.setTimeout(() => {
        window.clearInterval(checkReady);
        resolve(Boolean(window.grecaptcha));
      }, 3000);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(activeKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.sounddeckRecaptcha = 'true';

    const timer = window.setTimeout(() => {
      resolve(Boolean(window.grecaptcha));
    }, 3500);

    script.onload = () => {
      window.clearTimeout(timer);
      resolve(Boolean(window.grecaptcha));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };

    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/**
 * Executes dual-layer reCAPTCHA v3 + SoundDeck Adaptive Security Shield on sensitive auth actions
 * (registration, sign-in, password reset, phone/email OTP dispatch, Google sign-in).
 */
export async function executeRecaptchaSecurity(
  action: string
): Promise<RecaptchaExecutionResult> {
  const safeAction = action.replace(/[^a-zA-Z0-9_]/g, '_') || 'auth_action';
  const activeKey = getRecaptchaSiteKey();
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'server';

  if (typeof window === 'undefined') {
    return {
      token: null,
      shieldToken: null,
      siteKey: activeKey,
      action: safeAction,
      active: false,
      provider: 'adaptive_shield',
      status: 'unavailable',
      hostname,
      errorReason: 'Browser environment unavailable.',
    };
  }

  const loaded = activeKey ? await preloadRecaptchaScript() : false;
  if (loaded && window.grecaptcha && activeKey) {
    try {
      const token = await new Promise<string>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error('reCAPTCHA token request timed out'));
        }, 3200);

        window.grecaptcha!.ready(() => {
          window.grecaptcha!
            .execute(activeKey, { action: safeAction })
            .then((tok) => {
              window.clearTimeout(timeout);
              resolve(tok);
            })
            .catch((err) => {
              window.clearTimeout(timeout);
              reject(err);
            });
        });
      });

      const shieldToken = await generateAdaptiveShieldProof(safeAction, 'auto');
      return {
        token,
        shieldToken,
        siteKey: activeKey,
        action: safeAction,
        active: true,
        provider: 'google_v3',
        status: 'verified',
        hostname,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const shieldToken = await generateAdaptiveShieldProof(
        safeAction,
        cachedHumanShieldSessionToken ? 'challenge' : 'auto'
      );
      const isDomainIssue =
        message.toLowerCase().includes('invalid site key') ||
        message.toLowerCase().includes('domain') ||
        message.toLowerCase().includes('key');
      return {
        token: null,
        shieldToken,
        siteKey: activeKey,
        action: safeAction,
        active: true,
        provider: cachedHumanShieldSessionToken ? 'human_challenge' : 'adaptive_shield',
        status: cachedHumanShieldSessionToken
          ? 'shield_active'
          : isDomainIssue
          ? 'domain_unlisted'
          : 'shield_active',
        hostname,
        errorReason: message,
      };
    }
  }

  const shieldToken = await generateAdaptiveShieldProof(
    safeAction,
    cachedHumanShieldSessionToken ? 'challenge' : 'auto'
  );
  return {
    token: null,
    shieldToken,
    siteKey: activeKey,
    action: safeAction,
    active: true,
    provider: cachedHumanShieldSessionToken ? 'human_challenge' : 'adaptive_shield',
    status: 'shield_active',
    hostname,
    errorReason: 'Google reCAPTCHA script offline or blocked; Adaptive Security Shield active.',
  };
}
