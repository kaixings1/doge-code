import { feature } from 'bun:bundle';

// Bugfix for corepack auto-pinning，它会将 yarnpkg 添加到用户的 package.json 中
// eslint-disable-next-line custom-rules/no-top-level-side-effects
process.env.COREPACK_ENABLE_AUTO_PIN = '0';

// 在 CCR 环境中为子进程设置最大堆大小（容器有 16GB）
// eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level, custom-rules/safe-env-boolean-check
if (process.env.CLAUDE_CODE_REMOTE === 'true') {
  // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
  const existing = process.env.NODE_OPTIONS || '';
  // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
  process.env.NODE_OPTIONS = existing ? `${existing} --max-old-space-size=8192` : '--max-old-space-size=8192';
}

// Harness-science L0 消融基线。内联在此处（而非 init.ts），因为
// BashTool/AgentTool/PowerShellTool 在导入时将 DISABLE_BACKGROUND_TASKS 捕获到
// 模块级常量中 — init() 运行得太晚。feature() 门控
// 从外部构建中死代码消除整个块。
// eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
if (feature('ABLATION_BASELINE') && process.env.CLAUDE_CODE_ABLATION_BASELINE) {
  for (const k of ['CLAUDE_CODE_SIMPLE', 'CLAUDE_CODE_DISABLE_THINKING', 'DISABLE_INTERLEAVED_THINKING', 'DISABLE_COMPACT', 'DISABLE_AUTO_COMPACT', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS']) {
    // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
    process.env[k] ??= '1';
  }
}

/**
 * 引导入口点 - 在加载完整 CLI 之前检查特殊标志。
 * 所有导入都是动态的，以最小化快速路径的模块评估。
 * --version 的快速路径在此文件之外没有导入。
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // --version/-v 的快速路径：无需加载模块
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v' || args[0] === '-V')) {
    // MACRO.VERSION 在构建时内联
    // biome-ignore lint/suspicious/noConsole:: 有意的控制台输出
    console.log(`${MACRO.VERSION} (Claude Code)`);
    return;
  }

  // 对于所有其他路径，加载启动分析器
  const {
    profileCheckpoint
  } = await import('../utils/startupProfiler.js');
  profileCheckpoint('cli_entry');

  // --dump-system-prompt 的快速路径：输出渲染后的系统提示并退出。
  // 用于提示敏感性评估，以提取特定提交处的系统提示。
  // 仅 Ant 内部：通过 feature 标志从外部构建中排除。
  if (feature('DUMP_SYSTEM_PROMPT') && args[0] === '--dump-system-prompt') {
    profileCheckpoint('cli_dump_system_prompt_path');
    const {
      enableConfigs
    } = await import('../utils/config.js');
    enableConfigs();
    const {
      getMainLoopModel
    } = await import('../utils/model/model.js');
    const modelIdx = args.indexOf('--model');
    const model = modelIdx !== -1 && args[modelIdx + 1] || getMainLoopModel();
    const {
      getSystemPrompt
    } = await import('../constants/prompts.js');
    const prompt = await getSystemPrompt([], model);
    // biome-ignore lint/suspicious/noConsole:: 有意的控制台输出
    console.log(prompt.join('\n'));
    return;
  }
  if (process.argv[2] === '--claude-in-chrome-mcp') {
    profileCheckpoint('cli_claude_in_chrome_mcp_path');
    const {
      runClaudeInChromeMcpServer
    } = await import('../utils/claudeInChrome/mcpServer.js');
    await runClaudeInChromeMcpServer();
    return;
  } else if (process.argv[2] === '--chrome-native-host') {
    profileCheckpoint('cli_chrome_native_host_path');
    const {
      runChromeNativeHost
    } = await import('../utils/claudeInChrome/chromeNativeHost.js');
    await runChromeNativeHost();
    return;
  } else if (feature('CHICAGO_MCP') && process.argv[2] === '--computer-use-mcp') {
    profileCheckpoint('cli_computer_use_mcp_path');
    const {
      runComputerUseMcpServer
    } = await import('../utils/computerUse/mcpServer.js');
    await runComputerUseMcpServer();
    return;
  }

  // `--daemon-worker=<kind>` 的快速路径（内部 — 由主管进程生成）。
  // 必须在 daemon 子命令检查之前：每个工作进程生成时调用，因此
  // 对性能敏感。此层没有 enableConfigs()，没有分析 sinks —
  // 工作进程保持精简。如果工作进程类型需要配置/认证（助手将会需要），
  // 它会在自己的 run() 函数内调用它们。
  if (feature('DAEMON') && args[0] === '--daemon-worker') {
    const {
      runDaemonWorker
    } = await import('../daemon/workerRegistry.js');
    await runDaemonWorker(args[1]);
    return;
  }

  // `claude remote-control` 的快速路径（同时也接受旧的 `claude remote` / `claude sync` / `claude bridge`）：
  // 将本地机器作为 bridge 环境提供服务。
  // feature() 必须保持内联以实现构建时死代码消除；
  // isBridgeEnabled() 检查运行时的 GrowthBook 门控。
  if (feature('BRIDGE_MODE') && (args[0] === 'remote-control' || args[0] === 'rc' || args[0] === 'remote' || args[0] === 'sync' || args[0] === 'bridge')) {
    profileCheckpoint('cli_bridge_path');
    const {
      enableConfigs
    } = await import('../utils/config.js');
    enableConfigs();
    const {
      getBridgeDisabledReason,
      checkBridgeMinVersion
    } = await import('../bridge/bridgeEnabled.js');
    const {
      BRIDGE_LOGIN_ERROR
    } = await import('../bridge/types.js');
    const {
      bridgeMain
    } = await import('../bridge/bridgeMain.js');
    const {
      exitWithError
    } = await import('../utils/process.js');

    // 认证检查必须在 GrowthBook 门控检查之前 — 没有认证，
    // GrowthBook 没有用户上下文，会返回过时/默认的 false。
    // getBridgeDisabledReason 等待 GB 初始化，因此返回值是最新的
    // （不是过时的磁盘缓存），但初始化仍然需要认证头才能工作。
    const {
      getClaudeAIOAuthTokens
    } = await import('../utils/auth.js');
    if (!getClaudeAIOAuthTokens()?.accessToken) {
      exitWithError(BRIDGE_LOGIN_ERROR);
    }
    const disabledReason = await getBridgeDisabledReason();
    if (disabledReason) {
      exitWithError(`错误：${disabledReason}`);
    }
    const versionError = checkBridgeMinVersion();
    if (versionError) {
      exitWithError(versionError);
    }

    // Bridge 是一个远程控制功能 - 检查策略限制
    const {
      waitForPolicyLimitsToLoad,
      isPolicyAllowed
    } = await import('../services/policyLimits/index.js');
    await waitForPolicyLimitsToLoad();
    if (!isPolicyAllowed('allow_remote_control')) {
      exitWithError("错误：远程控制已被组织策略禁用。");
    }
    await bridgeMain(args.slice(1));
    return;
  }

  // `claude daemon [subcommand]` 的快速路径：长时间运行的主管进程。
  if (feature('DAEMON') && args[0] === 'daemon') {
    profileCheckpoint('cli_daemon_path');
    const {
      enableConfigs
    } = await import('../utils/config.js');
    enableConfigs();
    const {
      initSinks
    } = await import('../utils/sinks.js');
    initSinks();
    const {
      daemonMain
    } = await import('../daemon/main.js');
    await daemonMain(args.slice(1));
    return;
  }

  // `claude ps|logs|attach|kill` 和 `--bg`/`--background` 的快速路径。
  // 针对 ~/.claude/sessions/ 注册表的会话管理。标志
  // 字面量已内联，因此 bg.js 仅在实际分发时加载。
  if (feature('BG_SESSIONS') && (args[0] === 'ps' || args[0] === 'logs' || args[0] === 'attach' || args[0] === 'kill' || args.includes('--bg') || args.includes('--background'))) {
    profileCheckpoint('cli_bg_path');
    const {
      enableConfigs
    } = await import('../utils/config.js');
    enableConfigs();
    const bg = await import('../cli/bg.js');
    switch (args[0]) {
      case 'ps':
        await bg.psHandler(args.slice(1));
        break;
      case 'logs':
        await bg.logsHandler(args[1]);
        break;
      case 'attach':
        await bg.attachHandler(args[1]);
        break;
      case 'kill':
        await bg.killHandler(args[1]);
        break;
      default:
        await bg.handleBgFlag(args);
    }
    return;
  }

  // 模板任务命令的快速路径。
  if (feature('TEMPLATES') && (args[0] === 'new' || args[0] === 'list' || args[0] === 'reply')) {
    profileCheckpoint('cli_templates_path');
    const {
      templatesMain
    } = await import('../cli/handlers/templateJobs.js');
    await templatesMain(args);
    // process.exit（非 return）— mountFleetView 的 Ink TUI 可能会留下事件
    // 循环句柄，阻止自然退出。
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(0);
  }

  // `claude environment-runner` 的快速路径：无头 BYOC 运行器。
  // feature() 必须保持内联以实现构建时死代码消除。
  if (feature('BYOC_ENVIRONMENT_RUNNER') && args[0] === 'environment-runner') {
    profileCheckpoint('cli_environment_runner_path');
    const {
      environmentRunnerMain
    } = await import('../environment-runner/main.js');
    await environmentRunnerMain(args.slice(1));
    return;
  }

  // `claude self-hosted-runner` 的快速路径：无头自托管运行器
  // 针对 SelfHostedRunnerWorkerService API（注册 + 轮询；轮询即
  // 心跳）。feature() 必须保持内联以实现构建时死代码消除。
  if (feature('SELF_HOSTED_RUNNER') && args[0] === 'self-hosted-runner') {
    profileCheckpoint('cli_self_hosted_runner_path');
    const {
      selfHostedRunnerMain
    } = await import('../self-hosted-runner/main.js');
    await selfHostedRunnerMain(args.slice(1));
    return;
  }

  // --worktree --tmux 的快速路径：在加载完整 CLI 之前 exec 到 tmux 中
  const hasTmuxFlag = args.includes('--tmux') || args.includes('--tmux=classic');
  if (hasTmuxFlag && (args.includes('-w') || args.includes('--worktree') || args.some(a => a.startsWith('--worktree=')))) {
    profileCheckpoint('cli_tmux_worktree_fast_path');
    const {
      enableConfigs
    } = await import('../utils/config.js');
    enableConfigs();
    const {
      isWorktreeModeEnabled
    } = await import('../utils/worktreeModeEnabled.js');
    if (isWorktreeModeEnabled()) {
      const {
        execIntoTmuxWorktree
      } = await import('../utils/worktree.js');
      const result = await execIntoTmuxWorktree(args);
      if (result.handled) {
        return;
      }
      // 如果未处理（例如错误），则回退到正常 CLI
      if (result.error) {
        const {
          exitWithError
        } = await import('../utils/process.js');
        exitWithError(result.error);
      }
    }
  }

  // 将常见的更新标志误用重定向到 update 子命令
  if (args.length === 1 && (args[0] === '--update' || args[0] === '--upgrade')) {
    process.argv = [process.argv[0]!, process.argv[1]!, 'update'];
  }

  // --bare：尽早设置 SIMPLE，以便在模块评估 / commander
  // 选项构建期间触发门控（而不仅仅在 action handler 内部）。
  if (args.includes('--bare')) {
    process.env.CLAUDE_CODE_SIMPLE = '1';
  }

  // 未检测到特殊标志，加载并运行完整 CLI
  const {
    startCapturingEarlyInput
  } = await import('../utils/earlyInput.js');
  startCapturingEarlyInput();
  profileCheckpoint('cli_before_main_import');
  const {
    main: cliMain
  } = await import('../main.js');
  profileCheckpoint('cli_after_main_import');
  await cliMain();
  profileCheckpoint('cli_after_main_complete');
}

// eslint-disable-next-line custom-rules/no-top-level-side-effects
void main();
