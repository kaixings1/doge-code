/**
 * 命令语义配置模块，用于解释 PowerShell 中外部程序的退出码。
 *
 * PowerShell 原生的 cmdlet 不需要退出码语义：
 *   - Select-String（等效于 grep）无匹配时退出码为 0（返回 $null）
 *   - Compare-Object（等效于 diff）无论是否有差异均退出 0
 *   - Test-Path 无论路径是否存在均退出 0（通过管道返回布尔值）
 * 原生 cmdlet 通过终止性错误（$?）而非退出码来指示失败。
 *
 * 然而，在 PowerShell 中调用的外部可执行文件会设置 $LASTEXITCODE，
 * 且许多工具使用非零退出码来传递信息而非表示失败：
 *   - grep.exe / rg.exe（Git for Windows、scoop 等）：1 表示无匹配
 *   - findstr.exe（Windows 原生）：1 表示无匹配
 *   - robocopy.exe（Windows 原生）：0-7 表示成功，8+ 表示错误（臭名昭著！）
 *
 * 若无此模块，PowerShellTool 会在任何非零退出时抛出 ShellError，
 * 导致 `robocopy` 报告“文件复制成功”（退出码 1）时却显示为错误。
 */

export type CommandSemantic = (
  exitCode: number,
  stdout: string,
  stderr: string,
) => {
  isError: boolean
  message?: string
}

/**
 * 默认语义：仅将 0 视为成功，其他一切视为错误
 */
const DEFAULT_SEMANTIC: CommandSemantic = (exitCode, _stdout, _stderr) => ({
  isError: exitCode !== 0,
  message:
    exitCode !== 0 ? `命令失败，退出码为 ${exitCode}` : undefined,
})

/**
 * grep / ripgrep：0 = 找到匹配，1 = 无匹配，2+ = 错误
 */
const GREP_SEMANTIC: CommandSemantic = (exitCode, _stdout, _stderr) => ({
  isError: exitCode >= 2,
  message: exitCode === 1 ? '未找到匹配项' : undefined,
})

/**
 * 针对特定外部可执行文件的命令语义。
 * 键为不含 .exe 后缀的小写命令名称。
 *
 * 刻意排除：
 *   - 'diff'：存在歧义。Windows PowerShell 5.1 将 `diff` 别名为 Compare-Object
 *     （有差异时退出 0），但 PS Core / Git for Windows 可能解析为 diff.exe
 *     （有差异时退出 1）。无法可靠解释。
 *   - 'fc'：存在歧义。PowerShell 将 `fc` 别名为 Format-Custom（原生 cmdlet），
 *     但 `fc.exe` 是 Windows 文件比较实用工具（退出 1 表示文件不同）。
 *     与 `diff` 存在相同的别名问题。
 *   - 'find'：存在歧义。Windows 的 find.exe（文本搜索）与 Unix 的 find.exe
 *     （通过 Git for Windows 提供的文件搜索）具有不同的语义。
 *   - 'test'、'['：非 PowerShell 构造。
 *   - 'select-string'、'compare-object'、'test-path'：原生 cmdlet 均退出 0。
 */
const COMMAND_SEMANTICS: Map<string, CommandSemantic> = new Map([
  // 外部 grep/ripgrep（Git for Windows、scoop、choco）
  ['grep', GREP_SEMANTIC],
  ['rg', GREP_SEMANTIC],

  // findstr.exe：Windows 原生文本搜索
  // 0 = 找到匹配，1 = 无匹配，2 = 错误
  ['findstr', GREP_SEMANTIC],

  // robocopy.exe：Windows 原生稳定文件复制
  // 退出码是一个位字段——0-7 表示成功，8+ 表示至少存在一项失败：
  //   0 = 无文件复制、无不匹配、无失败（已同步）
  //   1 = 文件复制成功
  //   2 = 检测到额外文件/目录（未复制）
  //   4 = 检测到不匹配的文件/目录
  //   8 = 部分文件/目录无法复制（复制错误）
  //  16 = 严重错误（robocopy 未复制任何文件）
  // 这是 Windows 上最常见的“CI 失败但实际无事发生”的陷阱。
  [
    'robocopy',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 8,
      message:
        exitCode === 0
          ? '未复制任何文件（已处于同步状态）'
          : exitCode >= 1 && exitCode < 8
            ? exitCode & 1
              ? '文件复制成功'
              : 'Robocopy 已完成（无错误）'
            : undefined,
    }),
  ],
])

/**
 * 从单个管道段落中提取命令名称。
 * 剥离前导的 `&` / `.` 调用运算符及 `.exe` 后缀，并转为小写。
 */
function extractBaseCommand(segment: string): string {
  // 剥离 PowerShell 调用运算符：& "cmd"、. "cmd"
  // （段落开头的 & 和 . 后跟空白会调用下一个 token）
  const stripped = segment.trim().replace(/^[&.]\s+/, '')
  const firstToken = stripped.split(/\s+/)[0] || ''
  // 若命令是以 & "grep.exe" 形式调用，则剥离外围引号
  const unquoted = firstToken.replace(/^["']|["']$/g, '')
  // 剥离路径：C:\bin\grep.exe → grep.exe，.\rg.exe → rg.exe
  const basename = unquoted.split(/[\\/]/).pop() || unquoted
  // 剥离 .exe 后缀（Windows 不区分大小写）
  return basename.toLowerCase().replace(/\.exe$/, '')
}

/**
 * 从 PowerShell 命令行中提取主命令。
 * 取最后一个管道段落，因为它是决定退出码的命令。
 *
 * 基于 `;` 和 `|` 的启发式分割——对于带引号的字符串或复杂构造可能出错。
 * 切勿依赖此方法进行安全相关操作；它仅用于退出码解释（误报仅会回退到默认语义）。
 */
function heuristicallyExtractBaseCommand(command: string): string {
  const segments = command.split(/[;|]/).filter(s => s.trim())
  const last = segments[segments.length - 1] || command
  return extractBaseCommand(last)
}

/**
 * 根据语义规则解释命令结果
 */
export function interpretCommandResult(
  command: string,
  exitCode: number,
  stdout: string,
  stderr: string,
): {
  isError: boolean
  message?: string
} {
  const baseCommand = heuristicallyExtractBaseCommand(command)
  const semantic = COMMAND_SEMANTICS.get(baseCommand) ?? DEFAULT_SEMANTIC
  return semantic(exitCode, stdout, stderr)
}