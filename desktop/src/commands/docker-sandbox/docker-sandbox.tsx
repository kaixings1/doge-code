import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput, useStdin } from '../../ink.js'
import React from 'react'
import {
  DockerSandboxManager,
  type DockerSandboxConfig,
} from '../../utils/sandbox/docker-sandbox.js'
import { getCwdState } from '../../bootstrap/state.js'
import { color } from '../../ink.js'

// ============================================================================
// Docker Sandbox UI
// ============================================================================

type Screen = 'main' | 'start' | 'config' | 'logs' | 'exec' | 'shell'
type Action = 'start' | 'stop' | 'status' | 'logs' | 'exec' | 'shell' | 'config'

export const dockerSandboxUI: LocalJSXCommandCall = (_onDone, _context, args) => {
  const [screen, setScreen] = React.useState<Screen>('main')
  const [status, setStatus] = React.useState<Awaited<ReturnType<DockerSandboxManager['getStatus']>>>({
    running: false,
    containerId: null,
    image: '',
    networkMode: '',
    workspaceMounted: false,
  })
  const [logs, setLogs] = React.useState<string[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  const [actionInput, setActionInput] = React.useState('')
  const [dockerAvailable, setDockerAvailable] = React.useState<boolean | null>(null)
  const [dockerError, setDockerError] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState(0)
  const [config, setConfig] = React.useState<DockerSandboxConfig>({
    image: 'node:22-bookworm',
    workdir: '/workspace',
    networkMode: 'bridge',
    memoryLimitMB: 4096,
    cpuLimit: 2,
    envVars: {},
    extraMounts: [],
    autoRemove: true,
    useInit: true,
  })

  const manager = React.useMemo(() => getDockerSandboxManager(config), [config])
  const cwd = getCwdState()

  // Check Docker availability on mount
  React.useEffect(() => {
    const check = DockerSandboxManager.checkDockerAvailable()
    setDockerAvailable(check.available)
    if (!check.available) {
      setDockerError(check.error || 'Docker 不可用')
    }
  }, [])

  // Refresh status periodically
  React.useEffect(() => {
    const interval = setInterval(() => {
      const s = manager.getStatus()
      setStatus(s)
    }, 2000)
    return () => clearInterval(interval)
  }, [manager])

  // Subscribe to events
  React.useEffect(() => {
    return manager.onEvent((event) => {
      if (event.type === 'error') {
        setError(event.message)
      }
      // Refresh status on container changes
      setStatus(manager.getStatus())
    })
  }, [manager])

  const refreshStatus = () => {
    setStatus(manager.getStatus())
  }

  const refreshLogs = () => {
    if (manager.getContainerId()) {
      const rawLogs = manager.getLogs(100)
      setLogs(rawLogs.split('\n').filter(l => l.trim()))
    }
  }

  // Actions
  const handleStart = async () => {
    setError(null)
    setSuccess(null)
    const result = await manager.start(cwd)
    if (result.success) {
      setSuccess(`沙箱容器已启动: ${result.containerId?.slice(0, 12)}`)
      refreshStatus()
    } else {
      setError(result.error || '启动失败')
    }
  }

  const handleStop = () => {
    setError(null)
    manager.stop(true)
    setSuccess('沙箱容器已停止')
    refreshStatus()
  }

  const handleExec = async () => {
    if (!actionInput.trim()) return
    setError(null)
    setSuccess(null)
    const result = await manager.exec(actionInput, 60000, config.workdir)
    if (result.exitCode === 0) {
      setSuccess(`exit 0\n${result.output}`)
    } else {
      setError(`exit ${result.exitCode}\n${result.output}${result.error ? '\n' + result.error : ''}`)
    }
    setActionInput('')
  }

  const refreshConfig = () => {
    setConfig(manager.getConfig())
  }

  const updateConfig = (patch: Partial<DockerSandboxConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }))
  }

  // =========================================================================
  // Keyboard input
  // =========================================================================

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      _onDone()
      return
    }

    if (screen === 'main' || screen === 'status' || screen === 'logs') {
      if (key.escape) {
        _onDone()
      } else if (input === 's') {
        setScreen('start')
      } else if (input === 'p') {
        setScreen('config')
      } else if (input === 'l') {
        setScreen('logs')
        refreshLogs()
      } else if (input === 'e' && status.running) {
        setScreen('exec')
      } else if (input === 'x' && status.running) {
        handleStop()
      }
    } else if (screen === 'start') {
      if (key.escape) setScreen('main')
      else if (key.return) handleStart()
    } else if (screen === 'config') {
      if (key.escape) {
        setScreen('main')
        refreshConfig()
      } else if (key.return) {
        refreshConfig()
        setScreen('main')
        setSuccess('配置已保存（下次启动生效）')
      }
    } else if (screen === 'logs') {
      if (key.escape) setScreen('main')
      else if (input === 'r') refreshLogs()
    } else if (screen === 'exec') {
      if (key.escape) setScreen('main')
      else if (key.return) handleExec()
      else if (key.backspace || key.delete) {
        setActionInput(q => q.slice(0, -1))
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setActionInput(q => q + input)
      }
    }
  })

  // =========================================================================
  // Render
  // =========================================================================

  const renderHeader = () => (
    <Box borderStyle="round" borderColor="magenta" paddingX={1} marginBottom={1}>
      <Text bold color="magenta">
        🐳 Docker 沙箱隔离
      </Text>
      <Text dimColor> | 工作区: {cwd}</Text>
    </Box>
  )

  const renderDockerStatus = () => {
    if (dockerAvailable === null) {
      return <Text dimColor>正在检查 Docker...</Text>
    }
    if (!dockerAvailable) {
      return <Text color="red">❌ Docker 不可用: {dockerError}</Text>
    }
    return <Text color="green">✓ Docker 可用</Text>
  }

  const renderContainerInfo = () => {
    const containerStatus = manager.getStatus()
    const stats = containerStatus.running ? manager.getStats() : null

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold>状态: </Text>
          <Text color={containerStatus.running ? 'green' : 'gray'}>
            {containerStatus.running ? '🟢 运行中' : '🔴 已停止'}
          </Text>
        </Box>
        {containerStatus.containerId && (
          <Box>
            <Text dimColor>容器ID: </Text>
            <Text>{containerStatus.containerId.slice(0, 16)}</Text>
          </Box>
        )}
        <Box>
          <Text dimColor>镜像: </Text>
          <Text>{config.image}</Text>
        </Box>
        <Box>
          <Text dimColor>网络: </Text>
          <Text>{config.networkMode}</Text>
        </Box>
        {stats && (
          <Box>
            <Text dimColor>资源: </Text>
            <Text>CPU {stats.cpuPercent.toFixed(1)}% | 内存 {stats.memoryMB.toFixed(0)}/{stats.memoryLimitMB}MB</Text>
          </Box>
        )}
      </Box>
    )
  }

  const renderMainScreen = () => (
    <Box flexDirection="column">
      {renderHeader()}
      {renderDockerStatus()}

      {dockerAvailable && (
        <>
          {renderContainerInfo()}

          {error && (
            <Box borderStyle="round" borderColor="red" paddingX={1} marginBottom={1}>
              <Text color="red">❌ {error}</Text>
            </Box>
          )}

          {success && (
            <Box borderStyle="round" borderColor="green" paddingX={1} marginBottom={1}>
              <Text color="green">✓ {success}</Text>
            </Box>
          )}

          <Box marginTop={1}>
            <Text bold>快捷操作:</Text>
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            <Text color={status.running ? 'gray' : 'green'}>[S] {status.running ? '启动中...' : '启动容器'}</Text>
            <Text color={status.running ? 'red' : 'gray'}>[X] {status.running ? '停止容器' : '停止容器 (需先启动)'}</Text>
            <Text dimColor={!status.running ? 'gray' : undefined}>[E] 执行命令 (需运行中)</Text>
            <Text dimColor={!status.running ? 'gray' : undefined}>[L] 查看日志 (需运行中)</Text>
            <Text>[P] 配置</Text>
            <Text>[ESC] 退出</Text>
          </Box>
        </>
      )}
    </Box>
  )

  const renderConfigScreen = () => (
    <Box flexDirection="column">
      {renderHeader()}
      <Box marginBottom={1}>
        <Text bold color="yellow">沙箱配置</Text>
      </Box>

      <Box flexDirection="column">
        <Box>
          <Text dimColor>Docker 镜像: </Text>
          <Text>{config.image}</Text>
        </Box>
        <Box>
          <Text dimColor>工作目录: </Text>
          <Text>{config.workdir}</Text>
        </Box>
        <Box>
          <Text dimColor>网络模式: </Text>
          <Text>{config.networkMode === 'none' ? '🔒 隔离' : config.networkMode === 'host' ? '⚠ 主机' : '🌐 桥接'}</Text>
        </Box>
        <Box>
          <Text dimColor>内存限制: </Text>
          <Text>{config.memoryLimitMB > 0 ? `${config.memoryLimitMB} MB` : '无限制'}</Text>
        </Box>
        <Box>
          <Text dimColor>CPU 限制: </Text>
          <Text>{config.cpuLimit > 0 ? `${config.cpuLimit} 核` : '无限制'}</Text>
        </Box>
        <Box>
          <Text dimColor>自动删除: </Text>
          <Text>{config.autoRemove ? '是' : '否'}</Text>
        </Box>
        <Box>
          <Text dimColor>使用 tini: </Text>
          <Text>{config.useInit ? '是' : '否'}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>按 Enter 保存并返回 | ESC 取消</Text>
      </Box>
    </Box>
  )

  const renderLogsScreen = () => {
    React.useEffect(() => {
      const interval = setInterval(refreshLogs, 2000)
      return () => clearInterval(interval)
    }, [])

    return (
      <Box flexDirection="column">
        {renderHeader()}
        <Box marginBottom={1}>
          <Text bold color="yellow">容器日志</Text>
          <Text dimColor> (按 R 刷新, ESC 返回)</Text>
        </Box>
        <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
          {logs.length === 0 ? (
            <Text dimColor>暂无日志</Text>
          ) : (
            logs.slice(-30).map((line, i) => (
              <Text key={i} dimColor={i > 20}>{line}</Text>
            ))
          )}
        </Box>
      </Box>
    )
  }

  const renderExecScreen = () => (
    <Box flexDirection="column">
      {renderHeader()}
      <Box marginBottom={1}>
        <Text bold color="yellow">在容器内执行命令</Text>
      </Box>
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text color="cyan">$ {actionInput || '_'}</Text>
      </Box>
      {error && (
        <Box borderStyle="round" borderColor="red" paddingX={1} marginBottom={1}>
          <Text color="red">❌ {error}</Text>
        </Box>
      )}
      {success && (
        <Box borderStyle="round" borderColor="green" paddingX={1} marginBottom={1}>
          <Text color="green">✓ {success}</Text>
        </Box>
      )}
      <Box>
        <Text dimColor>输入命令后按 Enter 执行 | ESC 返回</Text>
      </Box>
    </Box>
  )

  const currentScreen = screen === 'start' ? 'start' :
    screen === 'config' ? 'config' :
    screen === 'logs' ? 'logs' :
    screen === 'exec' ? 'exec' :
    'main'

  return (
    <Box flexDirection="column" padding={1}>
      {currentScreen === 'main' && renderMainScreen()}
      {currentScreen === 'start' && (
        <Box flexDirection="column">
          {renderHeader()}
          <Box marginBottom={1}>
            <Text>确认启动 Docker 沙箱容器？</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>镜像: {config.image}</Text>
            {'\n'}
            <Text dimColor>工作区: {cwd}</Text>
            {'\n'}
            <Text dimColor>网络: {config.networkMode}</Text>
            {'\n'}
            <Text dimColor>内存: {config.memoryLimitMB}MB | CPU: {config.cpuLimit}核</Text>
          </Box>
          <Box>
            <Text color="green">[Enter] 确认启动</Text>
            {' '}
            <Text dimColor>[ESC] 取消</Text>
          </Box>
        </Box>
      )}
      {currentScreen === 'config' && renderConfigScreen()}
      {currentScreen === 'logs' && renderLogsScreen()}
      {currentScreen === 'exec' && renderExecScreen()}
    </Box>
  )
}
