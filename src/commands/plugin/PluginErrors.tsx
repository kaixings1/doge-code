import { getPluginErrorMessage, type PluginError } from '../../types/plugin.js';
export function formatErrorMessage(error: PluginError): string {
  switch (error.type) {
    case 'path-not-found':
      return `未找到 ${error.component} 路径：${error.path}`;
    case 'git-auth-failed':
      return `Git ${error.authType.toUpperCase()} 认证失败，${error.gitUrl}`;
    case 'git-timeout':
      return `Git ${error.operation} 超时，${error.gitUrl}`;
    case 'network-error':
      return `访问 ${error.url} 时出现网络错误${error.details ? `：${error.details}` : ''}`;
    case 'manifest-parse-error':
      return `解析清单失败，位于 ${error.manifestPath}：${error.parseError}`;
    case 'manifest-validation-error':
      return `清单无效，位于 ${error.manifestPath}：${error.validationErrors.join(', ')}`;
    case 'plugin-not-found':
      return `在 marketplace "${error.marketplace}" 中未找到插件 "${error.pluginId}"`;
    case 'marketplace-not-found':
      return `未找到 marketplace "${error.marketplace}"`;
    case 'marketplace-load-failed':
      return `加载 marketplace "${error.marketplace}" 失败：${error.reason}`;
    case 'mcp-config-invalid':
      return `"${error.serverName}" 的 MCP 服务器配置无效：${error.validationError}`;
    case 'mcp-server-suppressed-duplicate':
      {
        const dup = error.duplicateOf.startsWith('plugin:') ? `插件 "${error.duplicateOf.split(':')[1] ?? '?'}" 提供的服务器` : `已配置的 "${error.duplicateOf}"`;
        return `MCP 服务器 "${error.serverName}" 已跳过 — 与 ${dup} 使用相同的命令/URL`;
      }
    case 'hook-load-failed':
      return `从 ${error.hookPath} 加载 hooks 失败：${error.reason}`;
    case 'component-load-failed':
      return `从 ${error.path} 加载 ${error.component} 失败：${error.reason}`;
    case 'mcpb-download-failed':
      return `从 ${error.url} 下载 MCPB 失败：${error.reason}`;
    case 'mcpb-extract-failed':
      return `Failed to extract MCPB ${error.mcpbPath}: ${error.reason}`;
    case 'mcpb-invalid-manifest':
      return `MCPB manifest invalid at ${error.mcpbPath}: ${error.validationError}`;
    case 'marketplace-blocked-by-policy':
      return error.blockedByBlocklist ? `Marketplace "${error.marketplace}" is blocked by enterprise policy` : `Marketplace "${error.marketplace}" is not in the allowed marketplace list`;
    case 'dependency-unsatisfied':
      return error.reason === 'not-enabled' ? `Dependency "${error.dependency}" is disabled` : `Dependency "${error.dependency}" is not installed`;
    case 'lsp-config-invalid':
      return `Invalid LSP server config for "${error.serverName}": ${error.validationError}`;
    case 'lsp-server-start-failed':
      return `LSP server "${error.serverName}" failed to start: ${error.reason}`;
    case 'lsp-server-crashed':
      return error.signal ? `LSP server "${error.serverName}" crashed with signal ${error.signal}` : `LSP server "${error.serverName}" crashed with exit code ${error.exitCode ?? 'unknown'}`;
    case 'lsp-request-timeout':
      return `LSP server "${error.serverName}" timed out on ${error.method} after ${error.timeoutMs}ms`;
    case 'lsp-request-failed':
      return `LSP server "${error.serverName}" ${error.method} failed: ${error.error}`;
    case 'plugin-cache-miss':
      return `插件 "${error.plugin}" 未缓存在 ${error.installPath}`;
    case 'generic-error':
      return error.error;
  }
  const _exhaustive: never = error;
  return getPluginErrorMessage(_exhaustive);
}
export function getErrorGuidance(error: PluginError): string | null {
  switch (error.type) {
    case 'path-not-found':
      return '检查您的 manifest 或 marketplace 配置中的路径是否正确';
    case 'git-auth-failed':
      return error.authType === 'ssh' ? '请配置 SSH 密钥或改用 HTTPS URL' : '请配置凭据或改用 SSH URL';
    case 'git-timeout':
    case 'network-error':
      return '检查您的网络连接并重试';
    case 'manifest-parse-error':
      return '检查插件目录中的 manifest 文件语法';
    case 'manifest-validation-error':
      return '检查 manifest 文件是否符合要求的架构';
    case 'plugin-not-found':
      return `插件在 marketplace "${error.marketplace}" 中可能不存在`;
    case 'marketplace-not-found':
      return error.availableMarketplaces.length > 0 ? `可用的 marketplace：${error.availableMarketplaces.join(', ')}` : '请先使用 /plugin marketplace add 添加 marketplace';
    case 'mcp-config-invalid':
      return '检查 .mcp.json 或 manifest 中的 MCP 服务器配置';
    case 'mcp-server-suppressed-duplicate':
      {
        // duplicateOf is "plugin:name:srv" when another plugin won dedup —
        // users can't remove plugin-provided servers from their MCP config,
        // so point them at the winning plugin instead.
        if (error.duplicateOf.startsWith('plugin:')) {
          const winningPlugin = error.duplicateOf.split(':')[1] ?? '另一个插件';
          return `禁用插件 "${winningPlugin}" 以使用此插件的版本`;
        }
        return `从 MCP 配置中移除 "${error.duplicateOf}" 以使用插件版本`;
      }
    case 'hook-load-failed':
      return '检查 hooks.json 文件的语法和结构';
    case 'component-load-failed':
      return `检查 ${error.component} 目录结构和文件权限`;
    case 'mcpb-download-failed':
      return '检查您的网络连接和 URL 可访问性';
    case 'mcpb-extract-failed':
      return '验证 MCPB 文件是否有效且未损坏';
    case 'mcpb-invalid-manifest':
      return '请联系插件作者关于无效的 manifest';
    case 'marketplace-blocked-by-policy':
      if (error.blockedByBlocklist) {
        return '此 marketplace 源已被管理员明确阻止';
      }
      return error.allowedSources.length > 0 ? `允许的源：${error.allowedSources.join(', ')}` : '请联系您的管理员以配置允许的 marketplace 源';
    case 'dependency-unsatisfied':
      return error.reason === 'not-enabled' ? `启用 "${error.dependency}" 或卸载 "${error.plugin}"` : `安装 "${error.dependency}" 或卸载 "${error.plugin}"`;
    case 'lsp-config-invalid':
      return '检查插件 manifest 中的 LSP 服务器配置';
    case 'lsp-server-start-failed':
    case 'lsp-server-crashed':
    case 'lsp-request-timeout':
    case 'lsp-request-failed':
      return '使用 --debug 检查 LSP 服务器日志以获取详细信息';
    case 'plugin-cache-miss':
      return '运行 /plugins 刷新插件缓存';
    case 'marketplace-load-failed':
    case 'generic-error':
      return null;
  }
  const _exhaustive: never = error;
  return null;
}
