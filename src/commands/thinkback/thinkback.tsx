import { c as _c } from "react/compiler-runtime";
import { execa } from 'execa';
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Select } from '../../components/CustomSelect/select.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { Spinner } from '../../components/Spinner.js';
import instances from '../../ink/instances.js';
import { Box, Text } from '../../ink.js';
import { enablePluginOp } from '../../services/plugins/pluginOperations.js';
import { logForDebugging } from '../../utils/debug.js';
import { isENOENT, toError } from '../../utils/errors.js';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';
import { pathExists } from '../../utils/file.js';
import { logError } from '../../utils/log.js';
import { getPlatform } from '../../utils/platform.js';
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js';
import { isPluginInstalled } from '../../utils/plugins/installedPluginsManager.js';
import { addMarketplaceSource, clearMarketplacesCache, loadKnownMarketplacesConfig, refreshMarketplace } from '../../utils/plugins/marketplaceManager.js';
import { OFFICIAL_MARKETPLACE_NAME } from '../../utils/plugins/officialMarketplace.js';
import { loadAllPlugins } from '../../utils/plugins/pluginLoader.js';
import { installSelectedPlugins } from '../../utils/plugins/pluginStartupCheck.js';

// Marketplace and plugin identifiers - varies by user type
const INTERNAL_MARKETPLACE_NAME = 'claude-code-marketplace';
const INTERNAL_MARKETPLACE_REPO = 'anthropics/claude-code-marketplace';
const OFFICIAL_MARKETPLACE_REPO = 'anthropics/claude-plugins-official';
function getMarketplaceName(): string {
  return "external" === 'ant' ? INTERNAL_MARKETPLACE_NAME : OFFICIAL_MARKETPLACE_NAME;
}
function getMarketplaceRepo(): string {
  return "external" === 'ant' ? INTERNAL_MARKETPLACE_REPO : OFFICIAL_MARKETPLACE_REPO;
}
function getPluginId(): string {
  return `thinkback@${getMarketplaceName()}`;
}
const SKILL_NAME = 'thinkback';

/**
 * Get the thinkback skill directory from the installed plugin's cache path
 */
async function getThinkbackSkillDir(): Promise<string | null> {
  const {
    enabled
  } = await loadAllPlugins();
  const thinkbackPlugin = enabled.find(p => p.name === 'thinkback' || p.source && p.source.includes(getPluginId()));
  if (!thinkbackPlugin) {
    return null;
  }
  const skillDir = join(thinkbackPlugin.path, 'skills', SKILL_NAME);
  if (await pathExists(skillDir)) {
    return skillDir;
  }
  return null;
}
export async function playAnimation(skillDir: string): Promise<{
  success: boolean;
  message: string;
}> {
  const dataPath = join(skillDir, 'year_in_review.js');
  const playerPath = join(skillDir, 'player.js');

  // Both files are prerequisites for the node subprocess. Read them here
  // (not at call sites) so all callers get consistent error messaging. The
  // subprocess runs with reject: false, so a missing file would otherwise
  // silently return success. Using readFile (not access) per CLAUDE.md.
  //
  // Non-ENOENT errors (EACCES etc) are logged and returned as failures rather
  // than thrown — the old pathExists-based code never threw, and one caller
  // (handleSelect) uses `void playAnimation().then(...)` without a .catch().
  try {
    await readFile(dataPath);
  } catch (e: unknown) {
    if (isENOENT(e)) {
      return {
        success: false,
        message: '未找到动画。请先运行 /think-back 生成。'
      };
    }
    logError(e);
    return {
      success: false,
      message: `不能访问动画数据: ${toError(e).message}`
    };
  }
  try {
    await readFile(playerPath);
  } catch (e: unknown) {
    if (isENOENT(e)) {
      return {
        success: false,
        message: '未找到播放器脚本。thinkback 技能中缺少 player.js 文件。'
      };
    }
    logError(e);
    return {
      success: false,
      message: `不能访问玩家脚本: ${toError(e).message}`
    };
  }

  // Get ink instance for terminal takeover
  const inkInstance = instances.get(process.stdout);
  if (!inkInstance) {
    return {
      success: false,
      message: '无法访问终端实例'
    };
  }
  inkInstance.enterAlternateScreen();
  try {
    await execa('node', [playerPath], {
      stdio: 'inherit',
      cwd: skillDir,
      reject: false
    });
  } catch {
    // Animation may have been interrupted (e.g., Ctrl+C)
  } finally {
    inkInstance.exitAlternateScreen();
  }

  // Open the HTML file in browser for video download
  const htmlPath = join(skillDir, 'year_in_review.html');
  if (await pathExists(htmlPath)) {
    const platform = getPlatform();
    const openCmd = platform === 'macos' ? 'open' : platform === 'windows' ? 'start' : 'xdg-open';
    void execFileNoThrow(openCmd, [htmlPath]);
  }
  return {
    success: true,
    message: '年度回顾动画完成！'
  };
}
type InstallState = {
  phase: 'checking';
} | {
  phase: 'installing-marketplace';
} | {
  phase: 'installing-plugin';
} | {
  phase: 'enabling-plugin';
} | {
  phase: 'ready';
} | {
  phase: 'error';
  message: string;
};
function ThinkbackInstaller({
  onReady,
  onError
}: {
  onReady: () => void;
  onError: (message: string) => void;
}): React.ReactNode {
  const [state, setState] = useState<InstallState>({
    phase: 'checking'
  });
  const [progressMessage, setProgressMessage] = useState('');
  useEffect(() => {
    async function checkAndInstall(): Promise<void> {
      try {
        // Check if marketplace is installed
        const knownMarketplaces = await loadKnownMarketplacesConfig();
        const marketplaceName = getMarketplaceName();
        const marketplaceRepo = getMarketplaceRepo();
        const pluginId = getPluginId();
        const marketplaceInstalled = marketplaceName in knownMarketplaces;

        // Check if plugin is already installed first
        const pluginAlreadyInstalled = isPluginInstalled(pluginId);
        if (!marketplaceInstalled) {
          // Install the marketplace
          setState({
            phase: 'installing-marketplace'
          });
          logForDebugging(`Installing marketplace ${marketplaceRepo}`);
          await addMarketplaceSource({
            source: 'github',
            repo: marketplaceRepo
          }, message => {
            setProgressMessage(message);
          });
          clearAllCaches();
          logForDebugging(`Marketplace ${marketplaceName} installed`);
        } else if (!pluginAlreadyInstalled) {
          // Marketplace installed but plugin not installed - refresh to get latest plugins
          // Only refresh when needed to avoid potentially destructive git operations
          setState({
            phase: 'installing-marketplace'
          });
          setProgressMessage('正在更新市场…');
          logForDebugging(`Refreshing marketplace ${marketplaceName}`);
          await refreshMarketplace(marketplaceName, message_0 => {
            setProgressMessage(message_0);
          });
          clearMarketplacesCache();
          clearAllCaches();
          logForDebugging(`Marketplace ${marketplaceName} refreshed`);
        }
        if (!pluginAlreadyInstalled) {
          // Install the plugin
          setState({
            phase: 'installing-plugin'
          });
          logForDebugging(`Installing plugin ${pluginId}`);
          const result = await installSelectedPlugins([pluginId]);
          if (result.failed.length > 0) {
            const errorMsg = result.failed.map(f => `${f.name}: ${f.error}`).join(', ');
            throw new Error(`安装插件失败: ${errorMsg}`);
          }
          clearAllCaches();
          logForDebugging(`插件 ${pluginId} 已安装`);
        } else {
          // Plugin is installed, check if it's enabled
          const {
            disabled
          } = await loadAllPlugins();
          const isDisabled = disabled.some(p => p.name === 'thinkback' || p.source?.includes(pluginId));
          if (isDisabled) {
            // Enable the plugin
            setState({
              phase: 'enabling-plugin'
            });
            logForDebugging(`Enabling plugin ${pluginId}`);
            const enableResult = await enablePluginOp(pluginId);
            if (!enableResult.success) {
              throw new Error(`允许插件失败: ${enableResult.message}`);
            }
            clearAllCaches();
            logForDebugging(`Plugin ${pluginId} enabled`);
          }
        }
        setState({
          phase: 'ready'
        });
        onReady();
      } catch (error) {
        const err = toError(error);
        logError(err);
        setState({
          phase: 'error',
          message: err.message
        });
        onError(err.message);
      }
    }
    void checkAndInstall();
  }, [onReady, onError]);
  if (state.phase === 'error') {
    return <Box flexDirection="column">
        <Text color="error">错误: {state.message}</Text>
      </Box>;
  }
  if (state.phase === 'ready') {
    return null;
  }
  const statusMessage = state.phase === 'checking' ? '正在检查 thinkback 安装…' : state.phase === 'installing-marketplace' ? '正在安装市场…' : state.phase === 'enabling-plugin' ? '正在启用 thinkback 插件…' : '正在安装 thinkback 插件…';
  return <Box flexDirection="column">
      <Box>
        <Spinner />
        <Text>{progressMessage || statusMessage}</Text>
      </Box>
    </Box>;
}
type MenuAction = 'play' | 'edit' | 'fix' | 'regenerate';
type GenerativeAction = Exclude<MenuAction, 'play'>;
function ThinkbackMenu(t0) {
  const $ = _c(19);
  const {
    onDone,
    onAction,
    skillDir,
    hasGenerated
  } = t0;
  const [hasSelected, setHasSelected] = useState(false);
  let t1;
  if ($[0] !== hasGenerated) {
    t1 = hasGenerated ? [{
      label: "播放动画",
      value: "play" as const,
      description: "观看你的年度回顾"
    }, {
      label: "编辑内容",
      value: "edit" as const,
      description: "修改动画"
    }, {
      label: "修复错误",
      value: "fix" as const,
      description: "修复验证或渲染问题"
    }, {
      label: "重新生成",
      value: "regenerate" as const,
      description: "从头创建新动画"
    }] : [{
      label: "开始吧！",
      value: "regenerate" as const,
      description: "生成你的专属动画"
    }];
    $[0] = hasGenerated;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const options = t1;
  let t2;
  if ($[2] !== onAction || $[3] !== onDone || $[4] !== skillDir) {
    t2 = function handleSelect(value) {
      setHasSelected(true);
      if (value === "play") {
        playAnimation(skillDir).then(() => {
          onDone(undefined, {
            display: "skip"
          });
        });
      } else {
        onAction(value);
      }
    };
    $[2] = onAction;
    $[3] = onDone;
    $[4] = skillDir;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  const handleSelect = t2;
  let t3;
  if ($[6] !== onDone) {
    t3 = function handleCancel() {
      onDone(undefined, {
        display: "skip"
      });
    };
    $[6] = onDone;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  const handleCancel = t3;
  if (hasSelected) {
    return null;
  }
  let t4;
  if ($[8] !== hasGenerated) {
    t4 = !hasGenerated && <Box flexDirection="column"><Text>与 Claude 一起回顾你的编程之年。</Text><Text dimColor={true}>{"我们将创建个性化的 ASCII 动画，庆祝你的旅程。"}</Text></Box>;
    $[8] = hasGenerated;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  let t5;
  if ($[10] !== handleSelect || $[11] !== options) {
    t5 = <Select options={options} onChange={handleSelect} visibleOptionCount={5} />;
    $[10] = handleSelect;
    $[11] = options;
    $[12] = t5;
  } else {
    t5 = $[12];
  }
  let t6;
  if ($[13] !== t4 || $[14] !== t5) {
    t6 = <Box flexDirection="column" gap={1}>{t4}{t5}</Box>;
    $[13] = t4;
    $[14] = t5;
    $[15] = t6;
  } else {
    t6 = $[15];
  }
  let t7;
  if ($[16] !== handleCancel || $[17] !== t6) {
    t7 = <Dialog title="回顾 2025 年的 Claude Code 之旅" subtitle="生成您的 2025 Claude Code 回顾（运行需要几分钟）" onCancel={handleCancel} color="claude">{t6}</Dialog>;
    $[16] = handleCancel;
    $[17] = t6;
    $[18] = t7;
  } else {
    t7 = $[18];
  }
  return t7;
}
const EDIT_PROMPT = '使用 Skill 工具调用 mode=edit 的 "thinkback" 技能来修改我现有的 Claude Code 年度回顾动画。询问我想更改什么。动画准备就绪后，告诉用户再次运行 /think-back 来播放。';
const FIX_PROMPT = '使用 Skill 工具调用 mode=fix 的 "thinkback" 技能来修复我现有 Claude Code 年度回顾动画中的验证或渲染错误。运行验证器，识别错误并修复它们。动画准备就绪后，告诉用户再次运行 /think-back 来播放。';
const REGENERATE_PROMPT = '使用 Skill 工具调用 mode=regenerate 的 "thinkback" 技能从头开始创建全新的 Claude Code 年度回顾动画。删除现有动画并重新开始。动画准备就绪后，告诉用户再次运行 /think-back 来播放。';
function ThinkbackFlow(t0) {
  const $ = _c(27);
  const {
    onDone
  } = t0;
  const [installComplete, setInstallComplete] = useState(false);
  const [installError, setInstallError] = useState(null);
  const [skillDir, setSkillDir] = useState(null);
  const [hasGenerated, setHasGenerated] = useState(null);
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = function handleReady() {
      setInstallComplete(true);
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const handleReady = t1;
  let t2;
  if ($[1] !== onDone) {
    t2 = message => {
      setInstallError(message);
      onDone(`Thinkback 出错：${message}。尝试运行 /plugin 手动安装 think-back 插件。`, {
        display: "system"
      });
    };
    $[1] = onDone;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const handleError = t2;
  let t3;
  let t4;
  if ($[3] !== handleError || $[4] !== installComplete || $[5] !== installError || $[6] !== skillDir) {
    t3 = () => {
      if (installComplete && !skillDir && !installError) {
        getThinkbackSkillDir().then(dir => {
          if (dir) {
            logForDebugging(`Thinkback skill directory: ${dir}`);
            setSkillDir(dir);
          } else {
            handleError("找不到 Thinkback 技能目录");
          }
        });
      }
    };
    t4 = [installComplete, skillDir, installError, handleError];
    $[3] = handleError;
    $[4] = installComplete;
    $[5] = installError;
    $[6] = skillDir;
    $[7] = t3;
    $[8] = t4;
  } else {
    t3 = $[7];
    t4 = $[8];
  }
  useEffect(t3, t4);
  let t5;
  let t6;
  if ($[9] !== skillDir) {
    t5 = () => {
      if (!skillDir) {
        return;
      }
      const dataPath = join(skillDir, "year_in_review.js");
      pathExists(dataPath).then(exists => {
        logForDebugging(`Checking for ${dataPath}: ${exists ? "found" : "not found"}`);
        setHasGenerated(exists);
      });
    };
    t6 = [skillDir];
    $[9] = skillDir;
    $[10] = t5;
    $[11] = t6;
  } else {
    t5 = $[10];
    t6 = $[11];
  }
  useEffect(t5, t6);
  let t7;
  if ($[12] !== onDone) {
    t7 = function handleAction(action) {
      const prompts = {
        edit: EDIT_PROMPT,
        fix: FIX_PROMPT,
        regenerate: REGENERATE_PROMPT
      };
      onDone(prompts[action], {
        display: "user",
        shouldQuery: true
      });
    };
    $[12] = onDone;
    $[13] = t7;
  } else {
    t7 = $[13];
  }
  const handleAction = t7;
  if (installError) {
    let t8;
    if ($[14] !== installError) {
      t8 = <Text color="error">错误: {installError}</Text>;
      $[14] = installError;
      $[15] = t8;
    } else {
      t8 = $[15];
    }
    let t9;
    if ($[16] === Symbol.for("react.memo_cache_sentinel")) {
      t9 = <Text dimColor={true}>Try running /plugin to manually install the think-back plugin.</Text>;
      $[16] = t9;
    } else {
      t9 = $[16];
    }
    let t10;
    if ($[17] !== t8) {
      t10 = <Box flexDirection="column">{t8}{t9}</Box>;
      $[17] = t8;
      $[18] = t10;
    } else {
      t10 = $[18];
    }
    return t10;
  }
  if (!installComplete) {
    let t8;
    if ($[19] !== handleError) {
      t8 = <ThinkbackInstaller onReady={handleReady} onError={handleError} />;
      $[19] = handleError;
      $[20] = t8;
    } else {
      t8 = $[20];
    }
    return t8;
  }
  if (!skillDir || hasGenerated === null) {
    let t8;
    if ($[21] === Symbol.for("react.memo_cache_sentinel")) {
      t8 = <Box><Spinner /><Text>Loading thinkback skill…</Text></Box>;
      $[21] = t8;
    } else {
      t8 = $[21];
    }
    return t8;
  }
  let t8;
  if ($[22] !== handleAction || $[23] !== hasGenerated || $[24] !== onDone || $[25] !== skillDir) {
    t8 = <ThinkbackMenu onDone={onDone} onAction={handleAction} skillDir={skillDir} hasGenerated={hasGenerated} />;
    $[22] = handleAction;
    $[23] = hasGenerated;
    $[24] = onDone;
    $[25] = skillDir;
    $[26] = t8;
  } else {
    t8 = $[26];
  }
  return t8;
}
export async function call(onDone: (result?: string, options?: {
  display?: CommandResultDisplay;
  shouldQuery?: boolean;
}) => void): Promise<React.ReactNode> {
  return <ThinkbackFlow onDone={onDone} />;
}
