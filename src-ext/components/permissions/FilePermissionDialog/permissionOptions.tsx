import { homedir } from 'os';
import { basename, join, sep } from 'path';
import React, { type ReactNode } from 'react';
import { getOriginalCwd } from '../../../bootstrap/state.js';
import { Text } from '../../../ink.js';
import { getShortcutDisplay } from '../../../keybindings/shortcutFormat.js';
import type { ToolPermissionContext } from '../../../Tool.js';
import { expandPath, getDirectoryForPath } from '../../../utils/path.js';
import { normalizeCaseForComparison, pathInAllowedWorkingPath } from '../../../utils/permissions/filesystem.js';
import type { OptionWithDescription } from '../../CustomSelect/select.js';
/**
 * Check if a path is within the project's .claude/ folder.
 * This is used to determine whether to show the special ".claude folder" permission option.
 */
export function isInClaudeFolder(filePath: string): boolean {
  const absolutePath = expandPath(filePath);
  const claudeFolderPath = expandPath(`${getOriginalCwd()}/.claude`);

  // Check if the path is within the project's .claude folder
  const normalizedAbsolutePath = normalizeCaseForComparison(absolutePath);
  const normalizedClaudeFolderPath = normalizeCaseForComparison(claudeFolderPath);

  // Path must start with the .claude folder path (and be inside it, not just the folder itself)
  return normalizedAbsolutePath.startsWith(normalizedClaudeFolderPath + sep.toLowerCase()) ||
  // Also match case where sep is / on posix systems
  normalizedAbsolutePath.startsWith(normalizedClaudeFolderPath + '/');
}

/**
 * Check if a path is within the global ~/.claude/ folder.
 * This is used to determine whether to show the special ".claude folder" permission option
 * for files in the user's home directory.
 */
export function isInGlobalClaudeFolder(filePath: string): boolean {
  const absolutePath = expandPath(filePath);
  const globalClaudeFolderPath = join(homedir(), '.claude');
  const normalizedAbsolutePath = normalizeCaseForComparison(absolutePath);
  const normalizedGlobalClaudeFolderPath = normalizeCaseForComparison(globalClaudeFolderPath);
  return normalizedAbsolutePath.startsWith(normalizedGlobalClaudeFolderPath + sep.toLowerCase()) || normalizedAbsolutePath.startsWith(normalizedGlobalClaudeFolderPath + '/');
}
export type PermissionOption = {
  type: 'accept-once';
} | {
  type: 'accept-session';
  scope?: 'claude-folder' | 'global-claude-folder';
} | {
  type: 'reject';
};
export type PermissionOptionWithLabel = OptionWithDescription<string> & {
  option: PermissionOption;
};
export type FileOperationType = 'read' | 'write' | 'create';
export function getFilePermissionOptions({
  filePath,
  toolPermissionContext,
  operationType = 'write',
  onRejectFeedbackChange,
  onAcceptFeedbackChange,
  yesInputMode = false,
  noInputMode = false
}: {
  filePath: string;
  toolPermissionContext: ToolPermissionContext;
  operationType?: FileOperationType;
  onRejectFeedbackChange?: (value: string) => void;
  onAcceptFeedbackChange?: (value: string) => void;
  yesInputMode?: boolean;
  noInputMode?: boolean;
}): PermissionOptionWithLabel[] {
  const options: PermissionOptionWithLabel[] = [];
  const modeCycleShortcut = getShortcutDisplay('chat:cycleMode', 'Chat', 'shift+tab');

  // When in input mode, show input field
  if (yesInputMode && onAcceptFeedbackChange) {
    options.push({
      type: 'input',
      label: '是',
      value: 'yes',
      placeholder: '并告诉 Claude 下一步该做什么',
      onChange: onAcceptFeedbackChange,
      allowEmptySubmitToCancel: true,
      option: {
        type: 'accept-once'
      }
    });
  } else {
    options.push({
      label: '是',
      value: 'yes',
      option: {
        type: 'accept-once'
      }
    });
  }
  const inAllowedPath = pathInAllowedWorkingPath(filePath, toolPermissionContext);

  // Check if this is a .claude/ folder path (project or global)
  const inClaudeFolder = isInClaudeFolder(filePath);
  const inGlobalClaudeFolder = isInGlobalClaudeFolder(filePath);

  // Option 2: For .claude/ folder, show special option instead of generic session option
  // Note: Session-level options are always shown since they only affect in-memory state,
  // not persisted settings. The allowManagedPermissionRulesOnly setting only restricts
  // persisted permission rules.
  if ((inClaudeFolder || inGlobalClaudeFolder) && operationType !== 'read') {
    options.push({
      label: '是，并允许 Claude 在此会话中编辑自己的设置',
      value: 'yes-claude-folder',
      option: {
        type: 'accept-session',
        scope: inGlobalClaudeFolder ? 'global-claude-folder' : 'claude-folder'
      }
    });
  } else {
    // Option 2: Allow all changes/reads during session
    let sessionLabel: ReactNode;
    if (inAllowedPath) {
      // Inside working directory
      if (operationType === 'read') {
        sessionLabel = '是，在此会话期间';
      } else {
        sessionLabel = <Text>
            是，允许本次会话期间所有编辑{' '}
            <Text bold>({modeCycleShortcut})</Text>
          </Text>;
      }
    } else {
      // Outside working directory - include directory name
      const dirPath = getDirectoryForPath(filePath);
      const dirName = basename(dirPath) || 'this directory';
      if (operationType === 'read') {
        sessionLabel = <Text>
            是，允许从 <Text bold>{dirName}/</Text> 读取（本次会话）
          </Text>;
      } else {
        sessionLabel = <Text>
            是，允许在 <Text bold>{dirName}/</Text> 中进行所有编辑（本次会话）<Text bold>({modeCycleShortcut})</Text>
          </Text>;
      }
    }
    options.push({
      label: sessionLabel,
      value: 'yes-session',
      option: {
        type: 'accept-session'
      }
    });
  }

  // When in input mode, show input field for reject
  if (noInputMode && onRejectFeedbackChange) {
    options.push({
      type: 'input',
      label: '否',
      value: 'no',
      placeholder: '并告诉 Claude 应该如何改进',
      onChange: onRejectFeedbackChange,
      allowEmptySubmitToCancel: true,
      option: {
        type: 'reject'
      }
    });
  } else {
    // Not in input mode - simple option
    options.push({
      label: '否',
      value: 'no',
      option: {
        type: 'reject'
      }
    });
  }
  return options;
}
