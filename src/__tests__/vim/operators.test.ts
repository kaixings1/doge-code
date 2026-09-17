import { describe, it, expect } from 'vitest'
import { Cursor } from '../../utils/Cursor.ts'
import {
  executeIndent,
  executeJoin,
  executeLineOp,
  type OperatorContext,
  executeOpenLine,
  executeOperatorFind,
  executeOperatorG,
  executeOperatorGg,
  executeOperatorMotion,
  executeOperatorTextObj,
  executePaste,
  executeReplace,
  executeToggleCase,
  executeX,
} from '../../vim/operators.ts'

/**
 * operators.ts 此前覆盖率为 0。本文件为边界冒烟测试：
 * 输入均为 CLI 输入框中真实可达的状态（空输入框、单字符、多行、行首行尾）。
 *
 * 起因：findTextObject 在空文本上会抛 TypeError（已修），故对同模块
 * 全部导出函数做一次系统性边界检查，确认是否还有同类越界。
 */
function makeCtx(
  text: string,
  offset: number,
  register = '',
): { ctx: OperatorContext; currentText: () => string } {
  let cur = text
  let reg = register
  const cursor = Cursor.fromText(text, 80, offset)
  const ctx: OperatorContext = {
    cursor,
    text,
    setText: t => {
      cur = t
    },
    setOffset: () => {},
    enterInsert: () => {},
    getRegister: () => reg,
    setRegister: c => {
      reg = c
    },
    getLastFind: () => null,
    setLastFind: () => {},
    recordChange: () => {},
  }
  return { ctx, currentText: () => cur }
}

const TEXTS = ['', 'a', '\n', 'ab', 'ab\ncd', '  leading', 'trailing  ', 'a(b)c']

/** 对给定 ctx 调用全部 operator 函数，任一抛出即失败 */
function callAll(ctx: OperatorContext): void {
  executeX(1, ctx)
  executeX(3, ctx)
  executeReplace('x', 1, ctx)
  executeToggleCase(1, ctx)
  executeJoin(1, ctx)
  executePaste(false, 1, ctx)
  executePaste(true, 1, ctx)
  executeIndent('>', 1, ctx)
  executeIndent('<', 1, ctx)
  executeOpenLine('above', ctx)
  executeOpenLine('below', ctx)
  executeLineOp('delete', 1, ctx)
  executeLineOp('yank', 2, ctx)
  executeOperatorMotion('delete', 'w', 1, ctx)
  executeOperatorMotion('yank', 'e', 1, ctx)
  executeOperatorFind('delete', 'f', 'b', 1, ctx)
  executeOperatorFind('yank', 't', 'b', 1, ctx)
  executeOperatorG('delete', 1, ctx)
  executeOperatorGg('delete', 1, ctx)
  for (const objType of ['w', 'W', '"', "'", '`', '(', ')', 'b', '[', '{', 'B', '<', '>']) {
    executeOperatorTextObj('delete', 'inner', objType, 1, ctx)
    executeOperatorTextObj('yank', 'around', objType, 1, ctx)
    executeOperatorTextObj('change', 'inner', objType, 1, ctx)
  }
}

describe('operators 边界冒烟（空文本 / 单字符 / 多行）', () => {
  for (const text of TEXTS) {
    for (let offset = 0; offset <= text.length; offset++) {
      it(`text=${JSON.stringify(text)} offset=${offset} 不抛异常`, () => {
        const { ctx } = makeCtx(text, offset)
        expect(() => callAll(ctx)).not.toThrow()
      })
    }
  }
})

describe('operators 空文本语义', () => {
  it('空文本上 textobj 删除不改变文本', () => {
    const { ctx, currentText } = makeCtx('', 0)
    executeOperatorTextObj('delete', 'inner', 'w', 1, ctx)
    expect(currentText()).toBe('')
  })

  it('空文本上 textobj 不写入寄存器（未选中内容）', () => {
    let reg = ''
    const cursor = Cursor.fromText('', 80, 0)
    const ctx: OperatorContext = {
      cursor,
      text: '',
      setText: () => {},
      setOffset: () => {},
      enterInsert: () => {},
      getRegister: () => reg,
      setRegister: c => {
        reg = c
      },
      getLastFind: () => null,
      setLastFind: () => {},
      recordChange: () => {},
    }
    executeOperatorTextObj('yank', 'inner', 'w', 1, ctx)
    expect(reg).toBe('')
  })

  it('空文本上 x 不改变文本', () => {
    const { ctx, currentText } = makeCtx('', 0)
    executeX(1, ctx)
    expect(currentText()).toBe('')
  })

  it('空文本上粘贴无寄存器时是空操作', () => {
    const { ctx, currentText } = makeCtx('', 0, '')
    executePaste(true, 1, ctx)
    expect(currentText()).toBe('')
  })
})

describe('operators 常规语义（回归保护）', () => {
  it('diw 删掉整个单词', () => {
    const { ctx, currentText } = makeCtx('foo bar', 1)
    executeOperatorTextObj('delete', 'inner', 'w', 1, ctx)
    expect(currentText()).toBe(' bar')
  })

  it('ciw 删掉整个单词（进入插入模式，文本与 delete 相同）', () => {
    const { ctx, currentText } = makeCtx('foo bar', 1)
    executeOperatorTextObj('change', 'inner', 'w', 1, ctx)
    expect(currentText()).toBe(' bar')
  })

  it('di" 删掉引号内容', () => {
    const { ctx, currentText } = makeCtx('say "hi" now', 5)
    executeOperatorTextObj('delete', 'inner', '"', 1, ctx)
    expect(currentText()).toBe('say "" now')
  })

  it('da" 删掉引号及其内容', () => {
    const { ctx, currentText } = makeCtx('say "hi" now', 5)
    executeOperatorTextObj('delete', 'around', '"', 1, ctx)
    expect(currentText()).toBe('say  now')
  })

  it('di( 删掉括号内容', () => {
    const { ctx, currentText } = makeCtx('a(b)c', 2)
    executeOperatorTextObj('delete', 'inner', '(', 1, ctx)
    expect(currentText()).toBe('a()c')
  })

  it('x 删除光标处字符', () => {
    const { ctx, currentText } = makeCtx('abc', 1)
    executeX(1, ctx)
    expect(currentText()).toBe('ac')
  })

  it('3x 删除三个字符', () => {
    const { ctx, currentText } = makeCtx('abcdef', 0)
    executeX(3, ctx)
    expect(currentText()).toBe('def')
  })

  it('x 在行尾是空操作', () => {
    const { ctx, currentText } = makeCtx('ab', 2)
    executeX(1, ctx)
    expect(currentText()).toBe('ab')
  })

  it('yy（executeLineOp yank）把整行含换行符写入寄存器', () => {
    let reg = ''
    const cursor = Cursor.fromText('foo\nbar', 80, 1)
    const ctx: OperatorContext = {
      cursor,
      text: 'foo\nbar',
      setText: () => {},
      setOffset: () => {},
      enterInsert: () => {},
      getRegister: () => reg,
      setRegister: c => {
        reg = c
      },
      getLastFind: () => null,
      setLastFind: () => {},
      recordChange: () => {},
    }
    executeLineOp('yank', 1, ctx)
    expect(reg).toBe('foo\n')
  })

  it('无效 motion 名是空操作（不崩溃、不写寄存器）', () => {
    let reg = ''
    const cursor = Cursor.fromText('foo bar', 80, 1)
    const ctx: OperatorContext = {
      cursor,
      text: 'foo bar',
      setText: () => {},
      setOffset: () => {},
      enterInsert: () => {},
      getRegister: () => reg,
      setRegister: c => {
        reg = c
      },
      getLastFind: () => null,
      setLastFind: () => {},
      recordChange: () => {},
    }
    executeOperatorMotion('yank', 'y', 1, ctx)
    expect(reg).toBe('')
  })
})
