import { feature } from 'bun:bundle'
import { createRequire } from 'node:module'

const dynamicRequire = createRequire(import.meta.url)

/**
 * 安全的动态加载函数，避免在 Electron bundle 中 createRequire 无法解析模块路径时崩溃。
 * 在 Electron/Vite 构建中，feature() 返回 false，所有条件加载的命令都为 null。
 * 在 Bun 原生构建中，feature() 进行编译时死代码消除，相关 import 会被内联。
 * 此函数仅作为后备，防止任何动态 require/import 加载失败导致崩溃。
 */
export function safeRequire<T = any>(path: string): T | null {
  try {
    return dynamicRequire(path) as T
  } catch {
    return null
  }
}

type Condition = boolean | (() => boolean)

/**
 * 统一的条件命令加载函数
 * @param conditions 条件列表（布尔值或函数），任一为 true 即加载
 * @param loader 加载函数，返回加载结果或 null
 * @returns 加载结果或 null
 */
export function loadConditionalCommand<T>(
  conditions: Condition | Condition[],
  loader: () => T | null
): T | null {
  const shouldLoad = Array.isArray(conditions)
    ? conditions.some(c => (typeof c === 'function' ? c() : c))
    : typeof conditions === 'function'
      ? conditions()
      : conditions
  return shouldLoad ? loader() : null
}

/**
 * 统一「工厂式导出」模块：部分条件命令的 default 是工厂函数（`export default function X() { return Command | null }`），
 * 直接把它当命令注册会得到一个普通函数（没有 type/load，进入 /help 与分发即异常）。
 * 这里统一调用一次工厂，拿到真正的命令对象；返回 null 表示该功能当前未实现，应直接跳过而不是注入占位项。
 */
export function resolveCommandExport<T>(moduleDefault: T | (() => T | null) | null | undefined): T | null {
  if (typeof moduleDefault === 'function') {
    return (moduleDefault as () => T | null)()
  }
  return moduleDefault ?? null
}
