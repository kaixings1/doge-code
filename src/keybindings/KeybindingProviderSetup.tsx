import { c as _c } from "react/compiler-runtime";
/**
 * 将 KeybindingProvider 集成到应用中的设置工具。
 *
 * 此文件提供绑定和一个组合式 provider，可添加到应用的组件树中。
 * 它加载默认绑定和用户定义的绑定（来自 ~/.claude/keybindings.json），
 * 并支持文件变更时的热重载。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNotifications } from '../context/notifications.js';
import type { InputEvent } from '../ink/events/input-event.js';
// ChordInterceptor 有意使用 useInput 在其他处理函数之前拦截所有按键 -
// 这是和弦序列支持所必需的
// eslint-disable-next-line custom-rules/prefer-use-keybindings
import { type Key, useInput } from '../ink.js';
import { count } from '../utils/array.js';
import { logForDebugging } from '../utils/debug.js';
import { plural } from '../utils/stringUtils.js';
import { KeybindingProvider } from './KeybindingContext.js';
import { initializeKeybindingWatcher, type KeybindingsLoadResult, loadKeybindingsSyncWithWarnings, subscribeToKeybindingChanges } from './loadUserBindings.js';
import { resolveKeyWithChordState } from './resolver.js';
import type { KeybindingContextName, ParsedBinding, ParsedKeystroke } from './types.js';
import type { KeybindingWarning } from './validate.js';

/**
 * 和弦序列的超时时间（毫秒）。
 * 如果用户在此时间内未完成和弦，则取消。
 */
const CHORD_TIMEOUT_MS = 1000;
type Props = {
  children: React.ReactNode;
};

/**
 * 按键绑定 provider，支持默认 + 用户绑定和热重载。
 *
 * 用法：用此 provider 包裹应用以启用按键绑定支持。
 *
 * ```tsx
 * <AppStateProvider>
 *   <KeybindingSetup>
 *     <REPL ... />
 *   </KeybindingSetup>
 * </AppStateProvider>
 * ```
 *
 * 功能：
 * - 从代码加载默认绑定
 * - 与 ~/.claude/keybindings.json 中的用户绑定合并
 * - 监视文件变更并自动重新加载（热重载）
 * - 用户绑定覆盖默认绑定（后定义的条目胜出）
 * - 支持和弦及自动超时
 */
/**
 * 通过通知向用户显示按键绑定警告。
 * 显示一条简短消息，指向 /doctor 以查看详情。
 */
function useKeybindingWarnings(warnings, isReload) {
  const $ = _c(9);
  const {
    addNotification,
    removeNotification
  } = useNotifications();
  let t0;
  if ($[0] !== addNotification || $[1] !== removeNotification || $[2] !== warnings) {
    t0 = () => {
      if (warnings.length === 0) {
        removeNotification("keybinding-config-warning");
        return;
      }
      const errorCount = count(warnings, _temp);
      const warnCount = count(warnings, _temp2);
      let message;
      if (errorCount > 0 && warnCount > 0) {
        message = `Found ${errorCount} keybinding ${plural(errorCount, "error")} and ${warnCount} ${plural(warnCount, "warning")}`;
      } else {
        if (errorCount > 0) {
          message = `Found ${errorCount} keybinding ${plural(errorCount, "error")}`;
        } else {
          message = `Found ${warnCount} keybinding ${plural(warnCount, "warning")}`;
        }
      }
      message = message + " \xB7 /doctor for details";
      addNotification({
        key: "keybinding-config-warning",
        text: message,
        color: errorCount > 0 ? "error" : "warning",
        priority: errorCount > 0 ? "immediate" : "high",
        timeoutMs: 60000
      });
    };
    $[0] = addNotification;
    $[1] = removeNotification;
    $[2] = warnings;
    $[3] = t0;
  } else {
    t0 = $[3];
  }
  let t1;
  if ($[4] !== addNotification || $[5] !== isReload || $[6] !== removeNotification || $[7] !== warnings) {
    t1 = [warnings, isReload, addNotification, removeNotification];
    $[4] = addNotification;
    $[5] = isReload;
    $[6] = removeNotification;
    $[7] = warnings;
    $[8] = t1;
  } else {
    t1 = $[8];
  }
  useEffect(t0, t1);
}
function _temp2(w_0) {
  return w_0.severity === "warning";
}
function _temp(w) {
  return w.severity === "error";
}
export function KeybindingSetup({
  children
}: Props): React.ReactNode {
  // 同步加载绑定以便初始渲染
  const [{
    bindings,
    warnings
  }, setLoadResult] = useState<KeybindingsLoadResult>(() => {
    const result = loadKeybindingsSyncWithWarnings();
    logForDebugging(`[keybindings] KeybindingSetup initialized with ${result.bindings.length} bindings, ${result.warnings.length} warnings`);
    return result;
  });

  // 跟踪是否为重新加载（非初始加载）
  const [isReload, setIsReload] = useState(false);

  // 通过通知显示警告
  useKeybindingWarnings(warnings, isReload);

  // 和弦状态管理 - ref 用于即时访问，state 用于重新渲染
  // ref 被 resolve() 用于获取当前值而无需等待重新渲染
  // state 用于在需要时触发重新渲染（例如 UI 更新）
  const pendingChordRef = useRef<ParsedKeystroke[] | null>(null);
  const [pendingChord, setPendingChordState] = useState<ParsedKeystroke[] | null>(null);
  const chordTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 动作回调的处理函数注册表（ChordInterceptor 用它调用处理函数）
  const handlerRegistryRef = useRef(new Map<string, Set<{
    action: string;
    context: KeybindingContextName;
    handler: () => void;
  }>>());

  // 活动上下文跟踪，用于按键绑定优先级解析
  // 使用 ref 而非 state 以进行同步更新 - 输入处理函数需要
  // 立即看到当前值，而非在 React 渲染周期之后。
  const activeContextsRef = useRef<Set<KeybindingContextName>>(new Set());
  const registerActiveContext = useCallback((context: KeybindingContextName) => {
    activeContextsRef.current.add(context);
  }, []);
  const unregisterActiveContext = useCallback((context_0: KeybindingContextName) => {
    activeContextsRef.current.delete(context_0);
  }, []);

  // 在组件卸载或和弦变化时清除和弦超时
  const clearChordTimeout = useCallback(() => {
    if (chordTimeoutRef.current) {
      clearTimeout(chordTimeoutRef.current);
      chordTimeoutRef.current = null;
    }
  }, []);

  // setPendingChord 的包装函数，管理超时并同步 ref+state
  const setPendingChord = useCallback((pending: ParsedKeystroke[] | null) => {
    clearChordTimeout();
    if (pending !== null) {
      // 设置超时，在未完成时取消和弦
      chordTimeoutRef.current = setTimeout((pendingChordRef_0, setPendingChordState_0) => {
        logForDebugging('[keybindings] Chord timeout - cancelling');
        pendingChordRef_0.current = null;
        setPendingChordState_0(null);
      }, CHORD_TIMEOUT_MS, pendingChordRef, setPendingChordState);
    }

    // 立即更新 ref 以便在 resolve() 中同步访问
    pendingChordRef.current = pending;
    // 更新 state 以触发 UI 的重新渲染
    setPendingChordState(pending);
  }, [clearChordTimeout]);
  useEffect(() => {
    // 初始化文件监视器（幂等 - 仅运行一次）
    void initializeKeybindingWatcher();

    // 订阅变更
    const unsubscribe = subscribeToKeybindingChanges(result_0 => {
      // 任何回调调用都是重新加载，因为初始加载是
      // 在 useState 中同步完成的，而非通过此订阅
      setIsReload(true);
      setLoadResult(result_0);
      logForDebugging(`[keybindings] Reloaded: ${result_0.bindings.length} bindings, ${result_0.warnings.length} warnings`);
    });
    return () => {
      unsubscribe();
      clearChordTimeout();
    };
  }, [clearChordTimeout]);
  return <KeybindingProvider bindings={bindings} pendingChordRef={pendingChordRef} pendingChord={pendingChord} setPendingChord={setPendingChord} activeContexts={activeContextsRef.current} registerActiveContext={registerActiveContext} unregisterActiveContext={unregisterActiveContext} handlerRegistryRef={handlerRegistryRef}>
      <ChordInterceptor bindings={bindings} pendingChordRef={pendingChordRef} setPendingChord={setPendingChord} activeContexts={activeContextsRef.current} handlerRegistryRef={handlerRegistryRef} />
      {children}
    </KeybindingProvider>;
}

/**
 * 全局和弦拦截器，优先（在子组件之前）注册 useInput。
 *
 * 此组件拦截属于和弦序列的按键，并在其他处理函数
 * （如 PromptInput）看到它们之前停止传播。
 *
 * 没有此拦截器，和弦的第二个键（例如 "ctrl+c r" 中的 'r'）将被
 * PromptInput 捕获并添加到输入字段中，而按键绑定系统无法识别
 * 它正在完成一个和弦。
 */
type HandlerRegistration = {
  action: string;
  context: KeybindingContextName;
  handler: () => void;
};
function ChordInterceptor(t0) {
  const $ = _c(6);
  const {
    bindings,
    pendingChordRef,
    setPendingChord,
    activeContexts,
    handlerRegistryRef
  } = t0;
  let t1;
  if ($[0] !== activeContexts || $[1] !== bindings || $[2] !== handlerRegistryRef || $[3] !== pendingChordRef || $[4] !== setPendingChord) {
    t1 = (input, key, event) => {
      if ((key.wheelUp || key.wheelDown) && pendingChordRef.current === null) {
        return;
      }
      const registry = handlerRegistryRef.current;
      const handlerContexts = new Set();
      if (registry) {
        for (const handlers of registry.values()) {
          for (const registration of handlers) {
            handlerContexts.add(registration.context);
          }
        }
      }
      const contexts = [...handlerContexts, ...activeContexts, "Global"];
      const wasInChord = pendingChordRef.current !== null;
      const result = resolveKeyWithChordState(input, key, contexts, bindings, pendingChordRef.current);
      bb23: switch (result.type) {
        case "chord_started":
          {
            setPendingChord(result.pending);
            event.stopImmediatePropagation();
            break bb23;
          }
        case "match":
          {
            setPendingChord(null);
            // DOGE: 和弦时执行 handler 并拦截事件；
            // 单键只在 app:retryNow 时执行 handler 并拦截
            if (wasInChord || result.action === "app:retryNow") {
              const contextsSet = new Set(contexts);
              if (registry) {
                const handlers_0 = registry.get(result.action);
                if (handlers_0 && handlers_0.size > 0) {
                  for (const registration_0 of handlers_0) {
                    if (contextsSet.has(registration_0.context)) {
                      registration_0.handler();
                      event.stopImmediatePropagation();
                      break;
                    }
                  }
                }
              }
            }
            break bb23;
          }
        case "chord_cancelled":
          {
            setPendingChord(null);
            event.stopImmediatePropagation();
            break bb23;
          }
        case "unbound":
          {
            setPendingChord(null);
            event.stopImmediatePropagation();
            break bb23;
          }
        case "none":
      }
    };
    $[0] = activeContexts;
    $[1] = bindings;
    $[2] = handlerRegistryRef;
    $[3] = pendingChordRef;
    $[4] = setPendingChord;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  const handleInput = t1;
  useInput(handleInput);
  return null;
}
