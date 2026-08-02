import { spawn, exec } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const execAsync = promisify(exec)

export interface SessionEntry {
  id: string
  name: string
  createdAt: number
  lastActive: number
  workingDir: string
  history: string[]
  environment: Record<string, string>
  windows: WindowEntry[]
  activeWindowId: string
  backend: 'tmux' | 'screen' | 'local'
  tmuxSessionName?: string
  metadata: {
    sshHost?: string
    sshPort?: number
    sshUser?: string
    tunnelPort?: number
    sshKeyPath?: string
    reconnectCount: number
    lastDisconnect?: number
    isRemote: boolean
  }
}

export interface WindowEntry {
  id: string
  name: string
  activePaneId: string
  panes: PaneEntry[]
  layout: 'horizontal' | 'vertical' | 'grid'
  createdAt: number
  tmuxWindowIndex?: number
}

export interface PaneEntry {
  id: string
  title: string
  content: string
  cursorPosition: { line: number; col: number }
  workingDir: string
  shell: string
  pid?: number
  tmuxPaneId?: string
  exitCode?: number
  isActive: boolean
  createdAt: number
}

const SESSIONS_DIR = join(homedir(), '.doge-code', 'bridge-sessions')

let sessionCounter = 0
const sessions = new Map<string, SessionEntry>()
let activeSessionId: string | null = null

// ============================================================================
// Backend detection
// ============================================================================

export type TerminalBackend = 'tmux' | 'screen' | 'none'

export async function detectAvailableBackend(): Promise<TerminalBackend> {
  try {
    await execAsync('tmux -V')
    return 'tmux'
  } catch {
    // tmux not available
  }
  try {
    await execAsync('screen --version')
    return 'screen'
  } catch {
    // screen not available
  }
  return 'none'
}

export function getBackendLabel(backend: TerminalBackend): string {
  switch (backend) {
    case 'tmux':
      return 'tmux'
    case 'screen':
      return 'screen'
    default:
      return '本地模拟'
  }
}

// ============================================================================
// Persistence
// ============================================================================

export async function ensureSessionsDir(): Promise<void> {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true })
  } catch {
    // Directory might already exist
  }
}

export async function loadSessions(): Promise<void> {
  await ensureSessionsDir()

  try {
    const files = await fs.readdir(SESSIONS_DIR)
    const sessionFiles = files.filter(f => f.endsWith('.json'))

    for (const file of sessionFiles) {
      try {
        const content = await fs.readFile(join(SESSIONS_DIR, file), 'utf-8')
        const session: SessionEntry = JSON.parse(content)
        sessions.set(session.id, session)
        sessionCounter = Math.max(sessionCounter, parseInt(session.id.split('-')[1]) || 0)
      } catch (err) {
        console.error(`Failed to load session ${file}:`, err)
      }
    }

    if (sessions.size > 0 && !activeSessionId) {
      const mostRecent = Array.from(sessions.values())
        .sort((a, b) => b.lastActive - a.lastActive)[0]
      activeSessionId = mostRecent.id
    }
  } catch (err) {
    console.error('Failed to load sessions:', err)
  }
}

export async function saveSession(session: SessionEntry): Promise<void> {
  await ensureSessionsDir()
  const filePath = join(SESSIONS_DIR, `${session.id}.json`)
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8')
}

export async function deleteSessionFile(sessionId: string): Promise<void> {
  try {
    await fs.unlink(join(SESSIONS_DIR, `${sessionId}.json`))
  } catch {
    // File might not exist
  }
}

// ============================================================================
// Session CRUD
// ============================================================================

export function createSession(workingDir: string, name?: string, backend: TerminalBackend = 'local'): SessionEntry {
  const id = `s-${Date.now().toString(36)}-${++sessionCounter}`
  const sessionName = name || `会话 ${sessionCounter}`

  const defaultWindow: WindowEntry = {
    id: `w-${Date.now().toString(36)}`,
    name: '主窗口',
    activePaneId: '',
    panes: [createPane('主终端', workingDir)],
    layout: 'horizontal',
    createdAt: Date.now(),
  }
  defaultWindow.activePaneId = defaultWindow.panes[0].id

  const entry: SessionEntry = {
    id,
    name: sessionName,
    createdAt: Date.now(),
    lastActive: Date.now(),
    workingDir,
    history: [],
    environment: { ...process.env },
    windows: [defaultWindow],
    activeWindowId: defaultWindow.id,
    backend,
    tmuxSessionName: backend === 'tmux' ? `doge-${id}` : undefined,
    metadata: {
      reconnectCount: 0,
      isRemote: false,
    },
  }

  sessions.set(id, entry)
  activeSessionId = id
  saveSession(entry)

  if (backend !== 'local') {
    createBackendSession(entry).catch(err => {
      console.error(`Failed to create backend session for ${id}:`, err)
    })
  }

  return entry
}

function createPane(title: string, workingDir: string): PaneEntry {
  return {
    id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    content: '',
    cursorPosition: { line: 0, col: 0 },
    workingDir,
    shell: process.env.SHELL || 'bash',
    isActive: true,
    createdAt: Date.now(),
  }
}

export function getSession(sessionId: string): SessionEntry | undefined {
  return sessions.get(sessionId)
}

export function getActiveSession(): SessionEntry | undefined {
  return activeSessionId ? sessions.get(activeSessionId) : undefined
}

export function getAllSessions(): SessionEntry[] {
  return Array.from(sessions.values()).sort((a, b) => b.lastActive - a.lastActive)
}

export function switchSession(sessionId: string): SessionEntry | null {
  const entry = sessions.get(sessionId)
  if (entry) {
    entry.lastActive = Date.now()
    entry.metadata.reconnectCount = (entry.metadata.reconnectCount || 0) + 1
    activeSessionId = sessionId
    saveSession(entry)
    return entry
  }
  return null
}

export function updateSession(sessionId: string, updates: Partial<SessionEntry>): SessionEntry | undefined {
  const session = sessions.get(sessionId)
  if (session) {
    Object.assign(session, updates, { lastActive: Date.now() })
    saveSession(session)
    return session
  }
  return undefined
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const session = sessions.get(sessionId)
  if (session) {
    await killBackendSession(session)
    sessions.delete(sessionId)
    await deleteSessionFile(sessionId)
    if (activeSessionId === sessionId) {
      activeSessionId = sessions.size > 0 ? Array.from(sessions.keys())[0] : null
    }
    return true
  }
  return false
}

export function renameSession(sessionId: string, newName: string): SessionEntry | undefined {
  const session = sessions.get(sessionId)
  if (session) {
    session.name = newName
    session.lastActive = Date.now()
    saveSession(session)
    return session
  }
  return undefined
}

// ============================================================================
// tmux/screen backend integration
// ============================================================================

async function createBackendSession(session: SessionEntry): Promise<void> {
  if (session.backend === 'tmux' && session.tmuxSessionName) {
    try {
      await execAsync(
        `tmux new-session -d -s ${session.tmuxSessionName} -c "${session.workingDir}"`
      )
    } catch (err) {
      console.error(`Failed to create tmux session ${session.tmuxSessionName}:`, err)
    }
  }
}

async function killBackendSession(session: SessionEntry): Promise<void> {
  if (session.backend === 'tmux' && session.tmuxSessionName) {
    try {
      await execAsync(`tmux kill-session -t ${session.tmuxSessionName} 2>/dev/null || true`)
    } catch {
      // Session might not exist
    }
  }
}

export async function syncWithTmux(session: SessionEntry): Promise<void> {
  if (session.backend !== 'tmux' || !session.tmuxSessionName) return

  try {
    await execAsync(
      `tmux list-windows -t ${session.tmuxSessionName} -F "#{window_index}:#{window_name}" 2>/dev/null || echo ""`
    )
  } catch (err) {
    console.error(`Failed to sync tmux session ${session.tmuxSessionName}:`, err)
  }
}

// ============================================================================
// Window & pane management
// ============================================================================

export function createWindow(sessionId: string, name?: string): WindowEntry | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined

  const window: WindowEntry = {
    id: `w-${Date.now().toString(36)}`,
    name: name || `窗口 ${session.windows.length + 1}`,
    activePaneId: '',
    panes: [createPane('终端', session.workingDir)],
    layout: 'horizontal',
    createdAt: Date.now(),
  }
  window.activePaneId = window.panes[0].id

  session.windows.push(window)
  session.lastActive = Date.now()
  saveSession(session)

  if (session.backend === 'tmux' && session.tmuxSessionName) {
    createTmuxWindow(session, window).catch(err => {
      console.error(`Failed to create tmux window:`, err)
    })
  }

  return window
}

async function createTmuxWindow(session: SessionEntry, window: WindowEntry): Promise<void> {
  if (!session.tmuxSessionName) return
  try {
    const index = session.windows.length - 1
    await execAsync(
      `tmux new-window -t ${session.tmuxSessionName}:${index} -n "${window.name}" -c "${session.workingDir}"`
    )
    window.tmuxWindowIndex = index
  } catch (err) {
    console.error(`Failed to create tmux window:`, err)
  }
}

export function switchWindow(sessionId: string, windowId: string): WindowEntry | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined

  const window = session.windows.find(w => w.id === windowId)
  if (window) {
    session.activeWindowId = windowId
    session.lastActive = Date.now()
    saveSession(session)

    if (session.backend === 'tmux' && session.tmuxSessionName && window.tmuxWindowIndex !== undefined) {
      execAsync(`tmux select-window -t ${session.tmuxSessionName}:${window.tmuxWindowIndex}`).catch(() => {})
    }

    return window
  }
  return undefined
}

export function getActiveWindow(sessionId: string): WindowEntry | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined
  return session.windows.find(w => w.id === session.activeWindowId)
}

export function splitPane(sessionId: string, windowId: string, direction: 'horizontal' | 'vertical'): PaneEntry | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined

  const window = session.windows.find(w => w.id === windowId)
  if (!window || window.panes.length >= 4) return undefined

  const newPane = createPane('分屏终端', session.workingDir)
  window.panes.push(newPane)
  window.activePaneId = newPane.id
  session.lastActive = Date.now()
  saveSession(session)

  if (session.backend === 'tmux' && session.tmuxSessionName) {
    splitTmuxPane(session, window, direction, newPane).catch(() => {})
  }

  return newPane
}

async function splitTmuxPane(
  session: SessionEntry,
  window: WindowEntry,
  direction: 'horizontal' | 'vertical',
  newPane: PaneEntry
): Promise<void> {
  if (!session.tmuxSessionName) return
  try {
    const target = window.tmuxWindowIndex !== undefined
      ? `${session.tmuxSessionName}:${window.tmuxWindowIndex}`
      : session.tmuxSessionName

    const flag = direction === 'horizontal' ? '-h' : '-v'
    await execAsync(`tmux split-pane ${flag} -t "${target}" -c "${session.workingDir}"`)

    const { stdout } = await execAsync(
      `tmux list-panes -t "${target}" -F "#{pane_id}" 2>/dev/null || echo ""`
    )
    const paneIds = stdout.trim().split('\n').filter(Boolean)
    if (paneIds.length > 0) {
      newPane.tmuxPaneId = paneIds[paneIds.length - 1]
    }
  } catch (err) {
    console.error(`Failed to split tmux pane:`, err)
  }
}

export function closePane(sessionId: string, windowId: string, paneId: string): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false

  const window = session.windows.find(w => w.id === windowId)
  if (!window || window.panes.length <= 1) return false

  const paneIndex = window.panes.findIndex(p => p.id === paneId)
  if (paneIndex === -1) return false

  const pane = window.panes[paneIndex]

  if (session.backend === 'tmux' && pane.tmuxPaneId) {
    execAsync(`tmux kill-pane -t "${pane.tmuxPaneId}" 2>/dev/null || true`).catch(() => {})
  }

  window.panes.splice(paneIndex, 1)

  if (window.activePaneId === paneId) {
    window.activePaneId = window.panes[0].id
  }

  session.lastActive = Date.now()
  saveSession(session)
  return true
}

export function switchPane(sessionId: string, windowId: string, paneId: string): PaneEntry | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined

  const window = session.windows.find(w => w.id === windowId)
  if (!window) return undefined

  const pane = window.panes.find(p => p.id === paneId)
  if (pane) {
    window.panes.forEach(p => { p.isActive = false })
    pane.isActive = true
    window.activePaneId = paneId
    session.lastActive = Date.now()
    saveSession(session)

    if (session.backend === 'tmux' && pane.tmuxPaneId) {
      execAsync(`tmux select-pane -t "${pane.tmuxPaneId}" 2>/dev/null || true`).catch(() => {})
    }

    return pane
  }
  return undefined
}

export function getActivePane(sessionId: string): { window: WindowEntry; pane: PaneEntry } | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined

  const window = session.windows.find(w => w.id === session.activeWindowId)
  if (!window) return undefined

  const pane = window.panes.find(p => p.id === window.activePaneId)
  if (!pane) return undefined

  return { window, pane }
}

// ============================================================================
// History
// ============================================================================

export function addToHistory(sessionId: string, command: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.history.push(command)
    if (session.history.length > 1000) {
      session.history = session.history.slice(-500)
    }
    session.lastActive = Date.now()
    saveSession(session)
  }
}

export function getHistory(sessionId: string): string[] {
  const session = sessions.get(sessionId)
  return session?.history || []
}

// ============================================================================
// Real SSH tunnel via ssh -N -L / autossh
// ============================================================================

export async function setupRealSSHTunnel(
  sessionId: string,
  sshHost: string,
  sshPort: number = 22,
  sshUser: string,
  localPort: number = 0,
  sshKeyPath?: string
): Promise<{ success: boolean; port: number; pid?: number; error?: string }> {
  const session = sessions.get(sessionId)
  if (!session) {
    return { success: false, port: 0, error: 'Session not found' }
  }

  const assignedPort = localPort || 8080 + sessions.size
  const keyFlag = sshKeyPath ? `-i "${sshKeyPath}"` : ''
  const baseCmd = `ssh -N -L ${assignedPort}:localhost:22 ${keyFlag} -p ${sshPort} ${sshUser}@${sshHost}`

  try {
    const backend = await detectAvailableBackend()
    const useAutossh = backend !== 'none'

    let finalCmd: string
    if (useAutossh) {
      finalCmd = `autossh -M 0 -f -N ${keyFlag} -L ${assignedPort}:localhost:22 -p ${sshPort} ${sshUser}@${sshHost}`
    } else {
      finalCmd = baseCmd
    }

    const child = spawn('sh', ['-c', finalCmd], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()

    await new Promise(resolve => setTimeout(resolve, 2000))

    session.metadata.sshHost = sshHost
    session.metadata.sshPort = sshPort
    session.metadata.sshUser = sshUser
    session.metadata.sshKeyPath = sshKeyPath
    session.metadata.tunnelPort = assignedPort
    session.metadata.isRemote = true
    session.lastActive = Date.now()
    saveSession(session)

    return { success: true, port: assignedPort, pid: child.pid }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return { success: false, port: 0, error: `SSH 隧道创建失败: ${errorMsg}` }
  }
}

export async function teardownSSHTunnel(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session || !session.metadata.tunnelPort) return

  const port = session.metadata.tunnelPort
  try {
    if (process.platform === 'win32') {
      await execAsync(`netstat -ano | findstr :${port} | findstr LISTENING`).catch(() => {})
    } else {
      await execAsync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`).catch(() => {})
    }
  } catch {
    // Ignore teardown errors
  }

  session.metadata.tunnelPort = undefined
  session.metadata.isRemote = false
  session.lastActive = Date.now()
  saveSession(session)
}

export async function testSSHConnection(
  sshHost: string,
  sshPort: number,
  sshUser: string,
  sshKeyPath?: string
): Promise<{ success: boolean; error?: string }> {
  const keyFlag = sshKeyPath ? `-i "${sshKeyPath}"` : ''
  try {
    await execAsync(
      `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${keyFlag} -p ${sshPort} ${sshUser}@${sshHost} "echo ok"`,
      { timeout: 10000 }
    )
    return { success: true }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return { success: false, error: errorMsg }
  }
}

// ============================================================================
// Quick attach / connect helpers
// ============================================================================

export async function attachToTmuxSession(session: SessionEntry): Promise<string | null> {
  if (!session.tmuxSessionName) return null

  try {
    await execAsync(`tmux has-session -t ${session.tmuxSessionName} 2>/dev/null`)
    return `tmux attach -t ${session.tmuxSessionName}`
  } catch {
    return null
  }
}

export async function getSSHAccessInstructions(session: SessionEntry): Promise<string> {
  if (!session.metadata.isRemote || !session.metadata.tunnelPort || !session.metadata.sshHost) {
    return '此会话未配置远程访问。'
  }

  const sshHost = session.metadata.sshHost
  const sshPort = session.metadata.sshPort || 22
  const sshUser = session.metadata.sshUser
  const tunnelPort = session.metadata.tunnelPort
  const workingDir = session.workingDir
  const tmuxSessionName = session.tmuxSessionName || 'doge-session'

  const instructions = [
    `=== SSH 远程访问指南 ===`,
    ``,
    `方法 1：通过隧道直接 SSH 到本机`,
    `  从远程机器执行:`,
    `  ssh -p ${tunnelPort} ${sshUser}@${sshHost}`,
    `  （需要先在远程机器上建立反向隧道）`,
    ``,
    `方法 2：SSH 反向隧道（推荐）`,
    `  在远程机器上执行:`,
    `  ssh -R ${tunnelPort}:localhost:22 ${sshUser}@${sshHost}`,
    `  然后本地执行: ssh -p ${tunnelPort} localhost@localhost`,
    ``,
    `方法 3：直接 tmux attach`,
    `  ssh ${sshUser}@${sshHost}`,
    `  tmux attach -t ${tmuxSessionName}`,
    ``,
    `会话信息:`,
    `  本地工作目录: ${workingDir}`,
    `  隧道端口: ${tunnelPort}`,
    `  远程主机: ${sshUser}@${sshHost}:${sshPort}`,
  ].join('\n')

  return instructions
}

// ============================================================================
// Utilities
// ============================================================================

export function getSessionsDir(): string {
  return SESSIONS_DIR
}

export function getActiveSessionId(): string | null {
  return activeSessionId
}

export async function refreshAllSessions(): Promise<void> {
  for (const session of sessions.values()) {
    if (session.backend === 'tmux') {
      await syncWithTmux(session).catch(() => {})
    }
  }
}
