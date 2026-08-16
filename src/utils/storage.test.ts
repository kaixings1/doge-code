import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSafeLocalStorage, getSafeSessionStorage } from "./storage";

describe("getSafeLocalStorage", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
  });

  it("returns null when window/document are absent (SSR)", () => {
    expect(getSafeLocalStorage()).toBeNull();
  });

  it("returns null when localStorage throws (Safari private mode)", () => {
    const localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    };
    Object.defineProperty(globalThis, "window", {
      value: { localStorage },
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: {},
      configurable: true,
    });

    // Simulate Safari throwing on access
    const descriptor = {
      get() {
        throw new Error("SecurityError");
      },
      configurable: true,
    };
    Object.defineProperty(globalThis.window, "localStorage", descriptor);

    expect(getSafeLocalStorage()).toBeNull();
  });

  it("returns the real localStorage when available", () => {
    const mockStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    };
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: mockStorage },
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: {},
      configurable: true,
    });

    expect(getSafeLocalStorage()).toBe(mockStorage);
  });

  it("returns null when localStorage exists but lacks getItem/setItem", () => {
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: {} },
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: {},
      configurable: true,
    });

    expect(getSafeLocalStorage()).toBeNull();
  });
});

describe("getSafeSessionStorage", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
  });

  it("returns null when window/document are absent", () => {
    expect(getSafeSessionStorage()).toBeNull();
  });

  it("returns sessionStorage when available", () => {
    const mockStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    };
    Object.defineProperty(globalThis, "window", {
      value: { sessionStorage: mockStorage },
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: {},
      configurable: true,
    });

    expect(getSafeSessionStorage()).toBe(mockStorage);
  });
});
