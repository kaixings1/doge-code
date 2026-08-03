/**
 * DirectoryAdded Hook — 注册新工作目录后触发
 *
 * 来源: Claude Code 2.1.219
 * 当 /add-dir 或 SDK register_repo_root 注册新工作目录后触发
 */

export interface DirectoryAddedEvent {
  path: string
  sessionId: string
  source: 'add-dir' | 'sdk' | 'auto'
  timestamp: number
}

export type DirectoryAddedHandler = (event: DirectoryAddedEvent) => void | Promise<void>

export class DirectoryAddedHook {
  private handlers: DirectoryAddedHandler[] = []

  /**
   * 注册 hook 处理程序
   */
  on(handler: DirectoryAddedHandler): () => void {
    this.handlers.push(handler)
    return () => {
      const idx = this.handlers.indexOf(handler)
      if (idx >= 0) this.handlers.splice(idx, 1)
    }
  }

  /**
   * 触发 hook
   */
  async fire(event: DirectoryAddedEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(event)
      } catch (err) {
        console.error('[DirectoryAdded] Handler error:', err)
      }
    }
  }

  /**
   * 获取处理程序数量
   */
  getHandlerCount(): number {
    return this.handlers.length
  }
}

// 全局单例
let globalHook: DirectoryAddedHook | null = null

export function getDirectoryAddedHook(): DirectoryAddedHook {
  if (!globalHook) {
    globalHook = new DirectoryAddedHook()
  }
  return globalHook
}
