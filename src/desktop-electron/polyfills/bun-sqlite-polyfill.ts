/**
 * Minimal polyfill for Bun's `bun:sqlite` Database class.
 * Provides just enough to satisfy the import; actual queries
 * will fail until wired to a real SQLite binding (e.g. better-sqlite3).
 */
type Row = Record<string, unknown>
type Rows = Row[]

class DatabaseStub {
  private _open = true

  constructor(_path?: string) {
    // ignore path — no real DB backing yet
  }

  exec(_sql: string): void {
    // stub — no real execution
  }

  query(_sql: string, ..._params: unknown[]): { all: () => Rows; get: () => Row | undefined; run: () => { changes: number } } {
    return {
      all: () => [],
      get: () => undefined,
      run: () => ({ changes: 0 }),
    }
  }

  close(): void {
    this._open = false
  }
}

export class Database {
  constructor(_path?: string) {
    // no real backing — returns a stub instance
  }

  exec(_sql: string): void {
    // noop
  }

  query(_sql: string, ..._params: unknown[]): { all: () => Rows; get: () => Row | undefined; run: () => { changes: number } } {
    return {
      all: () => [],
      get: () => undefined,
      run: () => ({ changes: 0 }),
    }
  }

  close(): void {
    // noop
  }
}

export { DatabaseStub }
