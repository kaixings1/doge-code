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
      return { type: 'text', value: 'No package.json found' }
    }
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
      const deps = Object.keys(pkg.dependencies || {}).length
      const devDeps = Object.keys(pkg.devDependencies || {}).length
      const lines = [
        'Dependencies',
        '=============',
        '',
        'Package Manager: ' + pm,
        'Dependencies: ' + deps,
        'Dev Dependencies: ' + devDeps,
        'Total: ' + (deps + devDeps),
      ]
      return { type: 'text', value: lines.join('\n') }
    } catch {
      return { type: 'text', value: '[ERROR] Cannot read package.json' }
    }
  }

  if (cmd === 'outdated' || cmd === 'check') {
    const outdated = getOutdatedDeps()
    if (outdated.length === 0) {
      return { type: 'text', value: '[OK] All dependencies are up to date!' }
    }
    const lines = [
      'Outdated Dependencies',
      '=====================',
      '',
      '| Package | Current | Latest | Type |',
      '|---------|---------|--------|------|',
    ]
    outdated.forEach(d => {
      lines.push('| ' + d.name + ' | ' + d.current + ' | ' + d.latest + ' | ' + d.type + ' |')
    })
    lines.push('', 'Use /deps update <package> to update individually')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'update') {
    const pkgName = parts[1]
    if (!pkgName) return { type: 'text', value: 'Usage: /deps update <package>' }
    try {
      const installCmd = pm === 'bun' ? 'bun add' : pm === 'yarn' ? 'yarn add' : pm === 'pnpm' ? 'pnpm add' : 'npm install'
      const output = execSync(installCmd + ' ' + pkgName + ' 2>&1', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      })
      return { type: 'text', value: '[OK] Updated ' + pkgName + '\n' + output.slice(0, 500) }
    } catch (err) {
      return { type: 'text', value: '[ERROR] Update failed: ' + (err instanceof Error ? err.message : String(err)) }
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
          return { type: 'text', value: '[OK] No vulnerabilities found!' }
        }
        const lines = [
          'Security Audit',
          '===============',
          '',
          'Vulnerabilities: ' + vulnCount,
          '',
        ]
        const vulns = data.vulnerabilities || {}
        for (const [name, info] of Object.entries(vulns as Record<string, { severity: string; via: string[] }>)) {
          lines.push(name + ': ' + info.severity)
        }
        return { type: 'text', value: lines.join('\n') }
      }
      return { type: 'text', value: '[OK] No vulnerabilities found!' }
    } catch {
      return { type: 'text', value: '[ERROR] Audit failed' }
    }
  }

  if (cmd === 'add') {
    const pkgName = parts[1]
    if (!pkgName) return { type: 'text', value: 'Usage: /deps add <package>' }
    const isDev = parts.includes('--dev') || parts.includes('-D')
    try {
      const installCmd = pm === 'bun' ? 'bun add' : pm === 'yarn' ? 'yarn add' : pm === 'pnpm' ? 'pnpm add' : 'npm install'
      const devFlag = isDev ? (pm === 'yarn' ? ' -D' : ' --save-dev') : ''
      const output = execSync(installCmd + devFlag + ' ' + pkgName + ' 2>&1', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      })
      return { type: 'text', value: '[OK] Added ' + pkgName + '\n' + output.slice(0, 500) }
    } catch (err) {
      return { type: 'text', value: '[ERROR] Add failed: ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'remove') {
    const pkgName = parts[1]
    if (!pkgName) return { type: 'text', value: 'Usage: /deps remove <package>' }
    try {
      const uninstallCmd = pm === 'bun' ? 'bun remove' : pm === 'yarn' ? 'yarn remove' : pm === 'pnpm' ? 'pnpm remove' : 'npm uninstall'
      const output = execSync(uninstallCmd + ' ' + pkgName + ' 2>&1', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      })
      return { type: 'text', value: '[OK] Removed ' + pkgName + '\n' + output.slice(0, 500) }
    } catch (err) {
      return { type: 'text', value: '[ERROR] Remove failed: ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'help') {
    return { type: 'text', value: [
      'Dependency Management',
      '',
      '📖 📖 Usage: ',
      '  /deps status             Show dependency count',
      '  /deps outdated           Check for outdated packages',
      '  /deps update <pkg>       Update a package',
      '  /deps add <pkg> [--dev]  Add a new package',
      '  /deps remove <pkg>       Remove a package',
      '  /deps audit              Security audit',
      '',
      'Auto-detects: npm/yarn/pnpm/bun',
    ].join('\n') }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const deps: Command = {
  type: 'local',
  name: 'deps',
  description: 'Dependency management - status/outdated/update/add/remove/audit',
  aliases: ['/deps', '/dep', '/packages'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default deps
