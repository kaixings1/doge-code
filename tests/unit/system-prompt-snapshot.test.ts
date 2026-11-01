/**
 * `--system-prompt-snapshot <on|off>`（对齐官方帮助语义）。
 *
 *   on（默认）：会话首次请求时渲染并录制，之后每次请求与 resume 原样复用，
 *              直到该会话被压缩。
 *   off       ：从不录制，每次重新渲染（便于迭代提示词文本）。
 *
 * 覆盖：
 * 1. 默认值为 on（不传参数时）
 * 2. 非法值回落 on，'off' 才关闭（大小写/空白容错）
 * 3. on + 已录制 + 未失效 → 复用快照
 * 4. on + 未录制（首次请求）→ 用渲染值并录制
 * 5. on + 已录制但压缩后失效 → 用渲染值并重新录制
 * 6. off → 永远用渲染值且不录制
 * 7. 快照按数组保存（不 join/split，保住分段结构）
 *
 * 变异验证（必须做）：
 *   - parseSystemPromptSnapshotMode 去掉 toLowerCase/trim → 用例 2 失败
 *   - shouldReuse 去掉 invalidated 判断 → 用例 5 失败
 *   - resolve 的 off 分支返回 rendered 作 nextSnapshot → 用例 6 失败
 *   均已实测捕获。
 */
import { describe, it, expect } from 'vitest'
import {
  getSystemPromptSnapshotMode,
  parseSystemPromptSnapshotMode,
  resolveSystemPromptSnapshot,
  shouldReuseSystemPromptSnapshot,
} from '../../src/utils/systemPromptSnapshot.js'

describe('parseSystemPromptSnapshotMode', () => {
  it('不传时为 on（官方默认）', () => {
    expect(parseSystemPromptSnapshotMode(undefined)).toBe('on')
    expect(parseSystemPromptSnapshotMode(null)).toBe('on')
    expect(parseSystemPromptSnapshotMode('')).toBe('on')
  })

  it("只认 off，其余一律回落 on；大小写与空白容错", () => {
    expect(parseSystemPromptSnapshotMode('off')).toBe('off')
    expect(parseSystemPromptSnapshotMode('OFF')).toBe('off')
    expect(parseSystemPromptSnapshotMode('  off  ')).toBe('off')
    expect(parseSystemPromptSnapshotMode('on')).toBe('on')
    expect(parseSystemPromptSnapshotMode('bogus')).toBe('on')
  })
})

describe('getSystemPromptSnapshotMode', () => {
  it('从环境变量读取', () => {
    expect(
      getSystemPromptSnapshotMode({
        CLAUDE_CODE_SYSTEM_PROMPT_SNAPSHOT: 'off',
      } as any),
    ).toBe('off')
    expect(getSystemPromptSnapshotMode({} as any)).toBe('on')
  })
})

describe('shouldReuseSystemPromptSnapshot', () => {
  it('on + 已录制 + 未失效 → 复用', () => {
    expect(shouldReuseSystemPromptSnapshot('on', ['a', 'b'], false)).toBe(true)
  })

  it('未录制 → 不复用（首次请求需渲染）', () => {
    expect(shouldReuseSystemPromptSnapshot('on', null, false)).toBe(false)
    expect(shouldReuseSystemPromptSnapshot('on', [], false)).toBe(false)
  })

  it('压缩后失效 → 不复用（需重新录制）', () => {
    expect(shouldReuseSystemPromptSnapshot('on', ['a'], true)).toBe(false)
  })

  it('off → 永不复用', () => {
    expect(shouldReuseSystemPromptSnapshot('off', ['a'], false)).toBe(false)
  })
})

describe('resolveSystemPromptSnapshot', () => {
  const rendered = ['prompt-A', 'prompt-B']

  it('已录制时逐字复用，即使本轮渲染结果不同', () => {
    const r = resolveSystemPromptSnapshot({
      mode: 'on',
      snapshot: ['old-1', 'old-2'],
      invalidated: false,
      rendered: ['new-1', 'new-2'],
    })
    expect(r.prompt).toEqual(['old-1', 'old-2'])
    expect(r.nextSnapshot).toEqual(['old-1', 'old-2'])
  })

  it('首次请求：用渲染值并录制', () => {
    const r = resolveSystemPromptSnapshot({
      mode: 'on',
      snapshot: null,
      invalidated: false,
      rendered,
    })
    expect(r.prompt).toEqual(rendered)
    expect(r.nextSnapshot).toEqual(rendered)
  })

  it('压缩后：重新渲染并重新录制', () => {
    const r = resolveSystemPromptSnapshot({
      mode: 'on',
      snapshot: ['stale'],
      invalidated: true,
      rendered,
    })
    expect(r.prompt).toEqual(rendered)
    expect(r.nextSnapshot).toEqual(rendered)
  })

  it('off：用渲染值且不录制', () => {
    const r = resolveSystemPromptSnapshot({
      mode: 'off',
      snapshot: ['old'],
      invalidated: false,
      rendered,
    })
    expect(r.prompt).toEqual(rendered)
    expect(r.nextSnapshot).toBeNull()
  })

  it('快照保持数组结构（不 join/split 往返）', () => {
    // 分段边界必须原样保留：join('\n\n')/split('\n\n') 会把含空行的一段拆散。
    const withBlank = ['a\n\nb', 'c']
    const r = resolveSystemPromptSnapshot({
      mode: 'on',
      snapshot: null,
      invalidated: false,
      rendered: withBlank,
    })
    expect(r.nextSnapshot).toHaveLength(2)
    expect(r.nextSnapshot![0]).toBe('a\n\nb')
  })
})
