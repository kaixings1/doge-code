import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const UP_SECTION_HEADING = /^#{1,6}\s+claude\s+up\s*$/im

/**
 * 向上查找最近的 CLAUDE.md / CLAUDE.local.md
 * @internal 导出以支持单元测试
 */
export function findClaudeMd(startDir: string): string | null {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    for (const name of ['CLAUDE.local.md', 'CLAUDE.md']) {
      const p = join(dir, name)
      if (existsSync(p)) return p
    }
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * 提取 `# claude up` 节（到下一个同/上级标题为止）
 * @internal 导出以支持单元测试
 */
export function extractUpSection(content: string): string | null {
  const lines = content.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (UP_SECTION_HEADING.test(lines[i])) {
      start = i + 1
      break
    }
  }
  if (start === -1) return null

  // 收集到下一个标题（#、##、###）为止
  const section: string[] = []
  for (let i = start; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) break
    section.push(lines[i])
  }
  return section.join('\n')
}

/**
 * 提取节内的可执行命令（bash 代码块或缩进行）
 * @internal 导出以支持单元测试
 */
export function extractCommands(section: string): string[] {
  const commands: string[] = []
  // ```bash ... ``` 代码块
  const blockRegex = /```(?:bash|sh|shell)?\s*\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = blockRegex.exec(section)) !== null) {
    for (const line of m[1].split('\n')) {
      const t = line.trim()
      if (t && !t.startsWith('#')) commands.push(t)
    }
  }
  // 普通指令行（以 $ 前缀或非注释文本）
  if (commands.length === 0) {
    for (const line of section.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const cleaned = t.startsWith('$ ') ? t.slice(2).trim() : t
      if (cleaned) commands.push(cleaned)
    }
  }
  return commands
}

/**
 * `claude up` — 运行 CLAUDE.md 中 `# claude up` 指令节的设置指令。
 */
export async function up(): Promise<void> {
  const claudeMd = findClaudeMd(process.cwd())
  if (!claudeMd) {
    console.log('未找到 CLAUDE.md，跳过 "claude up"')
    return
  }
  const content = readFileSync(claudeMd, 'utf-8')
  const section = extractUpSection(content)
  if (!section) {
    console.log(`CLAUDE.md（${claudeMd}）中没有 "# claude up" 指令节，跳过`)
    return
  }
  const commands = extractCommands(section)
  if (commands.length === 0) {
    console.log('"# claude up" 节中没有可执行的命令')
    return
  }

  console.log(`执行 "# claude up" 指令（${commands.length} 条，来自 ${claudeMd}）：`)
  let failed = 0
  for (const cmd of commands) {
    try {
      console.log(`$ ${cmd}`)
      const out = execSync(cmd, {
        encoding: 'utf-8',
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
      })
      if (out.trim()) console.log(out.trim())
    } catch (err: any) {
      failed++
      console.error(`执行失败: ${cmd}`)
      console.error(err.stderr?.toString().trim() || err.message)
    }
  }
  if (failed > 0) {
    console.error(`完成：${commands.length - failed}/${commands.length} 成功，${failed} 失败`)
    process.exitCode = 1
  } else {
    console.log(`完成：全部 ${commands.length} 条指令执行成功`)
  }
}
