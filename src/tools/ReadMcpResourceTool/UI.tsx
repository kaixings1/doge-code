import * as React from 'react';
import type { z } from 'zod/v4';
import { MessageResponse } from '../../components/MessageResponse.js';
import { OutputLine } from '../../components/shell/OutputLine.js';
import { Box, Text } from '../../ink.js';
import type { ToolProgressData } from '../../Tool.js';
import type { ProgressMessage } from '../../types/message.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import type { inputSchema, Output } from './ReadMcpResourceTool.js';
export function renderToolUseMessage(input: Partial<z.infer<ReturnType<typeof inputSchema>>>): React.ReactNode {
  if (!input.uri || !input.server) {
    return null;
  }
  return `读取资源 "${input.uri}"，来自服务器 "${input.server}"`;
}
export function userFacingName(): string {
  return '读取 MCP 资源';
}
export function renderToolResultMessage(output: Output, _progressMessagesForMessage: ProgressMessage<ToolProgressData>[], {
  verbose
}: {
  verbose: boolean;
}): React.ReactNode {
  if (!output || !output.contents || output.contents.length === 0) {
    return <Box justifyContent="space-between" overflowX="hidden" width="100%">
        <MessageResponse height={1}>
          <Text dimColor>（无内容）</Text>
        </MessageResponse>
      </Box>;
  }

  // Format as JSON for better readability
   
  const formattedOutput = jsonStringify(output, null, 2);
  return <OutputLine content={formattedOutput} verbose={verbose} />;
}
