/**
 * Search engine registry - Add new engines here
 */
import type { SearchEngine, SearchResultItem } from '../types.js'

import * as duckduckgo from './duckduckgo.js'
import * as baidu from './baidu.js'
import * as bing from './bing.js'

type EngineModule = {
  name: string
  displayName: string
  needsKey: boolean
  envKey?: string
  isAvailable: () => boolean
  search: (query: string, limit: number) => Promise<SearchResultItem[]>
}

const modules: EngineModule[] = [duckduckgo, baidu, bing]

const engines: SearchEngine[] = modules.map((mod) => ({
  name: mod.name,
  displayName: mod.displayName,
  needsKey: mod.needsKey,
  envKey: mod.envKey,
  isAvailable: mod.isAvailable,
  search: mod.search,
}))

export default engines

export function getAvailableEngines(): SearchEngine[] {
  return engines.filter((e) => e.isAvailable())
}

export function getEngine(name: string): SearchEngine | void {
  return engines.find((e) => e.name === name)
}

