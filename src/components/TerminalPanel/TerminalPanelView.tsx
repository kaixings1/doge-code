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
import { logForDebugging } from '../../utils/debug.js'

const MAX_LINES = 500

type Props = {
  /** shell 可执行文件；默认按平台选择 */
  shell?: string
  /** 面板高度（行） */
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

export function TerminalPanelView({ shell, height = 20, onExit, onUnmount }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [exited, setExited] = useState(false)
  const procRef = useRef<ReturnType<typeof Bun.spawn> | null>(null)
  const stdinRef = useRef<Writable | null>(null)
  const bufRef = useRef('')

  useEffect(() => {
    const bin = shell || defaultShell()
    logForDebugging(`TerminalPanel: spawning ${bin}`)

    let proc: ReturnType<typeof Bun.spawn>
    try {
      proc = Bun.spawn([bin], {
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

  const visible = lines.slice(-height)

  return (
    <Box flexDirection="column" height={height} borderStyle="round" borderColor="cyan">
      <Box>
        <Text color="cyan" bold>
          Terminal
        </Text>
        <Text dimColor>{exited ? '  [已退出 · Esc 关闭]' : '  [Esc 返回]'}</Text>
      </Box>
      <Box flexDirection="column">
        {visible.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
    </Box>
  )
}
