import * as React from 'react';
import { Box, Text } from '../../ink.js';
import { readCustomApiStorage } from '../../utils/customApiStorage.js';
import { getTotalCostUSD } from '../../cost-tracker.js';
import { getCwd } from '../../utils/cwd.js';
import { getSessionId } from '../../bootstrap/state.js';

function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return key.slice(0, 2) + '\u2022\u2022\u2022\u2022' + key.slice(-2);
  }
  return key.slice(0, 4) + '\u2022\u2022\u2022\u2022' + key.slice(-4);
}

function DogeFooterInfo(): React.ReactNode {
  const config = readCustomApiStorage();
  const sessionId = getSessionId();
  const cwd = getCwd();
  const totalCost = getTotalCostUSD();

  const baseURL = config.baseURL || '';
  const apiKey = config.apiKey || '';
  const apiModel = config.model || '';

  const usdCost = totalCost > 0.5
    ? '$' + totalCost.toFixed(2)
    : '$' + totalCost.toFixed(4);
  const cnyCost = (totalCost * 7.2).toFixed(4);

  return (
    <Box flexDirection="column">
      <Text dimColor>Claude Code {MACRO.VERSION}-DOGE</Text>
      {apiModel && <Text dimColor>{apiModel} · Claude API</Text>}
      <Text dimColor>{cwd}</Text>
      {baseURL && <Text dimColor>baseURL: {baseURL}</Text>}
      {apiKey && <Text dimColor>apiKey: {maskApiKey(apiKey)}</Text>}
      <Text dimColor>总花费: {usdCost}</Text>
      <Text dimColor>花费人民币: ¥{cnyCost}</Text>
      <Text dimColor>会话ID: {sessionId}</Text>
    </Box>
  );
}

export default DogeFooterInfo;
