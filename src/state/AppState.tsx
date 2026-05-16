import { c as _c } from "react/compiler-runtime";
import { feature } from 'bun:bundle';
import React, { useContext, useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import { MailboxProvider } from '../context/mailbox.js';
import { useSettingsChange } from '../hooks/useSettingsChange.js';
import { logForDebugging } from '../utils/debug.js';
import { createDisabledBypassPermissionsContext, isBypassPermissionsModeDisabled } from '../utils/permissions/permissionSetup.js';
import { applySettingsChange } from '../utils/settings/applySettingsChange.js';
import type { SettingSource } from '../utils/settings/constants.js';
import { createStore } from './store.js';

// DCE：语音上下文仅限 ant 内部。外部构建使用透传。
 
const VoiceProvider: (props: {
  children: React.ReactNode;
}) => React.ReactNode = feature('VOICE_MODE') ? require('../context/voice.js').VoiceProvider : ({
  children
}) => children;

 
import { type AppState, type AppStateStore, getDefaultAppState } from './AppStateStore.js';

// TODO：当所有调用者都直接从 ./AppStateStore.js 导入后，移除这些重导出。
// 迁移期间为向后兼容而保留，以便 .ts 调用者可以增量地脱离 .tsx 导入并停止拉取 React。
export { type AppState, type AppStateStore, type CompletionBoundary, getDefaultAppState, IDLE_SPECULATION_STATE, type SpeculationResult, type SpeculationState } from './AppStateStore.js';
export const AppStoreContext = React.createContext<AppStateStore | null>(null);
type Props = {
  children: React.ReactNode;
  initialState?: AppState;
  onChangeAppState?: (args: {
    newState: AppState;
    oldState: AppState;
  }) => void;
};
const HasAppStateContext = React.createContext<boolean>(false);
export function AppStateProvider(t0) {
  const $ = _c(13);
  const {
    children,
    initialState,
    onChangeAppState
  } = t0;
  const hasAppStateContext = useContext(HasAppStateContext);
  if (hasAppStateContext) {
    throw new Error("AppStateProvider 不能嵌套在另一个 AppStateProvider 内部");
  }
  let t1;
  if ($[0] !== initialState || $[1] !== onChangeAppState) {
    t1 = () => createStore(initialState ?? getDefaultAppState(), onChangeAppState);
    $[0] = initialState;
    $[1] = onChangeAppState;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const [store] = useState(t1);
  let t2;
  if ($[3] !== store) {
    t2 = () => {
      const {
        toolPermissionContext
      } = store.getState();
      if (toolPermissionContext.isBypassPermissionsModeAvailable && isBypassPermissionsModeDisabled()) {
        logForDebugging("Disabling bypass permissions mode on mount (remote settings loaded before mount)");
        store.setState(_temp);
      }
    };
    $[3] = store;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = [];
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  useEffect(t2, t3);
  let t4;
  if ($[6] !== store.setState) {
    t4 = source => applySettingsChange(source, store.setState);
    $[6] = store.setState;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  const onSettingsChange = useEffectEvent(t4);
  useSettingsChange(onSettingsChange);
  let t5;
  if ($[8] !== children) {
    t5 = <MailboxProvider><VoiceProvider>{children}</VoiceProvider></MailboxProvider>;
    $[8] = children;
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  let t6;
  if ($[10] !== store || $[11] !== t5) {
    t6 = <HasAppStateContext.Provider value={true}><AppStoreContext.Provider value={store}>{t5}</AppStoreContext.Provider></HasAppStateContext.Provider>;
    $[10] = store;
    $[11] = t5;
    $[12] = t6;
  } else {
    t6 = $[12];
  }
  return t6;
}
function _temp(prev) {
  return {
    ...prev,
    toolPermissionContext: createDisabledBypassPermissionsContext(prev.toolPermissionContext)
  };
}
function useAppStore(): AppStateStore {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new ReferenceError('useAppState/useSetAppState 不能在 <AppStateProvider /> 外部调用');
  }
  return store;
}

/**
 * 订阅 AppState 的某个切片。仅当所选值发生变化时重新渲染（通过 Object.is 比较）。
 *
 * 对于多个独立字段，多次调用此钩子：
 * ```
 * const verbose = useAppState(s => s.verbose)
 * const model = useAppState(s => s.mainLoopModel)
 * ```
 *
 * 不要从选择器返回新对象——Object.is 总会认为它们已更改。
 * 相反，选择现有的子对象引用：
 * ```
 * const { text, promptId } = useAppState(s => s.promptSuggestion) // 好
 * ```
 */
export function useAppState(selector) {
  const $ = _c(3);
  const store = useAppStore();
  let t0;
  if ($[0] !== selector || $[1] !== store) {
    t0 = () => {
      const state = store.getState();
      const selected = selector(state);
      if (false && state === selected) {
        throw new Error(`你的选择器 \`useAppState(${selector.toString()})\` 返回了原始状态，这是不允许的。你必须返回一个属性以实现优化渲染。`);
      }
      return selected;
    };
    $[0] = selector;
    $[1] = store;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  const get = t0;
  return useSyncExternalStore(store.subscribe, get, get);
}

/**
 * 获取 setAppState 更新器而不订阅任何状态。
 * 返回一个永不改变的稳定引用——仅使用此钩子的组件永远不会因状态变化而重新渲染。
 */
export function useSetAppState() {
  return useAppStore().setState;
}

/**
 * 直接获取 store（用于将 getState/setState 传递给非 React 代码）。
 */
export function useAppStateStore() {
  return useAppStore();
}
const NOOP_SUBSCRIBE = () => () => {};

/**
 * useAppState 的安全版本，如果在 AppStateProvider 外部调用则返回 undefined。
 * 对于可能在 AppStateProvider 不可用的上下文中渲染的组件很有用。
 */
export function useAppStateMaybeOutsideOfProvider(selector) {
  const $ = _c(3);
  const store = useContext(AppStoreContext);
  let t0;
  if ($[0] !== selector || $[1] !== store) {
    t0 = () => store ? selector(store.getState()) : undefined;
    $[0] = selector;
    $[1] = store;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  return useSyncExternalStore(store ? store.subscribe : NOOP_SUBSCRIBE, t0);
}
