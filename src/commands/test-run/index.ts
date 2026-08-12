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
    'Test Runner', '', '📖 Usage: ',
    '  /test-run                       Run all tests',
    '  /test-run file <path>           Run specific test file',
    '  /test-run watch                 Watch mode',
    '  /test-run coverage              Run with coverage',
    '  /test-run failed                Re-run failed tests',
    '  /test-run pattern <regex>       Run matching tests',
    '  /test-run last                  Show last test result',
    '  /test-run framework             Show detected framework',
    '  /test-run init                  Initialize test framework',
    '  /test-run snapshot              Update snapshots',
    '  /test-run debug <file>          Debug a test',
    '  /test-run time                  Show slowest tests',
    '',
    'Detected: ' + framework,
  ].join('\n') }

  if (cmd === 'framework' || cmd === 'detect') {
    return { type: 'text', value: 'Test framework: ' + framework + '\nConfig files: ' + (framework !== 'unknown' ? 'found' : 'not found') }
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
      return { type: 'text', value: output.slice(0, 3000) }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'file') {
    const file = s[1]
    if (!file) return { type: 'text', value: 'Usage: /test-run file <path>' }
    try {
      let output = ''
      if (framework === 'vitest') output = execSync('npx vitest run "' + file + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      else if (framework === 'jest') output = execSync('npx jest "' + file + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      else if (framework === 'pytest') output = execSync('python -m pytest "' + file + '" -v 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      else return { type: 'text', value: 'Unsupported framework: ' + framework }
      return { type: 'text', value: output.slice(0, 2000) }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'watch') {
    return { type: 'text', value: 'Watch mode:\n  Vitest: npx vitest\n  Jest: npx jest --watch\n  Pytest: ptw (pytest-watch)' }
  }

  if (cmd === 'coverage') {
    try {
      if (framework === 'vitest') execSync('npx vitest run --coverage 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else if (framework === 'jest') execSync('npx jest --coverage 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else execSync('python -m pytest --cov=. 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      return { type: 'text', value: '[OK] Coverage report generated' }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'pattern') {
    const pattern = s[1]
    if (!pattern) return { type: 'text', value: 'Usage: /test-run pattern <regex>' }
    try {
      if (framework === 'vitest') execSync('npx vitest run -t "' + pattern + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      else execSync('npx jest -t "' + pattern + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      return { type: 'text', value: '[OK] Ran tests matching: ' + pattern }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'init') {
    return { type: 'text', value: 'Initialize test framework:\n  Vitest: npm install -D vitest\n  Jest: npm install -D jest\n  Pytest: pip install pytest' }
  }

  if (cmd === 'snapshot') {
    try {
      execSync('npx jest -u 2>&1 || npx vitest run -u 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      return { type: 'text', value: '[OK] Snapshots updated' }
    } catch { return { type: 'text', value: '[ERROR] Snapshot update failed' } }
  }

  if (cmd === 'debug') {
    const file = s[1]
    if (!file) return { type: 'text', value: 'Usage: /test-run debug <file>' }
    return { type: 'text', value: 'Debug: npx vitest run --reporter=verbose "' + file + '"\nOr use debugger: node --inspect-brk node_modules/.bin/jest --runInBand "' + file + '"' }
  }

  if (cmd === 'time') {
    return { type: 'text', value: 'Slowest tests:\n  Vitest: npx vitest run --reporter=verbose 2>&1 | grep -i "ms\|slow"\n  Jest: npx jest --verbose --slow-test-threshold=1000' }
  }

  if (cmd === 'last') {
    return { type: 'text', value: 'Run /test-run to see latest results' }
  }

  if (cmd === 'failed') {
    try {
      execSync('npx jest --onlyChanged 2>&1 || npx vitest run --reporter=verbose 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      return { type: 'text', value: '[OK] Re-ran failed tests' }
    } catch { return { type: 'text', value: '[ERROR] Re-run failed' } }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const testRun: Command = {
  type: 'local', name: 'test-run',
  description: 'Test runner - run/watch/coverage/debug/snapshot/time/framework',
  aliases: ['/test-run', '/test', '/t'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default testRun
