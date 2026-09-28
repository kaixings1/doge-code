// Type declaration for dynamic import in print.ts
// The runtime module is initReplBridge.ts, compiled to initReplBridge.js
declare module 'src/bridge/initReplBridge.js' {
  import type { ReplBridgeHandle } from './replBridge.js'
  export function initReplBridge(options: unknown): Promise<ReplBridgeHandle | null>
}
