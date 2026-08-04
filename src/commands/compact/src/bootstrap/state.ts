type PostCompactionHandler = () => void

let handlers: PostCompactionHandler[] = []

/**
 * 注册压缩后回调。返回取消注册函数。
 */
export function onPostCompaction(handler: PostCompactionHandler): () => void {
  handlers.push(handler)
  return () => {
    handlers = handlers.filter(h => h !== handler)
  }
}

/**
 * 标记压缩后状态。
 * 压缩完成后调用：执行所有已注册的观察者回调并清空队列。
 * 用于通知依赖方（如缓存失效、UI 更新）执行一次性清理。
 */
export function markPostCompaction(): void {
  const toRun = handlers
  handlers = []
  for (const h of toRun) {
    try { h() } catch { /* ignore */ }
  }
}
