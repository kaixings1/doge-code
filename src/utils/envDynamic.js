import { feature } from 'bun:bundle';
import { stat } from 'fs/promises';
import { memoize } from '../vendor/lodash.js';
import { env, JETBRAINS_IDES } from './env.js';
import { isEnvTruthy } from './envUtils.js';
import { execFileNoThrow } from './execFileNoThrow.js';
import { getAncestorCommandsAsync } from './genericProcessUtils.js';
// Functions that require execFileNoThrow and thus cannot be in env.ts
const getIsDocker = memoize(async () => {
    if (process.platform !== 'linux')
        return false;
    // Check for .dockerenv file
    const { code } = await execFileNoThrow('test', ['-f', '/.dockerenv']);
    return code === 0;
});
function getIsBubblewrapSandbox() {
    return (process.platform === 'linux' &&
        isEnvTruthy(process.env.CLAUDE_CODE_BUBBLEWRAP));
}
// Cache for the runtime musl detection fallback (node/unbundled only).
// In native linux builds, feature flags resolve this at compile time, so the
// cache is only consulted when both IS_LIBC_MUSL and IS_LIBC_GLIBC are false.
let muslRuntimeCache = null;
// Fire-and-forget: populate the musl cache for the node fallback path.
// Native builds never reach this (feature flags short-circuit), so this only
// matters for unbundled node on Linux. Installer calls on native builds are
// unaffected since feature() resolves at compile time.
if (process.platform === 'linux') {
    const muslArch = process.arch === 'x64' ? 'x86_64' : 'aarch64';
    void stat(`/lib/libc.musl-${muslArch}.so.1`).then(() => {
        muslRuntimeCache = true;
    }, () => {
        muslRuntimeCache = false;
    });
}
/**
 * Checks if the system is using MUSL libc instead of glibc.
 * In native linux builds, this is statically known at compile time via IS_LIBC_MUSL/IS_LIBC_GLIBC flags.
 * In node (unbundled), both flags are false and we fall back to a runtime async stat check
 * whose result is cached at module load. If the cache isn't populated yet, returns false.
 */
function isMuslEnvironment() {
    if (feature('IS_LIBC_MUSL'))
        return true;
    if (feature('IS_LIBC_GLIBC'))
        return false;
    // Fallback for node: runtime detection via pre-populated cache
    if (process.platform !== 'linux')
        return false;
    return muslRuntimeCache ?? false;
}
// Cache for async JetBrains detection
let jetBrainsIDECache;
async function detectJetBrainsIDEFromParentProcessAsync() {
    if (jetBrainsIDECache !== undefined) {
        return jetBrainsIDECache;
    }
    if (process.platform === 'darwin') {
        jetBrainsIDECache = null;
        return null; // macOS uses bundle ID detection which is already handled
    }
    try {
        // Get ancestor commands in a single call (avoids sync bash in loop)
        const commands = await getAncestorCommandsAsync(process.pid, 10);
        for (const command of commands) {
            const lowerCommand = command.toLowerCase();
            // Check for specific JetBrains IDEs in the command line
            for (const ide of JETBRAINS_IDES) {
                if (lowerCommand.includes(ide)) {
                    jetBrainsIDECache = ide;
                    return ide;
                }
            }
        }
    }
    catch {
        // Silently fail - this is a best-effort detection
    }
    jetBrainsIDECache = null;
    return null;
}
export async function getTerminalWithJetBrainsDetectionAsync() {
    // Check for JetBrains terminal on Linux/Windows
    if (process.env.TERMINAL_EMULATOR === 'JetBrains-JediTerm') {
        // For macOS, bundle ID detection above already handles JetBrains IDEs
        if (env.platform !== 'darwin') {
            const specificIDE = await detectJetBrainsIDEFromParentProcessAsync();
            return specificIDE || 'pycharm';
        }
    }
    return env ? env.terminal : null;
}
// Synchronous version that returns cached result or falls back to env.terminal
// Used for backward compatibility - callers should migrate to async version
export function getTerminalWithJetBrainsDetection() {
    // Check for JetBrains terminal on Linux/Windows
    if (process.env.TERMINAL_EMULATOR === 'JetBrains-JediTerm') {
        // For macOS, bundle ID detection above already handles JetBrains IDEs
        if (env.platform !== 'darwin') {
            // Return cached value if available, otherwise fall back to generic detection
            // The async version should be called early in app initialization to populate cache
            if (jetBrainsIDECache !== undefined) {
                return jetBrainsIDECache || 'pycharm';
            }
            // Fall back to generic 'pycharm' if cache not populated yet
            return 'pycharm';
        }
    }
    return env ? env.terminal : null;
}
/**
 * Initialize JetBrains IDE detection asynchronously.
 * Call this early in app initialization to populate the cache.
 * After this resolves, getTerminalWithJetBrainsDetection() will return accurate results.
 */
export async function initJetBrainsDetection() {
    if (process.env.TERMINAL_EMULATOR === 'JetBrains-JediTerm') {
        // Use a timeout to prevent the parent process detection from hanging
        // the event loop if the PowerShell subprocess stalls (e.g. WMI issues).
        const timeoutMs = 5000;
        try {
            await Promise.race([
                detectJetBrainsIDEFromParentProcessAsync(),
                new Promise(resolve => setTimeout(() => resolve(null), timeoutMs)),
            ]);
        }
        catch {
            // Silently fail - this is a best-effort detection
        }
    }
}
// envDynamic exports env properties plus dynamic overrides.
// The ...env spread is deferred via Proxy + queueMicrotask to avoid ESM TDZ
// errors when envDynamic is imported by modules that form a cycle with env.ts.
const envDynamicOverrides = {
    getIsDocker,
    getIsBubblewrapSandbox,
    isMuslEnvironment,
    getTerminalWithJetBrainsDetectionAsync,
    initJetBrainsDetection,
};
// 'terminal' is a lazy getter so getTerminalWithJetBrainsDetection() is NOT
// called at module top-level (which would trigger TDZ via the env.ts cycle).
Object.defineProperty(envDynamicOverrides, 'terminal', {
    get: () => getTerminalWithJetBrainsDetection(),
    enumerable: true,
    configurable: true,
});
let _envDynamic;
export const envDynamic = new Proxy(envDynamicOverrides, {
    get(_, prop) {
        // Once the microtask has run, return the merged snapshot
        if (_envDynamic) {
            const val = _envDynamic[prop];
            if (val !== undefined)
                return val;
        }
        // Before microtask: return from env directly (no TDZ since env.ts
        // bindings are live by the time any consumer actually reads them)
        if (prop in env)
            return env[prop];
        return undefined;
    },
    has(_, prop) {
        if (_envDynamic && prop in _envDynamic)
            return true;
        return prop in env;
    },
    ownKeys() {
        if (_envDynamic)
            return Reflect.ownKeys(_envDynamic);
        return [...Reflect.ownKeys(envDynamicOverrides), ...Reflect.ownKeys(env)];
    },
    getOwnPropertyDescriptor(_, prop) {
        if (_envDynamic)
            return Reflect.getOwnPropertyDescriptor(_envDynamic, prop);
        if (prop in envDynamicOverrides)
            return Reflect.getOwnPropertyDescriptor(envDynamicOverrides, prop);
        if (prop in env)
            return Reflect.getOwnPropertyDescriptor(env, prop);
        return undefined;
    },
    enumerate() {
        if (_envDynamic)
            return Reflect.ownKeys(_envDynamic);
        return [...Reflect.ownKeys(envDynamicOverrides), ...Reflect.ownKeys(env)];
    },
    set(_, prop, value) {
        if (_envDynamic) {
            _envDynamic[prop] = value;
            return true;
        }
        ;
        envDynamicOverrides[prop] = value;
        return true;
    },
});
// Defer the ...env spread until after env.ts is fully initialized.
// This avoids TS5094 "Cannot access 'env' before initialization" when
// envDynamic is imported by modules that form a cycle with env.ts.
queueMicrotask(() => {
    _envDynamic = { ...env, ...envDynamicOverrides };
});
