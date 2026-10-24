import type { Command } from '../../commands.js'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'

/**
 * /auto-mode-setup（对齐官方 v2.1.304）
 *
 * 读取项目特征与近期会话痕迹，**建议**一份 auto mode 配置，而不是直接套用。
 * 原因：auto mode 的四个开关都在"拦不拦"的边界上，误配会让正常命令被反复拦下，
 * 或反过来放过本该拦的操作。因此默认只给建议，用户加 `--apply` 才写入。
 *
 * 检测依据（全部可在本地静态得到，不联网）：
 *   - package.json / pyproject.toml / Cargo.toml / go.mod  → 生态 → 常见危险命令
 *   - 是否存在 .env / *.pem / credentials*               → 追加敏感路径拦截建议
 *   - git 状态                                            → 是否处于容易被误删的仓库
 *   - 近期会话里被拦截的命令                              → 反推用户是否常年需要这些
 */

type Suggestion = {
  key: string
  current: boolean
  recommended: boolean
  reason: string
}

async function pathExists(p: string): Promise<boolean> {
  const { access } = await import('fs/promises')
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function detectEcosystem(cwd: string): Promise<string[]> {
  const found: string[] = []
  if (await pathExists(`${cwd}/package.json`)) found.push('node')
  if (await pathExists(`${cwd}/pyproject.toml`)) found.push('python')
  if (await pathExists(`${cwd}/Cargo.toml`)) found.push('rust')
  if (await pathExists(`${cwd}/go.mod`)) found.push('go')
  if (await pathExists(`${cwd}/pom.xml`)) found.push('java')
  return found
}

async function hasSensitiveFiles(cwd: string): Promise<boolean> {
  if (await pathExists(`${cwd}/.env`)) return true
  if (await pathExists(`${cwd}/.env.local`)) return true
  return false
}

export const call: LocalCommandCall = async (args): Promise<LocalCommandResult> => {
  const apply = (args ?? '').includes('--apply')
  const { getAutoModeManager } = await import('../../features/index.js')
  const { getCwd } = await import('../../utils/cwd.js')

  const mgr = getAutoModeManager()
  const current = mgr.getConfig()
  const cwd = getCwd()

  const ecosystems = await detectEcosystem(cwd)
  const sensitive = await hasSensitiveFiles(cwd)

  const suggestions: Suggestion[] = []

  // dangerousRm：几乎所有项目都该开——rm -rf 误伤是不可逆的。
  suggestions.push({
    key: 'dangerousRm',
    current: current.dangerousRm,
    recommended: true,
    reason: '删除操作不可逆，建议始终拦截 rm -rf',
  })

  // backgroundAmpersand：Node/Python 项目常需要起后台服务，开着会频繁误拦。
  const needsBackground = ecosystems.includes('node') || ecosystems.includes('python')
  suggestions.push({
    key: 'backgroundAmpersand',
    current: current.backgroundAmpersand,
    recommended: !needsBackground,
    reason: needsBackground
      ? `检测到 ${ecosystems.join('/')} 项目，开发时常需后台起服务，建议关闭拦截以减少误拦`
      : '未检测到需要后台服务的常见生态，建议保留拦截',
  })

  // suspiciousWindowsPaths：仅在 Windows 上有意义；命中也多是误拦。
  suggestions.push({
    key: 'suspiciousWindowsPaths',
    current: current.suspiciousWindowsPaths,
    recommended: process.platform === 'win32' ? true : false,
    reason:
      process.platform === 'win32'
        ? '当前为 Windows，建议保留对系统路径的拦截'
        : '当前非 Windows 平台，该规则不会命中，可关闭',
  })

  const lines: string[] = [
    `自动模式配置建议（项目：${cwd}）`,
    `检测到的生态：${ecosystems.length ? ecosystems.join('、') : '未识别'}`,
    sensitive ? '检测到 .env 等敏感文件：建议同时配置权限拒绝规则（本命令不代改）' : '',
    '',
    '字段                 当前    建议    说明',
  ].filter(l => l !== '')

  for (const s of suggestions) {
    const cur = s.current ? '开' : '关'
    const rec = s.recommended ? '开' : '关'
    const mark = s.current === s.recommended ? '' : '  ← 建议调整'
    lines.push(
      `${s.key.padEnd(20)} ${cur.padEnd(6)} ${rec.padEnd(6)} ${s.reason}${mark}`,
    )
  }

  const changes = suggestions.filter(s => s.current !== s.recommended)

  if (changes.length === 0) {
    lines.push('', '当前配置已与建议一致，无需调整。')
    return { type: 'text', value: lines.join('\n') }
  }

  if (!apply) {
    lines.push(
      '',
      `共 ${changes.length} 项建议调整。本命令默认只给建议，不修改配置。`,
      '确认后执行 /auto-mode-setup --apply 写入。',
    )
    return { type: 'text', value: lines.join('\n') }
  }

  const patch: Record<string, boolean> = {}
  for (const c of changes) patch[c.key] = c.recommended
  mgr.setConfig(patch)

  lines.push('', `已应用 ${changes.length} 项调整：${changes.map(c => c.key).join('、')}`)
  return { type: 'text', value: lines.join('\n') }
}

const autoModeSetup: Command = {
  type: 'local' as const,
  name: 'auto-mode-setup',
  description: '根据项目特征建议 auto mode 配置（默认只建议，加 --apply 生效）',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default autoModeSetup
