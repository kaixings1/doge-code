import { c as _c } from "react/compiler-runtime";
/**
 * Portal for content that floats above the prompt so it escapes
 * FullscreenLayout 底部插槽的 `overflowY:hidden` 裁剪。
 *
 * 这个裁剪是负载性的 (CC-668: 长粘贴会挤压 ScrollBox)，但浮动覆盖层使用
 * `position:absolute bottom="100%"` 浮动到提示符上方 — 而 Ink 的裁剪堆栈
 * 与所有后代相交，因此它们被裁剪到约 1 行。
 *
 * 两个通道：
 * - `useSetPromptOverlay` — 斜杠命令建议数据（结构化，由 PromptInputFooter 写入）
 * - `useSetPromptOverlayDialog` — 任意对话框节点（例如 AutoModeOptInDialog，由 PromptInput 写入）
 *
 * FullscreenLayout 读取两者并在裁剪插槽外渲染它们。
 *
 * 拆分为数据/设置器上下文对，这样写入者永远不会因自己的写入而重新渲染 — 设置器上下文是稳定的。
 */
import React, { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { SuggestionItem } from '../components/PromptInput/PromptInputFooterSuggestions.js';
export type PromptOverlayData = {
  suggestions: SuggestionItem[];
  selectedSuggestion: number;
  maxColumnWidth?: number;
};
type Setter<T> = (d: T | null) => void;
const DataContext = createContext<PromptOverlayData | null>(null);
const SetContext = createContext<Setter<PromptOverlayData> | null>(null);
const DialogContext = createContext<ReactNode>(null);
const SetDialogContext = createContext<Setter<ReactNode> | null>(null);
export function PromptOverlayProvider(t0) {
  const $ = _c(6);
  const {
    children
  } = t0;
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null);
  let t1;
  if ($[0] !== children || $[1] !== dialog) {
    t1 = <DialogContext.Provider value={dialog}>{children}</DialogContext.Provider>;
    $[0] = children;
    $[1] = dialog;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== data || $[4] !== t1) {
    t2 = <SetContext.Provider value={setData}><SetDialogContext.Provider value={setDialog}><DataContext.Provider value={data}>{t1}</DataContext.Provider></SetDialogContext.Provider></SetContext.Provider>;
    $[3] = data;
    $[4] = t1;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  return t2;
}
export function usePromptOverlay() {
  return useContext(DataContext);
}
export function usePromptOverlayDialog() {
  return useContext(DialogContext);
}

/**
 * 为浮动覆盖层注册建议数据。卸载时清除。
 * 在非全屏环境下无效（改为内联渲染）。
 */
export function useSetPromptOverlay(data) {
  const $ = _c(4);
  const set = useContext(SetContext);
  let t0;
  let t1;
  if ($[0] !== data || $[1] !== set) {
    t0 = () => {
      if (!set) {
        return;
      }
      set(data);
      return () => set(null);
    };
    t1 = [set, data];
    $[0] = data;
    $[1] = set;
    $[2] = t0;
    $[3] = t1;
  } else {
    t0 = $[2];
    t1 = $[3];
  }
  useEffect(t0, t1);
}

/**
 * 注册一个对话框节点，使其浮动到提示符上方。卸载时清除。
 * 在非全屏环境下无效（改为内联渲染）。
 */
export function useSetPromptOverlayDialog(node) {
  const $ = _c(4);
  const set = useContext(SetDialogContext);
  let t0;
  let t1;
  if ($[0] !== node || $[1] !== set) {
    t0 = () => {
      if (!set) {
        return;
      }
      set(node);
      return () => set(null);
    };
    t1 = [set, node];
    $[0] = node;
    $[1] = set;
    $[2] = t0;
    $[3] = t1;
  } else {
    t0 = $[2];
    t1 = $[3];
  }
  useEffect(t0, t1);
}
