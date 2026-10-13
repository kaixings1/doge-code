/**
 * 手机端推送文本的提取测试（重点是 XML 标签剥离）。
 *
 * 为什么必须测：服务端的斜杠命令输出（`/compact`、`/cost` 等）以
 * `<local-command-stdout>…</local-command-stdout>` 包裹的用户消息形式
 * 出现在消息流里。手机端推送路径此前**不剥离标签**，用户敲 `/cost`
 * 看到的是：
 *
 *     <local-command-stdout>本次会话成本 $0.0231…</local-command-stdout>
 *
 * 这类问题在真机上才看得到，且很容易被当成「AI 输出格式怪」而不是
 * 推送层的 bug —— 故必须钉住。
 *
 * 变异验证：把 extractPlainText 里的 stripDisplayTagsAllowEmpty 去掉，
 * 「命令输出标签被剥离」用例失败。
 */
import { describe, it, expect } from 'vitest'
import { extractPlainText } from '../../src/hooks/useReplBridge.js'

/** 构造一条带单个 text 块的消息。 */
const msg = (text: string) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text }] },
})

describe('extractPlainText — 手机端推送文本提取', () => {
  it('普通文本原样返回', () => {
    expect(extractPlainText(msg('你好') as never)).toBe('你好')
  })

  it('斜杠命令输出标签被剥离（关键）', () => {
    // /cost 的输出形态
    const out = extractPlainText(
      msg('<local-command-stdout>本次会话成本 $0.0231</local-command-stdout>') as never,
    )
    expect(out).toBe('本次会话成本 $0.0231')
    expect(out).not.toContain('local-command-stdout')
  })

  it('命令输出标签与正文混排时都保留', () => {
    const out = extractPlainText(
      msg('<local-command-stdout>结果</local-command-stdout>另外补充一句') as never,
    )
    expect(out).toBe('结果另外补充一句')
  })

  it('多个命令输出块全部去标签', () => {
    const out = extractPlainText(
      msg('<local-command-stdout>1</local-command-stdout><local-command-stdout>2</local-command-stdout>') as never,
    )
    expect(out).toBe('12')
  })

  it('stderr 也去标签（错误信息对用户同样重要）', () => {
    const out = extractPlainText(
      msg('<local-command-stderr>命令失败：权限不足</local-command-stderr>') as never,
    )
    expect(out).toBe('命令失败：权限不足')
  })

  it('空内容的命令输出返回空串（由调用方跳过）', () => {
    const out = extractPlainText(msg('<local-command-stdout></local-command-stdout>') as never)
    expect(out).toBe('')
  })

  it('其他注入标签保留内容（回看上下文有意义）', () => {
    // ide_opened_file 的内容是用户当时看到的上下文，保留比丢掉更接近真实
    const out = extractPlainText(
      msg('<ide_opened_file>src/a.ts</ide_opened_file>帮我看看这个文件') as never,
    )
    expect(out).toContain('帮我看看这个文件')
    expect(out).toContain('src/a.ts')
  })

  it('用户正文里的 JSX/HTML 不被误伤（大写标签）', () => {
    // 「修一下 <Button> 的布局」是正常技术讨论，不该被当成标签剥掉
    const out = extractPlainText(msg('修一下 <Button> 的布局') as never)
    expect(out).toBe('修一下 <Button> 的布局')
  })

  it('不成对的尖括号不被误伤', () => {
    const out = extractPlainText(msg('当 x < y 时') as never)
    expect(out).toBe('当 x < y 时')
  })

  it('多个 text 块拼接后剥离', () => {
    const m = {
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: '<local-command-stdout>' },
          { type: 'text', text: '输出内容' },
          { type: 'text', text: '</local-command-stdout>' },
        ],
      },
    }
    expect(extractPlainText(m as never)).toBe('输出内容')
  })

  it('忽略非 text 块（工具调用等）', () => {
    const m = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', name: 'Bash', input: {} },
          { type: 'text', text: '正文' },
        ],
      },
    }
    expect(extractPlainText(m as never)).toBe('正文')
  })

  it('content 为字符串时同样处理命令标签', () => {
    const m = {
      type: 'user',
      message: { role: 'user', content: '<local-command-stdout>输出</local-command-stdout>' },
    }
    expect(extractPlainText(m as never)).toBe('输出')
  })

  it('非命令标签的尖括号内容原样保留', () => {
    // 只针对 local-command-* 做处理；别的标签（如用户提到的自定义标签）
    // 不动，避免误伤正文
    const m = { type: 'user', message: { role: 'user', content: '<x>隐藏</x>可见' } }
    expect(extractPlainText(m as never)).toBe('<x>隐藏</x>可见')
  })

  it('缺 content 时返回空串而非崩', () => {
    expect(extractPlainText({ type: 'user' } as never)).toBe('')
    expect(extractPlainText({ type: 'user', message: {} } as never)).toBe('')
  })
})
