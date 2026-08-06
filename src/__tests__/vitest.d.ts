declare module 'vitest' {
  export function describe(name: string, fn: () => void): void
  export function it(name: string, fn: () => void | Promise<void>, options?: { timeout?: number }): void
  export function test(name: string, fn: () => void | Promise<void>, options?: { timeout?: number }): void
  export function expect<T>(actual: T): {
    toBe(expected: T): void
    toEqual(expected: T): void
    toStrictEqual(expected: T): void
    toBeDefined(): void
    toBeUndefined(): void
    toBeNull(): void
    toBeTruthy(): void
    toBeFalsy(): void
    toContain(expected: T extends readonly any[] ? T[number] : T): void
    toHaveLength(expected: number): void
    toThrow(expected?: unknown): void
    toThrowError(expected?: unknown): void
    toMatch(expected: string | RegExp): void
    toMatchSnapshot(expected?: string): void
    toBeCloseTo(expected: number, precision?: number): void
    toBeGreaterThan(expected: number): void
    toBeGreaterThanOrEqual(expected: number): void
    toBeLessThan(expected: number): void
    toBeLessThanOrEqual(expected: number): void
    toHaveProperty(property: string, value?: unknown): void
    toMatchObject(expected: object): void
    toHaveBeenCalled(): void
    toHaveBeenCalledTimes(expected: number): void
    toHaveBeenCalledWith(...args: any[]): void
    not: {
      toBe(expected: T): void
      toEqual(expected: T): void
      toStrictEqual(expected: T): void
      toContain(expected: T extends readonly any[] ? T[number] : T): void
      toHaveLength(expected: number): void
      toThrow(expected?: unknown): void
      toThrowError(expected?: unknown): void
      toMatch(expected: string | RegExp): void
      toBeCloseTo(expected: number, precision?: number): void
      toBeGreaterThan(expected: number): void
      toBeGreaterThanOrEqual(expected: number): void
      toBeLessThan(expected: number): void
      toBeLessThanOrEqual(expected: number): void
      toHaveProperty(property: string, value?: unknown): void
      toMatchObject(expected: object): void
    }
  }
  export function spyOn(obj: unknown, method: string): {
    (...args: any[]): unknown
    mockReturnValue(value: unknown): void
    mockResolvedValue(value: unknown): void
    mockRejectedValue(error: unknown): void
    mockImplementation(fn: (...args: any[]) => unknown): void
    mockClear(): void
    mockReset(): void
    mockRestore(): void
    calls: { args: any[] }
    toHaveBeenCalled(): void
    toHaveBeenCalledTimes(expected: number): void
    toHaveBeenCalledWith(...args: any[]): void
  }
  export function fn<T extends (...args: any[]) => any>(fn?: T): {
    (...args: Parameters<T>): ReturnType<T>
    mockReturnValue(value: ReturnType<T>): void
    mockResolvedValue(value: ReturnType<T>): void
    mockRejectedValue(error: unknown): void
    mockImplementation(fn: (...args: Parameters<T>) => ReturnType<T>): void
    mockClear(): void
    mockReset(): void
    mockRestore(): void
    calls: { args: any[]; result?: { type: string; value?: ReturnType<T> } }
    mock: { calls: Array<{ args: any[] }> }
  }
  export const AssertionError: typeof Error
  export namespace vi {
    export function fn<T extends (...args: any[]) => any>(fn?: T): {
      (...args: Parameters<T>): ReturnType<T>
      mockReturnValue(value: ReturnType<T>): void
      mockResolvedValue(value: ReturnType<T>): void
      mockRejectedValue(error: unknown): void
      mockImplementation(fn: (...args: Parameters<T>) => ReturnType<T>): void
      mockClear(): void
      mockReset(): void
      mockRestore(): void
      calls: { args: any[]; result?: { type: string; value?: ReturnType<T> } }
      mock: { calls: Array<{ args: any[] }> }
    }
    export function spyOn(obj: unknown, method: string): {
      (...args: any[]): unknown
      mockReturnValue(value: unknown): void
      mockClear(): void
      calls: { args: any[] }
    }
    export function useFakeTimers(): void
    export function useRealTimers(): void
    export function advanceTimersByTime(ms: number): void
    export function runAllTimers(): void
    export function clearAllMocks(): void
    export function resetAllMocks(): void
    export function restoreAllMocks(): void
    export function hoisted<T>(factory: () => T): T
    export function mock<T>(path: string, factory?: () => T): void
    export function unmock(path: string): void
    export function doMock<T>(path: string, factory?: () => T): void
    export function doUnmock(path: string): void
  }
  export function beforeAll(fn: () => void | Promise<void>): void
  export function afterAll(fn: () => void | Promise<void>): void
  export function beforeEach(fn: () => void | Promise<void>): void
  export function afterEach(fn: () => void | Promise<void>): void
}

declare module 'vitest/mock' {
  export { vi, fn, spyOn } from 'vitest'
}

declare module '@vitest/coverage-v8' {
  // Coverage provider types
}
