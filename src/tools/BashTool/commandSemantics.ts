/**
 * 命令语义配置 —— 用于在不同上下文中解释退出码。
 *
 * 许多命令使用退出码传达除成功/失败之外的信息。
 * 例如，grep 在无匹配时返回 1，这不属于错误情况。
 */

import { splitCommand_DEPRECATED } from '../../utils/bash/commands.js'

export type CommandSemantic = (
  exitCode: number,
  stdout: string,
  stderr: string,
) => {
  isError: boolean
  message?: string
}

/**
 * 默认语义：仅将 0 视为成功，其他均为错误
 */
const DEFAULT_SEMANTIC: CommandSemantic = (exitCode, _stdout, _stderr) => ({
  isError: exitCode !== 0,
  message:
    exitCode !== 0 ? `命令失败，退出码 ${exitCode}` : undefined,
})

/**
 * 命令特有语义
 */
const COMMAND_SEMANTICS: Map<string, CommandSemantic> = new Map([
  // grep: 0=找到匹配, 1=无匹配, 2+=错误
  [
    'grep',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? '未找到匹配项' : undefined,
    }),
  ],

  // ripgrep 语义同 grep
  [
    'rg',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? '未找到匹配项' : undefined,
    }),
  ],

  // find: 0=成功, 1=部分成功（某些目录不可访问）, 2+=错误
  [
    'find',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message:
        exitCode === 1 ? '某些目录无法访问' : undefined,
    }),
  ],

  // diff: 0=无差异, 1=发现差异, 2+=错误
  [
    'diff',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? '文件存在差异' : undefined,
    }),
  ],

  // test/[: 0=条件为真, 1=条件为假, 2+=错误
  [
    'test',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? '条件为假' : undefined,
    }),
  ],

  // [ 是 test 的别名
  [
    '[',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? '条件为假' : undefined,
    }),
  ],

  // wc、head、tail、cat 等：这些命令通常仅在遇到真正错误时才失败
  // 因此使用默认语义
])

/**
 * 获取命令的语义解释
 */
function getCommandSemantic(command: string): CommandSemantic {
  // 提取基础命令（第一个单词，处理管道）
  const baseCommand = heuristicallyExtractBaseCommand(command)
  const semantic = COMMAND_SEMANTICS.get(baseCommand)
  return semantic !== undefined ? semantic : DEFAULT_SEMANTIC
}

/**
 * 从单条命令字符串中提取命令名（第一个单词）。
 */
function extractBaseCommand(command: string): string {
  return command.trim().split(/\s+/)[0] || ''
}

/**
 * 从复杂命令行中提取主要命令；
 * 可能猜错 —— 请勿将其用于安全目的
 */
function heuristicallyExtractBaseCommand(command: string): string {
  const segments = splitCommand_DEPRECATED(command)

  // 取最后一个命令，因为它决定退出码
  const lastCommand = segments[segments.length - 1] || command

  return extractBaseCommand(lastCommand)
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
  const semantic = getCommandSemantic(command)
  const result = semantic(exitCode, stdout, stderr)

  return {
    isError: result.isError,
    message: result.message,
  }
}
