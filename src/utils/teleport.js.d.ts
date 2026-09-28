// Type declaration for dynamic import in print.ts
// The runtime module is teleport.tsx, compiled to teleport.js
declare module 'src/utils/teleport.js' {
  import type { Message } from '../types/message.js'
  export function teleportResumeCodeSession(options: unknown): Promise<{
    branch: string
    log: Message[]
  }>
  export function checkOutTeleportedSessionBranch(branch?: string): Promise<{
    branchName: string
    branchError: Error | null
  }>
  export function validateGitState(): Promise<void>
  export function processMessagesForTeleportResume(messages: Message[], error: Error | null): Message[]
}
