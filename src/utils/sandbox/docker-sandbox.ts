/**
 * Docker-based sandbox isolation for agent execution.
 *
 * Runs the AI agent's bash commands inside a Docker container,
 * providing full OS-level isolation. Inspired by OpenHands/Devin.
 *
 * The container uses a Node.js development image with git and build tools,
 * and mounts the workspace directory for file operations.
 */

import { execSync, spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { statSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join, resolve, sep } from 'path'

// ============================================================================
// Types
// ============================================================================

export interface DockerSandboxConfig {
  /** Docker image to use for the sandbox container */
  image: string
  /** Working directory inside the container (mapped to host workspace) */
  workdir: string
  /** Network mode: 'bridge' (default), 'none', or 'host' */
  networkMode: 'bridge' | 'none' | 'host'
  /** Memory limit in MB (0 = unlimited) */
  memoryLimitMB: number
  /** CPU limit in cores (0 = unlimited) */
  cpuLimit: number
  /** Additional environment variables to pass to the container */
  envVars: Record<string, string>
  /** Additional volumes to mount */
  extraMounts: Array<{ host: string; container: string; readOnly?: boolean }>
  /** Whether to auto-remove the container when it stops */
  autoRemove: boolean
  /** Whether to use --init to run tini as PID 1 */
  useInit: boolean
}

export interface DockerSandboxStatus {
  running: boolean
  containerId: string | null
  image: string
  networkMode: string
  workspaceMounted: boolean
  error?: string
}

export type DockerSandboxEvent =
  | { type: 'container-created'; containerId: string }
  | { type: 'container-started'; containerId: string }
  | { type: 'container-stopped'; containerId: string }
  | { type: 'container-removed'; containerId: string }
  | { type: 'exec-started'; execId: string }
  | { type: 'exec-completed'; execId: string; exitCode: number }
  | { type: 'error'; message: string }

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_IMAGE = 'node:22-bookworm'
const DEFAULT_WORKDIR = '/workspace'
const DEFAULT_NETWORK_MODE = 'bridge'
const DEFAULT_MEMORY_MB = 4096
const DEFAULT_CPU_CORES = 2

const DEFAULT_CONFIG: DockerSandboxConfig = {
  image: DEFAULT_IMAGE,
  workdir: DEFAULT_WORKDIR,
  networkMode: DEFAULT_NETWORK_MODE,
  memoryLimitMB: DEFAULT_MEMORY_MB,
  cpuLimit: DEFAULT_CPU_CORES,
  envVars: {},
  extraMounts: [],
  autoRemove: true,
  useInit: true,
}

// ============================================================================
// DockerSandboxManager
// ============================================================================

export class DockerSandboxManager {
  private config: DockerSandboxConfig
  private containerId: string | null = null
  private containerName: string | null = null
  private eventHandlers: Set<(event: DockerSandboxEvent) => void> = new Set()
  private initialized = false

  constructor(config?: Partial<DockerSandboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Check if Docker is available on this system.
   */
  static checkDockerAvailable(): { available: boolean; error?: string } {
    try {
      const result = execSync('docker version --format "{{.Server.Version}}"', {
        encoding: 'utf-8',
        timeout: 5000,
      })
      return { available: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (message.includes('Cannot connect to the Docker daemon')) {
        return { available: false, error: 'Docker daemon 未运行，请启动 Docker Desktop' }
      }
      return { available: false, error: message }
    }
  }

  /**
   * Check if the configured image exists locally.
   */
  static checkImageExists(image: string): boolean {
    try {
      execSync(`docker image inspect "${image}"`, {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: 'pipe',
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Pull the configured image if not present.
   */
  static async pullImage(image: string): Promise<{ success: boolean; error?: string }> {
    try {
      execSync(`docker pull "${image}"`, {
        encoding: 'utf-8',
        timeout: 120_000,
        stdio: 'pipe',
      })
      return { success: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { success: false, error: message }
    }
  }

  /**
   * Get the current status of the Docker sandbox.
   */
  getStatus(): DockerSandboxStatus {
    if (!this.containerId) {
      return {
        running: false,
        containerId: null,
        image: this.config.image,
        networkMode: this.config.networkMode,
        workspaceMounted: false,
      }
    }

    try {
      const result = execSync(
        `docker inspect --format "{{.State.Status}}" "${this.containerId}" 2>&1`,
        { encoding: 'utf-8', timeout: 5000 },
      ).trim()

      const running = result === 'running'

      return {
        running,
        containerId: this.containerId,
        image: this.config.image,
        networkMode: this.config.networkMode,
        workspaceMounted: running,
      }
    } catch {
      // Container no longer exists
      this.containerId = null
      this.containerName = null
      return {
        running: false,
        containerId: null,
        image: this.config.image,
        networkMode: this.config.networkMode,
        workspaceMounted: false,
      }
    }
  }

  /**
   * Create and start the sandbox container.
   */
  async start(workspacePath: string): Promise<{ success: boolean; error?: string; containerId?: string }> {
    if (this.containerId) {
      const status = this.getStatus()
      if (status.running) {
        return { success: true, containerId: this.containerId }
      }
      // Clean up stale container
      this.stop(true)
    }

    const dockerCheck = DockerSandboxManager.checkDockerAvailable()
    if (!dockerCheck.available) {
      return { success: false, error: dockerCheck.error }
    }

    // Pull image if needed
    if (!DockerSandboxManager.checkImageExists(this.config.image)) {
      const pullResult = await DockerSandboxManager.pullImage(this.config.image)
      if (!pullResult.success) {
        return { success: false, error: `拉取镜像失败: ${pullResult.error}` }
      }
    }

    // Resolve workspace path
    const resolvedWorkspace = resolve(workspacePath)
    if (!existsSync(resolvedWorkspace)) {
      return { success: false, error: `工作区路径不存在: ${resolvedWorkspace}` }
    }

    const containerName = `doge-sandbox-${randomUUID().slice(0, 8)}`
    const idFile = join(resolvedWorkspace, '.doge-sandbox-id')

    // Build docker run arguments
    const args: string[] = ['run', '-d']

    // Name
    args.push('--name', containerName)

    // Network mode
    if (this.config.networkMode !== 'bridge') {
      args.push(`--network=${this.config.networkMode}`)
    }

    // Memory limit
    if (this.config.memoryLimitMB > 0) {
      args.push(`--memory=${this.config.memoryLimitMB}m`)
    }

    // CPU limit
    if (this.config.cpuLimit > 0) {
      args.push(`--cpus=${this.config.cpuLimit}`)
    }

    // Init process
    if (this.config.useInit) {
      args.push('--init')
    }

    // Auto-remove
    if (this.config.autoRemove) {
      args.push('--rm')
    }

    // TTY allocation for interactive commands
    args.push('-t')

    // Environment variables
    for (const [key, value] of Object.entries(this.config.envVars)) {
      args.push('-e', `${key}=${value}`)
    }

    // HOME directory
    args.push('-e', `HOME=${DEFAULT_WORKDIR}`)

    // Workspace mount
    args.push('-v', `${resolvedWorkspace}:${this.config.workdir}`)

    // Extra mounts
    for (const mount of this.config.extraMounts) {
      const mode = mount.readOnly ? 'ro' : 'rw'
      args.push('-v', `${resolve(mount.host)}:${mount.container}:${mode}`)
    }

    // Image
    args.push(this.config.image)

    // Keep container alive with tail -f /dev/null
    args.push('sh', '-c', 'tail -f /dev/null')

    try {
      const result = execSync(`docker ${args.join(' ')}`, {
        encoding: 'utf-8',
        timeout: 30_000,
      }).trim()

      this.containerId = result
      this.containerName = containerName

      // Write container ID to file for recovery
      try {
        require('fs').writeFileSync(idFile, result, 'utf-8')
      } catch {
        // Ignore if we can't write the ID file
      }

      this.emit({ type: 'container-created', containerId: result })
      this.emit({ type: 'container-started', containerId: result })

      return { success: true, containerId: result }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { success: false, error: `创建容器失败: ${message}` }
    }
  }

  /**
   * Stop the sandbox container.
   */
  stop(force = false): void {
    if (!this.containerId) return

    try {
      execSync(`docker stop ${force ? '' : '-t 5 '}"${this.containerId}"`, {
        encoding: 'utf-8',
        timeout: 15_000,
        stdio: 'pipe',
      })
    } catch {
      // Container may have already stopped
    }

    this.emit({ type: 'container-stopped', containerId: this.containerId })

    if (this.config.autoRemove) {
      try {
        execSync(`docker rm -f "${this.containerId}"`, {
          encoding: 'utf-8',
          timeout: 5000,
          stdio: 'pipe',
        })
        this.emit({ type: 'container-removed', containerId: this.containerId })
      } catch {
        // Cleanup best-effort
      }
    }

    this.containerId = null
    this.containerName = null
  }

  /**
   * Execute a command inside the sandbox container.
   * Returns a promise that resolves with the command output.
   */
  async exec(
    command: string,
    timeoutMs = 120_000,
    cwd?: string,
  ): Promise<{ output: string; exitCode: number; error?: string }> {
    if (!this.containerId) {
      return { output: '', exitCode: -1, error: '沙箱容器未运行' }
    }

    const execId = randomUUID().slice(0, 8)
    this.emit({ type: 'exec-started', execId })

    const workdir = cwd || this.config.workdir

    try {
      const result = execSync(
        `docker exec -w "${workdir}" "${this.containerId}" sh -c ${JSON.stringify(command)}`,
        {
          encoding: 'utf-8',
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        },
      )

      this.emit({ type: 'exec-completed', execId, exitCode: 0 })
      return { output: result, exitCode: 0 }
    } catch (e) {
      const err = e as { status?: number; message?: string; stdout?: string; stderr?: string }
      const exitCode = err.status ?? -1
      const output = err.stdout || err.stderr || ''

      this.emit({ type: 'exec-completed', execId, exitCode })
      return {
        output,
        exitCode,
        error: err.message || `命令执行失败 (exit code: ${exitCode})`,
      }
    }
  }

  /**
   * Execute a command with streaming output.
   * Returns an async iterator that yields output chunks.
   */
  async *execStream(
    command: string,
    cwd?: string,
  ): AsyncGenerator<{ type: 'stdout' | 'stderr'; data: string } | { type: 'exit'; code: number }> {
    if (!this.containerId) {
      yield { type: 'exit', code: -1 }
      return
    }

    const workdir = cwd || this.config.workdir

    return new AsyncGenerator(async function* () {
      const child = spawn(
        'docker',
        [
          'exec',
          '-w',
          workdir,
          this.containerId,
          'sh',
          '-c',
          command,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      )

      if (child.stdout) {
        for await (const chunk of child.stdout) {
          yield { type: 'stdout', data: chunk.toString() }
        }
      }

      if (child.stderr) {
        for await (const chunk of child.stderr) {
          yield { type: 'stderr', data: chunk.toString() }
        }
      }

      const exitCode = await new Promise<number>((resolve) => {
        child.on('close', resolve)
      })

      yield { type: 'exit', code: exitCode }
    })
  }

  /**
   * Copy a file from host to container.
   */
  copyToContainer(hostPath: string, containerPath: string): { success: boolean; error?: string } {
    if (!this.containerId) {
      return { success: false, error: '沙箱容器未运行' }
    }

    try {
      execSync(
        `docker cp "${hostPath}" "${this.containerId}:${containerPath}"`,
        { encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' },
      )
      return { success: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { success: false, error: message }
    }
  }

  /**
   * Copy a file from container to host.
   */
  copyFromContainer(containerPath: string, hostPath: string): { success: boolean; error?: string } {
    if (!this.containerId) {
      return { success: false, error: '沙箱容器未运行' }
    }

    try {
      execSync(
        `docker cp "${this.containerId}:${containerPath}" "${hostPath}"`,
        { encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' },
      )
      return { success: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { success: false, error: message }
    }
  }

  /**
   * Get container logs.
   */
  getLogs(tailLines = 100): string {
    if (!this.containerId) return ''

    try {
      return execSync(`docker logs --tail ${tailLines} "${this.containerId}" 2>&1`, {
        encoding: 'utf-8',
        timeout: 10000,
      })
    } catch {
      return ''
    }
  }

  /**
   * Get resource usage stats for the container.
   */
  getStats(): { cpuPercent: number; memoryMB: number; memoryLimitMB: number } | null {
    if (!this.containerId) return null

    try {
      const result = execSync(
        `docker stats --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}" "${this.containerId}"`,
        { encoding: 'utf-8', timeout: 5000 },
      ).trim()

      const [cpuStr, memStr] = result.split('|')
      const cpuPercent = parseFloat(cpuStr.replace('%', '')) || 0
      const memParts = memStr.split('/')
      const memoryMB = parseFloat(memParts[0].trim().replace('MiB', '').replace('MB', '')) || 0
      const memoryLimitMB = parseFloat(memParts[1].trim().replace('MiB', '').replace('GB', '000').replace('MB', '')) || 0

      return { cpuPercent, memoryMB, memoryLimitMB }
    } catch {
      return null
    }
  }

  /**
   * Subscribe to sandbox events.
   */
  onEvent(handler: (event: DockerSandboxEvent) => void): () => void {
    this.eventHandlers.add(handler)
    return () => { this.eventHandlers.delete(handler) }
  }

  /**
   * Get the current container ID.
   */
  getContainerId(): string | null {
    return this.containerId
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<DockerSandboxConfig> {
    return this.config
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private emit(event: DockerSandboxEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event)
      } catch {
        // Ignore handler errors
      }
    }
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let instance: DockerSandboxManager | null = null

export function getDockerSandboxManager(config?: Partial<DockerSandboxConfig>): DockerSandboxManager {
  if (!instance) {
    instance = new DockerSandboxManager(config)
  }
  return instance
}

export function resetDockerSandboxManager(): void {
  if (instance) {
    instance.stop(true)
    instance = null
  }
}
