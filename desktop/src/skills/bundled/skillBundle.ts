/**
 * Skill Bundles — alias that loads multiple skills under one command
 *
 * Inspired by Hermes Agent's skill_bundles.py.
 *
 * A skill bundle groups several skills into a single compound command.
 * Invoking /<bundle-name> loads all referenced skills at once.
 *
 * Bundles are JSON files stored in DOGE_HOME/skills/bundles/
 *
 * Example bundle file (backend-dev.json):
 *   {
 *     "name": "backend-dev",
 *     "description": "Backend feature work",
 *     "skills": ["tdd", "codebase-design", "implement"]
 *   }
 *
 * The bundle wins if it shares a name with a skill (user explicitly wants
 * the bundle).
 */

import { readdir, readFile, writeFile, rename, mkdir } from 'fs/promises'
import { join, dirname, basename, extname } from 'path'
import { existsSync } from 'fs'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { logForDebugging } from '../../utils/debug.js'
import { registerBundledSkill } from '../bundledSkills.js'

export type SkillBundle = {
  name: string
  description: string
  skills: string[]
  instruction?: string
}

function bundlesDir(): string {
  return join(getClaudeConfigHomeDir(), 'skills', 'bundles')
}

function bundlePath(name: string): string {
  return join(bundlesDir(), name + '.json')
}

/** Parse a JSON bundle file (we use JSON instead of YAML to avoid deps). */
function parseBundle(raw: string): SkillBundle | null {
  try {
    const data = JSON.parse(raw) as SkillBundle
    if (!data.name || !Array.isArray(data.skills)) return null
    return data
  } catch {
    return null
  }
}

/** Load all skill bundles from disk. */
export async function getBundles(): Promise<Map<string, SkillBundle>> {
  const result = new Map<string, SkillBundle>()
  const dir = bundlesDir()
  try {
    const files = await readdir(dir)
    for (const file of files) {
      if (extname(file) !== '.json') continue
      const raw = await readFile(join(dir, file), 'utf-8')
      const bundle = parseBundle(raw)
      if (bundle) {
        result.set(bundle.name, bundle)
      }
    }
  } catch {
    // Directory doesn't exist yet
  }
  return result
}

/** Get a single bundle by name. */
export async function getBundle(name: string): Promise<SkillBundle | null> {
  const path = bundlePath(name)
  try {
    if (!existsSync(path)) return null
    const raw = await readFile(path, 'utf-8')
    return parseBundle(raw)
  } catch {
    return null
  }
}

/** Save a bundle to disk. */
export async function saveBundle(bundle: SkillBundle): Promise<void> {
  const dir = bundlesDir()
  await mkdir(dir, { recursive: true })
  const path = bundlePath(bundle.name)
  const tmp = path + '.tmp'
  await writeFile(tmp, JSON.stringify(bundle, null, 2), 'utf-8')
  await rename(tmp, path)
  logForDebugging('[skillBundle] Saved bundle: ' + bundle.name)
}

/** Delete a bundle. */
export async function deleteBundle(name: string): Promise<boolean> {
  try {
    const path = bundlePath(name)
    if (!existsSync(path)) return false
    const { unlink } = await import('fs/promises')
    await unlink(path)
    return true
  } catch {
    return false
  }
}

/** Build a combined prompt message for a bundle. */
export async function buildBundleMessage(
  bundle: SkillBundle,
): Promise<string> {
  const lines: string[] = [
    '# Skill Bundle: ' + bundle.name,
    '',
    bundle.description,
    '',
  ]

  if (bundle.instruction) {
    lines.push(bundle.instruction, '')
  }

  lines.push(
    '本 bundle 激活以下技能。按顺序执行每个技能：',
    '',
  )

  for (const skill of bundle.skills) {
    lines.push('- /' + skill)
  }

  return lines.join('\n')
}

/**
 * Register the /skill-bundle command
 */
export function registerSkillBundleCommand(): void {
  registerBundledSkill({
    name: 'skill-bundle',
    description: '创建、列出和管理技能 bundle——一组一起调用的技能。',
    whenToUse: '当你经常一起使用同一组技能，并希望用一个命令激活它们时。',
    argumentHint: '[create <name>|list|delete <name>|show <name>]',
    userInvocable: true,
    disableModelInvocation: true,
    async getPromptForCommand(args) {
      const trimmed = args.trim()
      const parts = trimmed.split(/\s+/)
      const action = parts[0]

      if (!trimmed || action === 'list') {
        const bundles = await getBundles()
        if (bundles.size === 0) {
          return [{ type: 'text', text: '未定义技能 bundle。\n\n使用以下命令创建一个：/skill-bundle create my-bundle\n然后描述要包含哪些技能。' }]
        }
        const lines = ['## 技能 Bundles', '']
        for (const [name, b] of bundles) {
          lines.push('- ' + name + ': ' + b.description)
          lines.push('  Skills: ' + b.skills.join(', '))
        }
        return [{ type: 'text', text: lines.join('\n') }]
      }

      if (action === 'show') {
        const name = parts[1]
        if (!name) return [{ type: 'text', text: ' 用法: /skill-bundle show <name>' }]
        const bundle = await getBundle(name)
        if (!bundle) return [{ type: 'text', text: 'Bundle "' + name + '" 未找到。' }]
        const msg = await buildBundleMessage(bundle)
        return [{ type: 'text', text: msg }]
      }

      if (action === 'delete') {
        const name = parts[1]
        if (!name) return [{ type: 'text', text: ' 用法: /skill-bundle delete <name>' }]
        const ok = await deleteBundle(name)
        return [{ type: 'text', text: ok ? '已删除 bundle "' + name + '"。' : 'Bundle "' + name + '" 未找到。' }]
      }

      if (action === 'create') {
        const name = parts[1]
        if (!name) return [{ type: 'text', text: ' 用法: /skill-bundle create <name>\n然后使用 /skill-bundle edit 添加技能。' }]
        const existing = await getBundle(name)
        if (existing) return [{ type: 'text', text: 'Bundle "' + name + '" 已存在。首先使用 /skill-bundle delete 删除它以替换。' }]
        await saveBundle({
          name,
          description: '一个技能 bundle',
          skills: [],
        })
        return [{ type: 'text', text: '已创建 bundle "' + name + '"。在以下位置编辑它：' + bundlePath(name) }]
      }

      return [{
        type: 'text',
        text: ' 用法: \n  /skill-bundle list              — 列出 bundles\n  /skill-bundle show <name>      — 显示 bundle\n  /skill-bundle create <name>    — 创建 bundle\n  /skill-bundle delete <name>    — 删除 bundle\n\n要编辑 bundle，直接在以下位置修改 JSON 文件：\n' + bundlesDir(),
      }]
    },
  })
}
