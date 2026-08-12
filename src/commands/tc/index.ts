import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'

interface CoverageInfo {
  path: string
  statements: number
  branches: number
  functions: number
  lines: number
}

function parseCoverageJson(file: string): CoverageInfo[] {
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'))
    const results: CoverageInfo[] = []
    for (const [path, info] of Object.entries(data as Record<string, any>)) {
      results.push({
        path,
        statements: info.statementMap ? Object.keys(info.statementMap).length : 0,
        branches: info.branchMap ? Object.keys(info.branchMap).length : 0,
        functions: info.fnMap ? Object.keys(info.fnMap).length : 0,
        lines: info.getLineCoverage ? Object.keys(info.getLineCoverage()).length : 0,
      })
    }
    return results
  } catch { return [] }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📊 测试覆盖率', '', '📖 用法：', '  /tc run [框架]                 运行带覆盖率的测试', '  /tc report                     显示覆盖率报告', '  /tc show [文件]                显示文件覆盖率', '  /tc missing                    显示未覆盖文件', '  /tc trend                      覆盖率趋势', '  /tc badge                      生成覆盖率徽章', '  /tc html                       打开 HTML 报告', '  /tc json                       导出覆盖率 JSON', '  /tc threshold <n>              设置最低阈值', '  /tc compare <分支>             与分支对比', ''].join('\n') }

  if (cmd === 'run') {
    const framework = parts[1] || 'auto'
    try {
      let output = ''
      if (framework === 'vitest') output = execSync('npx vitest run --coverage 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else if (framework === 'jest') output = execSync('npx jest --coverage 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else if (framework === 'pytest') output = execSync('python -m pytest --cov=. --cov-report=term-missing 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else if (framework === 'go') output = execSync('go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      else output = execSync('npm test -- --coverage 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      return { type: 'text', value: output.slice(0, 3000) }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'report') {
    try {
      const output = execSync('npx jest --coverage --coverageReporters=text 2>&1 || npx vitest run --coverage --reporter=text 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 })
      return { type: 'text', value: output.slice(0, 3000) }
    } catch { return { type: 'text', value: '❌ 无覆盖率数据。请先运行 /tc run。' } }
  }

  if (cmd === 'show') {
    const file = parts[1]
    if (file && existsSync(file)) {
      try {
        const output = execSync('npx vitest run --coverage --reporter=verbose 2>&1 | grep -i "' + file + '" || echo "No coverage for ' + file + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
        return { type: 'text', value: output }
      } catch { return { type: 'text', value: '❌ 无覆盖率数据：' + file } }
    }
    try {
      const output = execSync('go tool cover -func=coverage.out 2>/dev/null || cat coverage/lcov-report/index.html 2>/dev/null | grep -o "[0-9]*%" | head -5', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output || 'ℹ️ 未找到覆盖率数据' }
    } catch { return { type: 'text', value: 'No coverage data. Run /tc run first.' } }
  }

  if (cmd === 'missing') {
    try {
      const output = execSync('npx jest --coverage --coverageReporters=text 2>&1 | grep -A 50 "Uncovered" || echo "Run /tc run first"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output }
    } catch { return { type: 'text', value: 'No coverage data. Run /tc run first.' } }
  }

  if (cmd === 'trend') {
    return { type: 'text', value: '📈 覆盖率趋势：使用 git 历史追踪覆盖率变化。' }
  }

  if (cmd === 'badge') {
    return { type: 'text', value: '📋 覆盖率徽章：\n  ![coverage](https://img.shields.io/badge/coverage-XX%25-green)\n  或使用：https://codecov.io 或 https://coveralls.io' }
  }

  if (cmd === 'html') {
    try {
      execSync('open coverage/lcov-report/index.html 2>/dev/null || start coverage/lcov-report/index.html 2>/dev/null || xdg-open coverage/lcov-report/index.html 2>/dev/null || echo "Open coverage/lcov-report/index.html"', { stdio: 'ignore' })
      return { type: 'text', value: '✅ 正在打开 HTML 报告' }
    } catch { return { type: 'text', value: '❌ 未找到 HTML 报告。请先运行 /tc run。' } }
  }

  if (cmd === 'json') {
    try {
      const output = execSync('npx jest --coverage --coverageReporters=json-summary 2>&1 || npx vitest run --coverage --reporter=json 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
      return { type: 'text', value: output.slice(0, 2000) }
    } catch { return { type: 'text', value: '❌ 导出失败' } }
  }

  if (cmd === 'threshold') {
    const threshold = parseInt(parts[1]) || 80
    return { type: 'text', value: '📊 覆盖率阈值：' + threshold + '%\nAdd to package.json:\n  "jest": { "coverageThreshold": { "global": { "branches": ' + threshold + ', "functions": ' + threshold + ', "lines": ' + threshold + ', "statements": ' + threshold + ' } } }' }
  }

  if (cmd === 'compare') {
    const branch = parts[1] || 'main'
    return { type: 'text', value: '📊 对比当前与 ' + branch + '：在两个分支上分别运行 /tc run 后对比差异。' }
  }

  return { type: 'text', value: '❓ 未知命令：' + cmd }
}

const tc: Command = {
  type: 'local', name: 'tc',
  description: '📊 测试覆盖率 - 运行/报告/显示/缺失/趋势/徽章/HTML/JSON/阈值',
  aliases: '/tc, /coverage, /cov'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default tc
