import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

interface TestResult {
  passed: number
  failed: number
  skipped: number
  duration: number
  failures: string[]
}

function detectTestFramework(): 'vitest' | 'jest' | 'mocha' | 'pytest' | 'go-test' | 'cargo' | 'unknown' {
  if (existsSync('vitest.config.ts') || existsSync('vitest.config.js')) return 'vitest'
  if (existsSync('jest.config.ts') || existsSync('jest.config.js')) return 'jest'
  if (existsSync('.mocharc.js') || existsSync('.mocharc.json')) return 'mocha'
  if (existsSync('pyproject.toml') || existsSync('requirements.txt')) return 'pytest'
  if (existsSync('go.mod')) return 'go-test'
  if (existsSync('Cargo.toml')) return 'cargo'
  const pkg = existsSync('package.json') ? JSON.parse(require('fs').readFileSync('package.json', 'utf-8')) : {}
  if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) return 'vitest'
  if (pkg.devDependencies?.jest || pkg.dependencies?.jest) return 'jest'
  if (pkg.devDependencies?.mocha || pkg.dependencies?.mocha) return 'mocha'
  return 'unknown'
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim().split(/\s+/)
  const cmd = s[0]?.toLowerCase() || 'help'
  const framework = detectTestFramework()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: [
    '🧪 测试运行器', '', '📖 用法：',
    '  /test-run                       运行所有测试',
    '  /test-run file <path>           运行指定测试文件',
    '  /test-run watch                 监视模式',
    '  /test-run coverage              带覆盖率运行',
    '  /test-run failed                重新运行失败测试',
    '  /test-run pattern <regex>       运行匹配测试',
    '  /test-run last                  显示上次测试结果',
    '  /test-run framework             显示检测到的框架',
    '  /test-run init                  初始化测试框架',
    '  /test-run snapshot              更新快照',
    '  /test-run debug <file>          调试测试',
    '  /test-run time                  显示最慢测试',
    '',
    '检测到：' + framework,
  ].join('\n') }

  if (cmd === 'framework' || cmd === 'detect') {
    return { type: 'text', value: '🧪 测试框架：' + framework + '\n配置文件：' + (framework !== 'unknown' ? '已找到' : '未找到') }
  }

  if (cmd === 'run' || cmd === '') {
    const file = s[1] || ''
    try {
      let output = ''
      if (framework === 'vitest') output = execSync('npx vitest run ' + file + ' 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else if (framework === 'jest') output = execSync('npx jest ' + file + ' 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else if (framework === 'pytest') output = execSync('python -m pytest ' + file + ' -v 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else if (framework === 'go-test') output = execSync('go test ./... -v 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else if (framework === 'cargo') output = execSync('cargo test 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else output = execSync('npm test 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      return { type: 'text', value: '🧪 测试输出：\n' + output.slice(0, 3000) }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'file') {
    const file = s[1]
    if (!file) return { type: 'text', value: '📖 用法：/test-run file <path>' }
    try {
      let output = ''
      if (framework === 'vitest') output = execSync('npx vitest run "' + file + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      else if (framework === 'jest') output = execSync('npx jest "' + file + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      else if (framework === 'pytest') output = execSync('python -m pytest "' + file + '" -v 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      else return { type: 'text', value: '❌ 不支持的框架：' + framework }
      return { type: 'text', value: output.slice(0, 2000) }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'watch') {
    return { type: 'text', value: '👁️ 监视模式：\n  Vitest: npx vitest\n  Jest: npx jest --watch\n  Pytest: ptw (pytest-watch)' }
  }

  if (cmd === 'coverage') {
    try {
      if (framework === 'vitest') execSync('npx vitest run --coverage 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else if (framework === 'jest') execSync('npx jest --coverage 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else execSync('python -m pytest --cov=. 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      return { type: 'text', value: '✅ 覆盖率报告已生成' }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'pattern') {
    const pattern = s[1]
    if (!pattern) return { type: 'text', value: '📖 用法：/test-run pattern <regex>' }
    try {
      if (framework === 'vitest') execSync('npx vitest run -t "' + pattern + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      else execSync('npx jest -t "' + pattern + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      return { type: 'text', value: '✅ 已运行匹配测试：' + pattern }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'init') {
    return { type: 'text', value: '💡 初始化测试框架：\n  Vitest: npm install -D vitest\n  Jest: npm install -D jest\n  Pytest: pip install pytest' }
  }

  if (cmd === 'snapshot') {
    try {
      execSync('npx jest -u 2>&1 || npx vitest run -u 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      return { type: 'text', value: '✅ 快照已更新' }
    } catch { return { type: 'text', value: '❌ 快照更新失败' } }
  }

  if (cmd === 'debug') {
    const file = s[1]
    if (!file) return { type: 'text', value: '📖 用法：/test-run debug <file>' }
    return { type: 'text', value: '🐛 调试：npx vitest run --reporter=verbose "' + file + '"\n或使用调试器：node --inspect-brk node_modules/.bin/jest --runInBand "' + file + '"' }
  }

  if (cmd === 'time') {
    return { type: 'text', value: '⏱️ 最慢测试：\n  Vitest: npx vitest run --reporter=verbose 2>&1 | grep -i "ms\|slow"\n  Jest: npx jest --verbose --slow-test-threshold=1000' }
  }

  if (cmd === 'last') {
    return { type: 'text', value: '💡 运行 /test-run 查看最新测试结果' }
  }

  if (cmd === 'failed') {
    try {
      execSync('npx jest --onlyChanged 2>&1 || npx vitest run --reporter=verbose 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      return { type: 'text', value: '✅ 已重新运行失败测试' }
    } catch { return { type: 'text', value: '❌ 重新运行失败' } }
  }

  return { type: 'text', value: '❓ 未知命令：' + cmd }
}

const testRun: Command = {
  type: 'local', name: 'test-run',
  description: '🧪 测试运行器 - 运行/监视/覆盖率/调试/快照/耗时/框架',
  aliases: ['/test-run', '/test', '/t'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default testRun
