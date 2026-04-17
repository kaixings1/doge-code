import type * as React from 'react';
import { useCallback, useEffect } from 'react';
import { useAppStateStore, useSetAppState } from '../state/AppState.js';
import type { Theme } from '../utils/theme.js';
type Priority = 'low' | 'medium' | 'high' | 'immediate';
type BaseNotification = {
  key: string;
  /**
   * 此通知无效化的通知键。
   * 如果被无效化，通知将从队列中移除，
   * 并且如果当前显示，立即清除。
   */
  invalidates?: string[];
  priority: Priority;
  timeoutMs?: number;
  /**
   * Combine notifications with the same key, like Array.reduce().
   * Called as fold(accumulator, incoming) when a notification with a matching
   * key already exists in the queue or is currently displayed.
   * Returns the merged notification (should carry fold forward for future merges).
   */
  fold?: (accumulator: Notification, incoming: Notification) => Notification;
};
type TextNotification = BaseNotification & {
  text: string;
  color?: keyof Theme;
};
type JSXNotification = BaseNotification & {
  jsx: React.ReactNode;
};
type AddNotificationFn = (content: Notification) => void;
type RemoveNotificationFn = (key: string) => void;
export type Notification = TextNotification | JSXNotification;
const DEFAULT_TIMEOUT_MS = 8000;

// Track current timeout to clear it when immediate notifications arrive
let currentTimeoutId: NodeJS.Timeout | null = null;
export function useNotifications(): {
  addNotification: AddNotificationFn;
  removeNotification: RemoveNotificationFn;
} {
  const store = useAppStateStore();
  const setAppState = useSetAppState();

  // 当前通知完成或队列改变时处理队列
  const processQueue = useCallback(() => {
    setAppState(prev => {
      const next = getNext(prev.notifications.queue);
      if (prev.notifications.current !== null || !next) {
        return prev;
      }
      currentTimeoutId = setTimeout((setAppState, nextKey, processQueue) => {
        currentTimeoutId = null;
        setAppState(prev => {
          // 通过键而不是引用比较以处理重新创建的通知
          if (prev.notifications.current?.key !== nextKey) {
            return prev;
          }
          return {
            ...prev,
            notifications: {
              queue: prev.notifications.queue,
              current: null
            }
          };
        });
        processQueue();
      }, next.timeoutMs ?? DEFAULT_TIMEOUT_MS, setAppState, next.key, processQueue);
      return {
        ...prev,
        notifications: {
          queue: prev.notifications.queue.filter(_ => _ !== next),
          current: next
        }
      };
    });
  }, [setAppState]);
  const addNotification = useCallback<AddNotificationFn>((notif: Notification) => {
    // 处理立即优先级的通知
    if (notif.priority === 'immediate') {
      // 清除任何现有的超时，因为我们正在显示新的立即通知
      if (currentTimeoutId) {
        clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
      }

      // 设置立即通知的超时
      currentTimeoutId = setTimeout((setAppState, notif, processQueue) => {
        currentTimeoutId = null;
        setAppState(prev => {
          // 通过键而不是引用比较以处理重新创建的通知
          if (prev.notifications.current?.key !== notif.key) {
            return prev;
          }
          return {
            ...prev,
            notifications: {
              queue: prev.notifications.queue.filter(_ => !notif.invalidates?.includes(_.key)),
              current: null
            }
          };
        });
        processQueue();
      }, notif.timeoutMs ?? DEFAULT_TIMEOUT_MS, setAppState, notif, processQueue);

      // 立即显示立即通知
      setAppState(prev => ({
        ...prev,
        notifications: {
          current: notif,
          queue:
          // 仅在当前通知不是立即时才重新入队
          [...(prev.notifications.current ? [prev.notifications.current] : []), ...prev.notifications.queue].filter(_ => _.priority !== 'immediate' && !notif.invalidates?.includes(_.key))
        }
      }));
      return; // 重要：立即通知退出 addNotification
    }

    // 处理非立即通知
    setAppState(prev => {
      // 检查是否可以折叠到具有相同键的现有通知中
      if (notif.fold) {
        // 如果键匹配则折叠到当前通知
        if (prev.notifications.current?.key === notif.key) {
          const folded = notif.fold(prev.notifications.current, notif);
          // 重置折叠通知的超时
          if (currentTimeoutId) {
            clearTimeout(currentTimeoutId);
            currentTimeoutId = null;
          }
          currentTimeoutId = setTimeout((setAppState, foldedKey, processQueue) => {
            currentTimeoutId = null;
            setAppState(p => {
              if (p.notifications.current?.key !== foldedKey) {
                return p;
              }
              return {
                ...p,
                notifications: {
                  queue: p.notifications.queue,
                  current: null
                }
              };
            });
            processQueue();
          }, folded.timeoutMs ?? DEFAULT_TIMEOUT_MS, setAppState, folded.key, processQueue);
          return {
            ...prev,
            notifications: {
              current: folded,
              queue: prev.notifications.queue
            }
          };
        }

        // 如果键匹配则折叠到入队通知
        const queueIdx = prev.notifications.queue.findIndex(_ => _.key === notif.key);
        if (queueIdx !== -1) {
          const folded = notif.fold(prev.notifications.queue[queueIdx]!, notif);
          const newQueue = [...prev.notifications.queue];
          newQueue[queueIdx] = folded;
          return {
            ...prev,
            notifications: {
              current: prev.notifications.current,
              queue: newQueue
            }
          };
        }
      }

      // 仅在没有重复时才添加到队列（防止重复）
      const queuedKeys = new Set(prev.notifications.queue.map(_ => _.key));
      const shouldAdd = !queuedKeys.has(notif.key) && prev.notifications.current?.key !== notif.key;
      if (!shouldAdd) return prev;
      const invalidatesCurrent = prev.notifications.current !== null && notif.invalidates?.includes(prev.notifications.current.key);
      if (invalidatesCurrent && currentTimeoutId) {
        clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
      }
      return {
        ...prev,
        notifications: {
          current: invalidatesCurrent ? null : prev.notifications.current,
          queue: [...prev.notifications.queue.filter(_ => _.priority !== 'immediate' && !notif.invalidates?.includes(_.key)), notif]
        }
      };
    });

    // 添加通知后处理队列
    processQueue();
  }, [setAppState, processQueue]);
  const removeNotification = useCallback<RemoveNotificationFn>((key: string) => {
    setAppState(prev => {
      const isCurrent = prev.notifications.current?.key === key;
      const inQueue = prev.notifications.queue.some(n => n.key === key);
      if (!isCurrent && !inQueue) {
        return prev;
      }
      if (isCurrent && currentTimeoutId) {
        clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
      }
      return {
        ...prev,
        notifications: {
          current: isCurrent ? null : prev.notifications.current,
          queue: prev.notifications.queue.filter(n => n.key !== key)
        }
      };
    });
    processQueue();
  }, [setAppState, processQueue]);

  // 如果初始状态中有通知，则在挂载时处理队列。
  // 命令式读取（不使用 useAppState）— 仅在挂载时的订阅是多余的，
  // 会导致每个调用者在队列改变时重新渲染。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // biome-ignore lint/correctness/useExhaustiveDependencies: 仅在挂载时的效果，store 是稳定的上下文引用
  useEffect(() => {
    if (store.getState().notifications.queue.length > 0) {
      processQueue();
    }
  }, []);
  return {
    addNotification,
    removeNotification
  };
}
const PRIORITIES: Record<Priority, number> = {
  immediate: 0,
  high: 1,
  medium: 2,
  low: 3
};
export function getNext(queue: Notification[]): Notification | undefined {
  if (queue.length === 0) return undefined;
  return queue.reduce((min, n) => PRIORITIES[n.priority] < PRIORITIES[min.priority] ? n : min);
}
