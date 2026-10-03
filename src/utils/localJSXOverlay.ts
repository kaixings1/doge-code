/**
 * localJSX 覆盖层的更新决策。
 *
 * 从 REPL 的 setToolJSX 包装器抽出，使这条容易被静默违反的契约可被
 * 单测覆盖（原实现内联在组件里，测试只能复刻逻辑 —— 那种测试在生产
 * 代码改变时不会失败，等于没有保护）。
 *
 * 契约（三条，缺一即出错）：
 *  1. 开启 localJSX 命令 → 记录状态并显示；clearLocalJSX 标志不进入状态
 *  2. 已有 localJSX 激活时 → 一切不带 clearLocalJSX 的更新被忽略
 *     （这是给工具的："本地 JSX 命令显示期间，工具输出不得顶掉它"）
 *  3. 只有带 clearLocalJSX 的更新才能清除
 *
 * 违反第 2/3 条的后果是隐蔽的：覆盖层不卸载、或被意外清除，用户只看到
 * 「按了没反应」。Alt+J 终端面板曾因漏传 clearLocalJSX 关不掉。
 *
 * 用泛型保留调用方的 jsx 类型，使 REPL 侧无需 `as` 断言 —— 断言会让
 * 类型系统停止保护这里，而此处恰是最需要保护的地方。
 */

/**
 * 提交给渲染槽的负载。
 *
 * ⚠️ isLocalJSXCommand **必须保留**：渲染层有 5 处读它（REPL.tsx:1022 /
 * 2079 / 4261 / 4262 / 4340），其中 toolJsxCentered 决定覆盖层是否走
 * centeredModal（终端面板依赖这条路径）。剥离它会让面板退回非居中渲染。
 * clearLocalJSX 才是纯指令，不进入负载。
 */
export type ToolJSXPayload<J> = {
  jsx: J
  shouldHidePromptInput: boolean
  shouldContinueAnimation?: true
  showSpinner?: boolean
  isLocalJSXCommand?: boolean
  /**
   * 「即时命令」（/model、/mcp、/btw 等）标记，由 processSlashCommand 传入。
   * 渲染层在 REPL.tsx:4371 / 4387 读它决定覆盖层的排布方式。
   * 必须声明在此：运行时靠 rest 展开能保留，但类型上漏掉会让渲染层的
   * 读取失去保护（与本文件顶端记录的 emit 回归同类）。
   */
  isImmediate?: boolean
}

/** 调用方传入的更新参数 */
export type ToolJSXArgs<J> = (ToolJSXPayload<J> & {
  isLocalJSXCommand?: boolean
  clearLocalJSX?: boolean
}) | null

/** 应记录的 localJSX 状态（负载 + 标记） */
export type LocalJSXState<J> = ToolJSXPayload<J> & { isLocalJSXCommand: true }

export type ToolJSXDecision<J> =
  /** 忽略本次更新（工具输出不得顶掉活动的 localJSX 覆盖层） */
  | { kind: 'ignore' }
  /** 清除覆盖层 */
  | { kind: 'clear' }
  /**
   * 设置/更新覆盖层。
   * state 为要记录的 localJSX 状态（非 localJSX 更新时为 null）；
   * emit 为要提交给渲染槽的负载（null 表示清空）。
   */
  | { kind: 'set'; state: LocalJSXState<J> | null; emit: ToolJSXPayload<J> | null }

/**
 * 根据当前是否已有活动 localJSX 覆盖层，决定这次更新怎么处理。
 *
 * @param args 调用方传入的更新
 * @param hasActiveLocalJSX 当前是否有活动的 localJSX 覆盖层
 */
export function resolveToolJSXUpdate<J>(
  args: ToolJSXArgs<J>,
  hasActiveLocalJSX: boolean,
): ToolJSXDecision<J> {
  // 1. 开启/更新 localJSX 命令：记录状态并显示。
  //    clearLocalJSX 是「指令」而非「状态」，不能存进 state —— 否则下次
  //    读取会把一次性的清除标志当成持续状态。
  if (args?.isLocalJSXCommand) {
    // clearLocalJSX 是纯指令，剥离；isLocalJSXCommand 必须同时进入 state
    // 和 emit —— 渲染层读 emit.isLocalJSXCommand 决定走 centeredModal。
    const { clearLocalJSX: _clear, ...payload } = args
    return {
      kind: 'set',
      state: { ...payload, isLocalJSXCommand: true },
      emit: payload,
    }
  }

  // 2. 已有 localJSX 激活：工具更新不得顶掉它，除非明确要求清除
  if (hasActiveLocalJSX) {
    return args?.clearLocalJSX ? { kind: 'clear' } : { kind: 'ignore' }
  }

  // 3. 无活动覆盖层：允许任何更新；带 clearLocalJSX 视为清除
  if (args?.clearLocalJSX) return { kind: 'clear' }
  if (args === null) return { kind: 'set', state: null, emit: null }
  const { clearLocalJSX: _c2, ...payload } = args
  return { kind: 'set', state: null, emit: payload }
}
