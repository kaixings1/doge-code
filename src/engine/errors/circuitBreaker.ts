/**
 * engine/errors/circuitBreaker.ts — 熔断器（吸收自 error-coordinator）
 *
 * 跟踪错误率，超过阈值时暂时停止调用并切换到降级模式。
 * 每个被监控的实体（工具名/Agent 名）独立计数。
 *
 * 设计原则：
 * - 滑动窗口：最近 N 秒内的错误率
 * - 自动恢复：冷却期后尝试半开状态
 * - 最小侵入：通过 ErrorRecovery 接入，不改变现有工具签名
 */

export interface CircuitBreakerConfig {
  /** 窗口大小（毫秒），默认 60000（60s） */
  windowMs: number
  /** 窗口内最大错误次数，超过则打开熔断器，默认 5 */
  threshold: number
  /** 冷却期（毫秒），熔断器打开后多久尝试恢复，默认 30000（30s） */
  cooldownMs: number
  /** 错误率阈值（0-1），超过此比例触发熔断，默认 0.5（50%） */
  errorRateThreshold: number
  /** 最小请求数，窗口内请求数少于此值时不触发熔断（避免冷启动误触发），默认 3 */
  minRequests: number
}

export interface CircuitBreakerState {
  /** 当前状态 */
  status: 'closed' | 'open' | 'half-open'
  /** 连续失败次数 */
  consecutiveFailures: number
  /** 窗口内总请求数 */
  totalRequests: number
  /** 窗口内失败请求数 */
  failedRequests: number
  /** 熔断器打开时间（用于计算冷却期） */
  openedAt: number | null
  /** 上次重置时间 */
  lastResetAt: number
}

export interface CircuitBreakerResult {
  /** 是否允许执行 */
  allowed: boolean
  /** 熔断器状态 */
  state: CircuitBreakerState
  /** 拒绝原因（不允许时） */
  reason?: string
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  windowMs: 60000,
  threshold: 5,
  cooldownMs: 30000,
  errorRateThreshold: 0.5,
  minRequests: 3,
}

/**
 * CircuitBreaker — 单实体熔断器
 *
 * 跟踪特定实体（工具名/Agent 名）的错误率，超过阈值时阻止调用。
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig
  private records = new Map<string, CircuitBreakerState>()

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * check — 检查是否允许执行
   * @param key 实体标识（如工具名 'Bash' 或 Agent 名 'code-reviewer'）
   * @returns 是否允许执行 + 当前状态
   */
  check(key: string): CircuitBreakerResult {
    const now = Date.now()
    let state = this.records.get(key)

    if (!state) {
      state = this.createState(now)
      this.records.set(key, state)
      return { allowed: true, state }
    }

    // 清理过期窗口
    this.pruneWindow(state, now)

    switch (state.status) {
      case 'closed':
        // 检查是否超过阈值
        if (this.shouldTrip(state)) {
          state.status = 'open'
          state.openedAt = now
          return {
            allowed: false,
            state,
            reason: `熔断器打开：${key} 错误率超过阈值 (${state.failedRequests}/${state.totalRequests})`,
          }
        }
        return { allowed: true, state }

      case 'open':
        // 检查是否过了冷却期
        if (state.openedAt && now - state.openedAt >= this.config.cooldownMs) {
          state.status = 'half-open'
          state.openedAt = null
          return { allowed: true, state, reason: '熔断器半开：尝试恢复' }
        }
        return {
          allowed: false,
          state,
          reason: `熔断器打开：${key} 冷却中 (${Math.ceil((this.config.cooldownMs - (now - (state.openedAt ?? 0))) / 1000)}s 剩余)`,
        }

      case 'half-open':
        // 半开状态允许少量请求通过，用于探测恢复
        return { allowed: true, state }
    }
  }

  /**
   * recordSuccess — 记录成功调用
   */
  recordSuccess(key: string): void {
    const now = Date.now()
    let state = this.records.get(key)
    if (!state) {
      state = this.createState(now)
      this.records.set(key, state)
    }
    state.totalRequests++
    state.consecutiveFailures = 0
    // 半开状态成功 → 关闭熔断器
    if (state.status === 'half-open') {
      state.status = 'closed'
      state.failedRequests = 0
      state.lastResetAt = now
    }
  }

  /**
   * recordFailure — 记录失败调用
   */
  recordFailure(key: string): void {
    const now = Date.now()
    let state = this.records.get(key)
    if (!state) {
      state = this.createState(now)
      this.records.set(key, state)
    }
    state.totalRequests++
    state.failedRequests++
    state.consecutiveFailures++

    // 半开状态失败 → 重新打开熔断器
    if (state.status === 'half-open') {
      state.status = 'open'
      state.openedAt = now
    }
  }

  /**
   * reset — 重置指定实体的熔断器
   */
  reset(key: string): void {
    const now = Date.now()
    const state = this.records.get(key)
    if (state) {
      state.status = 'closed'
      state.consecutiveFailures = 0
      state.totalRequests = 0
      state.failedRequests = 0
      state.openedAt = null
      state.lastResetAt = now
    }
  }

  /**
   * resetAll — 重置所有熔断器
   */
  resetAll(): void {
    const now = Date.now()
    for (const state of this.records.values()) {
      state.status = 'closed'
      state.consecutiveFailures = 0
      state.totalRequests = 0
      state.failedRequests = 0
      state.openedAt = null
      state.lastResetAt = now
    }
  }

  /**
   * getState — 获取指定实体的状态
   */
  getState(key: string): CircuitBreakerState {
    const state = this.records.get(key)
    if (!state) return this.createState(Date.now())
    this.pruneWindow(state, Date.now())
    return { ...state }
  }

  /**
   * listAll — 列出所有实体的熔断器状态
   */
  listAll(): Map<string, CircuitBreakerState> {
    const now = Date.now()
    for (const state of this.records.values()) {
      this.pruneWindow(state, now)
    }
    return new Map(this.records)
  }

  /** 创建新的熔断器状态 */
  private createState(now: number): CircuitBreakerState {
    return {
      status: 'closed',
      consecutiveFailures: 0,
      totalRequests: 0,
      failedRequests: 0,
      openedAt: null,
      lastResetAt: now,
    }
  }

  /** 清理过期窗口数据 */
  private pruneWindow(state: CircuitBreakerState, now: number): void {
    if (now - state.lastResetAt >= this.config.windowMs) {
      state.totalRequests = 0
      state.failedRequests = 0
      state.consecutiveFailures = 0
      state.lastResetAt = now
    }
  }

  /** 检查是否应该打开熔断器 */
  private shouldTrip(state: CircuitBreakerState): boolean {
    // 最小请求数保护：冷启动时不触发
    if (state.totalRequests < this.config.minRequests) return false
    // 连续失败检查
    if (state.consecutiveFailures >= this.config.threshold) return true
    // 错误率检查
    if (state.totalRequests >= this.config.minRequests) {
      const errorRate = state.failedRequests / state.totalRequests
      if (errorRate >= this.config.errorRateThreshold) return true
    }
    return false
  }
}
