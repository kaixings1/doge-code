// Stub: server/lockfile.ts
export async function writeServerLock(_info: any): Promise<void> {}

export async function removeServerLock(): Promise<void> {}

export async function probeRunningServer(): Promise<{ pid: number; httpUrl: string } | null> {
  return null
}
