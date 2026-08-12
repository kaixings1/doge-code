import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface DependencyInfo {
  name: string
  current: string
  latest: string
  type: 'dependency' | 'devDependency'
  outdated: boolean
  deprecated: boolean
}

function detectPackageManager(): 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown' {
  if (existsSync('bun.lockb')) return 'bun'
  if (existsSync('pnpm-lock.yaml')) return 'pnpm'
  if (existsSync('yarn.lock')) return 'yarn'
  if (existsSync('package-lock.json')) return 'npm'
  if (existsSync('package.json')) return 'npm'
  return 'unknown'
}

function getOutdatedDeps(): DependencyInfo[] {
  const deps: DependencyInfo[] = []
  try {
    const output = execSync('npm outdated --json 2>/dev/null || true', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    if (output.trim()) {
      const data = JSON.parse(output)
      for (const [name, info] of Object.entries(data as Record<string, { current: string; latest: string; type: string }>)) {
        deps.push({
          name,
          current: info.current || 'unknown',
          latest: info.latest || 'unknown',
          type: info.type || 'dependency',
          outdated: info.current !== info.latest,
          deprecated: false,
        })
      }
    }
  } catch { /* ignore */ }
  return deps
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'status'
  const pm = detectPackageManager()

  if (cmd === 'status' || cmd === '' || cmd === 'list') {
    if (!existsSync('package.json')) {
      return { type: 'text', value: 'ℹ️ 未找到 package.json' }
    }
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
      const deps = Object.keys(pkg.dependencies || {}).length
      const devDeps = Object.keys(pkg.devDependencies || {}).length
      const lines = [
        '📦 依赖管理',
        '═══════════',
        '',
        '📋 包管理器：' + pm,
        '📌 依赖：' + deps,
        '🔧 开发依赖：' + devDeps,
        '📊 总计：' + (deps + devDeps),
      ]
      return { type: 'text', value: lines.join('\n') }
    } catch {
      return { type: 'text', value: '❌ 无法读取 package.json' }
    }
  }

  if (cmd === 'outdated' || cmd === 'check') {
    const outdated = getOutdatedDeps()
    if (outdated.length === 0) {
      return { type: 'text', value: '✅ 所有依赖均为最新版本！' }
    }
    const lines = [
      '📦 过期依赖',
      '════════════',
      '',
      '| 包名 | 当前版本 | 最新版本 | 类型 |',
      '|------|---------|--------|------|',
    ]
    outdated.forEach(d => {
      lines.push('| ' + d.name + ' | ' + d.current + ' | ' + d.latest + ' | ' + d.type + ' |')
    })
    lines.push('', '💡 使用 /deps update <包名> 逐个更新')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'update') {
    const pkgName = parts[1]
    if (!pkgName) return { type: 'text', value: '📖 用法：/deps update <包名>' }
    try {
      const installCmd = pm === 'bun' ? 'bun add' : pm === 'yarn' ? 'yarn add' : pm === 'pnpm' ? 'pnpm add' : 'npm install'
      const output = execSync(installCmd + ' ' + pkgName + ' 2>&1', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      })
      return { type: 'text', value: '✅ 已更新 ' + pkgName + '\n' + output.slice(0, 500) }
    } catch (err) {
      return { type: 'text', value: '❌ 更新失败：' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'audit') {
    try {
      const output = execSync('npm audit --json 2>/dev/null || true', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      })
      if (output.trim()) {
        const data = JSON.parse(output)
        const vulnCount = data.metadata?.vulnerabilities?.total || 0
        if (vulnCount === 0) {
          return { type: 'text', value: '✅ 未发现安全漏洞！' }
        }
        const lines = [
          '🔒 安全审计',
          '════════════',
          '',
          '漏洞数：' + vulnCount,
          '',
        ]
        const vulns = data.vulnerabilities || {}
        for (const [name, info] of Object.entries(vulns as Record<string, { severity: string; via: string[] }>)) {
          lines.push(name + ': ' + info.severity)
        }
        return { type: 'text', value: lines.join('\n') }
      }
      return { type: 'text', value: '✅ 未发现安全漏洞！' }
    } catch {
      return { type: 'text', value: '❌ 审计失败' }
    }
  }

  if (cmd === 'add') {
    const pkgName = parts[1]
    if (!pkgName) return { type: 'text', value: '📖 用法：/deps add <包名>' }
    const isDev = parts.includes('--dev') || parts.includes('-D')
    try {
      const installCmd = pm === 'bun' ? 'bun add' : pm === 'yarn' ? 'yarn add' : pm === 'pnpm' ? 'pnpm add' : 'npm install'
      const devFlag = isDev ? (pm === 'yarn' ? ' -D' : ' --save-dev') : ''
      const output = execSync(installCmd + devFlag + ' ' + pkgName + ' 2>&1', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      })
      return { type: 'text', value: '✅ 已添加 ' + pkgName + '\n' + output.slice(0, 500) }
    } catch (err) {
      return { type: 'text', value: '❌ 添加失败：' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'remove') {
    const pkgName = parts[1]
    if (!pkgName) return { type: 'text', value: '📖 用法：/deps remove <包名>' }
    try {
      const uninstallCmd = pm === 'bun' ? 'bun remove' : pm === 'yarn' ? 'yarn remove' : pm === 'pnpm' ? 'pnpm remove' : 'npm uninstall'
      const output = execSync(uninstallCmd + ' ' + pkgName + ' 2>&1', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      })
      return { type: 'text', value: '✅ 已移除 ' + pkgName + '\n' + output.slice(0, 500) }
    } catch (err) {
      return { type: 'text', value: '❌ 移除失败：' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'help') {
    return { type: 'text', value: [
      '📦 依赖管理',
      '',
      '📖 用法：',
      '  /deps status             查看依赖数量',
      '  /deps outdated           检查过期依赖',
      '  /deps update <包名>       更新包',
      '  /deps add <包名> [--dev]  添加新包',
      '  /deps remove <包名>       移除包',
      '  /deps audit              安全审计',
      '',
      '自动检测：npm/yarn/pnpm/bun',
    ].join('\n') }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const deps: Command = {
  type: 'local',
  name: 'deps',
  description: '📦 依赖管理 - 状态/过期/更新/添加/移除/审计',
  aliases: ['/deps', '/dep', '/packages'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default deps
