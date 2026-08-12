import { feature } from 'bun:bundle'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { Box, Text, useInput, useApp, useStdin } from '../../ink.js'
import {
  type SessionEntry,
  type WindowEntry,
  type PaneEntry,
  type TerminalBackend,
  createSession,
  deleteSession,
  switchSession,
  renameSession,
  createWindow,
  switchWindow,
  splitPane,
  switchPane,
  closePane,
  addToHistory,
  getHistory,
  loadSessions,
  getAllSessions,
  getActiveSession,
  getActiveWindow,
  getActivePane,
  detectAvailableBackend,
  getBackendLabel,
  setupRealSSHTunnel as setupSSHTunnel,
  attachToTmuxSession,
  getSSHAccessInstructions,
} from '../../services/bridgeSessions/sessionManager.js'

type ViewMode = 'list' | 'detail' | 'terminal' | 'ssh-config' | 'help' | 'ssh-guide'

export const call = (_onDone: (message?: string) => void, _context: unknown, _args: string): React.ReactNode => {
  // Preload sessions
  useEffect(() => {
    loadSessions().catch(err => {
      console.error('Failed to load bridge sessions:', err)
    })
  }, [])

  return <BridgeManager onDone={_onDone} />
}

interface BridgeManagerProps {
  onDone: (message?: string) => void
}

function BridgeManager({ onDone }: BridgeManagerProps) {
  const [view, setView] = useState<ViewMode>('list')
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [currentSession, setCurrentSession] = useState<SessionEntry | null>(null)
  const [currentWindow, setCurrentWindow] = useState<WindowEntry | null>(null)
  const [currentPane, setCurrentPane] = useState<PaneEntry | null>(null)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [detectedBackend, setDetectedBackend] = useState<TerminalBackend>('none')
  const [sshGuideText, setSshGuideText] = useState('')

  const { exit } = useApp()

  // Detect available backend on mount
  useEffect(() => {
    detectAvailableBackend().then(backend => {
      setDetectedBackend(backend)
    }).catch(() => {
      setDetectedBackend('none')
    })
  }, [])

  // Refresh sessions list
  const refreshSessions = () => {
    const all = getAllSessions()
    setSessions(all)
    setRefreshKey(k => k + 1)

    const active = getActiveSession()
    if (active) {
      setCurrentSession(active)
      const window = getActiveWindow(active.id)
      setCurrentWindow(window || null)
      const pane = getActivePane(active.id)
      setCurrentPane(pane?.pane || null)
    }
  }

  // Initial load
  useEffect(() => {
    refreshSessions()
    const active = getActiveSession()
    if (active) {
      setCurrentSession(active)
      const window = getActiveWindow(active.id)
      setCurrentWindow(window || null)
      const pane = getActivePane(active.id)
      setCurrentPane(pane?.pane || null)
    }
  }, [])

  // Create session with detected backend
  const handleCreateSession = () => {
    const backend = detectedBackend === 'none' ? 'local' : detectedBackend
    const session = createSession(process.cwd(), undefined, backend)
    refreshSessions()
    setCurrentSession(session)
    setView('detail')
    setStatus(`已创建新会话: ${session.name} [${getBackendLabel(backend)}]`)
  }

  // Attach to tmux session
  const handleAttachTmux = async () => {
    if (!currentSession) return
    const cmd = await attachToTmuxSession(currentSession)
    if (cmd) {
      setStatus(`正在附加到 tmux 会话: ${currentSession.tmuxSessionName}...`)
      setOutput([`执行: ${cmd}`, '正在启动 tmux attach...', '按任意键返回...'])
      setView('terminal')
      // In a real implementation, we would spawn the tmux attach process here
      // For now, we show the command that would be executed
    } else {
      setStatus(`无法附加到 tmux 会话: ${currentSession.tmuxSessionName}（会话不存在）`)
    }
  }

  // Show SSH guide
  const handleShowSSHGuide = async () => {
    if (!currentSession) return
    const guide = await getSSHAccessInstructions(currentSession)
    setSshGuideText(guide)
    setView('ssh-guide')
  }

  // Input handling
  useInput((input, key) => {
    if (key.escape) {
      if (view === 'list' || view === 'help' || view === 'ssh-guide') {
        onDone()
        return
      }
      setView('list')
      setInput('')
      setStatus('')
      return
    }

    if (view === 'list') {
      if (input === 'n') {
        // Create new session
        handleCreateSession()
        return
      }
      if (input === 'd') {
        // Delete selected session (simplified - delete active)
        const active = getActiveSession()
        if (active && sessions.length > 0) {
          deleteSession(active.id).then(() => {
            refreshSessions()
            setStatus(`已删除会话: ${active.name}`)
          })
        }
        return
      }
      if (input === 'r') {
        refreshSessions()
        setStatus('已刷新会话列表')
        return
      }
      if (input === 's') {
        // Setup SSH for active session
        const active = getActiveSession()
        if (active) {
          setCurrentSession(active)
          setView('ssh-config')
        }
        return
      }
      if (input === 'h') {
        setView('help')
        return
      }
      // Number keys to switch sessions
      if (!isNaN(Number(input)) && Number(input) >= 1 && Number(input) <= 9) {
        const idx = Number(input) - 1
        if (idx < sessions.length) {
          const session = sessions[idx]
          switchSession(session.id)
          refreshSessions()
          setCurrentSession(session)
          setView('detail')
          setStatus(`已切换到会话: ${session.name}`)
        }
        return
      }
      // Enter to enter selected session
      if (key.return) {
        const active = getActiveSession()
        if (active) {
          setCurrentSession(active)
          setView('detail')
          setStatus(`进入会话: ${active.name}`)
        }
        return
      }
    }

    if (view === 'detail' && currentSession) {
      if (input === 'w') {
        // Create new window
        const window = createWindow(currentSession.id)
        if (window) {
          refreshSessions()
          setCurrentWindow(window)
          setStatus(`已创建新窗口: ${window.name}`)
        }
        return
      }
      if (input === 's') {
        // Split pane
        if (currentWindow) {
          const pane = splitPane(currentSession.id, currentWindow.id, 'horizontal')
          if (pane) {
            refreshSessions()
            setCurrentPane(pane)
            setStatus(`已分屏: ${pane.title}`)
          }
        }
        return
      }
      if (input === 'q') {
        // Close pane
        if (currentSession && currentWindow && currentPane) {
          if (closePane(currentSession.id, currentWindow.id, currentPane.id)) {
            refreshSessions()
            setCurrentPane(null)
            setStatus('已关闭面板')
          }
        }
        return
      }
      if (input === '1' || input === '2' || input === '3' || input === '4') {
        // Switch pane
        if (currentSession && currentWindow) {
          const idx = Number(input) - 1
          if (idx < currentWindow.panes.length) {
            const pane = switchPane(currentSession.id, currentWindow.id, currentWindow.panes[idx].id)
            if (pane) {
              refreshSessions()
              setCurrentPane(pane)
              setStatus(`切换到面板: ${pane.title}`)
            }
          }
        }
        return
      }
      if (input === 't') {
        // Enter terminal mode
        if (currentSession.backend === 'tmux' && currentSession.tmuxSessionName) {
          // For tmux sessions, show attach command
          setOutput([
            `tmux 后端会话: ${currentSession.name}`,
            `tmux 会话名: ${currentSession.tmuxSessionName}`,
            '',
            `要连接到真实 tmux 会话，请执行:`,
            `  tmux attach -t ${currentSession.tmuxSessionName}`,
            '',
            '或按 a 键自动 attach',
          ])
        } else {
          setOutput(['欢迎使用终端会话管理器', `当前会话: ${currentSession.name}`, `当前窗口: ${currentWindow?.name}`, `当前面板: ${currentPane?.title}`, ''])
        }
        setView('terminal')
        setStatus('终端模式')
        return
      }
      if (input === 'a') {
        // Attach to tmux
        if (currentSession.backend === 'tmux') {
          handleAttachTmux()
        } else {
          setStatus('当前会话不是 tmux 后端，无法 attach')
        }
        return
      }
      if (input === 'r') {
        // Rename session
        if (currentSession) {
          setStatus(`重命名会话: 输入新名称... (功能开发中)`)
        }
        return
      }
      if (input === 'g') {
        // Show SSH guide
        handleShowSSHGuide()
        return
      }
      // Number keys to switch windows
      if (!isNaN(Number(input)) && Number(input) >= 1 && Number(input) <= 9) {
        if (currentSession) {
          const idx = Number(input) - 1
          if (idx < currentSession.windows.length) {
            const window = switchWindow(currentSession.id, currentSession.windows[idx].id)
            if (window) {
              refreshSessions()
              setCurrentWindow(window)
              setCurrentPane(window.panes[0])
              setStatus(`切换到窗口: ${window.name}`)
            }
          }
        }
        return
      }
    }

    if (view === 'terminal') {
      if (key.ctrl && input === 'c') {
        setView('detail')
        setInput('')
        setStatus('')
        return
      }
      if (key.return) {
        // Execute command (simulated for local backend)
        const cmd = input.trim()
        if (cmd) {
          addToHistory(currentSession!.id, cmd)
          setOutput(prev => [...prev, `$ ${cmd}`, `[模拟执行] ${cmd}`, ''])
        }
        setInput('')
        return
      }
      if (key.backspace || key.delete) {
        setInput(prev => prev.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setInput(prev => prev + input)
      }
    }

    if (view === 'ssh-config') {
      if (key.escape) {
        setView('list')
        setInput('')
        return
      }
      if (key.return) {
        // Parse and setup SSH
        const parts = input.trim().split('@')
        if (parts.length === 2) {
          const [user, hostPort] = parts
          const [host, portStr] = hostPort.split(':')
          const port = parseInt(portStr) || 22

          setStatus('正在建立 SSH 隧道...')
          setupSSHTunnel(currentSession!.id, host, port, user).then(result => {
            if (result.success) {
              setStatus(`SSH 隧道已建立: ${user}@${host}:${port} -> 本地端口 ${result.port}`)
              refreshSessions()
            } else {
              setStatus(`SSH 隧道失败: ${result.error}`)
            }
          })
        }
        setInput('')
        setView('list')
        return
      }
      if (key.backspace || key.delete) {
        setInput(prev => prev.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setInput(prev => prev + input)
      }
    }

    if (view === 'ssh-guide' || view === 'help') {
      if (key.escape) {
        setView('detail')
        setInput('')
        setStatus('')
        return
      }
    }
  })

  // Render based on view mode
  if (view === 'list') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            🌉 本地桥接会话管理器
          </Text>
          <Text dimColor> | 后端: {getBackendLabel(detectedBackend)}</Text>
        </Box>

        <Box marginBottom={1}>
          <Text bold color="green">
            活动会话 ({sessions.length})
          </Text>
        </Box>

        {sessions.length === 0 ? (
          <Box marginBottom={1}>
            <Text dimColor>暂无活动会话</Text>
          </Box>
        ) : (
          <Box flexDirection="column" marginBottom={1}>
            {sessions.map((s, i) => {
              const isActive = s.id === currentSession?.id
              return (
                <Box key={s.id} flexDirection="row">
                  <Text color={isActive ? 'green' : 'white'}>
                    {isActive ? '●' : '○'}
                  </Text>
                  <Text color={isActive ? 'green' : 'white'}>
                    {' '}[{i + 1}] {s.name}
                  </Text>
                  <Text dimColor> [{getBackendLabel(s.backend)}]</Text>
                  {isActive && <Text color="green"> ← 当前</Text>}
                  <Text dimColor> - {new Date(s.lastActive).toLocaleString()}</Text>
                </Box>
              )
            })}
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>
            {sessions.length > 0
              ? '按 Enter 进入会话 | 按 1-9 切换会话 | 按 n 创建新会话 | 按 d 删除 | 按 s SSH | 按 h 帮助 | 按 Esc 退出'
              : '按 n 创建新会话 | 按 h 帮助 | 按 Esc 退出'}
          </Text>
        </Box>

        {status && (
          <Box marginTop={1}>
            <Text color="yellow">{status}</Text>
          </Box>
        )}
      </Box>
    )
  }

  if (view === 'detail' && currentSession) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            📋 会话详情: {currentSession.name}
          </Text>
          <Text dimColor> - {currentSession.workingDir}</Text>
          <Text dimColor> [{getBackendLabel(currentSession.backend)}]</Text>
        </Box>

        {currentSession.backend === 'tmux' && currentSession.tmuxSessionName && (
          <Box marginBottom={1}>
            <Text color="magenta">tmux 会话: {currentSession.tmuxSessionName}</Text>
          </Box>
        )}

        {currentSession.metadata.isRemote && (
          <Box marginBottom={1}>
            <Text color="yellow">SSH 隧道: {currentSession.metadata.sshUser}@{currentSession.metadata.sshHost}:{currentSession.metadata.sshPort} -&gt; 本地端口 {currentSession.metadata.tunnelPort}</Text>
          </Box>
        )}

        <Box marginBottom={1}>
          <Text bold color="green">
            窗口 ({currentSession.windows.length})
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          {currentSession.windows.map((w, i) => {
            const isActive = w.id === currentSession.activeWindowId
            return (
              <Box key={w.id} flexDirection="row">
                <Text color={isActive ? 'green' : 'white'}>
                  {isActive ? '●' : '○'}
                </Text>
                <Text color={isActive ? 'green' : 'white'}>
                  {' '}[{i + 1}] {w.name} ({w.panes.length} 个面板)
                </Text>
              </Box>
            )
          })}
        </Box>

        {currentWindow && (
          <Box marginBottom={1}>
            <Text bold color="green">
              面板 ({currentWindow.panes.length})
            </Text>
          </Box>
        )}

        {currentWindow && (
          <Box flexDirection="column" marginBottom={1}>
            {currentWindow.panes.map((p, i) => {
              const isActive = p.id === currentWindow.activePaneId
              return (
                <Box key={p.id} flexDirection="row">
                  <Text color={isActive ? 'green' : 'white'}>
                    {isActive ? '●' : '○'}
                  </Text>
                  <Text color={isActive ? 'green' : 'white'}>
                    {' '}[{i + 1}] {p.title}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>
            按 w 新建窗口 | 按 s 分屏 | 按 q 关闭面板 | 按 t 终端 | 按 a attach(tmux) | 按 g SSH指南 | 按 1-4 切换面板 | 按 Esc 返回列表
          </Text>
        </Box>

        {status && (
          <Box marginTop={1}>
            <Text color="yellow">{status}</Text>
          </Box>
        )}
      </Box>
    )
  }

  if (view === 'terminal' && currentSession) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            🖥 终端 - {currentSession.name}
          </Text>
          <Text dimColor> | {currentPane?.title}</Text>
          <Text dimColor> [{getBackendLabel(currentSession.backend)}]</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1} padding={1} borderStyle="round" borderColor="gray">
          {output.map((line, i) => (
            <Text key={i} dimColor={line.startsWith('$')}>
              {line}
            </Text>
          ))}
        </Box>

        {currentSession.backend === 'local' && (
          <Box>
            <Text color="green">$ </Text>
            <Text>{input}</Text>
            <Text color="green">█</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>
            {currentSession.backend === 'tmux'
              ? `tmux attach: tmux attach -t ${currentSession.tmuxSessionName} | 按 Ctrl+C 退出`
              : `输入命令 | Ctrl+C 退出终端 | 历史: ${getHistory(currentSession.id).length} 条`}
          </Text>
        </Box>
      </Box>
    )
  }

  if (view === 'ssh-config' && currentSession) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            🔐 SSH 隧道配置 - {currentSession.name}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text>输入 SSH 连接信息 (格式: user@host:port):</Text>
        </Box>

        <Box marginBottom={1}>
          <Text color="green">$ </Text>
          <Text>{input || 'user@host'}</Text>
          <Text color="green">█</Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
            按 Enter 连接 | 按 Esc 取消
          </Text>
        </Box>

        {status && (
          <Box marginTop={1}>
            <Text color="yellow">{status}</Text>
          </Box>
        )}
      </Box>
    )
  }

  if (view === 'ssh-guide' && currentSession) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            🔐 SSH 远程访问指南 - {currentSession.name}
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1} padding={1} borderStyle="round" borderColor="gray">
          {sshGuideText.split('\n').map((line, i) => (
            <Text key={i} dimColor={line.startsWith('===')}>
              {line || ' '}
            </Text>
          ))}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>按 Esc 返回</Text>
        </Box>
      </Box>
    )
  }

  if (view === 'help') {
    const backendLabel = getBackendLabel(detectedBackend)
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            ❓ 帮助 - 本地桥接会话管理器
          </Text>
          <Text dimColor> | 后端: {backendLabel}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold>会话管理:</Text>
          <Text dimColor>  n - 创建新会话 [{backendLabel}]</Text>
          <Text dimColor>  d - 删除当前会话</Text>
          <Text dimColor>  r - 刷新会话列表</Text>
          <Text dimColor>  1-9 - 切换会话</Text>
          <Text dimColor>  Enter - 进入会话</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold>窗口管理:</Text>
          <Text dimColor>  w - 创建新窗口</Text>
          <Text dimColor>  1-9 - 切换窗口</Text>
          <Text dimColor>  s - 分屏</Text>
          <Text dimColor>  q - 关闭面板</Text>
          <Text dimColor>  1-4 - 切换面板</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold>终端:</Text>
          <Text dimColor>  t - 进入终端模式</Text>
          <Text dimColor>  a - attach 到 tmux (仅 tmux 后端)</Text>
          <Text dimColor>  Ctrl+C - 退出终端</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold>远程访问:</Text>
          <Text dimColor>  s - 配置 SSH 隧道</Text>
          <Text dimColor>  输入 user@host:port 格式</Text>
          <Text dimColor>  g - 显示 SSH 访问指南 (仅远程会话)</Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>按 Esc 返回</Text>
        </Box>
      </Box>
    )
  }

  return null
}
