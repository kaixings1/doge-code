/**
 * 如果 bash 命令的第一行是 `# comment`（非 `#!` shebang 行），
 * 返回去除 `#` 前缀后的注释文本。否则返回 undefined。
 *
 * 在全屏模式下，此值用作简洁的工具使用标签以及
 * 折叠组 ⎿ 提示——这是 Claude 写给人类阅读的内容。
 */
export function extractBashCommentLabel(command: string): string | undefined {
  const nl = command.indexOf('\n')
  const firstLine = (nl === -1 ? command : command.slice(0, nl)).trim()
  if (!firstLine.startsWith('#') || firstLine.startsWith('#!')) return undefined
  return firstLine.replace(/^#+\s*/, '') || undefined
}
