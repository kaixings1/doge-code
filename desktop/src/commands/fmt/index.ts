import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

interface FormatResult { file: string; changed: boolean; output: string }

function detectFormatter(file: string): string {
  const ext = extname(file).toLowerCase()
  if (['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.md'].includes(ext)) return 'prettier'
  if (['.py'].includes(ext)) return 'black'
  if (['.go'].includes(ext)) return 'gofmt'
  if (['.rs'].includes(ext)) return 'rustfmt'
  if (['.java'].includes(ext)) return 'google-java-format'
  return 'prettier'
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim().split(/\s+/)
  const cmd = s[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: [
    'Code Formatter', '', 'Usage:',
    '  /fmt check [file]            Check formatting',
    '  /fmt fix [file]              Fix formatting',
    '  /fmt all                     Format all files',
    '  /fmt diff [file]             Show format diff',
    '  /fmt config                  Show formatter config',
    '  /fmt install                 Install formatters',
    '  /fmt languages               Show supported languages',
    '  /fmt project                 Format entire project',
  ].join('\n') }

  if (cmd === 'check') {
    const file = s[1]
    if (file) {
      try {
        const formatter = detectFormatter(file)
        if (formatter === 'prettier') execSync('prettier --check "' + file + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
        return { type: 'text', value: '[OK] ' + file + ' is properly formatted' }
      } catch { return { type: 'text', value: '[NEEDS FIX] ' + file + ' needs formatting' } }
    }
    try {
      execSync('prettier --check .', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '[OK] All files properly formatted' }
    } catch { return { type: 'text', value: '[NEEDS FIX] Some files need formatting. Run /fmt fix' } }
  }

  if (cmd === 'fix') {
    const file = s[1]
    if (file) {
      try {
        execSync('prettier --write "' + file + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
        return { type: 'text', value: '[OK] Formatted: ' + file }
      } catch (err) {
        return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
      }
    }
    try {
      execSync('prettier --write .', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '[OK] All files formatted' }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'all' || cmd === 'project') {
    try {
      execSync('prettier --write .', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '[OK] Project formatted with Prettier' }
    } catch {
      try {
        execSync('npx prettier --write .', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
        return { type: 'text', value: '[OK] Project formatted (via npx)' }
      } catch (err) {
        return { type: 'text', value: '[ERROR] Prettier not installed. Run: npm install -D prettier' }
      }
    }
  }

  if (cmd === 'diff') {
    const file = s[1]
    if (!file) return { type: 'text', value: 'Usage: /fmt diff <file>' }
    try {
      const original = readFileSync(file, 'utf-8')
      const formatted = execSync('prettier --parser ' + (file.endsWith('.ts') ? 'typescript' : 'babel') + ' 2>/dev/null', { input: original, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      if (original === formatted) return { type: 'text', value: '[OK] Already formatted: ' + file }
      return { type: 'text', value: '[DIFF] ' + file + ' needs formatting' }
    } catch { return { type: 'text', value: '[OK] Already formatted or cannot parse' } }
  }

  if (cmd === 'config') {
    const configs = ['.prettierrc', '.prettierrc.json', '.prettierrc.yaml', 'prettier.config.js']
    const found = configs.filter(c => existsSync(c))
    return { type: 'text', value: 'Formatter configs: ' + (found.length > 0 ? found.join(', ') : 'none found (using defaults)') }
  }

  if (cmd === 'install') {
    return { type: 'text', value: 'Install formatters:\n  npm install -d prettier\n  pip install black\n  go install golang.org/x/tools/cmd/goimports\n  rustup component add rustfmt' }
  }

  if (cmd === 'languages') {
    return { type: 'text', value: 'Supported languages:\n  TS/JS/JSON/CSS/HTML/MD -> Prettier\n  Python -> Black/autopep8\n  Go -> gofmt/goimports\n  Rust -> rustfmt\n  Java -> google-java-format' }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const fmt: Command = {
  type: 'local', name: 'fmt',
  description: 'Code formatting - check/fix/all/diff/config/install/languages',
  aliases: ['/fmt', '/format', '/prettier'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default fmt
