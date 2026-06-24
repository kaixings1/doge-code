/**
 * Skill Bundles — alias that loads multiple skills under one command
 *
 * Inspired by Hermes Agent's skill_bundles.py.
 *
 * A skill bundle groups several skills into a single compound command.
 * Invoking /<bundle-name> loads all referenced skills at once.
 *
 * Bundles are YAML files stored in DOGE_HOME/skills/bundles/
 *
 * Example bundle file (backend-dev.yaml):
 *   name: backend-dev
 *   description: Backend feature work
 *   skills:
 *     - tdd
 *     - codebase-design
 *     - implement
 *
 * The bundle wins if it shares a name with a skill (user explicitly wants
 * the bundle).
 */

import { readdir, readFile, writeFile, rename, mkdir } from 'fs/promises'
import { join, dirname, basename, extname } from 'path'
import { existsSync } from 'fs'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { logForDebugging } from '../../utils/debug.js'

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
    'This bundle activates the following skills. Execute each in sequence:',
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
import { registerBundledSkill } from '../bundledSkills.js'

export function registerSkillBundleCommand(): void {
  registerBundledSkill({
    name: 'skill-bundle',
    description: 'Create, list, and manage skill bundles — groups of skills invoked together.',
    whenToUse: 'When you frequently use the same set of skills together and want a single command to activate them all.',
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
          return [{ type: 'text', text: 'No skill bundles defined.\n\nCreate one with: /skill-bundle create my-bundle\nThen describe which skills to include.' }]
        }
        const lines = ['## Skill Bundles', '']
        for (const [name, b] of bundles) {
          lines.push('- ' + name + ': ' + b.description)
          lines.push('  Skills: ' + b.skills.join(', '))
        }
        return [{ type: 'text', text: lines.join('\n') }]
      }

      if (action === 'show') {
        const name = parts[1]
        if (!name) return [{ type: 'text', text: 'Usage: /skill-bundle show <name>' }]
        const bundle = await getBundle(name)
        if (!bundle) return [{ type: 'text', text: 'Bundle "' + name + '" not found.' }]
        const msg = await buildBundleMessage(bundle)
        return [{ type: 'text', text: msg }]
      }

      if (action === 'delete') {
        const name = parts[1]
        if (!name) return [{ type: 'text', text: 'Usage: /skill-bundle delete <name>' }]
        const ok = await deleteBundle(name)
        return [{ type: 'text', text: ok ? 'Deleted bundle "' + name + '".' : 'Bundle "' + name + '" not found.' }]
      }

      if (action === 'create') {
        const name = parts[1]
        if (!name) return [{ type: 'text', text: 'Usage: /skill-bundle create <name>\nThen use /skill-bundle edit to add skills.' }]
        const existing = await getBundle(name)
        if (existing) return [{ type: 'text', text: 'Bundle "' + name + '" already exists. Use /skill-bundle delete first to replace it.' }]
        await saveBundle({
          name,
          description: 'A skill bundle',
          skills: [],
        })
        return [{ type: 'text', text: 'Created bundle "' + name + '". Edit it at: ' + bundlePath(name) }]
      }

      return [{
        type: 'text',
        text: 'Usage:\n  /skill-bundle list              — list bundles\n  /skill-bundle show <name>      — show bundle\n  /skill-bundle create <name>    — create bundle\n  /skill-bundle delete <name>    — delete bundle\n\nTo edit a bundle, modify the JSON file directly at:\n' + bundlesDir(),
      }]
    },
  })
}
