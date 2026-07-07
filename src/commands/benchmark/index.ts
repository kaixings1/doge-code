import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'

/**
 * /benchmark 命令 - 性能基准测试
 * 提供简单的代码片段和系统性能测试
 */

const HELP_TEXT = `⚡ **Benchmark 命令** - 性能基准测试工具

**用法**: /benchmark [run|suite|cpu|memory|compare|help]

**命令**:
  run [代码]       - 运行单次性能测试
  suite           - 运行标准测试套件（Fibonacci、排序、JSON解析）
  cpu             - CPU 性能测试
  memory          - 内存分配测试
  compare <代码1> <代码2> - 对比两段代码的性能
  help            - 显示帮助

**示例**:
  /benchmark suite              # 运行标准测试套件
  /benchmark cpu                # CPU 性能测试
  /benchmark memory             # 内存分配测试
  /benchmark run "for(let i=0;i<1e6;i++);"  # 运行自定义代码`

// 运行单次性能测试
function runSingleBenchmark(code: string): { time: number; iterations: number } {
  const iterations = 10
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(code)
      fn()
    } catch {
      // 忽略执行错误
    }
  }
  const elapsed = performance.now() - start
  return { time: elapsed / iterations, iterations }
}

// 标准测试套件
function runSuite(): string {
  const results: string[] = [`🧪 **标准测试套件**\n`]

  // Fibonacci 测试
  const fibStart = performance.now()
  let a = 0, b = 1
  for (let i = 0; i < 1000; i++) {
    const c = a + b
    a = b
    b = c
  }
  results.push(`• Fibonacci(1000): ${(performance.now() - fibStart).toFixed(2)}ms`)

  // 数组排序测试
  const sortStart = performance.now()
  const arr = Array.from({ length: 10000 }, () => Math.random())
  arr.sort((x, y) => x - y)
  results.push(`• 数组排序(10000): ${(performance.now() - sortStart).toFixed(2)}ms`)

  // JSON 解析测试
  const jsonStart = performance.now()
  const obj = { data: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: Math.random().toString(36) })) }
  for (let i = 0; i < 100; i++) {
    JSON.parse(JSON.stringify(obj))
  }
  results.push(`• JSON 解析(100次): ${(performance.now() - jsonStart).toFixed(2)}ms`)

  // 对象创建测试
  const objStart = performance.now()
  for (let i = 0; i < 100000; i++) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const o = { id: i, data: { nested: i * 2 } }
  }
  results.push(`• 对象创建(100000): ${(performance.now() - objStart).toFixed(2)}ms`)

  return results.join('\n') + '\n\n💡 提示: 使用 /benchmark compare 代码1 代码2 对比性能'
}

// CPU 压力测试
function cpuTest(): string {
  const start = performance.now()
  let result = 0
  for (let i = 0; i < 50_000_000; i++) {
    result += Math.sin(i) * Math.cos(i)
  }
  const elapsed = performance.now() - start
  return `🔥 **CPU 性能测试**

• 运算量: 50,000,000 次数学运算
• 耗时: ${elapsed.toFixed(0)}ms
• 结果校验: ${result.toFixed(6)}`
}

// 内存分配测试
function memoryTest(): string {
  const startMem = process.memoryUsage().heapUsed
  const start = performance.now()

  // 创建大量对象
  const arr = Array.from({ length: 1_000_000 }, (_, i) => ({
    id: i,
    data: 'x'.repeat(100),
    nested: { value: Math.random() }
  }))

  const elapsed = performance.now() - start
  const endMem = process.memoryUsage().heapUsed
  const memUsed = ((endMem - startMem) / 1024 / 1024).toFixed(2)

  // 清理
  arr.length = 0

  return `💾 **内存分配测试**

• 对象数量: 1,000,000 个
• 耗时: ${elapsed.toFixed(0)}ms
• 内存增长: ${memUsed}MB`
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim().toLowerCase()
  const words = s.split(/\s+/)
  const command = words[0] || 'help'

  try {
    if (command === 'help' || s === '') {
      return { type: 'text', value: HELP_TEXT }
    }

    if (command === 'suite') {
      return { type: 'text', value: runSuite() }
    }

    if (command === 'cpu') {
      return { type: 'text', value: cpuTest() }
    }

    if (command === 'memory') {
      return { type: 'text', value: memoryTest() }
    }

    if (command === 'run') {
      const code = s.slice(4).trim() || words.slice(1).join(' ').trim()
      if (!code) {
        return {
          type: 'text',
          value: `❌ **参数错误**

🔧 **正确用法**: \`/benchmark run <JavaScript代码>\`

📋 **示例**: \`/benchmark run "for(let i=0;i<1e6;i++);"\``
        }
      }
      try {
        // eslint-disable-next-line no-new-func
        const result = runSingleBenchmark(code)
        return {
          type: 'text',
          value: `📊 **单次性能测试**

• 代码: \`${code.substring(0, 50)}${code.length > 50 ? '...' : ''}\`
• 单次耗时: ${result.time.toFixed(2)}ms\n• 迭代次数: ${result.iterations}`
        }
      } catch (err) {
        return {
          type: 'text',
          value: `❌ **代码执行失败**

错误: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }

    if (command === 'compare') {
      // 提取两个代码片段（简单处理）
      const code1 = s.includes(' code2 ') ? s.split(' code2 ')[0].replace('compare', '').trim() : ''
      const code2 = s.includes(' code2 ') ? s.split(' code2 ')[1].trim() : ''

      if (!code1 || !code2) {
        return {
          type: 'text',
          value: `❌ **参数错误**

🔧 **正确用法**: \`/benchmark compare <代码1> code2 <代码2>\`

📋 **示例**: \`/benchmark compare "for(let i=0;i<1e6;i++);" code2 "Array(1e6).fill(0).map((_,i=>i));"\``
        }
      }

      try {
        const r1 = runSingleBenchmark(code1)
        const r2 = runSingleBenchmark(code2)
        const faster = r1.time < r2.time ? '代码1' : '代码2'

        return {
          type: 'text',
          value: `⚖️ **性能对比**

| 代码 | 单次耗时 |
|------|----------|
| 代码1 | ${r1.time.toFixed(2)}ms |
| 代码2 | ${r2.time.toFixed(2)}ms |

🏆 **更快**: ${faster}`
        }
      } catch (err) {
        return {
          type: 'text',
          value: `❌ **对比失败**

错误: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }

    return {
      type: 'text',
      value: `❌ **未知命令**: \`${command}\`\n\n${HELP_TEXT}`
    }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ **执行出错**

${err instanceof Error ? err.message : String(err)}`
    }
  }
}

const benchmark: Command = {
  type: 'local',
  name: 'benchmark',
  description: '性能基准测试工具',
  aliases: ['bench'],
  isEnabled: () => {
    const { getIsNonInteractiveSession } = require('../../bootstrap/state.js')
    return !getIsNonInteractiveSession()
  },
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default benchmark
