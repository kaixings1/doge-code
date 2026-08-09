import { describe, it, expect, beforeEach } from 'vitest'
import { AutoFixLoop, CompileErrorParser, TestFailureParser } from '../../engine/autoFixLoop.js'

describe('CompileErrorParser', () => {
  it('解析 TypeScript 编译错误（file:line:col: error TSxxx: message）', () => {
    const output = 'src/file.ts(10,5): error TS2322: Type mismatch.'
    const errors = CompileErrorParser.parse(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].file).toBe('src/file.ts')
    expect(errors[0].line).toBe(10)
    expect(errors[0].column).toBe(5)
    expect(errors[0].code).toBe('TS2322')
    expect(errors[0].message).toBe('Type mismatch.')
  })

  it('解析标准 compiler 错误（file:line: error: message）', () => {
    const output = 'app.py:42: error: NameError: name undefined'
    const errors = CompileErrorParser.parse(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].file).toBe('app.py')
    expect(errors[0].line).toBe(42)
  })

  it('提取文件列表去重', () => {
    const output = 'a.ts(1,1): error TS1: msg1\nb.ts(2,1): error TS2: msg2\na.ts(3,1): error TS3: msg3'
    const errors = CompileErrorParser.parse(output)
    const files = CompileErrorParser.extractFiles(errors)
    expect(files).toEqual(['a.ts', 'b.ts'])
  })
})

describe('TestFailureParser', () => {
  it('检测 Jest/Vitest 失败输出', () => {
    const output = 'FAIL src/foo.test.ts\n  ● test name\n    AssertionError'
    expect(TestFailureParser.hasFailures(output)).toBe(true)
    const files = TestFailureParser.extractFiles(output)
    expect(files).toContain('src/foo.test.ts')
  })

  it('检测 pytest 失败输出', () => {
    const output = 'FAILED tests/test_foo.py::test_bar'
    expect(TestFailureParser.hasFailures(output)).toBe(true)
    const files = TestFailureParser.extractFiles(output)
    expect(files).toContain('tests/test_foo.py')
  })

  it('检测正常输出（无失败）', () => {
    const output = 'PASS src/foo.test.ts'
    expect(TestFailureParser.hasFailures(output)).toBe(false)
  })
})

describe('AutoFixLoop', () => {
  let loop: AutoFixLoop

  beforeEach(() => {
    loop = new AutoFixLoop({ enabled: true, maxIterations: 3, onEvent: () => {} })
  })

  it('禁用时返回空消息列表', () => {
    const disabledLoop = new AutoFixLoop({ enabled: false, maxIterations: 3 })
    const result = disabledLoop.maybeRun([
      { toolUseId: 't1', success: true, output: 'Edited file: src/fix.ts' },
    ])
    expect(result).toEqual([])
  })

  it('达到最大迭代次数时返回空', () => {
    loop = new AutoFixLoop({ enabled: true, maxIterations: 1, onEvent: () => {} })
    loop.maybeRun([
      { toolUseId: 't1', success: true, output: 'Edited file: src/fix.ts' },
    ])
    // 第二次调用应返回空（已达最大迭代次数）
    const result = loop.maybeRun([
      { toolUseId: 't2', success: true, output: 'Edited file: src/fix.ts' },
    ])
    expect(result).toEqual([])
  })

  it('检测到 lint 错误时注入 role: "user" 消息（而非 role: "tool"）', () => {
    const result = loop.maybeRun([
      { toolUseId: 't1', success: true, output: 'Edited file: src/fix.ts\nsrc/fix.ts(10,5): error TS2322: Type mismatch.' },
    ])

    // 验证消息被注入
    expect(result.length).toBe(1)
    // 关键验证：消息角色必须是 'user'，而不是 'tool'
    expect(result[0].role).toBe('user')
    // 验证内容包含错误信息
    expect(result[0].content).toContain('[Auto-Fix Loop]')
    expect(result[0].content).toContain('Type mismatch')
  })

  it('检测到 test 错误时注入 role: "user" 消息', () => {
    const result = loop.maybeRun([
      { toolUseId: 't1', success: true, output: 'Edited file: src/test.ts\nFAIL src/test.ts' },
    ])

    expect(result.length).toBe(1)
    expect(result[0].role).toBe('user')
    expect(result[0].content).toContain('[Auto-Fix Loop]')
  })

  it('无错误时返回空消息列表', () => {
    const result = loop.maybeRun([
      { toolUseId: 't1', success: true, output: 'File written to: src/ok.ts' },
    ])
    expect(result).toEqual([])
  })

  it('工具执行失败时不触发修复', () => {
    const result = loop.maybeRun([
      { toolUseId: 't1', success: false, output: undefined, error: 'Something went wrong' },
    ])
    expect(result).toEqual([])
  })

  it('reset() 清除迭代计数器和错误状态', () => {
    loop.maybeRun([
      { toolUseId: 't1', success: true, output: 'Edited file: src/fix.ts\nsrc/fix.ts(10,5): error TS2322: bug' },
    ])
    // 第一轮消耗，第二轮应该能再次触发
    loop.reset()
    const result = loop.maybeRun([
      { toolUseId: 't2', success: true, output: 'Edited file: src/ok.ts\nsrc/ok.ts(5,2): error TS2345: another bug' },
    ])
    expect(result.length).toBe(1)
    expect(result[0].role).toBe('user')
  })

  it('shouldAbort 在引入新文件错误时触发（允许探索）', () => {
    loop = new AutoFixLoop({ enabled: true, maxIterations: 5, onEvent: () => {} })

    // 第一轮 — 错误在 file_a.ts
    loop.maybeRun([
      { toolUseId: 't1', success: true, output: 'Edited file: src/file_a.ts\nsrc/file_a.ts(10,5): error TS2322: bug' },
    ])

    // 模拟 shouldAbort 检测
    const abort = loop.shouldAbort(
      [{ type: 'lint', message: 'new_file_error' }],
      ['src/new_file.ts'],
    )
    // 新文件比例 > 50% 且当前仍有错误 → 应该中止
    expect(abort).toBe(true)
  })
})
