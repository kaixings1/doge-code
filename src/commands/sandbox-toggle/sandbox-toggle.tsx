import { relative } from 'path';
import React from 'react';
import { getCwdState } from '../../bootstrap/state.js';
import { SandboxSettings } from '../../components/sandbox/SandboxSettings.js';
import { color } from '../../ink.js';
import { getPlatform } from '../../utils/platform.js';
import { addToExcludedCommands, SandboxManager } from '../../utils/sandbox/sandbox-adapter.js';
import { getSettings_DEPRECATED, getSettingsFilePathForSource } from '../../utils/settings/settings.js';
import type { ThemeName } from '../../utils/theme.js';
export async function call(onDone: (result?: string) => void, _context: unknown, args?: string): Promise<React.ReactNode | null> {
  const settings = getSettings_DEPRECATED();
  const themeName: ThemeName = settings.theme as ThemeName || 'light';
  const platform = getPlatform();
  if (!SandboxManager.isSupportedPlatform()) {
    // WSL1 用户会看到此消息，因为 isSupportedPlatform 对 WSL1 返回 false
    const errorMessage = platform === 'wsl' ? '错误：沙盒需要 WSL2。WSL1 不受支持。' : '错误：沙盒目前仅支持 macOS、Linux 和 WSL2。';
    const message = color('error', themeName)(errorMessage);
    onDone(message);
    return null;
  }

  // 检查依赖项 — 获取包含错误/警告的结构化结果
  const depCheck = SandboxManager.checkDependencies();

  // 检查平台是否在 enabledPlatforms 列表中（未记录的企业设置）
  if (!SandboxManager.isPlatformInEnabledList()) {
    const message = color('error', themeName)(`错误：此平台 (${platform}) 通过 enabledPlatforms 设置禁用了沙盒。`);
    onDone(message);
    return null;
  }

  // 检查沙盒设置是否被更高优先级的设置锁定
  if (SandboxManager.areSandboxSettingsLockedByPolicy()) {
    const message = color('error', themeName)('错误：沙盒设置已被更高优先级的配置覆盖，无法在本地更改。');
    onDone(message);
    return null;
  }

  // 解析参数
  const trimmedArgs = args?.trim() || '';

  // 无参数时显示交互菜单
  if (!trimmedArgs) {
    return <SandboxSettings onComplete={onDone} depCheck={depCheck} />;
  }

  // 处理子命令
  if (trimmedArgs) {
    const parts = trimmedArgs.split(' ');
    const subcommand = parts[0];
    if (subcommand === 'exclude') {
      // 处理 exclude 子命令
      const commandPattern = trimmedArgs.slice('exclude '.length).trim();
      if (!commandPattern) {
        const message = color('error', themeName)('错误：请提供要排除的命令模式（例如，/sandbox exclude "npm run test:*"）');
        onDone(message);
        return null;
      }

      // 移除存在的引号
      const cleanPattern = commandPattern.replace(/^["']|["']$/g, '');

      // 添加到 excludedCommands
      addToExcludedCommands(cleanPattern);

      // 获取本地设置路径并相对于 cwd
      const localSettingsPath = getSettingsFilePathForSource('localSettings');
      const relativePath = localSettingsPath ? relative(getCwdState(), localSettingsPath) : '.claude/settings.local.json';
      const message = color('success', themeName)(`已将 "${cleanPattern}" 添加到 ${relativePath} 的排除命令中`);
      onDone(message);
      return null;
    } else {
      // 未知子命令
      const message = color('error', themeName)(`错误：未知子命令 "${subcommand}"。可用的子命令：exclude`);
      onDone(message);
      return null;
    }
  }

  // 理论上不会到达这里，因为以上已处理所有情况
  return null;
}
