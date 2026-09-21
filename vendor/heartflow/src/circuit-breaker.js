'use strict';

/**
 * [v7.0.0] 工作包 D: 全局熔断 + Kill Switch
 * 
 * 国标要求：持续异常时自动降级，紧急时一键终止
 * 
 * 覆盖：
 * - 内存熔断（并发/内存/CPU 水位）
 * - MCP 成功率熔断（连续失败阈值）
 * - Kill Switch（紧急终止 +  graceful shutdown）
 * - 状态 REST API（GET /health）
 */

// ── 内存熔断 ──────────────────────────────────────────
const MEM_WARNING  = 0.75;  // 75% RSS → warn
const MEM_CRITICAL = 0.90;  // 90% RSS → trip
const CPU_WARNING  = 0.80;  // 80% CPU → warn
const CPU_CRITICAL = 0.95;  // 95% CPU → trip
const REQUEST_WINDOW  = 60_000;  // 1 分钟滑动窗口
const FAIL_RATE_WARN  = 0.30;  // 30% 失败率 → warn
const FAIL_RATE_TRIP  = 0.50;  // 50% 失败率 → trip
const MIN_SAMPLES     = 10;    // 最少采样数才触发
const CPU_TRIP_STREAK = 3;     // CPU 连续饱和多少次才跳闸（防瞬时误判）

const STATE = Object.freeze({
  CLOSED:    'CLOSED',      // 正常
  OPEN:      'OPEN',        // 熔断开启
  HALF_OPEN: 'HALF_OPEN',   // 半开探测
  TRIPPED:   'TRIPPED',     // 紧急终止
});

let _state = STATE.CLOSED;
let _trippedAt = 0;
let _lastError = null;
let _stats = { total: 0, failures: 0, successes: 0 };
let _windowStart = Date.now();
let _killSwitchActive = false;

// ── 内存检查 ──────────────────────────────────────────
// 注意：不能用 heapUsed / heapTotal。V8 会把堆保持在高水位，
// 该比值在正常运行下长期处于 0.9 以上，会让熔断器永久 TRIPPED，
// 进而把 memory.getStats 这类只读调用也一并拦掉。改用 RSS 对系统内存上限。
function _sysMemLimitMB() {
  try {
    const os = require('os');
    const total = os.totalmem() / 1024 / 1024;
    if (total > 0) return total;
  } catch (e) { /* fall through */ }
  return 0;
}

function checkMemory() {
  const usage = process.memoryUsage();
  const rssMB = Math.round(usage.rss / 1024 / 1024);
  const sysTotalMB = _sysMemLimitMB();
  // 无系统信息时回退到固定预算（默认 2GB），而不是堆比值
  const budgetMB = sysTotalMB > 0 ? Math.min(sysTotalMB, 2048) : 2048;
  const percent = Math.round(Math.min(1, rssMB / budgetMB) * 100) / 100;

  return {
    usedMB: rssMB,
    totalMB: Math.round(budgetMB),
    percent,
    level: percent >= MEM_CRITICAL ? 'critical' : percent >= MEM_WARNING ? 'warning' : 'ok',
    action: percent >= MEM_CRITICAL ? 'trip' : percent >= MEM_WARNING ? 'warn' : 'none',
  };
}

// ── CPU 检查（基于 process.cpuUsage）─────────────────
// 不使用 busy-wait：同步空转会堵死事件循环，把"保护"变成"僵死"。
// 改为用两次调用之间的墙上时间做采样，无阻塞。
let _cpuPrev = null;
let _cpuCriticalStreak = 0;
function checkCPU() {
  const now = Date.now();
  const cum = process.cpuUsage();
  let cpuPercent = 0;

  if (_cpuPrev) {
    const elapsedMs = Math.max(1, now - _cpuPrev.at);
    const dUser = cum.user - _cpuPrev.user;
    const dSys = cum.system - _cpuPrev.system;
    cpuPercent = Math.min(1, (dUser + dSys) / (elapsedMs * 1000));
  }
  _cpuPrev = { at: now, user: cum.user, system: cum.system };

  cpuPercent = Math.round(cpuPercent * 100) / 100;
  return {
    cpuPercent,
    level: cpuPercent >= CPU_CRITICAL ? 'critical' : cpuPercent >= CPU_WARNING ? 'warning' : 'ok',
    action: cpuPercent >= CPU_CRITICAL ? 'trip' : cpuPercent >= CPU_WARNING ? 'warn' : 'none',
  };
}

// ── 滑动窗口失败率统计 ────────────────────────────────
function recordOutcome(success) {
  const now = Date.now();
  if (now - _windowStart > REQUEST_WINDOW) {
    _stats = { total: 0, failures: 0, successes: 0 };
    _windowStart = now;
  }
  _stats.total++;
  if (success) {
    _stats.successes++;
  } else {
    _stats.failures++;
  }
  _evaluate();
}

function getFailRate() {
  if (_stats.total < MIN_SAMPLES) return 0;
  return _stats.failures / _stats.total;
}

// ── 熔断状态机 ──────────────────────────────────────
// 自动恢复冷却：资源类熔断不应永久闩死，否则一次瞬时内存尖峰会让
// 整个 MCP 服务永久不可用（连只读的状态查询也一起挂掉）。
const AUTO_RESET_MS = 60_000;

function _maybeAutoReset() {
  if (!_killSwitchActive) return;
  if (Date.now() - _trippedAt < AUTO_RESET_MS) return;
  // 冷却期已过：复核资源水位，正常则自动恢复
  const mem = checkMemory();
  const cpu = checkCPU();
  if (mem.action === 'trip' || cpu.action === 'trip') {
    _trippedAt = Date.now(); // 仍然超限，顺延冷却
    return;
  }
  _state = STATE.CLOSED;
  _killSwitchActive = false;
  _lastError = null;
  _stats = { total: 0, failures: 0, successes: 0 };
}

function _evaluate() {
  _maybeAutoReset();
  if (_killSwitchActive) return STATE.TRIPPED;
  
  const mem = checkMemory();
  const cpu = checkCPU();
  const failRate = getFailRate();
  
  // Memory/CPU critical → trip, but CPU only after SUSTAINED saturation.
  // 单次瞬时 CPU 采样在 1ms 粒度下极易读出 1.0（两次调用间隔内的真实 CPU 时间
  // 相对墙钟时间被放大），据此跳闸会让熔断器在无真实过载时闩死，
  // 连 memory.getStats 这类只读调用也一并被拦掉。
  if (mem.action === 'trip') {
    trip(`Resource exhausted: mem ${mem.percent}`);
    return STATE.TRIPPED;
  }
  if (cpu.action === 'trip') {
    _cpuCriticalStreak++;
    if (_cpuCriticalStreak >= CPU_TRIP_STREAK) {
      trip(`Resource exhausted: cpu ${cpu.cpuPercent} (${_cpuCriticalStreak} consecutive samples)`);
      return STATE.TRIPPED;
    }
  } else {
    _cpuCriticalStreak = 0;
  }
  
  // High failure rate → open circuit
  if (failRate >= FAIL_RATE_TRIP && _stats.total >= MIN_SAMPLES) {
    _state = STATE.OPEN;
    _trippedAt = Date.now();
    return STATE.OPEN;
  }
  
  // Warning threshold
  if (failRate >= FAIL_RATE_WARN || mem.level === 'warning' || cpu.level === 'warning') {
    return STATE.HALF_OPEN;
  }
  
  return STATE.CLOSED;
}

// ── Kill Switch ──────────────────────────────────────
function trip(reason) {
  _state = STATE.TRIPPED;
  _trippedAt = Date.now();
  _lastError = reason;
  _killSwitchActive = true;
  console.error(`[circuitBreaker] TRIPPED: ${reason}`);
  return getState();
}

function reset() {
  _state = STATE.CLOSED;
  _trippedAt = 0;
  _lastError = null;
  _killSwitchActive = false;
  _stats = { total: 0, failures: 0, successes: 0 };
  _cpuCriticalStreak = 0;
}

function isTripped() { return _killSwitchActive; }
function getState()   { return { state: _state, trippedAt: _trippedAt, lastError: _lastError, ..._stats }; }

// ── MCP 请求守卫 ──────────────────────────────────────
function guard() {
  if (_killSwitchActive) {
    return {
      allowed: false,
      reason: `Circuit breaker TRIPPED at ${new Date(_trippedAt).toISOString()}: ${_lastError}`,
      state: STATE.TRIPPED,
    };
  }
  
  const current = _evaluate();
  if (current === STATE.OPEN) {
    return {
      allowed: false,
      reason: `Circuit breaker OPEN (failRate=${Math.round(getFailRate()*100)}% >= ${Math.round(FAIL_RATE_TRIP*100)}%)`,
      state: STATE.OPEN,
    };
  }
  
  return { allowed: true, state: current };
}

// ── 健康检查 ──────────────────────────────────────────
function healthCheck() {
  const mem = checkMemory();
  const cpu = checkCPU();
  const failRate = getFailRate();
  const cb = guard();
  
  return {
    status: cb.allowed ? 'ok' : 'degraded',
    circuitBreaker: cb,
    memory: mem,
    cpu: cpu,
    failRate: Math.round(failRate * 100) / 100,
    uptime: process.uptime(),
    timestamp: Date.now(),
  };
}

module.exports = {
  guard,
  trip,
  reset,
  isTripped,
  getState,
  healthCheck,
  checkMemory,
  checkCPU,
  recordOutcome,
  STATE,
  MEM_CRITICAL,
  FAIL_RATE_TRIP,
};

