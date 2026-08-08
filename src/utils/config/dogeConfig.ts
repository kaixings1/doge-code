import { existsSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CONFIG_FILE = join(homedir(), '.doge', 'config.json')

export interface DogeConfig {
  baseURL?: string
  apiKey?: string
  model?: string
  tokens?: {
    sent?: number
    received?: number
    current?: number
    sessionTotal?: number
    currentSessionTotal?: number
    jsonSentBytes?: number
    jsonReceivedBytes?: number
  }
  [key: string]: unknown
}

const DEFAULT_CONFIG: DogeConfig = {}

/**
 * Ensure the .doge directory exists
 */
export function ensureDogeDir(): void {
  const dogeDir = join(homedir(), '.doge')
  if (!existsSync(dogeDir)) {
    mkdirSync(dogeDir, { recursive: true })
  }
}

/**
 * Load doge configuration from .doge/config.json
 */
export function loadDogeConfig(): DogeConfig {
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG }
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * Save doge configuration to .doge/config.json
 */
export function saveDogeConfig(config: DogeConfig): void {
  ensureDogeDir()
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * Get a specific config value
 */
export function getDogeConfig<K extends keyof DogeConfig>(key: K): DogeConfig[K] | undefined {
  return loadDogeConfig()[key]
}

/**
 * Set a specific config value
 */
export function setDogeConfig<K extends keyof DogeConfig>(key: K, value: DogeConfig[K]): void {
  const config = loadDogeConfig()
  config[key] = value
  saveDogeConfig(config)
}
