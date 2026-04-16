import { c as _c } from "react/compiler-runtime";
import { createContext, type RefObject, useContext } from 'react';
import type { ScrollBoxHandle } from '../ink/components/ScrollBox.js';

/**
 * 由 FullscreenLayout 设置，用于在其 `modal` 槽中渲染内容 —
 * 用于斜杠命令对话框的绝对定位底部锚定面板。
 * 消费者使用它来：
 *
 * - 抑制顶层框架 — `Pane` 跳过其完整终端宽度的
 *   `Divider`（FullscreenLayout 已经绘制了 ▔ 分隔符）。
 * - 将 Select 分页大小设置为可用行数 — modal 的内部区域小于终端（行数减去
 *   转录预览减去分隔符），因此从 `useTerminalSize().rows` 限制其可见选项数量的组件
 *   如果没有这个上下文会溢出。
 * - 在标签切换时重置滚动 — Tabs 通过
 *   `selectedTabIndex` 键入 ScrollBox，在标签切换时重新挂载，所以 scrollTop 重置为 0
 *   无需 scrollTo() 时间游戏。
 *
 * null = 不在 modal 槽内。
 */
type ModalCtx = {
  rows: number;
  columns: number;
  scrollRef: RefObject<ScrollBoxHandle | null> | null;
};
export const ModalContext = createContext<ModalCtx | null>(null);
export function useIsInsideModal() {
  return useContext(ModalContext) !== null;
}

/**
 * 在 Modal 内部可用的内容行/列，否则回退到提供的终端大小。当组件限制其可见内容高度时
 * 请使用它而不是 `useTerminalSize()` — modal 的内部区域小于终端。
 */
export function useModalOrTerminalSize(fallback) {
  const $ = _c(3);
  const ctx = useContext(ModalContext);
  let t0;
  if ($[0] !== ctx || $[1] !== fallback) {
    t0 = ctx ? {
      rows: ctx.rows,
      columns: ctx.columns
    } : fallback;
    $[0] = ctx;
    $[1] = fallback;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  return t0;
}
export function useModalScrollRef() {
  return useContext(ModalContext)?.scrollRef ?? null;
}
