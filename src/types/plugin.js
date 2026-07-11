/**
 * 辅助函数：从任意 PluginError 获取显示消息
 * 适用于日志记录和简单的错误展示
 */
export function getPluginErrorMessage(error) {
    switch (error.type) {
        case 'generic-error':
            return error.error;
        case 'path-not-found':
            return `路径未找到: ${error.path} (${error.component})`;
        case 'git-auth-failed':
            return `Git 认证失败 (${error.authType}): ${error.gitUrl}`;
        case 'git-timeout':
            return `Git ${error.operation} 超时: ${error.gitUrl}`;
        case 'network-error':
            return `网络错误: ${error.url}${error.details ? ` - ${error.details}` : ''}`;
        case 'manifest-parse-error':
            return `清单解析错误: ${error.parseError}`;
        case 'manifest-validation-error':
            return `清单验证失败: ${error.validationErrors.join(', ')}`;
        case 'plugin-not-found':
            return `插件 ${error.pluginId} 在市场 ${error.marketplace} 中未找到`;
        case 'marketplace-not-found':
            return `市场 ${error.marketplace} 未找到`;
        case 'marketplace-load-failed':
            return `市场 ${error.marketplace} 加载失败: ${error.reason}`;
        case 'mcp-config-invalid':
            return `MCP 服务器 ${error.serverName} 无效: ${error.validationError}`;
        case 'mcp-server-suppressed-duplicate': {
            const dup = error.duplicateOf.startsWith('plugin:')
                ? `server provided by plugin "${error.duplicateOf.split(':')[1] ?? '?'}"`
                : `already-configured "${error.duplicateOf}"`;
            return `MCP 服务器 "${error.serverName}" 已跳过 — 与 ${dup} 命令/URL 重复`;
        }
        case 'hook-load-failed':
            return `钩子加载失败: ${error.reason}`;
        case 'component-load-failed':
            return `${error.component} 加载失败，路径: ${error.path}: ${error.reason}`;
        case 'mcpb-download-failed':
            return `从 ${error.url} 下载 MCPB 失败: ${error.reason}`;
        case 'mcpb-extract-failed':
            return `解压 MCPB ${error.mcpbPath} 失败: ${error.reason}`;
        case 'mcpb-invalid-manifest':
            return `MCPB 清单在 ${error.mcpbPath} 处无效: ${error.validationError}`;
        case 'lsp-config-invalid':
            return `插件 "${error.plugin}" 的 LSP 服务器配置 "${error.serverName}" 无效: ${error.validationError}`;
        case 'lsp-server-start-failed':
            return `插件 "${error.plugin}" 的 LSP 服务器 "${error.serverName}" 启动失败: ${error.reason}`;
        case 'lsp-server-crashed':
            if (error.signal) {
                return `插件 "${error.plugin}" 的 LSP 服务器 "${error.serverName}" 因信号 ${error.signal} 崩溃`;
            }
            return `插件 "${error.plugin}" 的 LSP 服务器 "${error.serverName}" 以退出码 ${error.exitCode ?? '未知'} 崩溃`;
        case 'lsp-request-timeout':
            return `插件 "${error.plugin}" 的 LSP 服务器 "${error.serverName}" 在 ${error.method} 请求中超时（${error.timeoutMs}ms）`;
        case 'lsp-request-failed':
            return `插件 "${error.plugin}" 的 LSP 服务器 "${error.serverName}" 的 ${error.method} 请求失败: ${error.error}`;
        case 'marketplace-blocked-by-policy':
            if (error.blockedByBlocklist) {
                return `市场 '${error.marketplace}' 被企业策略阻止`;
            }
            return `市场 '${error.marketplace}' 不在允许的市场列表中`;
        case 'dependency-unsatisfied': {
            const hint = error.reason === 'not-enabled'
                ? '已禁用 — 请启用它或移除依赖'
                : '未在任何已配置的市场中找到';
            return `依赖 "${error.dependency}" ${hint}`;
        }
        case 'plugin-cache-miss':
            return `插件 "${error.plugin}" 未缓存在 ${error.installPath} — 运行 /plugins 刷新`;
    }
}
