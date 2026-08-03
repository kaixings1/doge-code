import { c as _c } from "react/compiler-runtime";
import React, { createContext, type RefObject, useContext, useLayoutEffect, useMemo } from 'react';
import type { Key } from '../ink.js';
import { type ChordResolveResult, getBindingDisplayText, resolveKeyWithChordState } from './resolver.js';
import type { KeybindingContextName, ParsedBinding, ParsedKeystroke } from './types.js';

/** 动作回调的处理函数注册 */
type HandlerRegistration = {
  action: string;
  context: KeybindingContextName;
  handler: () => void;
};
type KeybindingContextValue = {
  /** 将按键输入解析为动作名称（支持和弦） */
  resolve: (input: string, key: Key, activeContexts: KeybindingContextName[]) => ChordResolveResult;

  /** 更新待定和弦状态 */
  setPendingChord: (pending: ParsedKeystroke[] | null) => void;

  /** 获取动作的显示文本（例如 "ctrl+t"） */
  getDisplayText: (action: string, context: KeybindingContextName) => string | undefined;

  /** 所有已解析的绑定（用于帮助显示） */
  bindings: ParsedBinding[];

  /** 当前待定和弦按键序列（不在和弦中时为 null） */
  pendingChord: ParsedKeystroke[] | null;

  /** 当前活动的按键绑定上下文（用于优先级解析） */
  activeContexts: Set<KeybindingContextName>;

  /** 注册一个上下文为活动状态（在挂载时调用） */
  registerActiveContext: (context: KeybindingContextName) => void;

  /** 注销一个上下文（在卸载时调用） */
  unregisterActiveContext: (context: KeybindingContextName) => void;

  /** 为动作注册处理函数（由 useKeybinding 使用） */
  registerHandler: (registration: HandlerRegistration) => () => void;

  /** 调用某个动作的所有处理函数（由 ChordInterceptor 使用） */
  invokeAction: (action: string) => boolean;
};
const KeybindingContext = createContext<KeybindingContextValue | null>(null);
type ProviderProps = {
  bindings: ParsedBinding[];
  /** 用于即时访问待定和弦的 ref（避免 React 状态延迟） */
  pendingChordRef: RefObject<ParsedKeystroke[] | null>;
  /** 用于重新渲染的状态值（UI 更新） */
  pendingChord: ParsedKeystroke[] | null;
  setPendingChord: (pending: ParsedKeystroke[] | null) => void;
  activeContexts: Set<KeybindingContextName>;
  registerActiveContext: (context: KeybindingContextName) => void;
  unregisterActiveContext: (context: KeybindingContextName) => void;
  /** 处理函数注册表的 ref（由 ChordInterceptor 使用） */
  handlerRegistryRef: RefObject<Map<string, Set<HandlerRegistration>>>;
  children: React.ReactNode;
};
export function KeybindingProvider(t0) {
  const $ = _c(24);
  const {
    bindings,
    pendingChordRef,
    pendingChord,
    setPendingChord,
    activeContexts,
    registerActiveContext,
    unregisterActiveContext,
    handlerRegistryRef,
    children
  } = t0;
  let t1;
  if ($[0] !== bindings) {
    t1 = (action, context) => getBindingDisplayText(action, context, bindings);
    $[0] = bindings;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const getDisplay = t1;
  let t2;
  if ($[2] !== handlerRegistryRef) {
    t2 = registration => {
      const registry = handlerRegistryRef.current;
      if (!registry) {
        return _temp;
      }
      if (!registry.has(registration.action)) {
        registry.set(registration.action, new Set());
      }
      registry.get(registration.action).add(registration);
      return () => {
        const handlers = registry.get(registration.action);
        if (handlers) {
          handlers.delete(registration);
          if (handlers.size === 0) {
            registry.delete(registration.action);
          }
        }
      };
    };
    $[2] = handlerRegistryRef;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const registerHandler = t2;
  let t3;
  if ($[4] !== activeContexts || $[5] !== handlerRegistryRef) {
    t3 = action_0 => {
      const registry_0 = handlerRegistryRef.current;
      if (!registry_0) {
        return false;
      }
      const handlers_0 = registry_0.get(action_0);
      if (!handlers_0 || handlers_0.size === 0) {
        return false;
      }
      for (const registration_0 of handlers_0) {
        if (activeContexts.has(registration_0.context)) {
          registration_0.handler();
          return true;
        }
      }
      return false;
    };
    $[4] = activeContexts;
    $[5] = handlerRegistryRef;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  const invokeAction = t3;
  let t4;
  if ($[7] !== bindings || $[8] !== pendingChordRef) {
    t4 = (input, key, contexts) => resolveKeyWithChordState(input, key, contexts, bindings, pendingChordRef.current);
    $[7] = bindings;
    $[8] = pendingChordRef;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  let t5;
  if ($[10] !== activeContexts || $[11] !== bindings || $[12] !== getDisplay || $[13] !== invokeAction || $[14] !== pendingChord || $[15] !== registerActiveContext || $[16] !== registerHandler || $[17] !== setPendingChord || $[18] !== t4 || $[19] !== unregisterActiveContext) {
    t5 = {
      resolve: t4,
      setPendingChord,
      getDisplayText: getDisplay,
      bindings,
      pendingChord,
      activeContexts,
      registerActiveContext,
      unregisterActiveContext,
      registerHandler,
      invokeAction
    };
    $[10] = activeContexts;
    $[11] = bindings;
    $[12] = getDisplay;
    $[13] = invokeAction;
    $[14] = pendingChord;
    $[15] = registerActiveContext;
    $[16] = registerHandler;
    $[17] = setPendingChord;
    $[18] = t4;
    $[19] = unregisterActiveContext;
    $[20] = t5;
  } else {
    t5 = $[20];
  }
  const value = t5;
  let t6;
  if ($[21] !== children || $[22] !== value) {
    t6 = <KeybindingContext.Provider value={value}>{children}</KeybindingContext.Provider>;
    $[21] = children;
    $[22] = value;
    $[23] = t6;
  } else {
    t6 = $[23];
  }
  return t6;
}
function _temp() {}
export function useKeybindingContext() {
  const ctx = useContext(KeybindingContext);
  if (!ctx) {
    throw new Error("useKeybindingContext 必须在 KeybindingProvider 中使用");
  }
  return ctx;
}

/**
 * 可选 hook，在 KeybindingProvider 外部返回 undefined。
 * 适用于可能在 provider 可用之前渲染的组件。
 */
export function useOptionalKeybindingContext() {
  return useContext(KeybindingContext);
}

/**
/**
 * 在组件挂载期间将按键绑定上下文注册为活动状态的 Hook。
 *
 * 当上下文已注册时，其按键绑定优先于全局绑定。
 * 这允许特定于上下文的绑定（如 ThemePicker 的 ctrl+t）在上下文
 * 活动时覆盖全局绑定（如待办事项切换）。
 *
 * @example
 * ```tsx
 * function ThemePicker() {
 *   useRegisterKeybindingContext('ThemePicker')
 *   // 现在 ThemePicker 的 ctrl+t 绑定优先于全局绑定
 * }
 * ```
 */
export function useRegisterKeybindingContext(context, t0) {
  const $ = _c(5);
  const isActive = t0 === undefined ? true : t0;
  const keybindingContext = useOptionalKeybindingContext();
  let t1;
  let t2;
  if ($[0] !== context || $[1] !== isActive || $[2] !== keybindingContext) {
    t1 = () => {
      if (!keybindingContext || !isActive) {
        return;
      }
      keybindingContext.registerActiveContext(context);
      return () => {
        keybindingContext.unregisterActiveContext(context);
      };
    };
    t2 = [context, keybindingContext, isActive];
    $[0] = context;
    $[1] = isActive;
    $[2] = keybindingContext;
    $[3] = t1;
    $[4] = t2;
  } else {
    t1 = $[3];
    t2 = $[4];
  }
  useLayoutEffect(t1, t2);
}
