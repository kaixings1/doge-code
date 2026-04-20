/**
 * MCP 子命令处理函数 — 从 main.tsx 提取以实现懒加载。
 * 仅在对应的 `claude mcp *` 命令执行时才会动态导入这些模块。
 */

import { stat } from 'fs/promises';
import pMap from 'p-map';
import { cwd } from 'process';
import React from 'react';
import { MCPServerDesktopImportDialog } from '../../components/MCPServerDesktopImportDialog.js';
import { render } from '../../ink.js';
import { KeybindingSetup } from '../../keybindings/KeybindingProviderSetup.js';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../../services/analytics/index.js';
import { clearMcpClientConfig, clearServerTokensFromLocalStorage, getMcpClientConfig, readClientSecret, saveMcpClientSecret } from '../../services/mcp/auth.js';
import { connectToServer, getMcpServerConnectionBatchSize } from '../../services/mcp/client.js';
import { addMcpConfig, getAllMcpConfigs, getMcpConfigByName, getMcpConfigsByScope, removeMcpConfig } from '../../services/mcp/config.js';
import type { ConfigScope, ScopedMcpServerConfig } from '../../services/mcp/types.js';
import { describeMcpConfigFilePath, ensureConfigScope, getScopeLabel } from '../../services/mcp/utils.js';
import { AppStateProvider } from '../../state/AppState.js';
import { getCurrentProjectConfig, getGlobalConfig, saveCurrentProjectConfig } from '../../utils/config.js';
import { isFsInaccessible } from '../../utils/errors.js';
import { gracefulShutdown } from '../../utils/gracefulShutdown.js';
import { safeParseJSON } from '../../utils/json.js';
import { getPlatform } from '../../utils/platform.js';
import { cliError, cliOk } from '../exit.js';

async function checkMcpServerHealth(name: string, server: ScopedMcpServerConfig): Promise<string> {
  try {
    const result = await connectToServer(name, server);
    if (result.type === 'connected') {
      return '✓ 连接成功';
    } else if (result.type === 'needs-auth') {
      return '! 需要认证';
    } else {
      return '✗ 连接失败';
    }
  } catch (_error) {
    return '✗ 连接错误';
  }
}

// mcp serve (原行号 4512–4532)
export async function mcpServeHandler({
  debug,
  verbose
}: {
  debug?: boolean;
  verbose?: boolean;
}): Promise<void> {
  const providedCwd = cwd();
  logEvent('tengu_mcp_start', {});
  try {
    await stat(providedCwd);
  } catch (error) {
    if (isFsInaccessible(error)) {
      cliError(`错误：目录 ${providedCwd} 不存在`);
    }
    throw error;
  }
  try {
    const {
      setup
    } = await import('../../setup.js');
    await setup(providedCwd, 'default', false, false, undefined, false);
    const {
      startMCPServer
    } = await import('../../entrypoints/mcp.js');
    await startMCPServer(providedCwd, debug ?? false, verbose ?? false);
  } catch (error) {
    cliError(`错误：启动 MCP 服务器失败：${error}`);
  }
}

// mcp remove (原行号 4545–4635)
export async function mcpRemoveHandler(name: string, options: {
  scope?: string;
}): Promise<void> {
  // 在移除前先查找配置，以便清理安全存储
  const serverBeforeRemoval = getMcpConfigByName(name);
  const cleanupSecureStorage = () => {
    if (serverBeforeRemoval && (serverBeforeRemoval.type === 'sse' || serverBeforeRemoval.type === 'http')) {
      clearServerTokensFromLocalStorage(name, serverBeforeRemoval);
      clearMcpClientConfig(name, serverBeforeRemoval);
    }
  };
  try {
    if (options.scope) {
      const scope = ensureConfigScope(options.scope);
      logEvent('tengu_mcp_delete', {
        name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
      });
      await removeMcpConfig(name, scope);
      cleanupSecureStorage();
      process.stdout.write(`已从 ${scope} 配置中移除 MCP 服务器 ${name}\n`);
      cliOk(`文件已修改：${describeMcpConfigFilePath(scope)}`);
    }

    // 如果未指定作用域，则检查服务器存在于何处
    const projectConfig = getCurrentProjectConfig();
    const globalConfig = getGlobalConfig();

    // 检查服务器是否存在于项目作用域（.mcp.json）
    const {
      servers: projectServers
    } = getMcpConfigsByScope('project');
    const mcpJsonExists = !!projectServers[name];

    // 统计包含该服务器的作用域数量
    const scopes: Array<Exclude<ConfigScope, 'dynamic'>> = [];
    if (projectConfig.mcpServers?.[name]) scopes.push('local');
    if (mcpJsonExists) scopes.push('project');
    if (globalConfig.mcpServers?.[name]) scopes.push('user');
    if (scopes.length === 0) {
      cliError(`找不到名称为 "${name}" 的 MCP 服务器`);
    } else if (scopes.length === 1) {
      // 服务器仅存在于一个作用域，直接移除
      const scope = scopes[0]!;
      logEvent('tengu_mcp_delete', {
        name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
      });
      await removeMcpConfig(name, scope);
      cleanupSecureStorage();
      process.stdout.write(`已从 ${scope} 配置中移除 MCP 服务器 "${name}"\n`);
      cliOk(`文件已修改：${describeMcpConfigFilePath(scope)}`);
    } else {
      // 服务器存在于多个作用域中
      process.stderr.write(`MCP 服务器 "${name}" 存在于多个作用域中：\n`);
      scopes.forEach(scope => {
        process.stderr.write(`  - ${getScopeLabel(scope)} (${describeMcpConfigFilePath(scope)})\n`);
      });
      process.stderr.write('\n如需从特定作用域移除，请使用：\n');
      scopes.forEach(scope => {
        process.stderr.write(`  claude mcp remove "${name}" -s ${scope}\n`);
      });
      cliError();
    }
  } catch (error) {
    cliError((error as Error).message);
  }
}

// mcp list (原行号 4641–4688)
export async function mcpListHandler(): Promise<void> {
  logEvent('tengu_mcp_list', {});
  const {
    servers: configs
  } = await getAllMcpConfigs();
  if (Object.keys(configs).length === 0) {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log('未配置 MCP 服务器。使用 `claude mcp add` 添加服务器。');
  } else {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log('正在检查 MCP 服务器状态...\n');

    // 并发检查服务器状态
    const entries = Object.entries(configs);
    const results = await pMap(entries, async ([name, server]) => ({
      name,
      server,
      status: await checkMcpServerHealth(name, server)
    }), {
      concurrency: getMcpServerConnectionBatchSize()
    });
    for (const {
      name,
      server,
      status
    } of results) {
      // 此处有意排除 sse-ide 服务器，因其为内部使用
      if (server.type === 'sse') {
        // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
        console.log(`${name}: ${server.url} (SSE) - ${status}`);
      } else if (server.type === 'http') {
        // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
        console.log(`${name}: ${server.url} (HTTP) - ${status}`);
      } else if (server.type === 'claudeai-proxy') {
        // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
        console.log(`${name}: ${server.url} - ${status}`);
      } else if (!server.type || server.type === 'stdio') {
        const args = Array.isArray(server.args) ? server.args : [];
        // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
        console.log(`${name}: ${server.command} ${args.join(' ')} - ${status}`);
      }
    }
  }
  // 使用 gracefulShutdown 以正确清理 MCP 服务器连接
  // (process.exit 会绕过清理处理程序，导致子进程成为孤儿进程)
  await gracefulShutdown(0);
}

// mcp get (原行号 4694–4786)
export async function mcpGetHandler(name: string): Promise<void> {
  logEvent('tengu_mcp_get', {
    name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
  });
  const server = getMcpConfigByName(name);
  if (!server) {
    cliError(`未找到名称为 ${name} 的 MCP 服务器`);
  }

  // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
  console.log(`${name}:`);
  // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
  console.log(`  作用域：${getScopeLabel(server.scope)}`);

  // 检查服务器健康状况
  const status = await checkMcpServerHealth(name, server);
  // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
  console.log(`  状态：${status}`);

  // 此处有意排除 sse-ide 服务器，因其为内部使用
  if (server.type === 'sse') {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log(`  类型：sse`);
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log(`  URL: ${server.url}`);
    if (server.headers) {
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log('  请求头：');
      for (const [key, value] of Object.entries(server.headers)) {
        // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
        console.log(`    ${key}: ${value}`);
      }
    }
    if (server.oauth?.clientId || server.oauth?.callbackPort) {
      const parts: string[] = [];
      if (server.oauth.clientId) {
        parts.push('已配置 client_id');
        const clientConfig = getMcpClientConfig(name, server);
        if (clientConfig?.clientSecret) parts.push('已配置 client_secret');
      }
      if (server.oauth.callbackPort) parts.push(`已配置 callback_port ${server.oauth.callbackPort}`);
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`  OAuth: ${parts.join(', ')}`);
    }
  } else if (server.type === 'http') {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log(`  类型：http`);
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log(`  URL: ${server.url}`);
    if (server.headers) {
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log('  请求头：');
      for (const [key, value] of Object.entries(server.headers)) {
        // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
        console.log(`    ${key}: ${value}`);
      }
    }
    if (server.oauth?.clientId || server.oauth?.callbackPort) {
      const parts: string[] = [];
      if (server.oauth.clientId) {
        parts.push('已配置 client_id');
        const clientConfig = getMcpClientConfig(name, server);
        if (clientConfig?.clientSecret) parts.push('已配置 client_secret');
      }
      if (server.oauth.callbackPort) parts.push(`已配置 callback_port ${server.oauth.callbackPort}`);
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log(`  OAuth: ${parts.join(', ')}`);
    }
  } else if (server.type === 'stdio') {
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log(`  类型：stdio`);
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log(`  命令：${server.command}`);
    const args = Array.isArray(server.args) ? server.args : [];
    // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
    console.log(`  参数：${args.join(' ')}`);
    if (server.env) {
      // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
      console.log('  环境变量：');
      for (const [key, value] of Object.entries(server.env)) {
        // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
        console.log(`    ${key}=${value}`);
      }
    }
  }
  // biome-ignore lint/suspicious/noConsole: 有意为之的控制台输出
  console.log(`\n要移除此服务器，请运行：claude mcp remove "${name}" -s ${server.scope}`);
  // 使用 gracefulShutdown 以正确清理 MCP 服务器连接
  // (process.exit 会绕过清理处理程序，导致子进程成为孤儿进程)
  await gracefulShutdown(0);
}

// mcp add-json (原行号 4801–4870)
export async function mcpAddJsonHandler(name: string, json: string, options: {
  scope?: string;
  clientSecret?: true;
}): Promise<void> {
  try {
    const scope = ensureConfigScope(options.scope);
    const parsedJson = safeParseJSON(json);

    // 在写入配置前读取 secret，以便取消操作不会留下部分状态
    const needsSecret = options.clientSecret && parsedJson && typeof parsedJson === 'object' && 'type' in parsedJson && (parsedJson.type === 'sse' || parsedJson.type === 'http') && 'url' in parsedJson && typeof parsedJson.url === 'string' && 'oauth' in parsedJson && parsedJson.oauth && typeof parsedJson.oauth === 'object' && 'clientId' in parsedJson.oauth;
    const clientSecret = needsSecret ? await readClientSecret() : undefined;
    await addMcpConfig(name, parsedJson, scope);
    const transportType = parsedJson && typeof parsedJson === 'object' && 'type' in parsedJson ? String(parsedJson.type || 'stdio') : 'stdio';
    if (clientSecret && parsedJson && typeof parsedJson === 'object' && 'type' in parsedJson && (parsedJson.type === 'sse' || parsedJson.type === 'http') && 'url' in parsedJson && typeof parsedJson.url === 'string') {
      saveMcpClientSecret(name, {
        type: parsedJson.type,
        url: parsedJson.url
      }, clientSecret);
    }
    logEvent('tengu_mcp_add', {
      scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source: 'json' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      type: transportType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
    });
    cliOk(`已将 ${transportType} MCP 服务器 ${name} 添加到 ${scope} 配置`);
  } catch (error) {
    cliError((error as Error).message);
  }
}

// mcp add-from-claude-desktop (原行号 4881–4927)
export async function mcpAddFromDesktopHandler(options: {
  scope?: string;
}): Promise<void> {
  try {
    const scope = ensureConfigScope(options.scope);
    const platform = getPlatform();
    logEvent('tengu_mcp_add', {
      scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      platform: platform as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source: 'desktop' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
    });
    const {
      readClaudeDesktopMcpServers
    } = await import('../../utils/claudeDesktop.js');
    const servers = await readClaudeDesktopMcpServers();
    if (Object.keys(servers).length === 0) {
      cliOk('未在 Claude Desktop 配置中找到 MCP 服务器，或配置文件不存在。');
    }
    const {
      unmount
    } = await render(<AppStateProvider>
        <KeybindingSetup>
          <MCPServerDesktopImportDialog servers={servers} scope={scope} onDone={() => {
          unmount();
        }} />
        </KeybindingSetup>
      </AppStateProvider>, {
      exitOnCtrlC: true
    });
  } catch (error) {
    cliError((error as Error).message);
  }
}

// mcp reset-project-choices (原行号 4935–4952)
export async function mcpResetChoicesHandler(): Promise<void> {
  logEvent('tengu_mcp_reset_mcpjson_choices', {});
  saveCurrentProjectConfig(current => ({
    ...current,
    enabledMcpjsonServers: [],
    disabledMcpjsonServers: [],
    enableAllProjectMcpServers: false
  }));
  cliOk('所有项目作用域（.mcp.json）的服务器批准与拒绝状态均已重置。\n' + '下次启动 Claude Code 时，您将再次收到授权提示。');
}