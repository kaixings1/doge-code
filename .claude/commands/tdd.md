---
description: 强制执行测试驱动开发工作流。先搭建接口脚手架，首先生成测试，然后编写最少代码以通过测试。确保 80% 以上的覆盖率。
---

# TDD 命令

此命令调用 **tdd-guide** 智能体（Agent）来强制执行测试驱动开发（Test-Driven Development, TDD）方法论。

## 此命令的作用

1. **搭建接口脚手架（Scaffold Interfaces）** - 首先定义类型/接口
2. **先生成测试（Generate Tests First）** - 编写失败的测试（红色 - RED）
3. **实现最少代码（Implement Minimal Code）** - 编写刚好能通过测试的代码（绿色 - GREEN）
4. **重构（Refactor）** - 在保持测试通过的同时改进代码（重构 - REFACTOR）
5. **验证覆盖率（Verify Coverage）** - 确保 80% 以上的测试覆盖率（Coverage）

## 何时使用

在以下情况下使用 `/tdd`：
- 实现新功能
- 添加新的函数/组件
- 修复 Bug（先编写能复现 Bug 的测试）
- 重构现有代码
- 构建关键业务逻辑

## 工作原理

tdd-guide 智能体会执行以下操作：

1. 为输入/输出**定义接口（Interfaces）**
2. **编写将要失败（FAIL）的测试**（因为代码尚不存在）
3. **运行测试**并验证它们因正确的理由而失败
4. **编写最少量的实现代码**使测试通过
5. **运行测试**并验证它们已通过
6. 在保持测试通过的同时**重构（Refactor）**代码
7. **检查覆盖率（Coverage）**，如果低于 80% 则添加更多测试

## TDD 循环

```
红色 (RED) → 绿色 (GREEN) → 重构 (REFACTOR) → 重复 (REPEAT)

红色 (RED):      编写一个失败的测试
绿色 (GREEN):    编写最少代码以通过测试
重构 (REFACTOR): 改进代码，保持测试通过
重复 (REPEAT):   下一个功能/场景
```

## 使用示例

```
用户: /tdd 我需要一个计算市场流动性评分的函数

智能体 (tdd-guide):
# TDD 会话：市场流动性评分计算器

## 步骤 1：定义接口 (SCAFFOLD)

```typescript
// lib/liquidity.ts
export interface MarketData {
  totalVolume: number
  bidAskSpread: number
  activeTraders: number
  lastTradeTime: Date
}

export function calculateLiquidityScore(market: MarketData): number {
  // TODO: 实现
  throw new Error('Not implemented')
}
```

## 步骤 2：编写失败的测试 (RED)

```typescript
// lib/liquidity.test.ts
import { calculateLiquidityScore } from './liquidity'

describe('calculateLiquidityScore', () => {
  it('should return high score for liquid market', () => {
    const market = {
      totalVolume: 100000,
      bidAskSpread: 0.01,
      activeTraders: 500,
      lastTradeTime: new Date()
    }

    const score = calculateLiquidityScore(market)

    expect(score).toBeGreaterThan(80)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('should return low score for illiquid market', () => {
    const market = {
      totalVolume: 100,
      bidAskSpread: 0.5,
      activeTraders: 2,
      lastTradeTime: new Date(Date.now() - 86400000) // 1 day ago
    }

    const score = calculateLiquidityScore(market)

    expect(score).toBeLessThan(30)
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('should handle edge case: zero volume', () => {
    const market = {
      totalVolume: 0,
      bidAskSpread: 0,
      activeTraders: 0,
      lastTradeTime: new Date()
    }

    const score = calculateLiquidityScore(market)

    expect(score).toBe(0)
  })
})
```

## 步骤 3：运行测试 - 验证失败 (FAIL)

```bash
npm test lib/liquidity.test.ts

FAIL lib/liquidity.test.ts
  ✕ should return high score for liquid market (2 ms)
    Error: Not implemented

1 test failed, 0 passed
```

✅ 测试如预期般失败。准备开始实现。

## 步骤 4：实现最少代码 (GREEN)

```typescript
// lib/liquidity.ts
export function calculateLiquidityScore(market: MarketData): number {
  // 处理零交易量的边缘情况
  if (market.totalVolume === 0) {
    return 0
  }

  // 计算各部分得分 (0-100 比例)
  const volumeScore = Math.min(market.totalVolume / 1000, 100)
  const spreadScore = Math.max(100 - (market.bidAskSpread * 1000), 0)
  const traderScore = Math.min(market.activeTraders / 10, 100)

  // 最近活动奖励
  const hoursSinceLastTrade = (Date.now() - market.lastTradeTime.getTime()) / (1000 * 60 * 60)
  const recencyScore = Math.max(100 - (hoursSinceLastTrade * 10), 0)

  // 加权平均
  const score = (
    volumeScore * 0.4 +
    spreadScore * 0.3 +
    traderScore * 0.2 +
    recencyScore * 0.1
  )

  return Math.min(Math.max(score, 0), 100) // 限制在 0-100
}
```

## 步骤 5：运行测试 - 验证通过 (PASS)

```bash
npm test lib/liquidity.test.ts

PASS lib/liquidity.test.ts
  ✓ should return high score for liquid market (3 ms)
  ✓ should return low score for illiquid market (2 ms)
  ✓ should handle edge case: zero volume (1 ms)

3 tests passed
```

✅ 所有测试均已通过！

## 步骤 6：重构 (IMPROVE)

```typescript
// lib/liquidity.ts - 使用常量重构，提高可读性
const WEIGHTS = {
  VOLUME: 0.4,
  SPREAD: 0.3,
  TRADERS: 0.2,
  RECENCY: 0.1,
} as const

const SCALE_FACTORS = {
  VOLUME: 1000,
  SPREAD: 1000,
  TRADERS: 10,
  RECENCY_PENALTY: 10,
} as const

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function calculateLiquidityScore(market: MarketData): number {
  if (market.totalVolume === 0) return 0

  const volumeScore = Math.min(market.totalVolume / SCALE_FACTORS.VOLUME, 100)
  const spreadScore = clamp(100 - (market.bidAskSpread * SCALE_FACTORS.SPREAD), 0, 100)
  const traderScore = Math.min(market.activeTraders / SCALE_FACTORS.TRADERS, 100)

  const hoursSinceLastTrade = (Date.now() - market.lastTradeTime.getTime()) / (1000 * 60 * 60)
  const recencyScore = clamp(100 - (hoursSinceLastTrade * SCALE_FACTORS.RECENCY_PENALTY), 0, 100)

  const weightedScore =
    volumeScore * WEIGHTS.VOLUME +
    spreadScore * WEIGHTS.SPREAD +
    traderScore * WEIGHTS.TRADERS +
    recencyScore * WEIGHTS.RECENCY

  return clamp(weightedScore, 0, 100)
}
```

## 步骤 7：验证测试依然通过

```bash
npm test lib/liquidity.test.ts

PASS lib/liquidity.test.ts
  ✓ should return high score for liquid market (3 ms)
  ✓ should return low score for illiquid market (2 ms)
  ✓ should handle edge case: zero volume (1 ms)

3 tests passed
```

✅ 重构完成，测试依然通过！

## 步骤 8：检查覆盖率 (Coverage)

```bash
npm test -- --coverage lib/liquidity.test.ts

File           | % Stmts | % Branch | % Funcs | % Lines
---------------|---------|----------|---------|--------
liquidity.ts   |   100   |   100    |   100   |   100

Coverage: 100% ✅ (目标: 80%)
```

✅ TDD 会话完成！
```

## TDD 最佳实践

**建议 (DO)：**
- ✅ 在进行任何实现之前，**首先**编写测试
- ✅ 在实现之前，运行测试并验证它们**失败 (FAIL)**
- ✅ 编写最少量的代码以通过测试
- ✅ 仅在测试变绿（通过）后才进行重构
- ✅ 添加边缘情况（Edge cases）和错误场景
- ✅ 目标是 80% 以上的覆盖率（关键代码为 100%）

**禁止 (DON'T)：**
- ❌ 在测试之前编写实现代码
- ❌ 跳过每次更改后的测试运行
- ❌ 一次编写过多代码
- ❌ 忽略失败的测试
- ❌ 测试实现细节（应测试行为）
- ❌ 模拟（Mock）一切（优先考虑集成测试）

## 应包含的测试类型

**单元测试 (Unit Tests)**（函数级）：
- 正常路径场景
- 边缘情况（空值、null、最大值）
- 错误条件
- 边界值

**集成测试 (Integration Tests)**（组件级）：
- API 终端节点
- 数据库操作
- 外部服务调用
- 带有 Hook 的 React 组件

**端到端测试 (E2E Tests)**（使用 `/e2e` 命令）：
- 关键用户流程
- 多步骤过程
- 全栈集成

## 覆盖率要求

- 所有代码**最低 80%**
- 以下内容**要求 100%**：
  - 财务计算
  - 身份验证逻辑
  - 安全关键代码
  - 核心业务逻辑

## 重要提示

**强制要求**：必须在实现之前编写测试。TDD 循环是：

1. **红色 (RED)** - 编写失败的测试
2. **绿色 (GREEN)** - 实现以通过测试
3. **重构 (REFACTOR)** - 改进代码

切勿跳过红色阶段。切勿在测试之前编写代码。

## 与其他命令的集成

- 首先使用 `/plan` 了解要构建的内容
- 使用 `/tdd` 进行带测试的实现
- 如果出现构建错误，使用 `/build-fix`
- 使用 `/code-review` 审查实现
- 使用 `/test-coverage` 验证覆盖率

## 相关智能体 (Agents)

此命令调用位于以下位置的 `tdd-guide` 智能体：
`~/.claude/agents/tdd-guide.md`

并可以参考位于以下位置的 `tdd-workflow` 技能（Skill）：
`~/.claude/skills/tdd-workflow/`
