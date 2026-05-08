import React, { useCallback, useEffect, useRef } from 'react';
import { isBridgeEnabled } from '../bridge/bridgeEnabled.js';
import { Box, Text } from '../ink.js';
import { getClaudeAIOAuthTokens } from '../utils/auth.js';
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js';
import type { OptionWithDescription } from './CustomSelect/select.js';
import { Select } from './CustomSelect/select.js';
import { PermissionDialog } from './permissions/PermissionDialog.js';
type RemoteCalloutSelection = 'enable' | 'dismiss';
type Props = {
  onDone: (selection: RemoteCalloutSelection) => void;
};
export function RemoteCallout({
  onDone
}: Props): React.ReactNode {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const handleCancel = useCallback((): void => {
    onDoneRef.current('dismiss');
  }, []);

  // Permanently mark as seen on mount so it only shows once
  useEffect(() => {
    saveGlobalConfig(current => {
      if (current.remoteDialogSeen) return current;
      return {
        ...current,
        remoteDialogSeen: true
      };
    });
  }, []);
  const handleSelect = useCallback((value: RemoteCalloutSelection): void => {
    onDoneRef.current(value);
  }, []);
  const options: OptionWithDescription<RemoteCalloutSelection>[] = [{
    label: '为此会话启用远程控制',
    description: '将打开一个到 claude.ai 的安全连接。',
    value: 'enable'
  }, {
    label: '不用了',
    description: '你可以随时通过 /remote-control 启用它。',
    value: 'dismiss'
  }];
  return <PermissionDialog title="远程控制">
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1} flexDirection="column">
          <Text>
            远程控制功能让你可以从网页（claude.ai/code）或 Claude 应用访问此 CLI 会话，
            这样你就可以在任何设备上继续工作。
          </Text>
          <Text> </Text>
          <Text>
            你可以随时运行 /remote-control 来断开远程访问。
          </Text>
        </Box>
        <Box>
          <Select options={options} onChange={handleSelect} onCancel={handleCancel} />
        </Box>
      </Box>
    </PermissionDialog>;
}

/**
 * Check whether to show the remote callout (first-time dialog).
 */
export function shouldShowRemoteCallout(): boolean {
  const config = getGlobalConfig();
  if (config.remoteDialogSeen) return false;
  if (!isBridgeEnabled()) return false;
  const tokens = getClaudeAIOAuthTokens();
  if (!tokens?.accessToken) return false;
  return true;
}
