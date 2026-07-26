import React from 'react';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Text } from '../../ink.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import type { Input, Output } from './ConfigTool.js';
export function renderToolUseMessage(input: Partial<Input>): React.ReactNode {
  if (!input.setting) return null;
  if (input.value === undefined) {
    return <Text dimColor>正在获取 {input.setting}</Text>;
  }
  return <Text dimColor>
      正在设置 {input.setting} 为 {jsonStringify(input.value)}
    </Text>;
}
export function renderToolResultMessage(content: Output): React.ReactNode {
  if (!content.success) {
    return <MessageResponse>
        <Text color="error">失败：{content.error}</Text>
      </MessageResponse>;
  }
  if (content.operation === 'get') {
    return <MessageResponse>
        <Text>
          <Text bold>{content.setting}</Text> = {jsonStringify(content.value)}
        </Text>
      </MessageResponse>;
  }
  return <MessageResponse>
      <Text>
        已设置 <Text bold>{content.setting}</Text> 为{' '}
        <Text bold>{jsonStringify(content.newValue)}</Text>
      </Text>
    </MessageResponse>;
}
export function renderToolUseRejectedMessage(): React.ReactNode {
  return <Text color="warning">配置更改被拒绝</Text>;
}
