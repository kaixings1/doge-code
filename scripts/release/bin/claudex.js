#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const entrypoint = join(packageRoot, 'src', 'bootstrap-entry.ts')
const bunExecutable = process.env.BUN_EXE || 'bun'
const packageName = getPackageName()

const result = spawnSync(
  '/bin/bash',
  [
    '-lc',
    'exec "$1" run "$2" "${@:3}"',
    'claudex',
    bunExecutable,
    entrypoint,
    ...process.argv.slice(2),
  ],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      CLAUDE_CODE_BIN_NAME: 'claudex',
      CLAUDE_CODE_PACKAGE_NAME: packageName,
    },
  },
)

if (result.error?.code === 'ENOENT') {
  console.error(
    'Bun is required to run claudex. Install Bun first: https://bun.sh/',
  )
  process.exit(1)
}

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)

function getPackageName() {
  const configured = process.env.CLAUDE_CODE_PACKAGE_NAME?.trim()
  if (configured) {
    return configured
  }

  try {
    const packageJson = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf8'),
    )
    if (typeof packageJson?.name === 'string' && packageJson.name.trim()) {
      return packageJson.name.trim()
    }
  } catch {}

  return '@zyycn/claudex'
}
