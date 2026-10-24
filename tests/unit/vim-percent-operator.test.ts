import { describe, it, expect } from 'vitest'
import { Cursor } from '../../src/utils/Cursor.js'
import { executeOperatorMotion } from '../../src/vim/operators.js'
import type { OperatorContext } from '../../src/vim/operators.js'
import type { Operator } from '../../src/vim/types.js'

/**
 * d% / c% / y% —— `%` 与操作符组合（对齐官方 v2.1.301）
 *
 * vim 语义：`%` 是**包含式** motion，`d%` 从光标处删到匹配括号并包含该括号。
 * 例：`(abc)` 光标在 `(` 上，`d%` 删除整个 `(abc)`，剩空串。
 *
 * 这里走生产函数 executeOperatorMotion，不复制范围计算逻辑。
 */
function makeCtx(text: string, offset: number) {
  const state = {
    text,
    offset,
    register: '',
    linewise: false,
    insertOffset: -1 as number,
  }
  // Cursor.equals() 比较的是 measuredText 的引用相等，所以 cursor 必须是
  // 稳定实例：每次访问都新建会让 equals 恒为 false（真实运行环境中
  // ctx.cursor 也是稳定的同一对象）。
  const measured = Cursor.fromText(text, 80).measuredText
  const cursor = new Cursor(measured, offset)
  const ctx: OperatorContext = {
    cursor,
    get text() {
      return state.text
    },
    setText: (t: string) => {
      state.text = t
      if (state.offset > t.length) state.offset = t.length
    },
    setOffset: (o: number) => {
      state.offset = o
    },
    enterInsert: (o: number) => {
      state.insertOffset = o
    },
    getRegister: () => state.register,
    setRegister: (content: string, linewise: boolean) => {
      state.register = content
      state.linewise = linewise
    },
    getLastFind: () => null,
    setLastFind: () => {},
    recordChange: () => {},
  }
  return { ctx, state }
}

function run(op: Operator, text: string, offset: number, count = 1) {
  const { ctx, state } = makeCtx(text, offset)
  executeOperatorMotion(op, '%', count, ctx)
  return state
}

describe('vim d% / c% / y%', () => {
  it('d% 删除到匹配括号（包含闭括号）', () => {
    const s = run('delete', 'x(abc)y', 1)
    expect(s.text).toBe('xy')
  })

  it('d% 从闭括号删除到开括号（包含开括号）', () => {
    const s = run('delete', 'x(abc)y', 5)
    expect(s.text).toBe('xy')
  })

  it('y% 复制包含两端括号的内容', () => {
    const s = run('yank', 'x(abc)y', 1)
    expect(s.register).toBe('(abc)')
    expect(s.text).toBe('x(abc)y')
  })

  it('c% 删除到括号并进入插入模式', () => {
    const s = run('change', 'x(abc)y', 1)
    expect(s.text).toBe('xy')
    expect(s.insertOffset).toBe(1)
  })

  it('d% 支持嵌套括号', () => {
    // 外层的 ( ... ) 全部删除
    const s = run('delete', 'x(a(b)c)y', 1)
    expect(s.text).toBe('xy')
  })

  it('d% 在多行括号上生效', () => {
    const s = run('delete', 'f(\n  x\n)z', 1)
    expect(s.text).toBe('fz')
  })

  it('不匹配的括号时 d% 不动文本', () => {
    const s = run('delete', 'a(b', 1)
    expect(s.text).toBe('a(b')
  })

  it('光标不在括号上时 d% 删除到本行第一个括号对的闭括号', () => {
    // 真实 vim 8.1 验证：文本 `ab(cd)e`，光标在 offset 0，执行 d% 结果为空
    // 前的 `e`——即删掉 `ab(cd)`。范围从光标起算，而非从括号起算。
    // 命令：vim -u NONE -N -es -c 'normal! 0' -c 'normal! d%'
    const s = run('delete', 'ab(cd)e', 0)
    expect(s.text).toBe('e')
  })
})
