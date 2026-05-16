import { quote } from './shellQuote.js'

/**
 * 检测命令是否包含 heredoc 模式
 * 匹配模式如：<<EOF, <<'EOF', <<"EOF", <<-EOF, <<-'EOF', <<\EOF 等
 */
function containsHeredoc(command: string): boolean {
  // 匹配 heredoc 模式：<< 后跟可选的 -，然后是可选的引号或反斜杠，然后是单词
  // 匹配：<<EOF, <<'EOF', <<"EOF", <<-EOF, <<-'EOF', <<\EOF
  // 首先检查位移操作符并排除它们
  if (
    /\d\s*<<\s*\d/.test(command) ||
    /\[\[\s*\d+\s*<<\s*\d+\s*\]\]/.test(command) ||
    /\$\(\(.*<<.*\)\)/.test(command)
  ) {
    return false
  }

  // 现在检查 heredoc 模式
  const heredocRegex = /<<-?\s*(?:(['"]?)(\w+)\1|\\(\w+))/
  return heredocRegex.test(command)
}

/**
 * 检测命令是否包含引号内的多行字符串
 */
function containsMultilineString(command: string): boolean {
  // 检查包含实际换行符的字符串
  // 使用更复杂的模式处理转义引号
  // 匹配单引号：'...\n...' 其中内容可包含转义引号 \'
  // 匹配双引号："...\n..." 其中内容可包含转义引号 \"
  const singleQuoteMultiline = /'(?:[^'\\]|\\.)*\n(?:[^'\\]|\\.)*'/
  const doubleQuoteMultiline = /"(?:[^"\\]|\\.)*\n(?:[^"\\]|\\.)*"/

  return (
    singleQuoteMultiline.test(command) || doubleQuoteMultiline.test(command)
  )
}

/**
 * 适当地引用 shell 命令，保留 heredoc 和多行字符串
 * @param command 要引用的命令
 * @param addStdinRedirect 是否添加 < /dev/null
 * @returns 正确引用的命令
 */
export function quoteShellCommand(
  command: string,
  addStdinRedirect: boolean = true,
): string {
  // 如果命令包含 heredoc 或多行字符串，特殊处理
  // shell-quote 库在这些情况下错误地将 ! 转义为 \!
  if (containsHeredoc(command) || containsMultilineString(command)) {
    // 对于 heredoc 和多行字符串，我们需要为 eval 引用
    // 但避免 shell-quote 的激进转义
    // 我们将使用单引号并仅转义命令中的单引号
    const escaped = command.replace(/'/g, "'\"'\"'")
    const quoted = `'${escaped}'`

    // 不为 heredoc 添加 stdin 重定向，因为它们提供自己的输入
    if (containsHeredoc(command)) {
      return quoted
    }

    // 对于没有 heredoc 的多行字符串，根据需要添加 stdin 重定向
    return addStdinRedirect ? `${quoted} < /dev/null` : quoted
  }

  // 对于常规命令，使用 shell-quote
  if (addStdinRedirect) {
    return quote([command, '<', '/dev/null'])
  }

  return quote([command])
}

/**
 * Detects if a command already has a stdin redirect
 * Match patterns like: < file, </path/to/file, < /dev/null, etc.
 * But not <<EOF (heredoc), << (bit shift), or <(process substitution)
 */
export function hasStdinRedirect(command: string): boolean {
  // Look for < followed by whitespace and a filename/path
  // Negative lookahead to exclude: <<, <(
  // Must be preceded by whitespace or command separator or start of string
  return /(?:^|[\s;&|])<(?![<(])\s*\S+/.test(command)
}

/**
 * Checks if stdin redirect should be added to a command
 * @param command The command to check
 * @returns true if stdin redirect can be safely added
 */
export function shouldAddStdinRedirect(command: string): boolean {
  // Don't add stdin redirect for heredocs as it interferes with the heredoc terminator
  if (containsHeredoc(command)) {
    return false
  }

  // Don't add stdin redirect if command already has one
  if (hasStdinRedirect(command)) {
    return false
  }

  // For other commands, stdin redirect is generally safe
  return true
}

/**
 * Rewrites Windows CMD-style `>nul` redirects to POSIX `/dev/null`.
 *
 * The model occasionally hallucinates Windows CMD syntax (e.g., `ls 2>nul`)
 * even though our bash shell is always POSIX (Git Bash / WSL on Windows).
 * When Git Bash sees `2>nul`, it creates a literal file named `nul` — a
 * Windows reserved device name that is extremely hard to delete and breaks
 * `git add .` and `git clone`. See anthropics/claude-code#4928.
 *
 * Matches: `>nul`, `> NUL`, `2>nul`, `&>nul`, `>>nul` (case-insensitive)
 * Does NOT match: `>null`, `>nullable`, `>nul.txt`, `cat nul.txt`
 *
 * Limitation: this regex does not parse shell quoting, so `echo ">nul"`
 * will also be rewritten. This is acceptable collateral — it's extremely
 * rare and rewriting to `/dev/null` inside a string is harmless.
 */
const NUL_REDIRECT_REGEX = /(\d?&?>+\s*)[Nn][Uu][Ll](?=\s|$|[|&;)\n])/g

export function rewriteWindowsNullRedirect(command: string): string {
  return command.replace(NUL_REDIRECT_REGEX, '$1/dev/null')
}
