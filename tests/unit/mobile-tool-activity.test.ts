/**
 * describeToolActivityForMobile 的测试。
 *
 * 为什么这段转换必须测：它决定手机端「活动区」显示什么。字段取错
 * （如把 tool_use 的 input 当成 name、把 progress 的 description 取成
 * undefined）会让手机端显示空白条目或错误名称，而这类问题**真机上极难
 * 定位** —— 要抓 WebSocket 包才看得出是服务端推错了还是客户端渲染错了。
 *
 * 覆盖两种来源：
 * 1. assistant 消息里的 tool_use 块 → kind:'tool', state:'running'
 * 2. progress 消息（六种类型）→ 子代理识别为 kind:'agent'
 *
 * 变异验证：把 assistant 分支的 `content.find(b => b.type === 'tool_use')`
 * 改成 `content[0]`，则「纯文本回复不产生活动」用例失败。
 */
import { describe, it, expect } from 'vitest'
import { describeToolActivityForMobile } from '../../src/bridge/mobileBridge.js'

describe('describeToolActivityForMobile', () => {
  // ── 来源 1：assistant 的 tool_use 块 ──

  it('解析 Bash 工具调用，target 取 command', () => {
    const a = describeToolActivityForMobile({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }],
      },
    })
    expect(a).toBeTruthy()
    expect(a!.kind).toBe('tool')
    expect(a!.name).toBe('Bash')
    expect(a!.target).toBe('npm test')
    expect(a!.state).toBe('running')
  })

  it('解析文件工具，target 取 file_path', () => {
    const a = describeToolActivityForMobile({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'src/a.ts' } }],
      },
    })
    expect(a!.target).toBe('src/a.ts')
  })

  it('纯文本回复不产生活动', () => {
    // 关键：assistant 只有 text 块时不该推活动 —— 否则手机端活动区
    // 会为每条普通回复多出一行无意义条目
    const a = describeToolActivityForMobile({
      type: 'assistant',
      message: { content: [{ type: 'text', text: '你好' }] },
    })
    expect(a).toBeNull()
  })

  it('content 非数组时返回空', () => {
    expect(
      describeToolActivityForMobile({ type: 'assistant', message: { content: 'hi' } }),
    ).toBeNull()
  })

  it('tool_use 缺 name 时回落为「工具」', () => {
    const a = describeToolActivityForMobile({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', input: { command: 'ls' } }] },
    })
    expect(a!.name).toBe('工具')
  })

  it('input 无已知字段时 target 为空', () => {
    const a = describeToolActivityForMobile({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'X', input: { foo: 1 } }] },
    })
    expect(a!.target).toBeUndefined()
  })

  it('超长 command 被截断到 200', () => {
    const a = describeToolActivityForMobile({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'x'.repeat(5000) } }] },
    })
    expect(a!.target!.length).toBe(200)
  })

  // ── 来源 2：progress 消息 ──

  it('agent_progress 识别为子代理并带 agentId', () => {
    const a = describeToolActivityForMobile({
      type: 'progress',
      parentToolUseID: 'tu-abc',
      data: { type: 'agent_progress', description: '重构模块' },
    })
    expect(a!.kind).toBe('agent')
    expect(a!.name).toBe('子代理')
    expect(a!.target).toBe('重构模块')
    expect(a!.agentId).toBe('tu-abc')
  })

  it('bash_progress 识别为工具', () => {
    const a = describeToolActivityForMobile({
      type: 'progress',
      data: { type: 'bash_progress', description: '跑测试' },
    })
    expect(a!.kind).toBe('tool')
    expect(a!.name).toBe('bash')
  })

  it('hook_progress 不推送', () => {
    // 内部钩子执行对用户无意义，推了只会刷屏
    expect(
      describeToolActivityForMobile({
        type: 'progress',
        data: { type: 'hook_progress', hookEvent: 'Stop' },
      }),
    ).toBeNull()
  })

  it('progress 缺 data 返回空', () => {
    expect(describeToolActivityForMobile({ type: 'progress' })).toBeNull()
  })

  // ── 不该产生活动的类型 ──

  it.each(['user', 'system', 'result', 'stream_event'])('%s 不产生活动', t => {
    expect(describeToolActivityForMobile({ type: t })).toBeNull()
  })

  it('null / 非对象安全返回空', () => {
    expect(describeToolActivityForMobile(null)).toBeNull()
    expect(describeToolActivityForMobile(undefined)).toBeNull()
    expect(describeToolActivityForMobile('str')).toBeNull()
    expect(describeToolActivityForMobile(42)).toBeNull()
  })
})
