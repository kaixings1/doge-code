import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { Box, Text } from '../../ink.js';
import { useAppState } from '../../state/AppState.js';
import { getSessionId } from '../../bootstrap/state.js';
import { getSessionElapsed } from '../StatusLine.js';
import { formatDuration, truncate } from '../../utils/format.js';
import { readCustomApiStorage } from '../../utils/customApiStorage.js';
import { getDisplayPath } from '../../utils/file.js';
import { isDebugMode, isDebugToStdErr, getDebugLogPath } from '../../utils/debug.js';
import { getEffortSuffix } from '../../utils/effort.js';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { renderModelSetting } from '../../utils/model/model.js';
import { getGlobalConfig } from '../../utils/config.js';
import { getLogoDisplayData, formatModelAndBilling, truncatePath } from '../../utils/logoV2Utils.js';
import { stringWidth } from '../../ink/stringWidth.js';
import { getTotalCost } from '../../cost-tracker.js';

function maskApiKey(key: string | undefined): string {
  if (!key || key.length <= 8) return key || '';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return val.toFixed(i === 0 ? 0 : 3) + units[i];
}

export function StatusInfoPanel({ maxWidth }: { maxWidth: number }) {
  const $ = _c(41);
  const agent = useAppState(_temp);
  const effortValue = useAppState(_temp2);
  const model = useMainLoopModel();
  const sessionId = getSessionId();
  const sessionElapsed = getSessionElapsed();

  const { version, cwd, billingType, agentName: agentNameFromSettings } = getLogoDisplayData();
  const agentName = agent ?? agentNameFromSettings;
  const dogeConfig = readCustomApiStorage();

  const modelDisplayName = renderModelSetting(model);
  const effortSuffix = getEffortSuffix(model, effortValue);
  const fullModelName = modelDisplayName + effortSuffix;

  const baseUrl = dogeConfig.baseURL || '';
  const apiKey = maskApiKey(dogeConfig.apiKey);
  const tokens = dogeConfig.tokens;
  const configPath = getDisplayPath(process.env.DOGE_API_JSON || '');
  const startupTime = formatDuration(sessionElapsed, { mostSignificantOnly: false });

  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <Text bold={true}>Claude Code v{version}</Text>;
    $[0] = t0;
  } else {
    t0 = $[0];
  }

  let t1;
  if ($[1] !== fullModelName) {
    t1 = <Text dimColor={true}>🤖 {truncate(fullModelName, maxWidth - 2)}</Text>;
    $[1] = fullModelName;
    $[2] = t1;
  } else {
    t1 = $[2];
  }

  let t2;
  if ($[3] !== cwd) {
    t2 = <Text dimColor={true}>📁 {truncatePath(cwd, maxWidth - 2)}</Text>;
    $[3] = cwd;
    $[4] = t2;
  } else {
    t2 = $[4];
  }

  let t3;
  if ($[5] !== agentName) {
    t3 = agentName ? <Text dimColor={true}>🤖 {agentName}</Text> : null;
    $[5] = agentName;
    $[6] = t3;
  } else {
    t3 = $[6];
  }

  let t4;
  if ($[7] !== baseUrl) {
    t4 = baseUrl ? <Text dimColor={true}>🌐 {baseUrl}</Text> : null;
    $[7] = baseUrl;
    $[8] = t4;
  } else {
    t4 = $[8];
  }

  let t5;
  if ($[9] !== apiKey) {
    t5 = apiKey ? <Text dimColor={true}>🔑 {apiKey}</Text> : null;
    $[9] = apiKey;
    $[10] = t5;
  } else {
    t5 = $[10];
  }

  let t6;
  if ($[11] !== tokens?.sent || $[12] !== tokens?.received) {
    const sentStr = typeof tokens?.sent === 'number' ? (tokens.sent / 1e8).toFixed(3) + '亿' : '0';
    const recvStr = typeof tokens?.received === 'number' ? (tokens.received / 1e8).toFixed(3) + '万' : '0';
    t6 = <Text dimColor={true}>▴ {sentStr} ▾ {recvStr}</Text>;
    $[11] = tokens?.sent;
    $[12] = tokens?.received;
    $[13] = t6;
  } else {
    t6 = $[13];
  }

  let t7;
  if ($[14] !== tokens?.jsonSentBytes || $[15] !== tokens?.jsonReceivedBytes) {
    const sentBytes = typeof tokens?.jsonSentBytes === 'number' ? tokens.jsonSentBytes : 0;
    const recvBytes = typeof tokens?.jsonReceivedBytes === 'number' ? tokens.jsonReceivedBytes : 0;
    t7 = <Text dimColor={true}>📤 {formatBytes(sentBytes)} ↔ 📥 {formatBytes(recvBytes)}</Text>;
    $[14] = tokens?.jsonSentBytes;
    $[15] = tokens?.jsonReceivedBytes;
    $[16] = t7;
  } else {
    t7 = $[16];
  }

  const totalCost = getTotalCost();
  let t7b;
  if ($[17] !== totalCost) {
    t7b = totalCost > 0 ? <Text dimColor={true}>💰 ¥{(totalCost * 7.2).toFixed(4)}</Text> : null;
    $[17] = totalCost;
    $[18] = t7b;
  } else {
    t7b = $[18];
  }

  let t8;
  if ($[19] !== configPath) {
    t8 = configPath ? <Text dimColor={true}>📜 {configPath}</Text> : null;
    $[19] = configPath;
    $[20] = t8;
  } else {
    t8 = $[20];
  }

  let t9;
  if ($[21] !== sessionId) {
    t9 = <Text dimColor={true}>🔗 {sessionId}</Text>;
    $[21] = sessionId;
    $[22] = t9;
  } else {
    t9 = $[22];
  }

  let t10;
  if ($[23] !== startupTime) {
    t10 = <Text dimColor={true}>启动时间: {startupTime}</Text>;
    $[23] = startupTime;
    $[24] = t10;
  } else {
    t10 = $[24];
  }

  let t11;
  if ($[25] !== configPath) {
    t11 = <Text dimColor={true}>配置: {configPath}</Text>;
    $[25] = configPath;
    $[26] = t11;
  } else {
    t11 = $[26];
  }

  let lines;
  if ($[27] !== t0 || $[28] !== t1 || $[29] !== t2 || $[30] !== t3 || $[31] !== t4 || $[32] !== t5 || $[33] !== t6 || $[34] !== t7 || $[35] !== t7b || $[36] !== t8 || $[37] !== t9 || $[38] !== t10 || $[39] !== t11) {
    lines = <>{t0}{t1}{t2}{t3}{t4}{t5}{t6}{t7}{t7b}{t8}{t9}{t10}{t11}</>;
    $[27] = t0; $[28] = t1; $[29] = t2; $[30] = t3; $[31] = t4; $[32] = t5; $[33] = t6; $[34] = t7; $[35] = t7b; $[36] = t8; $[37] = t9; $[38] = t10; $[39] = t11;
    $[40] = lines;
  } else {
    lines = $[40];
  }

  return (
    <Box flexDirection="column" paddingLeft={2} gap={0}>
      {lines}
    </Box>
  );
}

function _temp2(s_0) {
  return s_0.effortValue;
}
function _temp(s) {
  return s.agent;
}
