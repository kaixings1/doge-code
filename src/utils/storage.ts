// Safe storage access with environment detection and Safari private mode handling.
// Direct window.localStorage access is unsafe: it throws in SSR, in Safari private
// mode, and when cookies/storage are disabled. Centralize the guards here.

function hasWindowAndDocument(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isStorage(value: unknown): value is Storage {
  return (
    Boolean(value) &&
    typeof (value as Storage).getItem === "function" &&
    typeof (value as Storage).setItem === "function"
  );
}

function getRawStorage(name: "localStorage" | "sessionStorage"): Storage | null {
  if (!hasWindowAndDocument()) return null;
  try {
    const storage = window[name];
    return isStorage(storage) ? storage : null;
  } catch {
    // Safari private browsing mode throws SecurityError here.
    return null;
  }
}

export function getSafeLocalStorage(): Storage | null {
  return getRawStorage("localStorage");
}

export function getSafeSessionStorage(): Storage | null {
  return getRawStorage("sessionStorage");
}
