declare module 'src/proactive/index.js' {
  export function index(): void
}

declare module 'src/utils/messageQueueManager.js' {
  export class MessageQueueManager {
    enqueue(message: unknown): void
    dequeue(): unknown
  }
}

declare module '@clack/prompts' {
  export function select<T>(options: { message: string; options: { label: string; value: T }[] }): Promise<T>
  export function confirm(options: { message: string }): Promise<boolean>
  export function text(options: { message: string; defaultValue?: string }): Promise<string>
  export function cancel(message?: string): never
  export function isCancel(value: unknown): boolean
  export function spinner(): { start: (msg?: string) => void; stop: (msg?: string, code?: number) => void }
  export function note(message: string, title?: string): void
  export function outro(message: string): void
  export function intro(title: string): void
  export const log: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void; success: (msg: string) => void; step: (msg: string) => void }
}

declare module 'better-sqlite3' {
  export class Database {
    constructor(filename: string, opts?: Record<string, unknown>)
    prepare(sql: string): Statement
    exec(sql: string): void
    close(): void
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): (...args: Parameters<T>) => ReturnType<T>
    pragma(source: string): unknown
  }
  export const DatabaseConstructor: { new (filename: string, opts?: Record<string, unknown>): Database; prototype: Database }
  export default Database
  export class Statement {
    run(...params: unknown[]): RunResult
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
    iterate(...params: unknown[]): IterableIterator<unknown>
  }
  export interface RunResult {
    changes: number
    lastInsertRowid: number
  }
}

declare module 'image-processor-napi' {
  export function processImage(buffer: Buffer, options?: unknown): Promise<Buffer>
}

declare module 'src/utils/commitAttribution.js' {
  export type AttributionData = Record<string, unknown>
}

declare module 'src/utils/envUtils.js' {
  export function getSmallFastModel(): string
  export function getAWSRegion(): string
  export function getVertexRegionForModel(model: string): string
}

declare module 'src/utils/permissions/autoModeState.js' {
  export function isAutoModeActive(): boolean
  export function setAutoModeActive(value: boolean): void
}

declare module 'src/tools/PowerShellTool/PowerShellTool.js' {
  export class PowerShellTool {
    static readonly name: string
  }
}
