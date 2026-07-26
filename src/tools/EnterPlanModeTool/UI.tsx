import * as React from 'react';
import { BLACK_CIRCLE } from '../../constants/figures.js';
import { getModeColor } from '../../utils/permissions/PermissionMode.js';
import { Box, Text } from '../../ink.js';
import type { ToolProgressData } from '../../Tool.js';
import type { ProgressMessage } from '../../types/message.js';
import type { ThemeName } from '../../utils/theme.js';
import type { Output } from './EnterPlanModeTool.js';
export function renderToolUseMessage(): React.ReactNode {
  return null;
}
export function renderToolResultMessage(_output: Output, _progressMessagesForMessage: ProgressMessage<ToolProgressData>[], _options: {
  theme: ThemeName;
}): React.ReactNode {
  return <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Text color={getModeColor('plan')}>{BLACK_CIRCLE}</Text>
        <Text> 已进入计划模式</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text dimColor>
          Claude 正在探索并设计实现方案。
        </Text>
      </Box>
    </Box>;
}
export function renderToolUseRejectedMessage(): React.ReactNode {
  return <Box flexDirection="row" marginTop={1}>
      <Text color={getModeColor('default')}>{BLACK_CIRCLE}</Text>
      <Text> 用户拒绝进入计划模式</Text>
    </Box>;
}
