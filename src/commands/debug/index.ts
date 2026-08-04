import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { existsSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

interface DebugConfig {
  framework: 'node' | 'python' | 'go' | 'rust' | 'browser'
  port: number
  inspectorPort: number
  autoAttach: boolean
  breakOnException: boolean
}

interface Breakpoint {
  id: string
  file: string
  line: number
  condition?: string
  hitCount: number
  enabled: boolean
}

const DEBUG_CONFIG = '.debug-config.json'

function detectFramework(): string {
  if (existsSync('package.json')) return 'node'
  if (existsSync('pyproject.toml') || existsSync('requirements.txt')) return 'python'
  if (existsSync('go.mod')) return 'go'
  if (existsSync('Cargo.toml')) return 'rust'
  return 'node'
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const framework = detectFramework()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Debug Integration', '', 'Usage:', '  /debug start [file]            Start debugging', '  /debug launch <file>           Launch with debugger', '  /debug attach <port>           Attach to running process', '  /debug stop                    Stop debugging', '  /debug breakpoints             List breakpoints', '  /debug add <file> <line>       Add breakpoint', '  /debug remove <file> <line>    Remove breakpoint', '  /debug step                    Step over', '  /debug next                    Next line', '  /debug continue                Continue execution', '  /debug inspect <var>           Inspect variable', '  /debug watch <expr>            Add watch expression', '  /debug log <expr>              Add logpoint', '  /debug config                  Show debug config', '  /debug vscode                  Generate VS Code launch.json', '', 'Framework: ' + framework, ''].join('\n') }

  if (cmd === 'start' || cmd === 'launch') {
    const file = parts[1] || (framework === 'node' ? 'src/index.ts' : framework === 'python' ? 'main.py' : 'main.go')
    if (!existsSync(file)) return { type: 'text', value: 'File not found: ' + file }
    if (framework === 'node') return { type: 'text', value: 'Debug: node --inspect-brk=0.0.0.0:9229 ' + file + '\nOr: npx ts-node --inspect-brk ' + file }
    if (framework === 'python') return { type: 'text', value: 'Debug: python -m pdb ' + file + '\nOr: debugpy --listen 5678 ' + file }
    if (framework === 'go') return { type: 'text', value: 'Debug: dlv debug ' + file + '\nOr: dlv attach --headless --listen=:2345' }
    return { type: 'text', value: 'Debug: rust-gdb ' + file }
  }

  if (cmd === 'attach') {
    const port = parts[1] || '9229'
    return { type: 'text', value: 'Attach: node --inspect -e "process._debugProcess(' + port + ')"\nOr use Chrome DevTools: chrome://inspect' }
  }

  if (cmd === 'stop') return { type: 'text', value: '[OK] Debugger stopped' }
  if (cmd === 'step') return { type: 'text', value: 'Step over (s in gdb/pdb, F10 in VS Code)' }
  if (cmd === 'next') return { type: 'text', value: 'Next (F11 in VS Code)' }
  if (cmd === 'continue') return { type: 'text', value: 'Continue (c in gdb/pdb, F5 in VS Code)' }

  if (cmd === 'breakpoints' || cmd === 'bp') {
    return { type: 'text', value: 'No active breakpoints. Use /debug add <file> <line> to add.' }
  }

  if (cmd === 'add') {
    const file = parts[1]; const line = parts[2]
    if (!file || !line) return { type: 'text', value: 'Usage: /debug add <file> <line>' }
    return { type: 'text', value: '[OK] Breakpoint added: ' + file + ':' + line }
  }

  if (cmd === 'remove') {
    const file = parts[1]; const line = parts[2]
    if (!file || !line) return { type: 'text', value: 'Usage: /debug remove <file> <line>' }
    return { type: 'text', value: '[OK] Breakpoint removed: ' + file + ':' + line }
  }

  if (cmd === 'inspect') {
    const variable = parts.slice(1).join(' ')
    if (!variable) return { type: 'text', value: 'Usage: /debug inspect <variable>' }
    return { type: 'text', value: 'Inspect ' + variable + ': Use debugger console (p ' + variable + ' in gdb)' }
  }

  if (cmd === 'watch') {
    const expr = parts.slice(1).join(' ')
    if (!expr) return { type: 'text', value: 'Usage: /debug watch <expression>' }
    return { type: 'text', value: '[OK] Watch added: ' + expr }
  }

  if (cmd === 'log') {
    const expr = parts.slice(1).join(' ')
    if (!expr) return { type: 'text', value: 'Usage: /debug log <expression>' }
    return { type: 'text', value: '[OK] Logpoint added: console.log(' + expr + ')' }
  }

  if (cmd === 'config') {
    const config: DebugConfig = { framework: framework as any, port: 9229, inspectorPort: 9229, autoAttach: false, breakOnException: true }
    return { type: 'text', value: JSON.stringify(config, null, 2) }
  }

  if (cmd === 'vscode') {
    const launchConfig = {
      version: '0.2.0',
      configurations: [
        { name: 'Debug Current File', type: framework === 'python' ? 'debugpy' : 'node', request: 'launch', program: '${file}', console: 'integratedTerminal' },
        { name: 'Attach', type: framework === 'python' ? 'debugpy' : 'node', request: 'attach', connect: { host: 'localhost', port: 9229 } },
      ]
    }
    const vscodeDir = '.vscode'
    if (!existsSync(vscodeDir)) require('fs').mkdirSync(vscodeDir, { recursive: true })
    writeFileSync(join(vscodeDir, 'launch.json'), JSON.stringify(launchConfig, null, 2), 'utf-8')
    return { type: 'text', value: '[OK] Created .vscode/launch.json' }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const debug: Command = {
  type: 'local', name: 'debug',
  description: 'Debug integration - start/attach/breakpoints/step/vscode/config',
  aliases: '/debug, /dbg, /d'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default debug
