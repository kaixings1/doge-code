import * as React from 'react';
import type { Notification } from '../context/notifications.js';
import { Text } from '../ink.js';
import { logForDebugging } from '../utils/debug.js';
import { checkAndInstallOfficialMarketplace } from '../utils/plugins/officialMarketplaceStartupCheck.js';
import { useStartupNotification } from './notifs/useStartupNotification.js';

/**
 * Hook that handles official marketplace auto-installation and shows
 * notifications for success/failure in the bottom right of the REPL.
 */
export function useOfficialMarketplaceNotification() {
  useStartupNotification(_temp);
}
async function _temp() {
  const result = await checkAndInstallOfficialMarketplace();
  const notifs = [];
  if (result.configSaveFailed) {
    logForDebugging("显示市场配置保存失败通知");
    notifs.push({
      key: "marketplace-config-save-failed",
      jsx: <Text color="error">保存市场重试信息失败 · 检查 ~/.claude.json 权限</Text>,
      priority: "immediate",
      timeoutMs: 10000
    });
  }
  if (result.installed) {
    logForDebugging("显示市场安装成功通知");
    notifs.push({
      key: "marketplace-installed",
      jsx: <Text color="success">✓ Anthropic 市场已安装 · 运行 /plugin 查看可用插件</Text>,
      priority: "immediate",
      timeoutMs: 7000
    });
  } else {
    if (result.skipped && result.reason === "unknown") {
      logForDebugging("显示市场安装失败通知");
      notifs.push({
        key: "marketplace-install-failed",
        jsx: <Text color="warning">安装 Anthropic 市场失败 · 将在下次启动时重试</Text>,
        priority: "immediate",
        timeoutMs: 8000
      });
    }
  }
  return notifs;
}
