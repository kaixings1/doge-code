import * as React from 'react'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'

const DOGEDIR_CACHE = join(homedir(), '.doge')

interface CacheInfo {
  name: string
  path: string
  size: number
  entries: number
  lastModified: string
}

function getDiskUsage(dir: string): number {
  let size = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fp = join(dir, entry.name)
      try {
        const stat = statSync(fp)
        if (stat.isDirectory()) size += getDiskUsage(fp)
        else size += stat.size
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return size
}

function countFiles(dir: string): number {
  let count = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fp = join(dir, entry.name)
      try {
        if (statSync(fp).isFile()) count++
        else count += countFiles(fp)
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return count
}

function findCaches(dir: string): CacheInfo[] {
  const caches: CacheInfo[] = []
  const cacheDirs = ['sessions', 'backups', 'snippets', 'agents', 'templates', 'tasks', 'errors', 'notifications']
  for (const name of cacheDirs) {
    const path = join(dir, name)
    if (existsSync(path)) {
      try {
        const stat = statSync(path)
        caches.push({ name, path, size: getDiskUsage(path), entries: countFiles(path), lastModified: stat.mtime.toISOString() })
      } catch { /* ignore */ }
    }
  }
  return caches
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parts = args.trim().split(/\s+/)
  const operation = parts[0]?.toLowerCase() || 'status'
  const target = parts[1]?.toLowerCase() || 'all'

  if (operation === 'status' || operation === '') {
    if (!existsSync(DOGEDIR_CACHE)) {
      onDone('No .doge directory found. Cache is empty.')
      return null
    }
    const caches = findCaches(DOGEDIR_CACHE)
    if (caches.length === 0) {
      onDone('No caches found.')
      return null
    }
    const lines = ['Cache Status:', '==============', '']
    let totalSize = 0
    let totalEntries = 0
    caches.forEach(c => {
      totalSize += c.size
      totalEntries += c.entries
      lines.push(c.name + ': ' + (c.size / 1024).toFixed(1) + ' KB, ' + c.entries + ' entries')
    })
    lines.push('', 'Total: ' + (totalSize / 1024).toFixed(1) + ' KB, ' + totalEntries + ' entries')
    onDone(lines.join('\n'))
    return null
  }

  if (operation === 'clear') {
    const cacheName = target
    if (cacheName === 'all') {
      onDone('Clear all caches? This will delete all .doge data. Use specific cache name or "all --force".')
      return null
    }
    const cachePath = join(DOGEDIR_CACHE, cacheName)
    if (!existsSync(cachePath)) {
      onDone('Cache not found: ' + cacheName)
      return null
    }
    try {
      execSync('rm -rf "' + cachePath + '"', { stdio: 'ignore' })
      onDone('[OK] Cleared cache: ' + cacheName)
    } catch {
      onDone('[ERROR] Failed to clear: ' + cacheName)
    }
    return null
  }

  if (operation === 'analyze' || operation === 'stats') {
    const caches = findCaches(DOGEDIR_CACHE)
    const lines = ['Cache Analysis:', '================', '']
    caches.sort((a, b) => b.size - a.size).forEach(c => {
      const sizeKB = (c.size / 1024).toFixed(1)
      const lastMod = c.lastModified.slice(0, 19)
      lines.push(c.name + ': ' + sizeKB + ' KB (' + c.entries + ' files, modified: ' + lastMod + ')')
    })
    onDone(lines.join('\n'))
    return null
  }

  if (operation === 'clean') {
    onDone('Cleaning empty cache directories...')
    let cleaned = 0
    const dirs = readdirSync(DOGEDIR_CACHE, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      const path = join(DOGEDIR_CACHE, dir.name)
      const files = readdirSync(path)
      if (files.length === 0) {
        try { execSync('rm -rf "' + path + '"', { stdio: 'ignore' }); cleaned++ } catch { /* ignore */ }
      }
    }
    onDone('[OK] Cleaned ' + cleaned + ' empty directories')
    return null
  }

  onDone([
    'Cache Manager', '', 'Usage:',
    '  /cache status              Show cache status',
    '  /cache analyze             Analyze cache sizes',
    '  /cache clear <name>        Clear specific cache',
    '  /cache clean               Remove empty cache dirs',
  ].join('\n'))
  return null
}
