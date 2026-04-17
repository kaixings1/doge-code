import * as React from 'react';
import { MessageResponse } from '../../components/MessageResponse.js';
import { OutputLine } from '../../components/shell/OutputLine.js';
import { Text } from '../../ink.js';
import type { ToolProgressData } from '../../Tool.js';
import type { ProgressMessage } from '../../types/message.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import type { Output } from './ListMcpResourcesTool.js';
export function renderToolUseMessage(input: Partial<{
  server?: string;
}>): React.ReactNode {
  return input.server ? `列出服务器 "${input.server}" 的 MCP 资源` : `列出所有 MCP 资源`;
}
export function renderToolResultMessage(output: Output, _progressMessagesForMessage: ProgressMessage<ToolProgressData>[], {
  verbose
}: {
  verbose: boolean;
}): React.ReactNode {
  if (!output || output.length === 0) {
    return <MessageResponse height={1}>
        <Text dimColor>（未找到资源）</Text>
      </MessageResponse>;
  }

   
  const formattedOutput = jsonStringify(output, null, 2);
  return <OutputLine content={formattedOutput} verbose={verbose} />;
}
