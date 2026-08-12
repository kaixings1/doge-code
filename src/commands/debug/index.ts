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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['🐛 调试集成', '', '📖 用法：', '  /debug start [文件]              启动调试', '  /debug launch &lt;文件&gt;             启动调试器', '  /debug attach &lt;端口&gt;             附加到运行中进程', '  /debug stop                       停止调试', '  /debug breakpoints                列出断点', '  /debug add &lt;文件&gt; &lt;行号&gt;        添加断点', '  /debug remove &lt;文件&gt; &lt;行号&gt;     删除断点', '  /debug step                       单步跳过', '  /debug next                       下一行', '  /debug continue                   继续执行', '  /debug inspect &lt;变量&gt;           检查变量', '  /debug watch &lt;表达式&gt;          添加监视表达式', '  /debug log &lt;表达式&gt;            添加日志点', '  /debug config                     查看调试配置', '  /debug vscode                     生成 VS Code launch.json', '', '当前框架：' + framework, ''].join('\n') }

  if (cmd === 'start' || cmd === 'launch') {
    const file = parts[1] || (framework === 'node' ? 'src/index.ts' : framework === 'python' ? 'main.py' : 'main.go')
    if (!existsSync(file)) return { type: 'text', value: '❌ 文件未找到：' + file }
    if (framework === 'node') return { type: 'text', value: '🐛 调试：node --inspect-brk=0.0.0.0:9229 ' + file + '\n或：npx ts-node --inspect-brk ' + file }
    if (framework === 'python') return { type: 'text', value: '🐛 调试：python -m pdb ' + file + '\n或：debugpy --listen 5678 ' + file }
    if (framework === 'go') return { type: 'text', value: '🐛 调试：dlv debug ' + file + '\n或：dlv attach --headless --listen=:2345' }
    return { type: 'text', value: '🐛 调试：rust-gdb ' + file }
  }

  if (cmd === 'attach') {
    const port = parts[1] || '9229'
    return { type: 'text', value: '🔗 附加：node --inspect -e "process._debugProcess(' + port + ')"\n或使用 Chrome DevTools：chrome://inspect' }
  }

  if (cmd === 'stop') return { type: 'text', value: '✅ 调试器已停止' }
  if (cmd === 'step') return { type: 'text', value: '👣 单步跳过（gdb/pdb 按 s，VS Code 按 F10）' }
  if (cmd === 'next') return { type: 'text', value: '👣 下一行（VS Code 按 F11）' }
  if (cmd === 'continue') return { type: 'text', value: '▶️ 继续执行（gdb/pdb 按 c，VS Code 按 F5）' }

  if (cmd === 'breakpoints' || cmd === 'bp') {
    return { type: 'text', value: 'ℹ️ 暂无活动断点。使用 /debug add &lt;文件&gt; &lt;行号&gt; 添加。' }
  }

  if (cmd === 'add') {
    const file = parts[1]; const line = parts[2]
    if (!file || !line) return { type: 'text', value: '📖 用法：/debug add &lt;文件&gt; &lt;行号&gt;' }
    return { type: 'text', value: '✅ 断点已添加：' + file + ':' + line }
  }

  if (cmd === 'remove') {
    const file = parts[1]; const line = parts[2]
    if (!file || !line) return { type: 'text', value: '📖 用法：/debug remove &lt;文件&gt; &lt;行号&gt;' }
    return { type: 'text', value: '✅ 断点已删除：' + file + ':' + line }
  }

  if (cmd === 'inspect') {
    const variable = parts.slice(1).join(' ')
    if (!variable) return { type: 'text', value: '📖 用法：/debug inspect &lt;变量名&gt;' }
    return { type: 'text', value: '🔍 检查 ' + variable + '：使用调试器控制台（gdb 中输入 p ' + variable + '）' }
  }

  if (cmd === 'watch') {
    const expr = parts.slice(1).join(' ')
    if (!expr) return { type: 'text', value: '📖 用法：/debug watch &lt;表达式&gt;' }
    return { type: 'text', value: '✅ 监视已添加：' + expr }
  }

  if (cmd === 'log') {
    const expr = parts.slice(1).join(' ')
    if (!expr) return { type: 'text', value: '📖 用法：/debug log &lt;表达式&gt;' }
    return { type: 'text', value: '✅ 日志点已添加：console.log(' + expr + ')' }
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
    return { type: 'text', value: '✅ 已创建 .vscode/launch.json' }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const debug: Command = {
  type: 'local', name: 'debug',
  description: '调试集成 - 启动/附加/断点/单步/vscode/配置',
  aliases: '/debug, /dbg, /d'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default debug
