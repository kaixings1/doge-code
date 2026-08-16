/**
 * buildRegistry.ts — 桥接引擎工具与 ToolRegistry
 *
 * 将 engine/index.ts 中 buildRegistry() 构建的 Map<string, Tool>
 * 转换为 ToolRegistry（带适配器、关系图谱、执行统计）。
 *
 * 这是 Phase 2 工具系统重构的关键集成点。
 */

import { ToolRegistry, type ToolAdapter } from './toolRegistry.js'
import { createToolAdapter } from './toolAdapters.js'
import type { Tool } from '../../engine/toolScheduler.js'

// ─── 桥接函数 ────────────────────────────────────────────

/**
 * 从引擎的 Map<string, Tool> 构建完整的 ToolRegistry
 * @param engineTools 引擎构建的工具 Map
 * @returns 已注册所有工具的 ToolRegistry 实例
 */
export function buildToolRegistry(engineTools: Map<string, Tool>): ToolRegistry {
  const registry = new ToolRegistry()

  const adapters: ToolAdapter[] = []
  for (const [, tool] of engineTools) {
    const adapter = createToolAdapter(tool)
    adapters.push(adapter)
  }

  registry.registerMany(adapters)

  // 注册预定义工具关系
  registerToolRelationships(registry)

  return registry
}

/**
 * 注册工具间的关系图谱
 * 帮助 discoverTools 和 validateToolChain 理解工具间的依赖和替代关系
 */
function registerToolRelationships(registry: ToolRegistry): void {
  // 文件读写关系
  registry.addRelationship('file_edit', {
    type: 'depends_on',
    target: 'file_read',
    description: '编辑前通常需要先读取文件',
  })

  registry.addRelationship('file_write', {
    type: 'depends_on',
    target: 'file_read',
    description: '写入前通常需要先读取上下文',
  })

  // 搜索 → 读取管道
  registry.addRelationship('grep', {
    type: 'complements',
    target: 'file_read',
    description: 'grep 搜索后通常用 file_read 查看完整内容',
  })

  registry.addRelationship('glob', {
    type: 'complements',
    target: 'file_read',
    description: 'glob 搜索后通常用 file_read 查看内容',
  })

  // git 关系
  registry.addRelationship('git', {
    type: 'complements',
    target: 'bash',
    description: 'git 工具底层通过 bash 执行',
  })

  // 替代关系
  registry.addRelationship('file_edit', {
    type: 'alternative',
    target: 'multi_file_edit',
    description: '多文件编辑时可使用 multi_file_edit 批量操作',
  })

  registry.addRelationship('bash', {
    type: 'alternative',
    target: 'shell',
    description: 'shell 工具可替代 bash 执行命令',
  })

  registry.addRelationship('web_fetch', {
    type: 'alternative',
    target: 'http',
    description: 'http 工具可替代 web_fetch 进行请求',
  })
}
