/**
 * Loop Strategy Registry
 * Exports all loop strategies for the loop engine.
 */

import type { LoopStrategy, LoopStrategyName } from '../types.js'
import { LangGraphStrategy } from './langgraph.js'
import { CrewStrategy } from './crew.js'
import { AutoGPTStrategy } from './autogpt.js'
import { OpenHandsStrategy } from './openhands.js'
import { SWEAgentStrategy } from './swe-agent.js'

/** Strategy registry - maps strategy names to instances */
const strategies = new Map<LoopStrategyName, LoopStrategy>()

// Register all strategies
for (const s of [
  new LangGraphStrategy(),
  new CrewStrategy(),
  new AutoGPTStrategy(),
  new OpenHandsStrategy(),
  new SWEAgentStrategy(),
]) {
  strategies.set(s.name, s)
}

/** Get a strategy by name */
export function getStrategy(name: LoopStrategyName): LoopStrategy {
  const s = strategies.get(name)
  if (!s) throw new Error(`Unknown loop strategy: ${name}. Available: ${getAvailableStrategies().join(', ')}`)
  return s
}

/** Get all available strategy names */
export function getAvailableStrategies(): LoopStrategyName[] {
  return Array.from(strategies.keys())
}

/** Get all strategy info for help display */
export function getStrategyInfo(): Array<{ name: LoopStrategyName; displayName: string; description: string }> {
  return Array.from(strategies.values()).map(s => ({
    name: s.name,
    displayName: s.displayName,
    description: s.description,
  }))
}

export type { LoopStrategy, LoopStrategyName }
