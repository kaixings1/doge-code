import { c as _c } from "react/compiler-runtime";
/**
 * 用于 Escape 键协调的覆盖层跟踪。
 *
 * 解决了当覆盖层（如带 onCancel 的 Select）打开时的 Escape 键处理问题。CancelRequestHandler
 * 需要知道何时存在活动覆盖层，以便用户只是想关闭覆盖层时不会取消请求。
 *
 * 用法：
 * 1. 在任何覆盖层组件中调用 useRegisterOverlay() 自动注册它
 * 2. 调用 useIsOverlayActive() 检查是否有任何覆盖层当前处于活动状态
 *
 * 该钩子在挂载时自动注册，在卸载时取消注册，
 * 因此无需手动清理或状态管理。
 */
import { useContext, useEffect, useLayoutEffect } from 'react';
import instances from '../ink/instances.js';
import { AppStoreContext, useAppState } from '../state/AppState.js';

// Non-modal overlays that shouldn't disable TextInput focus
const NON_MODAL_OVERLAYS = new Set(['autocomplete']);

/**
 * 将组件注册为活动覆盖层的钩子。
 * 在挂载时自动注册，在卸载时取消注册。
 *
 * @param id - 此覆盖层的唯一标识符（例如，'select'、'multi-select'）
 * @param enabled - 是否注册（默认：true）。根据组件属性条件性注册，
 *                  例如仅在提供 onCancel 时注册。
 *
 * @example
 * // 根据是否支持取消进行条件注册
 * function useSelectInput({ state }) {
 *   useRegisterOverlay('select', !!state.onCancel)
 *   // ...
 * }
 */
export function useRegisterOverlay(id, t0) {
  const $ = _c(8);
  const enabled = t0 === undefined ? true : t0;
  const store = useContext(AppStoreContext);
  const setAppState = store?.setState;
  let t1;
  let t2;
  if ($[0] !== enabled || $[1] !== id || $[2] !== setAppState) {
    t1 = () => {
      if (!enabled || !setAppState) {
        return;
      }
      setAppState(prev => {
        if (prev.activeOverlays.has(id)) {
          return prev;
        }
        const next = new Set(prev.activeOverlays);
        next.add(id);
        return {
          ...prev,
          activeOverlays: next
        };
      });
      return () => {
        setAppState(prev_0 => {
          if (!prev_0.activeOverlays.has(id)) {
            return prev_0;
          }
          const next_0 = new Set(prev_0.activeOverlays);
          next_0.delete(id);
          return {
            ...prev_0,
            activeOverlays: next_0
          };
        });
      };
    };
    t2 = [id, enabled, setAppState];
    $[0] = enabled;
    $[1] = id;
    $[2] = setAppState;
    $[3] = t1;
    $[4] = t2;
  } else {
    t1 = $[3];
    t2 = $[4];
  }
  useEffect(t1, t2);
  let t3;
  let t4;
  if ($[5] !== enabled) {
    t3 = () => {
      if (!enabled) {
        return;
      }
      return _temp;
    };
    t4 = [enabled];
    $[5] = enabled;
    $[6] = t3;
    $[7] = t4;
  } else {
    t3 = $[6];
    t4 = $[7];
  }
  useLayoutEffect(t3, t4);
}

/**
 * 检查是否有任何覆盖层当前处于活动状态的钩子。
 * 这是响应式的 — 当覆盖层状态改变时组件会重新渲染。
 *
 * @returns 如果有任何覆盖层当前处于活动状态则为 true
 *
 * @example
 * function CancelRequestHandler() {
 *   const isOverlayActive = useIsOverlayActive()
 *   const isActive = !isOverlayActive && canCancelRunningTask
 *   useKeybinding('chat:cancel', handleCancel, { isActive })
 * }
 */
function _temp() {
  return instances.get(process.stdout)?.invalidatePrevFrame();
}
export function useIsOverlayActive() {
  return useAppState(_temp2);
}

/**
 * 检查是否有任何模态覆盖层当前处于活动状态的钩子。
 * 模态覆盖层是应该捕获所有输入（如 Select 对话框）的覆盖层。
 * 非模态覆盖层（如自动补全）不会禁用 TextInput 焦点。
 *
 * @returns 如果有任何模态覆盖层当前处于活动状态则为 true
 *
 * @example
 * // 用于 TextInput 焦点 - 允许在自动补全期间输入
 * focus: !isSearchingHistory && !isModalOverlayActive
 */
function _temp2(s) {
  return s.activeOverlays.size > 0;
}
export function useIsModalOverlayActive() {
  return useAppState(_temp3);
}
function _temp3(s) {
  for (const id of s.activeOverlays) {
    if (!NON_MODAL_OVERLAYS.has(id)) {
      return true;
    }
  }
  return false;
}
