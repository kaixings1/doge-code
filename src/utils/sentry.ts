/**
 * Sentry integration module
 *
 * Dynamically loads @sentry/node when SENTRY_DSN is set.
 * If the package is not installed or DSN is missing, all exports become no-ops.
 * 
 * Usage:
 *   await initSentry();   // call once at startup
 *   captureException(err, { userId: 123 });
 */

import { logForDebugging } from './debug.js';

// ---------- state ----------
let initialized = false;
let initPromise: Promise<void> | null = null;
let sentryModule: typeof import('@sentry/node') | null = null;

// ---------- internal helpers ----------

/**
 * Dynamically load the Sentry module.
 * Returns null if the package is not installed.
 */
async function loadSentry(): Promise<typeof import('@sentry/node') | null> {
  if (sentryModule) return sentryModule;
  try {
    sentryModule = await import('@sentry/node');
    return sentryModule;
  } catch {
    logForDebugging('[sentry] @sentry/node not installed, skipping');
    return null;
  }
}

/**
 * Ensure Sentry is loaded and initialized.
 * If already initialized, returns immediately.
 * If initialization is in progress, waits for it.
 * If not initialized, starts initialization.
 */
async function ensureInitialized(): Promise<boolean> {
  if (initialized) return true;
  if (initPromise) {
    await initPromise;
    return initialized;
  }
  // No initialization started – call initSentry() explicitly
  return false;
}

// ---------- public API ----------

/**
 * Initialize Sentry SDK.
 *
 * - Safe to call multiple times (subsequent calls are no‑ops).
 * - Only activates when SENTRY_DSN environment variable is set and @sentry/node is installed.
 * - Returns a promise that resolves when initialization is complete.
 *
 * @example
 *   await initSentry();
 */
export async function initSentry(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
      logForDebugging('[sentry] SENTRY_DSN not set, skipping initialization');
      return;
    }

    const Sentry = await loadSentry();
    if (!Sentry) {
      logForDebugging('[sentry] @sentry/node not available, skipping init');
      return;
    }

    Sentry.init({
      dsn,
      release: typeof MACRO !== 'undefined' ? MACRO.VERSION : undefined,
      environment:
        typeof BUILD_ENV !== 'undefined' ? BUILD_ENV : process.env.NODE_ENV || 'development',

      maxBreadcrumbs: 20,
      sampleRate: 1.0,

      beforeSend(event) {
        const request = event.request;
        if (request?.headers) {
          const sensitiveHeaders = [
            'authorization',
            'x-api-key',
            'cookie',
            'set-cookie',
          ];
          for (const key of Object.keys(request.headers)) {
            if (sensitiveHeaders.includes(key.toLowerCase())) {
              delete request.headers[key];
            }
          }
        }
        return event;
      },

      ignoreErrors: [
        'ECONNREFUSED',
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT',
        'AbortError',
        'The user aborted a request',
        'CancelError',
      ],

      beforeSendTransaction() {
        return null; // disable performance transactions
      },
    });

    initialized = true;
    logForDebugging('[sentry] Initialized successfully');
  })();

  await initPromise;
}

/**
 * Capture an exception and send it to Sentry.
 * No‑op if Sentry is not initialized.
 *
 * @param error - The error or exception to capture
 * @param context - Additional context (extras) to attach
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  // If not initialized, try to ensure initialization (but don't wait)
  // We want to be non‑blocking, so we don't await.
  // However, to avoid missing errors that occur before init finishes,
  // we can start init if not already started.
  if (!initialized) {
    // If init hasn't been called at all, we can't do anything.
    // But if init is in progress, we could wait – but that would make this function async.
    // To keep it synchronous and non‑blocking, we simply return if not ready.
    // This means errors before init completes are dropped – acceptable because
    // users are expected to call initSentry() at startup.
    return;
  }

  const Sentry = sentryModule;
  if (!Sentry) return;

  try {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setExtras(context);
      }
      Sentry.captureException(error);
    });
  } catch {
    // Sentry itself failed – ignore to avoid crashing the app
  }
}

/**
 * Set a tag on the current scope.
 * No‑op if Sentry is not initialized.
 */
export function setTag(key: string, value: string): void {
  if (!initialized) return;
  const Sentry = sentryModule;
  if (!Sentry) return;

  try {
    Sentry.setTag(key, value);
  } catch {
    // ignore
  }
}

/**
 * Set user context in Sentry.
 * No‑op if Sentry is not initialized.
 */
export function setUser(user: { id?: string; email?: string; username?: string }): void {
  if (!initialized) return;
  const Sentry = sentryModule;
  if (!Sentry) return;

  try {
    Sentry.setUser(user);
  } catch {
    // ignore
  }
}

/**
 * Flush pending Sentry events and close the client.
 * Call during graceful shutdown to ensure events are sent.
 *
 * @param timeoutMs - Maximum time to wait for flushing (default: 2000 ms)
 */
export async function closeSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  const Sentry = sentryModule;
  if (!Sentry) return;

  try {
    await Sentry.close(timeoutMs);
    logForDebugging('[sentry] Closed successfully');
  } catch {
    // Ignore – we're shutting down anyway
  }
}

/**
 * Check if Sentry is initialized.
 */
export function isSentryInitialized(): boolean {
  return initialized;
}