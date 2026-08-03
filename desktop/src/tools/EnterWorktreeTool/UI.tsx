import * as React from 'react';
import { Box, Text } from '../../ink.js';
import type { ToolProgressData } from '../../Tool.js';
import type { ProgressMessage } from '../../types/message.js';
import type { ThemeName } from '../../utils/theme.js';
import type { Output } from './EnterWorktreeTool.js';
export function renderToolUseMessage(): React.ReactNode {
  return '正在创建工作树…';
}
export function renderToolResultMessage(output: Output, _progressMessagesForMessage: ProgressMessage<ToolProgressData>[], _options: {
  theme: ThemeName;
}): React.ReactNode {
  return <Box flexDirection="column">
      <Text>
        已切换到分支 <Text bold>{output.worktreeBranch}</Text> 的工作树
      </Text>
      <Text dimColor>{output.worktreePath}</Text>
    </Box>;
}
