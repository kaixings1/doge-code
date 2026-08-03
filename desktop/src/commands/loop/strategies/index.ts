/**
 * Loop Strategy Registry
 * 策略注册表 — 管理所有循环策略的注册和查询
 */

import type { LoopStrategy, LoopStrategyName } from '../types.js'
import { LangGraphStrategy } from './langgraph.js'
import { CrewStrategy } from './crew.js'
import { AutoGPTStrategy } from './autogpt.js'
import { OpenHandsStrategy } from './openhands.js'
import { SWEAgentStrategy } from './swe-agent.js'

const strategies = new Map<LoopStrategyName, LoopStrategy>()

for (const s of [
  new LangGraphStrategy(),
  new CrewStrategy(),
  new AutoGPTStrategy(),
  new OpenHandsStrategy(),
  new SWEAgentStrategy(),
]) {
  strategies.set(s.name, s)
}

export function getStrategy(name: LoopStrategyName): LoopStrategy {
  const s = strategies.get(name)
  if (!s) throw new Error(`Unknown loop strategy: ${name}. Available: ${getAvailableStrategies().join(', ')}`)
  return s
}

export function getAvailableStrategies(): LoopStrategyName[] {
  return Array.from(strategies.keys())
}

export function getStrategyInfo(): Array<{ name: LoopStrategyName; displayName: string; description: string }> {
  return Array.from(strategies.values()).map(s => ({
    name: s.name,
    displayName: s.displayName,
    description: s.description,
  }))
}

export type { LoopStrategy, LoopStrategyName }
