/**
 * TerminalPanel — xterm.js + node-pty 终端模拟器组件
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { UseCommandHistoryReturn } from './hooks/useCommandHistory.js'

interface TerminalPanelProps {
  cwd: string
  dogeAPI: {
    spawnTerminal: (cwd: string) => Promise<{ success: boolean; id?: string; error?: string }>
    terminalWrite: (id: string, data: string) => Promise<{ success: boolean; error?: string }>
    terminalResize: (id: string, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>
    terminalKill: (id: string) => Promise<{ success: boolean; error?: string }>
    onTerminalData: (callback: (id: string, data: string) => void) => () => void
    onTerminalExit: (callback: (id: string) => void) => () => void
  }
  cmdHistory: UseCommandHistoryReturn
}

export default function TerminalPanel({ cwd, dogeAPI, cmdHistory }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const unsubData = useRef<(() => void) | null>(null)
  const unsubExit = useRef<(() => void) | null>(null)

  // 命令历史（由父组件传入，与 CommandPalette 共享）
  const currentLineRef = useRef('')

  // 初始化终端实例
  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0F0F0F',
        foreground: '#D4D4D4',
        cursor: '#D4D4D4',
        cursorAccent: '#0F0F0F',
        selectionBackground: '#333333',
      },
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    term.open(containerRef.current)
    fitAddon.fit()

    // 初始 PTY 进程
    dogeAPI.spawnTerminal(cwd).then((result) => {
      if (result.success && result.id) {
        terminalIdRef.current = result.id
        setStatus('ready')
      } else {
        term.writeln(`\x1b[31m终端启动失败: ${result.error}\x1b[0m`)
        setStatus('error')
      }
    })

    return () => {
      term.dispose()
      unsubData.current?.()
      unsubExit.current?.()
    }
  }, [cwd, dogeAPI])

  // 监听 PTY 数据回写
  useEffect(() => {
    if (status !== 'ready') return
    const term = terminalRef.current
    if (!term) return

    unsubData.current = dogeAPI.onTerminalData((id, data) => {
      if (id === terminalIdRef.current) {
        term.write(data)
      }
    })

    unsubExit.current = dogeAPI.onTerminalExit((id) => {
      if (id === terminalIdRef.current) {
        term.writeln('\r\n\x1b[33m[进程已退出]\x1b[0m')
        terminalIdRef.current = null
        setStatus('error')
      }
    })

    return () => {
      unsubData.current?.()
      unsubExit.current?.()
    }
  }, [status, dogeAPI])

  // 用户输入 → PTY（含命令历史导航）
  useEffect(() => {
    const term = terminalRef.current
    if (!term) return

    const handler = (data: string) => {
      const id = terminalIdRef.current
      if (!id) return

      // 上箭头键：导航历史命令
      if (data === '\x1b[A') {
        const historyCmd = cmdHistory.navigateHistory('up', currentLineRef.current)
        currentLineRef.current = historyCmd
        // 清除当前行并写入历史命令
        term.write('\x1b[2K\r')
        term.write(historyCmd)
        return
      }

      // 下箭头键：导航历史命令
      if (data === '\x1b[B') {
        const historyCmd = cmdHistory.navigateHistory('down', currentLineRef.current)
        currentLineRef.current = historyCmd
        term.write('\x1b[2K\r')
        term.write(historyCmd)
        return
      }

      // 回车键：记录命令到历史
      if (data === '\r') {
        const trimmed = currentLineRef.current.trim()
        if (trimmed) {
          cmdHistory.addCommand(trimmed)
        }
        currentLineRef.current = ''
        cmdHistory.resetNavigation()
        dogeAPI.terminalWrite(id, '\r')
        return
      }

      // 记录可打印字符到当前行
      if (data.length === 1 && data >= ' ' && data <= '~') {
        currentLineRef.current += data
      } else if (data === '\x7f' || data === '\b') {
        // Backspace
        currentLineRef.current = currentLineRef.current.slice(0, -1)
      }

      dogeAPI.terminalWrite(id, data)
    }

    term.onData(handler)

    // 初始适配尺寸
    const fitAddon = fitAddonRef.current
    if (fitAddon) fitAddon.fit()

    return () => {
      // xterm.js 的 onData 监听器在 dispose 时自动清理
    }
  }, [dogeAPI, status, cmdHistory])

  return (
    <div
      style={{
        height: '200px',
        display: 'flex',
        flexDirection: 'column',
        background: '#0F0F0F',
      }}
    >
      <div
        style={{
          padding: '4px 12px',
          background: '#1A1A1A',
          borderBottom: '1px solid #262626',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '12px', color: '#888' }}>💻 终端 — {cwd}</span>
        <span style={{ fontSize: '10px', color: '#555' }}>
          {status === 'loading' ? '启动中...' : status === 'ready' ? '就绪' : '已断开'}
        </span>
      </div>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          padding: '4px',
          overflow: 'hidden',
        }}
      />
    </div>
  )
}
