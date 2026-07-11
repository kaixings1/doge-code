import { logEvent, } from '../services/analytics/index.js';
import { loadKeybindingsSync } from './loadUserBindings.js';
import { getBindingDisplayText } from './resolver.js';
// TODO(keybindings-migration): 迁移完成后移除 fallback 参数，
// 并确认没有记录 'keybinding_fallback_used' 事件。
// fallback 在迁移期间作为安全网存在——如果绑定加载失败
// 或找不到操作，我们回退到硬编码值。
// 一旦稳定，调用者应该能够信任 getBindingDisplayText
// 总是为已知操作返回值，我们可以移除这种防御性模式。
// 跟踪哪些 action+context 对已记录回退事件，
// 以避免在非 React 上下文中重复调用时产生重复事件。
const LOGGED_FALLBACKS = new Set();
/**
 * Get the display text for a configured shortcut without React hooks.
 * Use this in non-React contexts (commands, services, etc.).
 *
 * This lives in its own module (not useShortcutDisplay.ts) so that
 * non-React callers like query/stopHooks.ts don't pull React into their
 * module graph via the sibling hook.
 *
 * @param action - The action name (e.g., 'app:toggleTranscript')
 * @param context - The keybinding context (e.g., 'Global')
 * @param fallback - Fallback text if binding not found
 * @returns The configured shortcut display text
 *
 * @example
 * const expandShortcut = getShortcutDisplay('app:toggleTranscript', 'Global', 'Ctrl+o')
 * // Returns the user's configured binding, or 'Ctrl+o' as default
 */
export function getShortcutDisplay(action, context, fallback) {
    const bindings = loadKeybindingsSync();
    const resolved = getBindingDisplayText(action, context, bindings);
    if (resolved === undefined) {
        const key = `${action}:${context}`;
        if (!LOGGED_FALLBACKS.has(key)) {
            LOGGED_FALLBACKS.add(key);
            logEvent('tengu_keybinding_fallback_used', {
                action: action,
                context: context,
                fallback: fallback,
                reason: 'action_not_found',
            });
        }
        return fallback;
    }
    return resolved;
}
