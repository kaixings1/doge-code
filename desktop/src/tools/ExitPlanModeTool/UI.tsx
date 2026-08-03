import * as React from 'react';
import { Markdown } from '../../components/Markdown.js';
import { MessageResponse } from '../../components/MessageResponse.js';
import { RejectedPlanMessage } from '../../components/messages/UserToolResultMessage/RejectedPlanMessage.js';
import { BLACK_CIRCLE } from '../../constants/figures.js';
import { getModeColor } from '../../utils/permissions/PermissionMode.js';
import { Box, Text } from '../../ink.js';
import type { ToolProgressData } from '../../Tool.js';
import type { ProgressMessage } from '../../types/message.js';
import { getDisplayPath } from '../../utils/file.js';
import { getPlan } from '../../utils/plans.js';
import type { ThemeName } from '../../utils/theme.js';
import type { Output } from './ExitPlanModeV2Tool.js';
export function renderToolUseMessage(): React.ReactNode {
  return null;
}
export function renderToolResultMessage(output: Output, _progressMessagesForMessage: ProgressMessage<ToolProgressData>[], {
  theme: _theme
}: {
  theme: ThemeName;
}): React.ReactNode {
  const {
    plan,
    filePath
  } = output;
  const isEmpty = !plan || plan.trim() === '';
  const displayPath = filePath ? getDisplayPath(filePath) : '';
  const awaitingLeaderApproval = output.awaitingLeaderApproval;

  // Simplified message for empty plans
  if (isEmpty) {
    return <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Text color={getModeColor('plan')}>{BLACK_CIRCLE}</Text>
          <Text> 已退出计划模式</Text>
        </Box>
      </Box>;
  }

  // When awaiting leader approval, show a different message
  if (awaitingLeaderApproval) {
    return <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Text color={getModeColor('plan')}>{BLACK_CIRCLE}</Text>
          <Text> 计划已提交，等待团队负责人审批</Text>
        </Box>
        <MessageResponse>
          <Box flexDirection="column">
            {filePath && <Text dimColor>计划文件：{displayPath}</Text>}
            <Text dimColor>等待团队负责人审核并批准…</Text>
          </Box>
        </MessageResponse>
      </Box>;
  }
  return <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Text color={getModeColor('plan')}>{BLACK_CIRCLE}</Text>
        <Text> 用户已批准 Claude 的计划</Text>
      </Box>
      <MessageResponse>
        <Box flexDirection="column">
          {filePath && <Text dimColor>计划已保存至：{displayPath} · 输入 /plan 可编辑</Text>}
          <Markdown>{plan}</Markdown>
        </Box>
      </MessageResponse>
    </Box>;
}
export function renderToolUseRejectedMessage({
  plan
}: {
  plan?: string;
}, {
  theme: _theme
}: {
  theme: ThemeName;
}): React.ReactNode {
  const planContent = plan ?? getPlan() ?? '未找到计划'
  return <Box flexDirection="column">
      <RejectedPlanMessage plan={planContent} />
    </Box>;
}
