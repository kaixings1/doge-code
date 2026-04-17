import React from 'react'
import Text from '../../ink/components/Text.js'

type Props = {
  /** The key or chord to display (e.g., "Ctrl+o", "Enter", "↑/↓") */
  shortcut: string;
  /** The action the key performs (e.g., "展开", "选择", "导航") */
  action: string;
  /** Whether to wrap the hint in parentheses. Default: false */
  parens?: boolean;
  /** Whether to render the shortcut in bold. Default: false */
  bold?: boolean;
};

/**
 * Renders a keyboard shortcut hint like "Ctrl+o 展开" or "（Tab 切换）"
 *
 * Wrap in <Text dimColor> for the common dim styling.
 *
 * @example
 * // Simple hint wrapped in dim Text
 * <Text dimColor><KeyboardShortcutHint shortcut="Esc" action="取消" /></Text>
 *
 * // With parentheses: "（Ctrl+o 展开）"
 * <Text dimColor><KeyboardShortcutHint shortcut="Ctrl+o" action="展开" parens /></Text>
 *
 * // With bold shortcut: "Enter 确认" (Enter is bold)
 * <Text dimColor><KeyboardShortcutHint shortcut="Enter" action="确认" bold /></Text>
 */
export function KeyboardShortcutHint({
  shortcut,
  action,
  parens = false,
  bold = false,
}: Props): React.ReactNode {
  const shortcutText = bold ? <Text bold>{shortcut}</Text> : shortcut

  if (parens) {
    return (
      <Text>
        （{shortcutText} {action}）
      </Text>
    )
  }
  return (
    <Text>
      {shortcutText} {action}
    </Text>
  )
}
