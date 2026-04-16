import { c as _c } from "react/compiler-runtime";
import React, { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { createStore, type Store } from '../state/store.js';
export type VoiceState = {
  voiceState: 'idle' | 'recording' | 'processing'; // 语音状态：空闲/录音中/处理中
  voiceError: string | null; // 语音错误信息
  voiceInterimTranscript: string; // 临时转录文本
  voiceAudioLevels: number[]; // 音频电平
  voiceWarmingUp: boolean; // 是否正在预热
};
const DEFAULT_STATE: VoiceState = {
  voiceState: 'idle',
  voiceError: null,
  voiceInterimTranscript: '',
  voiceAudioLevels: [],
  voiceWarmingUp: false
};
type VoiceStore = Store<VoiceState>;
const VoiceContext = createContext<VoiceStore | null>(null);
type Props = {
  children: React.ReactNode;
};
export function VoiceProvider(t0) {
  const $ = _c(3);
  const {
    children
  } = t0;
  const [store] = useState(_temp);
  let t1;
  if ($[0] !== children || $[1] !== store) {
    t1 = <VoiceContext.Provider value={store}>{children}</VoiceContext.Provider>;
    $[0] = children;
    $[1] = store;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}
function _temp() {
  return createStore(DEFAULT_STATE);
}
function useVoiceStore() {
  const store = useContext(VoiceContext);
  if (!store) {
    throw new Error("useVoiceState 必须在 VoiceProvider 内使用");
  }
  return store;
}

/**
 * 订阅语音状态的一部分。仅在选中的值改变时重新渲染（通过 Object.is 比较）。
 */
export function useVoiceState(selector) {
  const $ = _c(3);
  const store = useVoiceStore();
  let t0;
  if ($[0] !== selector || $[1] !== store) {
    t0 = () => selector(store.getState());
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
 * 获取语音状态设置器。稳定引用 — 永远不会导致重新渲染。
 * store.setState 是同步的：调用者可以在之后立即读取 getVoiceState() 来观察新值（VoiceKeybindingHandler 依赖于此）。
 */
export function useSetVoiceState() {
  return useVoiceStore().setState;
}

/**
 * 获取回调中新鲜状态的同步读取器。与 useVoiceState（订阅）不同，这不会导致重新渲染 — 在需要读取同一 tick 中之前设置的状态的内部事件处理器中使用。
 */
export function useGetVoiceState() {
  return useVoiceStore().getState;
}
