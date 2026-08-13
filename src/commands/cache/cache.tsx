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
      onDone('❌ 未找到 .doge 目录。缓存为空。')
      return null
    }
    const caches = findCaches(DOGEDIR_CACHE)
    if (caches.length === 0) {
      onDone('ℹ️ 未找到缓存。')
      return null
    }
    const lines = ['📊 缓存状态：', '═══════════', '']
    let totalSize = 0
    let totalEntries = 0
    caches.forEach(c => {
      totalSize += c.size
      totalEntries += c.entries
      lines.push(c.name + ': ' + (c.size / 1024).toFixed(1) + ' KB, ' + c.entries + ' 个文件')
    })
    lines.push('', '合计：' + (totalSize / 1024).toFixed(1) + ' KB, ' + totalEntries + ' 个文件')
    onDone(lines.join('\n'))
    return null
  }

  if (operation === 'clear') {
    const cacheName = target
    if (cacheName === 'all') {
      onDone('⚠️ 确定要清除所有缓存？这将删除所有 .doge 数据。请使用��体缓存名或 "all --force"。')
      return null
    }
    const cachePath = join(DOGEDIR_CACHE, cacheName)
    if (!existsSync(cachePath)) {
      onDone('❌ 未找到缓存：' + cacheName)
      return null
    }
    try {
      execSync('rm -rf "' + cachePath + '"', { stdio: 'ignore' })
      onDone('✅ 已清除缓存：' + cacheName)
    } catch {
      onDone('❌ 清除失败：' + cacheName)
    }
    return null
  }

  if (operation === 'analyze' || operation === 'stats') {
    const caches = findCaches(DOGEDIR_CACHE)
    const lines = ['📊 缓存分析：', '════════════', '']
    caches.sort((a, b) => b.size - a.size).forEach(c => {
      const sizeKB = (c.size / 1024).toFixed(1)
      const lastMod = c.lastModified.slice(0, 19)
      lines.push(c.name + ': ' + sizeKB + ' KB (' + c.entries + ' 个文件, 修改时间: ' + lastMod + ')')
    })
    onDone(lines.join('\n'))
    return null
  }

  if (operation === 'clean') {
    onDone('🧹 正在清理空缓存目录...')
    let cleaned = 0
    const dirs = readdirSync(DOGEDIR_CACHE, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      const path = join(DOGEDIR_CACHE, dir.name)
      const files = readdirSync(path)
      if (files.length === 0) {
        try { execSync('rm -rf "' + path + '"', { stdio: 'ignore' }); cleaned++ } catch { /* ignore */ }
      }
    }
    onDone('✅ 已清理 ' + cleaned + ' 个空目录')
    return null
  }

  onDone([
    '🗄️ 缓存管理器', '', '📖 用法：',
    '  /cache status              显示缓存状态',
    '  /cache analyze             分析缓存大小',
    '  /cache clear <name>        清除指定缓存',
    '  /cache clean               删除空缓存目录',
  ].join('\n'))
  return null
}
