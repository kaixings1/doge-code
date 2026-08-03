/**
 * 路径安全控制器
 * 文件：src/security/PathGuard.ts
 * 文档 16 §6.1
 */

import { resolve, normalize, isAbsolute, join } from 'path';

export interface PathGuardConfig {
  rootDir: string;
  allowedDirs: string[];
  blockedDirs: string[];
  allowedExtensions: string[];
  blockedExtensions: string[];
  maxSymlinkDepth: number;
}

export class PathGuard {
  private config: PathGuardConfig;

  constructor(config: Partial<PathGuardConfig> = {}) {
    this.config = {
      rootDir: process.cwd(),
      allowedDirs: [],
      blockedDirs: [
        '.git',
        'node_modules',
        '.env',
        '.ssh',
        '.aws',
      ],
      allowedExtensions: [],
      blockedExtensions: ['.exe', '.bat', '.cmd', '.sh', '.ps1'],
      maxSymlinkDepth: 5,
      ...config,
    };
  }

  /**
   * 验证路径
   */
  validate(path: string): {
    allowed: boolean;
    reason?: string;
    normalizedPath?: string;
  } {
    // 1. 检查空路径
    if (!path || path.trim().length === 0) {
      return { allowed: false, reason: 'Path is empty' };
    }

    // 2. 规范化路径
    const normalizedPath = this.normalizePath(path);

    // 3. 检查路径遍历
    if (path.includes('..')) {
      const resolved = resolve(this.config.rootDir, path);
      if (!resolved.startsWith(this.config.rootDir)) {
        return {
          allowed: false,
          reason: 'Path traversal detected: escapes root directory',
        };
      }
    }

    // 4. 检查阻止目录
    for (const blocked of this.config.blockedDirs) {
      if (normalizedPath.includes(blocked)) {
        return {
          allowed: false,
          reason: `Access to blocked directory: ${blocked}`,
          normalizedPath,
        };
      }
    }

    // 5. 检查允许目录（如果配置了）
    if (this.config.allowedDirs.length > 0) {
      const inAllowedDir = this.config.allowedDirs.some((dir) =>
        normalizedPath.startsWith(this.normalizePath(dir))
      );
      if (!inAllowedDir) {
        return {
          allowed: false,
          reason: 'Path is not in allowed directories',
          normalizedPath,
        };
      }
    }

    // 6. 检查扩展名
    const ext = this.getExtension(normalizedPath);
    if (ext) {
      if (this.config.blockedExtensions.includes(ext)) {
        return {
          allowed: false,
          reason: `Blocked file extension: ${ext}`,
          normalizedPath,
        };
      }

      if (
        this.config.allowedExtensions.length > 0 &&
        !this.config.allowedExtensions.includes(ext)
      ) {
        return {
          allowed: false,
          reason: `File extension not allowed: ${ext}`,
          normalizedPath,
        };
      }
    }

    return { allowed: true, normalizedPath };
  }

  /**
   * 规范化路径
   */
  private normalizePath(path: string): string {
    let normalized = path.replace(/\\/g, '/');

    if (!isAbsolute(normalized)) {
      normalized = join(this.config.rootDir, normalized);
    }

    normalized = normalize(normalized);

    return normalized.replace(/\\/g, '/');
  }

  /**
   * 获取扩展名
   */
  private getExtension(path: string): string {
    const parts = path.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1].toLowerCase()}` : '';
  }

  /**
   * 添加允许目录
   */
  addAllowedDir(dir: string): void {
    this.config.allowedDirs.push(dir);
  }

  /**
   * 添加阻止目录
   */
  addBlockedDir(dir: string): void {
    this.config.blockedDirs.push(dir);
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<PathGuardConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
