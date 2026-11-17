// Resilient API client for full-stack Node/Express and static deployments (e.g. GitHub Pages)
import { resolvePublicAsset } from '../assets/studioAssets';

export interface SafeApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  isStaticFallback: boolean;
}

let backendAvailabilityCache: boolean | null = null;
let backendProbePromise: Promise<boolean> | null = null;

export function resetBackendAvailabilityCache(): void {
  backendAvailabilityCache = null;
  backendProbePromise = null;
}

export function getCachedBackendAvailability(): boolean | null {
  return backendAvailabilityCache;
}

/**
 * Safely probes /api/health to detect whether the Express backend is running
 * (returns false cleanly on GitHub Pages or static hosting without throwing JSON parse errors).
 */
export async function checkBackendAvailability(forceRefresh = false): Promise<boolean> {
  if (!forceRefresh && backendAvailabilityCache !== null) {
    return backendAvailabilityCache;
  }
  if (!forceRefresh && backendProbePromise) {
    return backendProbePromise;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  backendProbePromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3000);
      const res = await fetch(resolveApiUrl('/api/health'), {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      window.clearTimeout(timeout);
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const isJson = contentType.includes('application/json');
      if (res.ok && isJson) {
        const body = (await res.json()) as { ok?: boolean };
        backendAvailabilityCache = Boolean(body?.ok);
        return backendAvailabilityCache;
      }
      backendAvailabilityCache = false;
      return false;
    } catch {
      backendAvailabilityCache = false;
      return false;
    } finally {
      backendProbePromise = null;
    }
  })();

  return backendProbePromise;
}

export function resolveApiUrl(apiPath: string): string {
  const customOrigin = (import.meta.env.VITE_API_ORIGIN || '').trim().replace(/\/+$/, '');
  const normalized = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  if (customOrigin) {
    return `${customOrigin}${normalized}`;
  }
  return normalized;
}

/**
 * Safely parses JSON from /api/* endpoints. If a static host (like GitHub Pages) returns
 * an HTML 404/SPA page, returns { isStaticFallback: true, ok: false } instead of crashing with
 * "Unexpected token '<'".
 */
export async function safeApiFetch<T>(
  apiPath: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<SafeApiResponse<T>> {
  const timeoutMs = init?.timeoutMs ?? 12000;
  const controller = new AbortController();
  const externalSignal = init?.signal;

  if (externalSignal?.aborted) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Request aborted',
      isStaticFallback: false,
    };
  }

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(resolveApiUrl(apiPath), {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
    });

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      if (res.status === 404 || contentType.includes('text/html')) {
        backendAvailabilityCache = false;
        return {
          ok: false,
          status: res.status,
          data: null,
          error: 'Static hosting mode active (no backend server at /api).',
          isStaticFallback: true,
        };
      }
      const rawText = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        data: null,
        error: rawText.slice(0, 200) || `Unexpected response (HTTP ${res.status})`,
        isStaticFallback: res.status === 404,
      };
    }

    const parsed = (await res.json()) as T & { error?: string; reason?: string };
    backendAvailabilityCache = true;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: parsed,
        error: parsed?.error || parsed?.reason || `Request failed (HTTP ${res.status})`,
        isStaticFallback: false,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: parsed,
      isStaticFallback: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isOfflineOrAborted =
      (err as { name?: string })?.name === 'AbortError' ||
      (typeof navigator !== 'undefined' && !navigator.onLine);
    return {
      ok: false,
      status: 0,
      data: null,
      error: msg,
      isStaticFallback: isOfflineOrAborted || backendAvailabilityCache === false,
    };
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

export function getAppShellCacheUrls(): string[] {
  return [
    resolvePublicAsset(''),
    resolvePublicAsset('manifest.webmanifest'),
    resolvePublicAsset('pwa-192x192.png'),
    resolvePublicAsset('pwa-512x512.png'),
  ];
}
