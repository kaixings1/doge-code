/**
 * 内嵌终端面板视图。
 *
 * 用 Bun.spawn + 管道驱动一个交互式 shell，把输出渲染到 Ink。
 * 不依赖外部 tmux —— Windows ConPTY 下 tmux attach 拿不到控制台句柄，
 * 会打印版本号后立即退出（实测 status=0、约 30ms），故改走管道。
 *
 * 会话在组件存活期间保持；卸载时 kill 子进程。
 */

import React, { useEffect, useRef, useState } from 'react'
import { Box, Text, useInput } from '../../ink.js'
import { useSafeTerminalSize } from '../../hooks/useTerminalSize.js'
import { logForDebugging } from '../../utils/debug.js'

const MAX_LINES = 500

/** 面板最多占终端高度的比例。留出余量给对话记录，面板不该吃掉整屏。 */
const MAX_HEIGHT_RATIO = 0.6
/** 面板高度上限（行）。终端很高时也不该无节制地长，避免挤掉对话记录。 */
const MAX_HEIGHT = 24

/**
 * 按终端高度算出面板应占的行数。全部是上界，取最小值：
 * - 占比上限（MAX_HEIGHT_RATIO）：留余量给对话记录
 * - 物理上限（rows-4）：再留 4 行给对话记录与提示符
 * - 绝对上限（MAX_HEIGHT）：终端很高时也不无节制地长
 *
 * 刻意不设"最小高度"：极小终端（rows<=5）下任何最小高度都会盖过物理
 * 高度而溢出，宁可显示得少也不撑破屏幕。末尾 clamp 到 >=0 —— rows<=4
 * 时 rows-4 为负，Ink 收到负 height 行为未定义。
 */
export function computePanelHeight(rows: number, explicit?: number): number {
  return Math.max(
    0,
    explicit ?? Math.min(Math.floor(rows * MAX_HEIGHT_RATIO), rows - 4, MAX_HEIGHT),
  )
}

/**
 * 面板可显示的输出行数 = 高度 - 1 行标题 - 2 行边框。
 *
 * 必须对 0 单独处理：`slice(-0)` 等价于 `slice(0)`，会返回**全部**行，
 * 正好在极小终端下把整屏撑破（JS 的负数零陷阱）。
 */
export function sliceVisibleLines(lines: readonly string[], panelHeight: number): string[] {
  const outputRows = Math.max(0, panelHeight - 3)
  return outputRows === 0 ? [] : lines.slice(-outputRows)
}

/**
 * 单引号最小化转义：`'` -> `''`。
 *
 * 必须转义：Windows 文件名允许包含单引号，而 `-LiteralPath` 只防通配符
 * 展开，不防引号逃逸。若直接拼接，形如 `C:\a'.log` 的路径会提前闭合
 * PowerShell 字符串，使其后的内容被当作代码执行。 */
function quotePowerShell(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

export function buildFollowCommand(
  logPath: string | null,
  platform: string = process.platform,
): string[] | null {
  const target = (logPath ?? '').trim()
  if (!target) return null
  if (platform === 'win32') {
    return [
      'powershell',
      '-NoProfile',
      '-Command',
      `Get-Content -LiteralPath ${quotePowerShell(target)} -Wait -Tail 50`,
    ]
  }
  // tail 以 argv 传参、不经 shell 解析，无注入面。
  return ['tail', '-n', '50', '-f', target]
}

/**
 * 标题栏右侧的状态文字。
 *
 * 顺序必须是 exited 优先于 isFollow：跟随进程（Get-Content -Wait / tail -f）
 * 在文件不存在或读取出错时会退出，此时若不显示 exited，界面仍是
 * 「[Esc 返回]」——用户只看到一屏 stderr（PowerShell 中文报错在 GBK 下
 * 还是乱码），拿不到任何「已退出」信号。实测：文件不存在时 Get-Content
 * 报错但 $LASTEXITCODE 为空，故子进程退出码为 0，唯一可用的失败信号
 * 就是 exited 这个布尔。
 */
export function panelStatusText(isFollow: boolean, exited: boolean, followPath?: string): string {
  if (exited) return '  [已退出 · Esc 关闭]'
  if (isFollow) return `  ${followPath ?? ''}  [Esc 返回]`
  return '  [Esc 返回]'
}

type Props = {
  /** shell 可执行文件；默认按平台选择 */
  shell?: string
  /** 面板高度（行）；缺省按终端尺寸自适应 */
  height?: number
  /** 用户按 Esc 时的回调 */
  onExit?: () => void
  /** 组件卸载时回调（无论何种原因），用于同步外部开合状态 */
  onUnmount?: () => void
}

function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/sh'
}

/** Bun.spawn 的 stdout 类型可能是数字或流；统一成可读流 */
function asReadable(stream: unknown): ReadableStream<Uint8Array> | null {
  if (typeof ReadableStream !== 'undefined' && stream instanceof ReadableStream) {
    return stream as ReadableStream<Uint8Array>
  }
  return null
}

type Writable = { write(data: string): void; flush?: () => void }

/** Bun.spawn 的 stdin 可能是数字或 sink；统一成可写对象 */
function asWritable(sink: unknown): Writable | null {
  if (sink && typeof (sink as { write?: unknown }).write === 'function') {
    return sink as Writable
  }
  return null
}

export function TerminalPanelView({ shell, height, onExit, onUnmount }: Props) {
  // 高度自适应终端尺寸（原实现硬编码 20 行，24 行终端里几乎占满整屏）。
  // useSafeTerminalSize 是本仓库既有的安全版本（Ink App 树外渲染时回退
  // 24 行），/btw 同款用法。判定逻辑见 computePanelHeight。
  const { rows } = useSafeTerminalSize()
  const effectiveHeight = computePanelHeight(rows, height)
  const [lines, setLines] = useState<string[]>([])
  const [exited, setExited] = useState(false)
  // 跟随模式在挂载时确定一次即可：环境变量不会在面板存活期间变化。
  const [isFollow] = useState(
    () => buildFollowCommand(process.env.DOGE_TERMINAL_FOLLOW ?? null) !== null,
  )
  const procRef = useRef<ReturnType<typeof Bun.spawn> | null>(null)
  const stdinRef = useRef<Writable | null>(null)
  const bufRef = useRef('')

  useEffect(() => {
    const followCmd = buildFollowCommand(process.env.DOGE_TERMINAL_FOLLOW ?? null)
    const argv = followCmd ?? [shell || defaultShell()]
    logForDebugging(`TerminalPanel: spawning ${argv.join(' ')}`)

    let proc: ReturnType<typeof Bun.spawn>
    try {
      proc = Bun.spawn(argv, {
        cwd: process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      })
    } catch (e) {
      const msg = (e as Error).message
      logForDebugging(`TerminalPanel: spawn failed: ${msg}`, { level: 'error' })
      setLines([`无法启动 shell: ${msg}`])
      setExited(true)
      return
    }

    procRef.current = proc
    stdinRef.current = asWritable(proc.stdin)

    const decoder = new TextDecoder()
    let cancelled = false

    const pump = async (raw: unknown) => {
      const stream = asReadable(raw)
      if (!stream) return
      const reader = stream.getReader()
      try {
        while (!cancelled) {
          const { value, done } = await reader.read()
          if (done) break
          bufRef.current += decoder.decode(value, { stream: true })
          // 按行切分；末尾不完整的一段留在缓冲等下一块
          const parts = bufRef.current.split(/\r?\n/)
          bufRef.current = parts.pop() ?? ''
          if (parts.length > 0) {
            setLines(prev => {
              const next = [...prev, ...parts]
              return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
            })
          }
        }
      } catch (e) {
        logForDebugging(
          `TerminalPanel: stream read error: ${(e as Error).message}`,
        )
      }
    }
    void pump(proc.stdout)
    void pump(proc.stderr)

    void proc.exited.then(code => {
      if (cancelled) return
      setExited(true)
      logForDebugging(`TerminalPanel: shell exited with code ${code}`)
    })

    return () => {
      cancelled = true
      try {
        proc.kill()
      } catch {
        /* 进程可能已退出 */
      }
      procRef.current = null
      stdinRef.current = null
      onUnmount?.()
    }
  }, [shell, onUnmount])

  // 键盘输入 → 子进程 stdin
  useInput((input, key) => {
    if (key.escape) {
      onExit?.()
      return
    }
    const stdin = stdinRef.current
    if (!stdin || exited) return

    let data = input
    if (key.return) data = '\r'
    else if (key.backspace) data = '\u007f'
    else if (key.tab) data = '\t'
    else if (key.upArrow) data = '\u001b[A'
    else if (key.downArrow) data = '\u001b[B'
    else if (key.leftArrow) data = '\u001b[D'
    else if (key.rightArrow) data = '\u001b[C'
    else if (key.ctrl && input) data = String.fromCharCode(input.charCodeAt(0) & 0x1f)
    if (data.length === 0) return

    try {
      stdin.write(data)
      stdin.flush?.()
    } catch (e) {
      logForDebugging(
        `TerminalPanel: stdin write failed: ${(e as Error).message}`,
      )
    }
  })

  const visible = sliceVisibleLines(lines, effectiveHeight)

  return (
    <Box flexDirection="column" height={effectiveHeight} flexShrink={0} borderStyle="round" borderColor="cyan">
      <Box>
        <Text color="cyan" bold>
          {isFollow ? 'Log' : 'Terminal'}
        </Text>
        <Text dimColor>
          {panelStatusText(isFollow, exited, process.env.DOGE_TERMINAL_FOLLOW)}
        </Text>
      </Box>
      <Box flexDirection="column">
        {visible.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
    </Box>
  )
}
