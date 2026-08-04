// ============================================================================
// AgentProxy Core — Handler 接口、注册表、链式调用、代理编排核心
// 强化版：优先级/依赖注入/并行/超时/重试/条件分支/统计/持久化
// ============================================================================

import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// ============================================================================
// 类型定义
// ============================================================================

export interface HandlerContext {
  requestId: string
  metadata: Record<string, unknown>
  startTime: number
  chain: string[]
  currentStep: number
  /** 步骤参数（跨步骤传递） */
  stepParams?: Record<string, unknown>
  /** 已执行步骤的索引列表 */
  executedSteps?: string[]
}

export interface HandlerResult {
  success: boolean
  data: unknown
  error?: string
  code: number
  enhanced?: boolean
  intercepted?: boolean
  handlerName?: string
  duration?: number
  /** 重试次数 */
  retries?: number
}

export interface IHandler {
  name: string
  description: string
  version: string
  tags: string[]
  /** 依赖的 Handler 名称（自动解析注入） */
  dependencies?: string[]
  handle(input: unknown, context: HandlerContext): Promise<HandlerResult>
}

export interface InterceptRule {
  name: string
  condition: (result: HandlerResult) => boolean
  transform: (result: HandlerResult) => HandlerResult
}

export interface WorkflowStep {
  handler: string
  params?: Record<string, unknown>
  onError?: 'stop' | 'skip' | 'fallback'
  fallbackHandler?: string
  /** 并行执行组（同一组的步骤并行执行） */
  parallel?: boolean
  /** 超时时间（毫秒） */
  timeout?: number
  /** 失败重试次数 */
  retries?: number
  /** 条件执行：仅当满足条件时执行（接收上一结果） */
  when?: (lastResult: HandlerResult | undefined) => boolean
  /** 步骤名称（用于展示） */
  name?: string
}

/** Handler 注册选项 */
export interface HandlerOptions {
  /** 优先级（数字越小越先注册） */
  priority?: number
  /** 是否允许覆盖已有 Handler */
  overwrite?: boolean
}

/** 调用统计 */
export interface HandlerStats {
  calls: number
  failures: number
  totalDuration: number
  avgDuration: number
  lastCalledAt: string | null
}

// ============================================================================
// HandlerRegistry — 服务注册中心（增强：优先级 + 依赖注入）
// ============================================================================

export class HandlerRegistry {
  private handlers = new Map<string, IHandler>()
  private priorities = new Map<string, number>()
  private stats = new Map<string, HandlerStats>()

  register(handler: IHandler, options?: HandlerOptions): void {
    if (this.handlers.has(handler.name) && !options?.overwrite) {
      throw new Error(`Handler '${handler.name}' 已注册（使用 { overwrite: true } 覆盖）`)
    }
    this.handlers.set(handler.name, handler)
    this.priorities.set(handler.name, options?.priority ?? 100)
    if (!this.stats.has(handler.name)) {
      this.stats.set(handler.name, {
        calls: 0,
        failures: 0,
        totalDuration: 0,
        avgDuration: 0,
        lastCalledAt: null,
      })
    }
  }

  get(name: string): IHandler | undefined {
    return this.handlers.get(name)
  }

  list(): IHandler[] {
    // 按优先级排序（数字小在前）
    return Array.from(this.handlers.values()).sort(
      (a, b) => (this.priorities.get(a.name) ?? 100) - (this.priorities.get(b.name) ?? 100),
    )
  }

  unregister(name: string): boolean {
    const removed = this.handlers.delete(name)
    this.priorities.delete(name)
    this.stats.delete(name)
    return removed
  }

  findByTag(tag: string): IHandler[] {
    return this.list().filter((h) => h.tags.includes(tag))
  }

  count(): number {
    return this.handlers.size
  }

  /** 记录调用统计 */
  recordCall(name: string, success: boolean, duration: number): void {
    const stat = this.stats.get(name)
    if (stat) {
      stat.calls++
      if (!success) stat.failures++
      stat.totalDuration += duration
      stat.avgDuration = stat.calls > 0 ? stat.totalDuration / stat.calls : 0
      stat.lastCalledAt = new Date().toISOString()
    }
  }

  /** 获取单个 Handler 统计 */
  getStats(name: string): HandlerStats | undefined {
    return this.stats.get(name)
  }

  /** 获取全部统计 */
  getAllStats(): Record<string, HandlerStats> {
    return Object.fromEntries(this.stats)
  }

  /** 解析依赖：按顺序返回 handler 及其依赖（拓扑排序，简单实现） */
  resolveWithDependencies(name: string): IHandler[] {
    const ordered: IHandler[] = []
    const visited = new Set<string>()
    const visit = (n: string, stack: Set<string>) => {
      if (visited.has(n)) return
      if (stack.has(n)) throw new Error(`循环依赖检测到: ${Array.from(stack).join(' -> ')} -> ${n}`)
      const h = this.handlers.get(n)
      if (!h) throw new Error(`Handler '${n}' 未注册`)
      stack.add(n)
      for (const dep of h.dependencies ?? []) visit(dep, stack)
      stack.delete(n)
      visited.add(n)
      ordered.push(h)
    }
    visit(name, new Set())
    return ordered
  }
}

// ============================================================================
// HandlerChain — 责任链模式（增强：并行/超时/重试/条件分支）
// ============================================================================

export class HandlerChain {
  private steps: WorkflowStep[] = []
  private registry: HandlerRegistry

  constructor(registry: HandlerRegistry) {
    this.registry = registry
  }

  add(
    handlerName: string,
    params?: Record<string, unknown>,
    onError?: 'stop' | 'skip' | 'fallback',
    fallbackHandler?: string,
  ): HandlerChain {
    this.steps.push({ handler: handlerName, params, onError, fallbackHandler })
    return this
  }

  /** 添加带高级选项的步骤 */
  addStep(step: WorkflowStep): HandlerChain {
    this.steps.push(step)
    return this
  }

  /** 执行单个步骤（含超时/重试） */
  private async executeStep(
    step: WorkflowStep,
    input: unknown,
    context: HandlerContext,
    onResult: (result: HandlerResult) => void,
  ): Promise<boolean> {
    const handler = this.registry.get(step.handler)
    if (!handler) {
      const errResult: HandlerResult = {
        success: false,
        data: null,
        error: `Handler '${step.handler}' 未注册`,
        code: 404,
        handlerName: step.handler,
        duration: 0,
      }
      onResult(errResult)
      this.registry.recordCall(step.handler, false, 0)
      return false
    }

    const stepInput = step.params ? { ...((input as object) || {}), ...step.params } : input
    const retries = step.retries ?? 0
    const timeout = step.timeout ?? 0
    let attempts = 0

    for (let attempt = 0; attempt <= retries; attempt++) {
      attempts = attempt + 1
      try {
        let result: HandlerResult
        if (timeout > 0) {
          result = await Promise.race([
            handler.handle(stepInput, { ...context, stepParams: step.params }),
            new Promise<HandlerResult>((_, reject) =>
              setTimeout(() => reject(new Error(`Handler '${step.handler}' 超时 (${timeout}ms)`)), timeout),
            ),
          ])
        } else {
          result = await handler.handle(stepInput, { ...context, stepParams: step.params })
        }
        result.handlerName = handler.name
        result.duration = Date.now() - context.startTime
        result.retries = attempt
        onResult(result)
        this.registry.recordCall(handler.name, result.success, result.duration)
        return result.success
      } catch (err) {
        if (attempt >= retries) {
          const errResult: HandlerResult = {
            success: false,
            data: null,
            error: `Handler '${step.handler}' 异常: ${err instanceof Error ? err.message : String(err)}`,
            code: 500,
            handlerName: step.handler,
            duration: Date.now() - context.startTime,
            retries: attempt,
          }
          onResult(errResult)
          this.registry.recordCall(handler.name, false, errResult.duration)
          return false
        }
        // 重试前等待（简单退避）
        await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt)))
      }
    }
    return false
  }

  /** 处理失败后的降级/停止策略 */
  private handleFailure(
    step: WorkflowStep,
    input: unknown,
    context: HandlerContext,
    results: HandlerResult[],
    currentInput: unknown,
  ): { stop: boolean; input: unknown } {
    if (step.onError === 'stop') return { stop: true, input: currentInput }
    if (step.onError === 'fallback' && step.fallbackHandler) {
      const fallback = this.registry.get(step.fallbackHandler)
      if (fallback) {
        try {
          const fbResult = fallback.handle(input, context)
          const start = Date.now()
          return Promise.resolve(fbResult).then((r) => {
            r.handlerName = fallback.name
            r.duration = Date.now() - start
            results.push(r)
            this.registry.recordCall(fallback.name, r.success, r.duration)
            return { stop: false, input: r.success ? r.data : currentInput }
          }) as unknown as { stop: boolean; input: unknown }
        } catch (err) {
          results.push({
            success: false,
            data: null,
            error: `降级 Handler '${step.fallbackHandler}' 异常: ${err instanceof Error ? err.message : String(err)}`,
            code: 500,
            handlerName: step.fallbackHandler,
          })
        }
      }
    }
    return { stop: false, input: currentInput }
  }

  async execute(input: unknown, baseContext: Partial<HandlerContext> = {}): Promise<HandlerResult[]> {
    const results: HandlerResult[] = []
    const context: HandlerContext = {
      requestId: baseContext.requestId || crypto.randomUUID(),
      metadata: baseContext.metadata || {},
      startTime: Date.now(),
      chain: this.steps.map((s) => s.handler),
      currentStep: 0,
      executedSteps: [],
    }

    let currentInput = input
    let lastResult: HandlerResult | undefined

    let i = 0
    while (i < this.steps.length) {
      const step = this.steps[i]
      context.currentStep = i

      // 条件分支：不满足则跳过
      if (step.when && !step.when(lastResult)) {
        results.push({
          success: true,
          data: null,
          code: 0,
          handlerName: step.handler,
          duration: 0,
          error: `条件不满足，跳过 (${step.name || step.handler})`,
        })
        i++
        continue
      }

      // 并行组：收集连续的 parallel 步骤并行执行
      if (step.parallel) {
        const parallelSteps: WorkflowStep[] = []
        while (i < this.steps.length && this.steps[i].parallel) {
          parallelSteps.push(this.steps[i])
          i++
        }
        const parallelInput = currentInput
        const parallelResults = await Promise.all(
          parallelSteps.map((ps) => {
            const subResults: HandlerResult[] = []
            return this.executeStep(ps, parallelInput, context, (r) => subResults.push(r)).then((ok) => ({
              ok,
              subResults,
              ps,
            }))
          }),
        )
        for (const pr of parallelResults) {
          for (const r of pr.subResults) {
            results.push(r)
            if (r.success && pr.ps.handler !== '') {
              // 取最后一个成功的结果作为输入
              lastResult = r
            }
          }
          // 并行组内若有失败，应用失败策略
          if (!pr.ok && pr.ps.onError === 'stop') {
            return results
          }
        }
        // 并行组结束后，用最后一个成功结果更新输入
        if (lastResult && lastResult.success) currentInput = lastResult.data
        continue
      }

      // 顺序执行
      const stepResults: HandlerResult[] = []
      const ok = await this.executeStep(step, currentInput, context, (r) => stepResults.push(r))
      for (const r of stepResults) results.push(r)

      if (stepResults.length > 0) {
        lastResult = stepResults[stepResults.length - 1]
      }

      if (ok) {
        if (lastResult?.success) currentInput = lastResult.data
        context.executedSteps!.push(step.handler)
      } else {
        if (step.onError === 'fallback' && step.fallbackHandler) {
          const fbResult = await this.executeFallback(step, currentInput, context)
          if (fbResult) {
            results.push(fbResult)
            if (fbResult.success) {
              currentInput = fbResult.data
              lastResult = fbResult
            }
          }
        }
        if (step.onError === 'stop') break
        // 默认 skip：继续下一个
      }
      i++
    }

    return results
  }

  private async executeFallback(
    step: WorkflowStep,
    input: unknown,
    context: HandlerContext,
  ): Promise<HandlerResult | null> {
    if (!step.fallbackHandler) return null
    const fallback = this.registry.get(step.fallbackHandler)
    if (!fallback) return null
    const start = Date.now()
    try {
      const result = await fallback.handle(input, context)
      result.handlerName = fallback.name
      result.duration = Date.now() - start
      this.registry.recordCall(fallback.name, result.success, result.duration)
      return result
    } catch (err) {
      return {
        success: false,
        data: null,
        error: `降级 Handler '${step.fallbackHandler}' 异常: ${err instanceof Error ? err.message : String(err)}`,
        code: 500,
        handlerName: step.fallbackHandler,
        duration: Date.now() - start,
      }
    }
  }

  clear(): void {
    this.steps = []
  }

  getSteps(): WorkflowStep[] {
    return [...this.steps]
  }
}

// ============================================================================
// AgentProxy — 代理编排核心（增强：统计 + 持久化）
// ============================================================================

export class AgentProxy {
  registry: HandlerRegistry
  private name: string

  constructor(name = 'default') {
    this.registry = new HandlerRegistry()
    this.name = name
  }

  /** 执行单个 Handler（自动解析依赖） */
  async execute(
    handlerName: string,
    input: unknown,
    metadata: Record<string, unknown> = {},
  ): Promise<HandlerResult> {
    // 解析依赖顺序
    let handlers: IHandler[]
    try {
      handlers = this.registry.resolveWithDependencies(handlerName)
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
        code: 404,
      }
    }

    const context: HandlerContext = {
      requestId: crypto.randomUUID(),
      metadata,
      startTime: Date.now(),
      chain: handlers.map((h) => h.name),
      currentStep: 0,
    }

    let currentInput = input
    let lastResult: HandlerResult | null = null

    for (const h of handlers) {
      const start = Date.now()
      try {
        const result = await h.handle(currentInput, { ...context, currentStep: context.chain.indexOf(h.name) })
        result.handlerName = h.name
        result.duration = Date.now() - start
        this.registry.recordCall(h.name, result.success, result.duration)
        lastResult = result
        if (result.success) {
          currentInput = result.data
        } else {
          return result
        }
      } catch (err) {
        const errResult: HandlerResult = {
          success: false,
          data: null,
          error: `Handler '${h.name}' 异常: ${err instanceof Error ? err.message : String(err)}`,
          code: 500,
          handlerName: h.name,
          duration: Date.now() - start,
        }
        this.registry.recordCall(h.name, false, errResult.duration)
        return errResult
      }
    }

    return lastResult ?? { success: false, data: null, error: '无 Handler 执行', code: 404 }
  }

  /** 创建工作链 */
  createChain(): HandlerChain {
    return new HandlerChain(this.registry)
  }

  /** 执行工作链 */
  async runChain(
    steps: WorkflowStep[],
    input: unknown,
    metadata: Record<string, unknown> = {},
  ): Promise<HandlerResult[]> {
    const chain = this.createChain()
    for (const step of steps) {
      chain.addStep(step)
    }
    return chain.execute(input, { metadata })
  }

  /** 请求增强 — 注入元数据 */
  enhance(input: unknown, metadata: Record<string, unknown>): unknown {
    if (typeof input === 'object' && input !== null) {
      return {
        ...(input as Record<string, unknown>),
        _enhanced: true,
        _enhancedAt: new Date().toISOString(),
        _metadata: metadata,
      }
    }
    return {
      _original: input,
      _enhanced: true,
      _enhancedAt: new Date().toISOString(),
      _metadata: metadata,
    }
  }

  /** 响应拦截 — 统一错误码转换 */
  intercept(result: HandlerResult, rules?: InterceptRule[]): HandlerResult {
    if (!rules || rules.length === 0) {
      if (!result.success && result.code === 0) {
        result.code = 500
      }
      result.intercepted = true
      return result
    }

    for (const rule of rules) {
      if (rule.condition(result)) {
        result = rule.transform(result)
        result.intercepted = true
        break
      }
    }
    return result
  }

  /** 注册 Handler */
  register(handler: IHandler, options?: HandlerOptions): void {
    this.registry.register(handler, options)
  }

  /** 列出所有 Handler */
  listHandlers(): IHandler[] {
    return this.registry.list()
  }

  /** 获取统计 */
  getStats(): Record<string, HandlerStats> {
    return this.registry.getAllStats()
  }

  /** 获取单个 Handler 统计 */
  getHandlerStats(name: string): HandlerStats | undefined {
    return this.registry.getStats(name)
  }

  /** 持久化到磁盘 */
  persist(): string {
    const dir = path.join(os.homedir(), '.doge', 'agentproxy')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${this.name}.json`)
    const data = {
      name: this.name,
      savedAt: new Date().toISOString(),
      stats: this.getStats(),
      handlers: this.listHandlers().map((h) => ({
        name: h.name,
        description: h.description,
        version: h.version,
        tags: h.tags,
      })),
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
    return file
  }

  /** 加载持久化统计 */
  loadPersisted(): Record<string, HandlerStats> | null {
    const file = path.join(os.homedir(), '.doge', 'agentproxy', `${this.name}.json`)
    if (!fs.existsSync(file)) return null
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      return data.stats ?? null
    } catch {
      return null
    }
  }
}
