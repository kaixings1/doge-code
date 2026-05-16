/**
 * 子命令处理程序的 CLI 退出辅助函数。
 *
 * 合并了在 `claude mcp *` / `claude plugin *` 处理程序中
 * 重复粘贴约 60 次的 4-5 行 "print + lint-suppress + exit" 代码块。
 * `: never` 返回类型允许 TypeScript 在调用点缩小控制流范围，
 * 而无需尾随的 `return`。
 */
/* eslint-disable custom-rules/no-process-exit -- 集中的 CLI 退出点 */

// `return undefined as never`（非退出后抛异常）— 测试会监视
// process.exit 并让其返回。调用点写 `return cliError(...)`
// 后续代码会在 mock 下解引用已缩小的值。
// cliError 使用 console.error（测试监视 console.error）；cliOk 使用
// process.stdout.write（测试监视 process.stdout.write — Bun 的 console.log
// 不会路由到被监视的 process.stdout.write）。

/** 将错误消息写入 stderr（如果提供了）并以代码 1 退出。 */
export function cliError(msg?: string): never {
  // biome-ignore lint/suspicious/noConsole: 集中的 CLI 错误输出
  if (msg) console.error(msg)
  process.exit(1)
  return undefined as never
}

/** 将消息写入 stdout（如果提供了）并以代码 0 退出。 */
export function cliOk(msg?: string): never {
  if (msg) process.stdout.write(msg + '\n')
  process.exit(0)
  return undefined as never
}
