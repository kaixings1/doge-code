import { c as _c } from "react/compiler-runtime";
import chalk from 'chalk';
import figures from '../../vendor/figures.js';
import React from 'react';
import { getAdditionalDirectoriesForClaudeMd, setAdditionalDirectoriesForClaudeMd } from '../../bootstrap/state.js';
import type { LocalJSXCommandContext } from '../../commands.js';
import { MessageResponse } from '../../components/MessageResponse.js';
import { AddWorkspaceDirectory } from '../../components/permissions/rules/AddWorkspaceDirectory.js';
import { Box, Text } from '../../ink.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { applyPermissionUpdate, persistPermissionUpdate } from '../../utils/permissions/PermissionUpdate.js';
import type { PermissionUpdateDestination } from '../../utils/permissions/PermissionUpdateSchema.js';
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js';
import { addDirHelpMessage, validateDirectoryForWorkspace } from './validation.js';

// 成功图标 - 使用绿色对号
const SUCCESS_ICON = figures.tick;
// 错误图标 - 使用红色叉号
const ERROR_ICON = figures.cross;

export async function call(onDone: LocalJSXCommandOnDone, context: LocalJSXCommandContext, args?: string): Promise<React.ReactNode> {
  const directoryPath = (args ?? '').trim();
  const appState = context.getAppState();

  // 处理添加目录的辅助函数（与-path 和无-path 情况共享）
  // 同步函数：完成操作后调用 onDone
  // 注意：Select 组件的 onChange 不会渲染返回值，所以我们在消息前添加图标
  const handleAddDirectory = (path: string, remember = false) => {
    const destination: PermissionUpdateDestination = remember ? 'localSettings' : 'session';
    const permissionUpdate = {
      type: 'addDirectories' as const,
      directories: [path],
      destination
    };

    // 应用于会话上下文
    const latestAppState = context.getAppState();
    const updatedContext = applyPermissionUpdate(latestAppState.toolPermissionContext, permissionUpdate);
    context.setAppState(prev => ({
      ...prev,
      toolPermissionContext: updatedContext
    }));

    // 更新沙箱配置以便 Bash 命令可以访问新目录。
    // 引导状态是仅会话目录的真实来源；持久化
    // 目录通过设置订阅获取，但我们立即刷新
    // 以避免用户立即操作时出现竞争条件。
    const currentDirs = getAdditionalDirectoriesForClaudeMd();
    if (!currentDirs.includes(path)) {
      setAdditionalDirectoriesForClaudeMd([...currentDirs, path]);
    }
    SandboxManager.refreshConfig();
    let message: string;
    if (remember) {
      try {
        persistPermissionUpdate(permissionUpdate);
        message = `✅ ${chalk.bold(path)} 添加为工作目录并保存到本地设置`;
      } catch (error) {
        message = `❌ ${chalk.bold(path)} 添加为工作目录。保存失败：${error instanceof Error ? error.message : '未知错误'}`;
      }
    } else {
      message = `✅ ${chalk.bold(path)} 添加为本次会话的工作目录`;
    }
    const messageWithHint = `${message} ${chalk.dim('· /permissions 管理')}`;
    // 同步调用 onDone，完成命令
    onDone(messageWithHint);
  };

  // 当未提供路径时，直接显示 AddWorkspaceDirectory 输入表单
  // 并在确认后返回 REPL
  if (!directoryPath) {
    return <AddWorkspaceDirectory permissionContext={appState.toolPermissionContext} onAddDirectory={handleAddDirectory} onCancel={() => {
      onDone('未添加工作目录。');
    }} />;
  }
  const result = await validateDirectoryForWorkspace(directoryPath, appState.toolPermissionContext);
  if (result.resultType !== 'success') {
    const message = addDirHelpMessage(result);
    onDone(message);
    return <MessageResponse><Box flexDirection="row" gap={1}><Text color="error">{ERROR_ICON}</Text><Text>{message}</Text></Box></MessageResponse>;
  }
  return <AddWorkspaceDirectory directoryPath={result.absolutePath} permissionContext={appState.toolPermissionContext} onAddDirectory={handleAddDirectory} onCancel={() => {
    onDone(`未添加 ${chalk.bold(result.absolutePath)} 作为工作目录。`);
  }} />;
}
