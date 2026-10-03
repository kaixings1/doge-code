/**
 * emit 负载契约 —— 锁定「渲染层依赖 emit.isLocalJSXCommand」这一跨模块耦合。
 *
 * 背景（真实回归）：一次重构把 emit 改成剥离 isLocalJSXCommand 的纯 payload，
 * 理由是"标记是给状态跟踪的，不是给渲染的"——这个推断是错的。REPL 渲染层
 * 有 5 处读 toolJSX.isLocalJSXCommand，其中 toolJsxCentered 决定覆盖层是否
 * 走 centeredModal（终端面板 /btw 等都依赖）。剥离后类型检查通过（字段可选，
 * undefined 合法）、纯函数单测通过（测的是决策结果），但运行时面板会静默
 * 退回非居中渲染路径 —— 单测抓不到，因为它断言的是函数输出而非跨模块使用。
 *
 * 本测试通过**扫描 REPL 源码**确认这些读取点仍存在，且决策结果保留了该字段。
 * 若将来渲染层不再读它，此测试失败，提示可以安全简化 —— 是双向的契约。
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveToolJSXUpdate } from '../../src/utils/localJSXOverlay.js'

const REPL_SRC = readFileSync('D:/doge-code/src/screens/REPL.tsx', 'utf8')

describe('emit 负载契约', () => {
  it('决策结果保留 isLocalJSXCommand（渲染层需要它）', () => {
    const d = resolveToolJSXUpdate(
      { jsx: 'panel', shouldHidePromptInput: true, isLocalJSXCommand: true },
      false,
    )
    if (d.kind !== 'set') throw new Error('unreachable')
    expect(d.emit).toMatchObject({ isLocalJSXCommand: true })
  })

  it('REPL 渲染层确实读取 toolJSX.isLocalJSXCommand —— 契约仍然成立', () => {
    // 若此断言失败（读取点为 0），说明渲染层已不再依赖该字段，
    // 可以放心从 emit 中剥离并更新本测试。
    const reads = REPL_SRC.match(/toolJSX\??\.isLocalJSXCommand/g) ?? []
    expect(reads.length).toBeGreaterThan(0)
  })

  it('toolJsxCentered 依赖 isLocalJSXCommand —— 终端面板走 centeredModal 的前提', () => {
    // 这是终端面板能否居中的判定式，回归就发生在它变恒为 false 上。
    expect(REPL_SRC).toMatch(/toolJsxCentered\s*=[^;]*isLocalJSXCommand/)
  })

  it('setToolJSXInternal 收到的是 emit（含标记），而非剥离后的 payload', () => {
    // 若 REPL 侧改成只传 decision.emit.jsx，标记同样会丢 —— 锁定用法。
    expect(REPL_SRC).toMatch(/setToolJSXInternal\(decision\.emit\)/)
  })

  it('emit 保留 isImmediate —— 渲染层读它决定即时命令的排布', () => {
    // 与 isLocalJSXCommand 同类：运行时靠 rest 展开能保留，但若决策函数
    // 改为逐字段构造，就会静默丢失。锁定「未知字段必须透传」。
    const d = resolveToolJSXUpdate(
      {
        jsx: 'dialog',
        shouldHidePromptInput: true,
        isLocalJSXCommand: true,
        isImmediate: true,
      },
      false,
    )
    if (d.kind !== 'set') throw new Error('unreachable')
    expect(d.emit).toMatchObject({ isImmediate: true })
  })

  it('REPL 渲染层确实读取 toolJSX.isImmediate —— 契约仍然成立', () => {
    const reads = REPL_SRC.match(/toolJSX\??\.isImmediate/g) ?? []
    expect(reads.length).toBeGreaterThan(0)
  })

  it('未知/新增字段一律透传 —— 决策函数不得逐字段白名单重构', () => {
    // 这是本文件存在的原因：任何"看起来只是清理"的逐字段重写都会
    // 静默丢掉渲染层依赖的字段。用一个虚构字段验证透传性质。
    const d = resolveToolJSXUpdate(
      {
        jsx: 'x',
        shouldHidePromptInput: false,
        isLocalJSXCommand: true,
        someFutureFlag: 'kept',
      } as never,
      false,
    )
    if (d.kind !== 'set') throw new Error('unreachable')
    expect(d.emit).toMatchObject({ someFutureFlag: 'kept' })
  })
})
