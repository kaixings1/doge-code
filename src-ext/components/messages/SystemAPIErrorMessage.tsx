import * as React from 'react';
import { useState, useCallback, useRef } from 'react';
import { Box, Text } from '../../ink.js';
import { formatAPIError } from '../../services/api/errorUtils.js';
import type { SystemAPIErrorMessage as SystemAPIErrorMessageType } from '../../types/message.js';
import { CtrlOToExpand } from '../CtrlOToExpand.js';
import { MessageResponse } from '../MessageResponse.js';

const MAX_API_ERROR_CHARS = 1000;

type Props = {
  message: SystemAPIErrorMessageType;
  verbose: boolean;
};

export function SystemAPIErrorMessage({ message, verbose }: Props) {
  const {
    retryAttempt,
    error,
    retryInMs: rawRetryInMs,
    maxRetries,
  } = message;

  const retryInMs = rawRetryInMs > 0 ? rawRetryInMs : 0;
  const hidden = retryAttempt < 2 || retryInMs === 0;
  const [countdownMs, setCountdownMs] = useState(0);
  const prevRetryInMsRef = useRef<number>(0);

  if (retryInMs > 0 && prevRetryInMsRef.current !== retryInMs) {
    setCountdownMs(0);
    prevRetryInMsRef.current = retryInMs;
  }

  const done = countdownMs >= retryInMs;

  const tick = useCallback(() => setCountdownMs(ms => ms + 1000), []);
  React.useEffect(() => {
    if (hidden || done) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hidden, done, tick]);

  if (hidden) return null;

  const retryInSecondsLive = Math.max(0, Math.round((retryInMs - countdownMs) / 1000));
  const formatted = formatAPIError(error);
  const truncated = !verbose && formatted.length > MAX_API_ERROR_CHARS;
  const displayText = truncated ? formatted.slice(0, MAX_API_ERROR_CHARS) + '\u2026' : formatted;
  const secLabel = retryInSecondsLive === 1 ? '秒' : '秒';
  // DOGE: 检测是否为超时错误，显示更具体的提示
  const isTimeout = error && (
    (error as any).name === 'APIConnectionTimeoutError' ||
    ((error as any).message && String((error as any).message).toLowerCase().includes('timeout'))
  )
  const timeoutHint = process.env.API_TIMEOUT_MS
    ? ` · API_TIMEOUT_MS=${process.env.API_TIMEOUT_MS}ms${isTimeout ? '（当前值可能过小）' : '，可以尝试增加'}`
    : isTimeout
      ? ' · 请求超时，将自动退避重试'
      : '';

  return (
    <MessageResponse>
      <Box flexDirection="column">
        <Text color="error">{displayText}</Text>
        {truncated && <CtrlOToExpand />}
        <Text dimColor={true}>
          {String(retryInSecondsLive)} {secLabel}后重试…（第 {String(retryAttempt)}/{String(maxRetries)} 次尝试 · Ctrl+Y 立即重试{timeoutHint}）
        </Text>
      </Box>
    </MessageResponse>
  );
}
