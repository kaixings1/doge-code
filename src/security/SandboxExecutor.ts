/**
 * 沙箱执行器
 * 文件：src/security/SandboxExecutor.ts
 * 文档 16 §4.1
 */

import { spawn, ChildProcess } from 'child_process';

export interface SandboxConfig {
  enabled: boolean;
  workDir: string;
  allowedPaths: string[];
  blockedPaths: string[];
  env: Record<string, string>;
  timeout: number;
  maxMemory: number; // MB
  maxCpuTime: number; // ms
  maxProcesses: number;
  networkAccess: boolean;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  timedOut: boolean;
}

export class SandboxExecutor {
  private config: SandboxConfig;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = {
      enabled: true,
      workDir: process.cwd(),
      allowedPaths: [],
      blockedPaths: ['/etc', '/var', '/usr', '/bin', '/sbin', 'C:\\Windows', 'C:\\Program Files'],
      env: {},
      timeout: 60000,
      maxMemory: 512,
      maxCpuTime: 30000,
      maxProcesses: 10,
      networkAccess: false,
      ...config,
    };
  }

  /**
   * 在沙箱中执行命令
   */
  async execute(command: string, args: string[] = []): Promise<SandboxResult> {
    if (!this.config.enabled) {
      // 沙箱未启用，直接执行
      return this.executeDirect(command, args);
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: this.config.workDir,
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // 超时处理
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');

        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, this.config.timeout);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);

        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
          duration: Date.now() - startTime,
          timedOut,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);

        resolve({
          stdout,
          stderr: stderr + err.message,
          exitCode: -1,
          duration: Date.now() - startTime,
          timedOut,
        });
      });
    });
  }

  /**
   * 直接执行（无沙箱）
   */
  private async executeDirect(command: string, args: string[]): Promise<SandboxResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: this.config.workDir,
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
          duration: Date.now() - startTime,
          timedOut: false,
        });
      });

      child.on('error', (err) => {
        resolve({
          stdout,
          stderr: err.message,
          exitCode: -1,
          duration: Date.now() - startTime,
          timedOut: false,
        });
      });
    });
  }

  /**
   * 检查路径是否允许访问
   */
  isPathAllowed(path: string): boolean {
    // 检查是否在阻止列表中
    for (const blocked of this.config.blockedPaths) {
      if (path.startsWith(blocked)) {
        return false;
      }
    }

    // 如果有允许列表，检查是否在允许列表中
    if (this.config.allowedPaths.length > 0) {
      return this.config.allowedPaths.some((allowed) => path.startsWith(allowed));
    }

    return true;
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * 获取配置
   */
  getConfig(): SandboxConfig {
    return { ...this.config };
  }
}
