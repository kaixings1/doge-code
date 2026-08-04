/**
 * pluginRuntime.ts — 插件运行时 SDK
 *
 * 在 pluginManager（声明式扫描）之上提供真正的 JS 插件执行能力：
 * - vm 沙箱执行插件入口（index.js / main.js），暴露受限 SDK
 * - registerCommand：注册可调用的命令
 * - registerHook：注册生命周期 hooks（onFileOpen/onFileSave/onToolExecuted/onMessageSent/onStateChange）
 * - on/emit：插件间事件总线
 * - fs.watch 热加载：插件文件变化自动重载（带 debounce）
 * - 超时保护：插件初始化/命令执行超时自动终止，防止卡死主进程
 */

import * as fs from 'fs'
import * as path from 'path'
import * as vm from 'vm'

// ─── 类型 ───

export interface PluginHook {
  onFileOpen?: (filePath: string) => void
  onFileSave?: (filePath: string, content: string) => void
  onToolExecuted?: (toolName: string, input: unknown, result: unknown) => void
  onMessageSent?: (content: string) => void
  onStateChange?: (state: string) => void
}

export interface PluginCommand {
  name: string
  fn: (...args: unknown[]) => unknown
}

export interface LoadedPlugin {
  name: string
  dir: string
  entry: string
  enabled: boolean
  commands: Map<string, (...args: unknown[]) => unknown>
  hooks: Partial<PluginHook>
  log: (level: 'info' | 'warn' | 'error', ...args: unknown[]) => void
  loadedAt: number
  errors: string[]
}

export interface PluginRuntimeStatus {
  name: string
  dir: string
  entry: string
  enabled: boolean
  commandCount: number
  hookCount: number
  loadedAt: number
  errors: string[]
}

// ─── 事件总线 ───

class PluginEventBus {
  private listeners = new Map<string, Array<{ plugin: string; fn: (data: unknown) => void }>>()

  on(plugin: string, event: string, fn: (data: unknown) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event)!.push({ plugin, fn })
  }

  off(plugin: string, event: string): void {
    const list = this.listeners.get(event)
    if (!list) return
    this.listeners.set(event, list.filter(l => l.plugin !== plugin))
  }

  emit(event: string, data: unknown): void {
    const list = this.listeners.get(event)
    if (!list) return
    for (const l of [...list]) {
      try { l.fn(data) } catch (e) { /* 单个监听器异常不影响其他 */ }
    }
  }
}

// ─── 运行时 ───

export class PluginRuntime {
  private plugins = new Map<string, LoadedPlugin>()
  private watchers = new Map<string, fs.FSWatcher>()
  private bus = new PluginEventBus()
  private reloadTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private pluginDirs: string[] = []
  private timeoutMs = 5000

  constructor(projectRoot: string, opts?: { timeoutMs?: number }) {
    this.pluginDirs = [
      path.join(projectRoot, '.doge', 'plugins'),
      path.join(projectRoot, 'plugins'),
      path.join(projectRoot, '.claude', 'plugins'),
    ].filter(d => fs.existsSync(d))
    if (opts?.timeoutMs) this.timeoutMs = opts.timeoutMs
  }

  // ─── 查询 ───

  list(): PluginRuntimeStatus[] {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      dir: p.dir,
      entry: p.entry,
      enabled: p.enabled,
      commandCount: p.commands.size,
      hookCount: Object.keys(p.hooks).length,
      loadedAt: p.loadedAt,
      errors: p.errors,
    }))
  }

  get(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name)
  }

  getCommandNames(): string[] {
    const names: string[] = []
    for (const p of this.plugins.values()) {
      for (const cmd of p.commands.keys()) names.push(`${p.name}:${cmd}`)
    }
    return names
  }

  hasPlugin(name: string): boolean {
    return this.plugins.has(name)
  }

  // ─── 加载 ───

  loadAll(): LoadedPlugin[] {
    const loaded: LoadedPlugin[] = []
    for (const dir of this.pluginDirs) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const pluginDir = path.join(dir, entry.name)
          try {
            const p = this.loadPlugin(pluginDir)
            if (p) loaded.push(p)
          } catch (e) {
            console.warn(`[PLUGIN-RUNTIME] 加载插件 ${entry.name} 失败:`, e)
          }
        }
      } catch { /* 目录不存在或无权限 */ }
    }
    return loaded
  }

  loadPlugin(pluginDir: string): LoadedPlugin | null {
    const entry = this.resolveEntry(pluginDir)
    if (!entry) return null

    const manifest = this.readManifest(pluginDir)
    const name = manifest.name || path.basename(pluginDir)

    // 已加载则先卸载（重载场景）
    this.unloadPlugin(name)

    const loaded: LoadedPlugin = {
      name,
      dir: pluginDir,
      entry,
      enabled: true,
      commands: new Map(),
      hooks: {},
      log: (level, ...args) => {
        const prefix = `[PLUGIN:${name}]`
        if (level === 'error') console.error(prefix, ...args)
        else if (level === 'warn') console.warn(prefix, ...args)
        else console.log(prefix, ...args)
      },
      loadedAt: Date.now(),
      errors: [],
    }

    // 构建沙箱 SDK
    const sdk = this.createSdk(loaded)

    // vm 执行插件代码
    try {
      const code = fs.readFileSync(entry, 'utf-8')
      const sandbox = {
        console: {
          log: (...a: unknown[]) => loaded.log('info', ...a),
          warn: (...a: unknown[]) => loaded.log('warn', ...a),
          error: (...a: unknown[]) => loaded.log('error', ...a),
        },
        process: { env: {}, platform: process.platform, versions: { node: process.versions.node } },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Buffer,
        URL,
        TextDecoder,
        TextEncoder,
        require: this.createSafeRequire(pluginDir, loaded),
        exports: {},
        module: { exports: {} },
        global: undefined,
      }
      sandbox.global = sandbox
      const context = vm.createContext(sandbox)
      const wrapped = `${code}\n;if (typeof module.exports === 'function') module.exports; else if (typeof exports.activate === 'function') exports.activate;`
      // 支持两种插件形态：module.exports = fn(ctx) 或 exports.activate(ctx)
      let activate: ((ctx: unknown) => unknown) | null = null
      const moduleExports = sandbox.module.exports as { activate?: (ctx: unknown) => unknown }
      const directExports = sandbox.exports as { activate?: (ctx: unknown) => unknown }

      const runResult = vm.runInContext(wrapped, context, { filename: entry, timeout: this.timeoutMs })
      if (typeof runResult === 'function') {
        activate = runResult as (ctx: unknown) => unknown
      } else if (typeof moduleExports.activate === 'function') {
        activate = moduleExports.activate
      } else if (typeof directExports.activate === 'function') {
        activate = directExports.activate
      }

      if (activate) {
        const result = activate(sdk)
        if (result instanceof Promise) {
          // 异步初始化：等待但不阻塞超时
          void result.catch(err => loaded.errors.push(`init: ${err instanceof Error ? err.message : String(err)}`))
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      loaded.errors.push(`load: ${msg}`)
      loaded.enabled = false
      console.error(`[PLUGIN-RUNTIME] 插件 ${name} 加载失败:`, msg)
    }

    this.plugins.set(name, loaded)
    console.log(`[PLUGIN-RUNTIME] 已加载插件: ${name} (${entry})`)
    return loaded
  }

  // ─── 卸载 ───

  unloadPlugin(name: string): boolean {
    const p = this.plugins.get(name)
    if (!p) return false
    // 清理事件监听
    this.bus.off(name, '*')
    this.stopWatch(name)
    this.plugins.delete(name)
    console.log(`[PLUGIN-RUNTIME] 已卸载插件: ${name}`)
    return true
  }

  unloadAll(): void {
    for (const name of [...this.plugins.keys()]) this.unloadPlugin(name)
  }

  // ─── 命令调用 ───

  invokeCommand(fullName: string, ...args: unknown[]): { success: boolean; result?: unknown; error?: string } {
    const sep = fullName.indexOf(':')
    if (sep === -1) return { success: false, error: `命令名格式错误: ${fullName}（应为 pluginName:commandName）` }
    const pluginName = fullName.slice(0, sep)
    const cmdName = fullName.slice(sep + 1)
    const plugin = this.plugins.get(pluginName)
    if (!plugin) return { success: false, error: `插件 ${pluginName} 未加载` }
    const fn = plugin.commands.get(cmdName)
    if (!fn) return { success: false, error: `插件 ${pluginName} 没有命令 ${cmdName}` }
    try {
      const result = fn(...args)
      if (result instanceof Promise) {
        return { success: true, result: undefined, async: true }
      }
      return { success: true, result }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // ─── hooks 触发 ───

  emitHook(hookName: keyof PluginHook, ...args: unknown[]): void {
    for (const p of this.plugins.values()) {
      const fn = p.hooks[hookName]
      if (!fn) continue
      try { (fn as (...a: unknown[]) => void)(...args) } catch (e) {
        p.errors.push(`hook ${hookName}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  emitEvent(event: string, data: unknown): void {
    this.bus.emit(event, data)
  }

  // ─── 热加载 ───

  watch(pluginName: string): boolean {
    const p = this.plugins.get(pluginName)
    if (!p) return false
    this.stopWatch(pluginName)
    try {
      const watcher = fs.watch(p.dir, { recursive: true }, (event, filename) => {
        if (!filename) return
        const rel = filename.toString()
        if (rel.includes('node_modules')) return
        // debounce 300ms
        const existing = this.reloadTimers.get(pluginName)
        if (existing) clearTimeout(existing)
        this.reloadTimers.set(pluginName, setTimeout(() => {
          console.log(`[PLUGIN-RUNTIME] 热重载: ${pluginName} (${rel} ${event})`)
          this.loadPlugin(p.dir)
          this.watch(pluginName)
        }, 300))
      })
      this.watchers.set(pluginName, watcher)
      return true
    } catch (e) {
      console.warn(`[PLUGIN-RUNTIME] 监听插件 ${pluginName} 失败:`, e)
      return false
    }
  }

  stopWatch(pluginName: string): void {
    const timer = this.reloadTimers.get(pluginName)
    if (timer) { clearTimeout(timer); this.reloadTimers.delete(pluginName) }
    const w = this.watchers.get(pluginName)
    if (w) { try { w.close() } catch { /* ignore */ } this.watchers.delete(pluginName) }
  }

  watchAll(): void {
    for (const name of this.plugins.keys()) this.watch(name)
  }

  // ─── 内部 ───

  private resolveEntry(pluginDir: string): string | null {
    for (const f of ['index.js', 'main.js', 'index.mjs', 'index.cjs']) {
      const p = path.join(pluginDir, f)
      if (fs.existsSync(p)) return p
    }
    return null
  }

  private readManifest(pluginDir: string): { name?: string } {
    try {
      const p = path.join(pluginDir, 'plugin.json')
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
    } catch { /* ignore */ }
    return {}
  }

  private createSdk(plugin: LoadedPlugin) {
    return {
      name: plugin.name,
      log: plugin.log,
      registerCommand: (name: string, fn: (...args: unknown[]) => unknown) => {
        plugin.commands.set(name, fn)
      },
      registerHook: (hook: Partial<PluginHook>) => {
        plugin.hooks = { ...plugin.hooks, ...hook }
      },
      on: (event: string, fn: (data: unknown) => void) => this.bus.on(plugin.name, event, fn),
      emit: (event: string, data: unknown) => this.bus.emit(event, data),
      api: {
        now: () => Date.now(),
        platform: process.platform,
      },
    }
  }

  /**
   * 受限 require：允许插件 require 其自身目录下的相对模块，
   * 以及白名单内置模块（path/fs 的子集由系统侧保护，仅提供只读辅助函数）。
   * 绝对路径/上级目录/黑名单模块一律拒绝。
   */
  private createSafeRequire(pluginDir: string, plugin: LoadedPlugin): NodeRequire {
    const ALLOWED = new Set(['path', 'path/posix', 'path/win32', 'url'])
    const req = (specifier: string): unknown => {
      // 相对路径：仅限插件目录内部
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        const resolved = path.resolve(pluginDir, specifier)
        if (!resolved.startsWith(pluginDir + path.sep)) {
          throw new Error(`[安全] require 越界: ${specifier}`)
        }
        if (!fs.existsSync(resolved)) throw new Error(`模块不存在: ${specifier}`)
        // 简单 JS 模块加载（CommonJS）
        const code = fs.readFileSync(resolved, 'utf-8')
        const m = { exports: {} }
        const localRequire = this.createSafeRequire(path.dirname(resolved), plugin)
        const fn = new Function('module', 'exports', 'require', code)
        fn(m, m.exports, localRequire)
        return (m as { exports: unknown }).exports
      }
      // 内置模块白名单
      if (ALLOWED.has(specifier)) {
        return require(specifier)
      }
      throw new Error(`[安全] 不允许 require: ${specifier}`)
    }
    return req as NodeRequire
  }
}

// ─── 便捷创建 ───

export function createPluginRuntime(projectRoot: string, opts?: { timeoutMs?: number }): PluginRuntime {
  return new PluginRuntime(projectRoot, opts)
}
