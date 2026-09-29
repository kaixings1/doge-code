export class SSHSessionError extends Error {}

export interface SSHSession {
  createManager(opts: {
    onMessage: (msg: unknown) => void
    onPermissionRequest: (request: unknown, requestId: string) => void
    onConnected: () => void
    onDisconnected: () => void
    onReconnecting: (attempt: number, max: number) => void
    onError: (error: unknown) => void
  }): SSHSessionManager & { respondToPermissionRequest(requestId: string, result: unknown): void }
  getStderrTail(): string
  proxy: { stop(): void }
  proc: { exitCode?: number; signalCode?: string }
}

export async function createSSHSession(_opts?: unknown, _progressOpts?: unknown): Promise<SSHSession> {
  return {} as SSHSession
}

export async function createLocalSSHSession(_opts?: unknown): Promise<SSHSession> {
  return {} as SSHSession
}
