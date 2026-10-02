/**
 * Built-in terminal panel toggled with Meta+J.
 *
 * Uses tmux for shell persistence: a separate tmux server with a per-instance
 * socket (e.g., "claude-panel-a1b2c3d4") holds the shell session. Each Claude
 * Code instance gets its own isolated terminal panel that persists within the
 * session but is destroyed when the instance exits.
 *
 * Meta+J is bound to detach-client inside tmux, so pressing it returns to
 * Claude Code while the shell keeps running. Next toggle re-attaches to the
 * same session.
 *
 * When tmux is not available, falls back to a non-persistent shell via spawnSync.
 *
 * Uses the same suspend-Ink pattern as the external editor (promptEditor.ts).
 */

import { spawn, spawnSync } from 'child_process'
import { getSessionId } from '../bootstrap/state.js'
import instances from '../ink/instances.js'
import { registerCleanup } from './cleanupRegistry.js'
import { pwd } from './cwd.js'
import { logForDebugging } from './debug.js'

const TMUX_SESSION = 'panel'

/**
 * Get the tmux socket name for the terminal panel.
 * Uses a unique socket per Claude Code instance (based on session ID)
 * so that each instance has its own isolated terminal panel.
 */
export function getTerminalPanelSocket(): string {
  // Full session UUID keeps sockets unique per instance. Path stays well
  // under the 108-char Unix socket limit (/tmp/tmux-<uid>/ + 57 chars).
  const sessionId = getSessionId()
  return `claude-panel-${sessionId}`
}

let instance: TerminalPanel | undefined

/**
 * Return the singleton TerminalPanel, creating it lazily on first use.
 */
export function getTerminalPanel(): TerminalPanel {
  if (!instance) {
    instance = new TerminalPanel()
  }
  return instance
}

class TerminalPanel {
  private hasTmux: boolean | undefined
  private cleanupRegistered = false

  // ── public API ────────────────────────────────────────────────────

  toggle(): void {
    this.showShell()
  }

  // ── tmux helpers ──────────────────────────────────────────────────

  private checkTmux(): boolean {
    if (this.hasTmux !== undefined) return this.hasTmux
    const result = spawnSync('tmux', ['-V'], { encoding: 'utf-8' })
    this.hasTmux = result.status === 0
    if (!this.hasTmux) {
      logForDebugging(
        '终端面板：未找到 tmux，回退到非持久化 shell',
      )
    }
    return this.hasTmux
  }

  private hasSession(): boolean {
    const result = spawnSync(
      'tmux',
      ['-L', getTerminalPanelSocket(), 'has-session', '-t', TMUX_SESSION],
      { encoding: 'utf-8' },
    )
    return result.status === 0
  }

  private createSession(): boolean {
    const shell = process.env.SHELL || '/bin/bash'
    const cwd = pwd()
    const socket = getTerminalPanelSocket()

    const result = spawnSync(
      'tmux',
      [
        '-L',
        socket,
        'new-session',
        '-d',
        '-s',
        TMUX_SESSION,
        '-c',
        cwd,
        shell,
        '-l',
      ],
      { encoding: 'utf-8' },
    )

    if (result.status !== 0) {
      logForDebugging(
        `Terminal panel: failed to create tmux session: ${result.stderr}`,
      )
      return false
    }

    // Bind Meta+J (toggles back to Claude Code from inside the terminal)
    // and configure the status bar hint.
    //
    // NOTE: these must be separate spawnSync calls — tmux's ';' command
    // separator swallows the value of any 3-arg command (set-option -g k v)
    // that precedes another command, so only the final link of a chain
    // takes effect. Verified on tmux 3.3.6.
    const tmuxArgs = (...args: string[]) => ['-L', socket, ...args]
    spawnSync('tmux', tmuxArgs('bind-key', '-n', 'M-j', 'detach-client'))
    spawnSync('tmux', tmuxArgs('set-option', '-g', 'status-style', 'bg=default'))
    spawnSync('tmux', tmuxArgs('set-option', '-g', 'status-left', ' '))
    spawnSync(
      'tmux',
      tmuxArgs('set-option', '-g', 'status-right', ' Alt+J to return to Claude '),
    )
    spawnSync(
      'tmux',
      tmuxArgs('set-option', '-g', 'status-right-style', 'fg=brightblack'),
    )

    if (!this.cleanupRegistered) {
      this.cleanupRegistered = true
      registerCleanup(async () => {
        // Detached async spawn — spawnSync here would block the event loop
        // and serialize the entire cleanup Promise.all in gracefulShutdown.
        // .on('error') swallows ENOENT if tmux disappears between session
        // creation and cleanup — prevents spurious uncaughtException noise.
        spawn('tmux', ['-L', socket, 'kill-server'], {
          detached: true,
          stdio: 'ignore',
        })
          .on('error', () => {})
          .unref()
      })
    }

    return true
  }

  private attachSession(): void {
    // attach 必须是"阻塞到用户脱离"的。若它瞬间返回（常见于 stdin 不是
    // TTY 时 —— tmux 会打印版本号后退出），界面会立即弹回主界面。
    // 记录耗时与退出码，便于事后从 debug 日志定位是哪种情况。
    const startedAt = Date.now()
    const socket = getTerminalPanelSocket()
    // On Windows the child must go through cmd.exe to inherit the console
    // handle; a bare spawnSync leaves it without a usable console, and tmux
    // then prints its version and exits immediately (rendering the panel
    // flash-and-return). Mirrors the win32 branch in editor.ts:134.
    const result =
      process.platform === 'win32'
        ? spawnSync(
            `tmux -L ${socket} attach-session -t ${TMUX_SESSION}`,
            { stdio: 'inherit', shell: true },
          )
        : spawnSync(
            'tmux',
            ['-L', socket, 'attach-session', '-t', TMUX_SESSION],
            { stdio: 'inherit' },
          )
    const elapsed = Date.now() - startedAt
    logForDebugging(
      `Terminal panel: attach returned after ${elapsed}ms, status=${result.status}, error=${result.error?.message ?? 'none'}, isTTY=${process.stdin.isTTY}`,
    )
    if (elapsed < 500) {
      logForDebugging(
        'Terminal panel: attach exited immediately — tmux likely found no usable TTY. ' +
          'Check that the terminal supports ConPTY handoff (Windows Terminal works; some shells embed the process without a console).',
      )
    }
  }

  // ── show shell ────────────────────────────────────────────────────

  private showShell(): void {
    const inkInstance = instances.get(process.stdout)
    if (!inkInstance) {
      logForDebugging('Terminal panel: no Ink instance found, aborting')
      return
    }

    inkInstance.enterAlternateScreen()
    try {
      if (this.checkTmux() && this.ensureSession()) {
        this.attachSession()
      } else {
        this.runShellDirect()
      }
    } finally {
      inkInstance.exitAlternateScreen()
    }
  }

  // ── helpers ───────────────────────────────────────────────────────

  /** Ensure a tmux session exists, creating one if needed. */
  private ensureSession(): boolean {
    if (this.hasSession()) return true
    return this.createSession()
  }

  /** Fallback when tmux is not available — runs a non-persistent shell. */
  private runShellDirect(): void {
    const shell = process.env.SHELL || '/bin/bash'
    const cwd = pwd()
    // Same win32 console-inheritance caveat as attachSession: go through
    // cmd.exe so the shell gets a usable console.
    const result =
      process.platform === 'win32'
        ? spawnSync(shell, ['-i', '-l'], {
            stdio: 'inherit',
            cwd,
            env: process.env,
            shell: true,
          })
        : spawnSync(shell, ['-i', '-l'], {
            stdio: 'inherit',
            cwd,
            env: process.env,
          })
    if (result.error) {
      logForDebugging(
        `Terminal panel: fallback shell failed: ${result.error.message}`,
      )
    }
  }
}
