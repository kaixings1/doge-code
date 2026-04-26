import { getTokenPreview } from '../../utils/lastTokenText.js';

import { c as _c } from "react/compiler-runtime";
import figures from 'figures';
import * as React from 'react';
import { useMemo, useRef } from 'react';
import { stringWidth } from '../../ink/stringWidth.js';
import { Box, Text, useAnimationFrame } from '../../ink.js';
import type { InProcessTeammateTaskState } from '../../tasks/InProcessTeammateTask/types.js';
import { formatDuration, formatNumber } from '../../utils/format.js';
import { toInkColor } from '../../utils/ink.js';
import type { Theme } from '../../utils/theme.js';
import { Byline } from '../design-system/Byline.js';
import { GlimmerMessage } from './GlimmerMessage.js';
import { TimeGradientMessage } from './TimeGradientMessage.js';
import { SpinnerGlyph } from './SpinnerGlyph.js';
import type { SpinnerMode } from './types.js';
import { useStalledAnimation } from './useStalledAnimation.js';
import { interpolateColor, toRGBColor } from './utils.js';

const SEP_WIDTH = stringWidth(' · ');
const THINKING_BARE_WIDTH = stringWidth('思考...');
const SHOW_TOKENS_AFTER_MS = 30_000;

// 思考微光常量
const THINKING_INACTIVE = { r: 153, g: 153, b: 153 };
const THINKING_INACTIVE_SHIMMER = { r: 185, g: 185, b: 185 };
const THINKING_DELAY_MS = 3000;
const THINKING_GLOW_PERIOD_S = 2;

export type SpinnerAnimationRowProps = {
  mode: SpinnerMode;
  reducedMotion: boolean;
  hasActiveTools: boolean;
  responseLengthRef: React.RefObject<number>;
  message: string;
  messageColor: keyof Theme;
  shimmerColor: keyof Theme;
  overrideColor?: keyof Theme | null;
  loadingStartTimeRef: React.RefObject<number>;
  totalPausedMsRef: React.RefObject<number>;
  pauseStartTimeRef: React.RefObject<number | null>;
  spinnerSuffix?: string | null;
  verbose: boolean;
  columns: number;
  hasRunningTeammates: boolean;
  teammateTokens: number;
  foregroundedTeammate: InProcessTeammateTaskState | undefined;
  leaderIsIdle?: boolean;
  thinkingStatus: 'thinking' | number | null;
  effortSuffix: string;
  useTimeGradient?: boolean;
  
  lastTokenTextRef?: React.RefObject<string>; // 新增：最新 token 文本
};

export function SpinnerAnimationRow({
  mode,
  reducedMotion,
  hasActiveTools,
  responseLengthRef,
  message,
  messageColor,
  shimmerColor,
  overrideColor,
  loadingStartTimeRef,
  totalPausedMsRef,
  pauseStartTimeRef,
  spinnerSuffix,
  verbose,
  columns,
  hasRunningTeammates,
  teammateTokens,
  foregroundedTeammate,
  leaderIsIdle = false,
  thinkingStatus,
  effortSuffix,
  useTimeGradient = false,
  lastTokenTextRef,
}: SpinnerAnimationRowProps): React.ReactNode {
  const [viewportRef, time] = useAnimationFrame(reducedMotion ? null : 50);

  // === 已耗时（挂钟时间） ===
  const now = Date.now();
  const elapsedTimeMs =
    pauseStartTimeRef.current !== null
      ? pauseStartTimeRef.current -
        loadingStartTimeRef.current -
        totalPausedMsRef.current
      : now - loadingStartTimeRef.current - totalPausedMsRef.current;

  const derivedStart = now - elapsedTimeMs;
  const turnStartRef = useRef(derivedStart);
  if (!hasRunningTeammates || derivedStart < turnStartRef.current) {
    turnStartRef.current = derivedStart;
  }

  // === 动画派生值 ===
  const currentResponseLength = responseLengthRef.current;
  const { isStalled, stalledIntensity } = useStalledAnimation(
    time,
    currentResponseLength,
    hasActiveTools || leaderIsIdle,
    reducedMotion,
  );
  const frame = reducedMotion ? 0 : Math.floor(time / 120);
  const glimmerSpeed = mode === 'requesting' ? 50 : 200;
  const glimmerMessageWidth = useMemo(() => stringWidth(message), [message]);
  const cycleLength = glimmerMessageWidth + 20;
  const cyclePosition = Math.floor(time / glimmerSpeed);
  const glimmerIndex = reducedMotion
    ? -100
    : isStalled
      ? -100
      : mode === 'requesting'
        ? (cyclePosition % cycleLength) - 10
        : glimmerMessageWidth + 10 - (cyclePosition % cycleLength);
  const flashOpacity = reducedMotion
    ? 0
    : mode === 'tool-use'
      ? (Math.sin((time / 1000) * Math.PI) + 1) / 2
      : 0;

  // === 令牌计数器动画 ===
  const tokenCounterRef = useRef(currentResponseLength);
  if (!reducedMotion) {
    const gap = currentResponseLength - tokenCounterRef.current;
    if (gap > 0) {
      let increment: number;
      if (gap < 70) increment = 3;
      else if (gap < 200) increment = Math.max(8, Math.ceil(gap * 0.15));
      else increment = 50;
      tokenCounterRef.current = Math.min(
        tokenCounterRef.current + increment,
        currentResponseLength,
      );
    }
  } else {
    tokenCounterRef.current = currentResponseLength;
  }

  const displayedResponseLength = tokenCounterRef.current;
  const leaderTokens = Math.round(displayedResponseLength / 4);
  const effectiveElapsedMs = hasRunningTeammates
    ? Math.max(elapsedTimeMs, now - turnStartRef.current)
    : elapsedTimeMs;
  const timerText = formatDuration(effectiveElapsedMs);
  const timerWidth = stringWidth(timerText);

  // === 计算总令牌数（必须先于闪烁检测） ===
  const totalTokens =
    foregroundedTeammate && !foregroundedTeammate.isIdle
      ? foregroundedTeammate.progress?.tokenCount ?? 0
      : leaderTokens + teammateTokens;
  const tokenCount = formatNumber(totalTokens);
  const tokensText = hasRunningTeammates
    ? `${tokenCount} 个 token`
    : `${figures.arrowDown} ${tokenCount} 个 token`;
  const tokensWidth = stringWidth(tokensText);

  // === Token 变化闪烁检测 ===
  const lastTokenRef = useRef(totalTokens);
  const tokenFlashStartRef = useRef<number | null>(null);
  const TOKEN_FLASH_DURATION_MS = 3000;
  const FLASH_FREQUENCY = 2;

  if (totalTokens !== lastTokenRef.current) {
    tokenFlashStartRef.current = time;
    lastTokenRef.current = totalTokens;
  }

  let tokenFlashIntensity = 0;
  if (tokenFlashStartRef.current !== null) {
    const flashElapsed = time - tokenFlashStartRef.current;
    if (flashElapsed < TOKEN_FLASH_DURATION_MS) {
      const pulse =
        (Math.sin(flashElapsed * FLASH_FREQUENCY * Math.PI * 2) + 1) / 2;
      tokenFlashIntensity = 0.3 + pulse * 0.7;
    } else {
      tokenFlashStartRef.current = null;
    }
  }

  const tokenFlashColor =
    tokenFlashIntensity > 0
      ? toRGBColor(
          interpolateColor(
            { r: 153, g: 153, b: 153 },
            { r: 255, g: 200, b: 100 },
            tokenFlashIntensity,
          ),
        )
      : undefined;

  // === 思考文本 ===
  let thinkingText: string | null = null;
  if (thinkingStatus === 'thinking') {
    thinkingText = `思考中${effortSuffix}`;
  } else if (typeof thinkingStatus === 'number') {
    thinkingText = `思考了 ${Math.max(1, Math.round(thinkingStatus / 1000))}秒`;
  }
  let thinkingWidthValue = thinkingText ? stringWidth(thinkingText) : 0;

  // === 宽度门控 ===
  const messageWidth = glimmerMessageWidth + 2;
  const sep = SEP_WIDTH;
  const wantsThinking = thinkingStatus !== null;
  const wantsTimerAndTokens =
    verbose || hasRunningTeammates || effectiveElapsedMs > SHOW_TOKENS_AFTER_MS;
  const availableSpace = columns - messageWidth - 5;

  let showThinking = wantsThinking && availableSpace > thinkingWidthValue;
  if (
    !showThinking &&
    wantsThinking &&
    thinkingStatus === 'thinking' &&
    effortSuffix
  ) {
    if (availableSpace > THINKING_BARE_WIDTH) {
      thinkingText = '思考中';
      thinkingWidthValue = THINKING_BARE_WIDTH;
      showThinking = true;
    }
  }

  const usedAfterThinking = showThinking ? thinkingWidthValue + sep : 0;
  const showTimer =
    wantsTimerAndTokens && availableSpace > usedAfterThinking + timerWidth;
  const usedAfterTimer =
    usedAfterThinking + (showTimer ? timerWidth + sep : 0);
  const showTokens =
    wantsTimerAndTokens &&
    totalTokens > 0 &&
    availableSpace > usedAfterTimer + tokensWidth;
  const thinkingOnly =
    showThinking &&
    thinkingStatus === 'thinking' &&
    !spinnerSuffix &&
    !showTimer &&
    !showTokens;

  // === 思考微光颜色 ===
  const thinkingElapsedSec = (time - THINKING_DELAY_MS) / 1000;
  const thinkingOpacity =
    time < THINKING_DELAY_MS
      ? 0
      : (Math.sin((thinkingElapsedSec * Math.PI * 2) / THINKING_GLOW_PERIOD_S) +
          1) /
        2;
  const thinkingShimmerColor = toRGBColor(
    interpolateColor(
      THINKING_INACTIVE,
      THINKING_INACTIVE_SHIMMER,
      thinkingOpacity,
    ),
  );

  // 获取最新 token 文本
  //const rawTokenText = getLastTokenText();
  //const lastTokenPreview = rawTokenText.slice(-30); // 截取最后 30 个字符

	// 获取最多 20 字符的最新 token 预览
	const tokenPreview = getTokenPreview();

	// 为文本预览添加变化闪烁（可选）
	const lastPreviewRef = useRef(tokenPreview);
	const previewFlashStartRef = useRef<number | null>(null);
	if (tokenPreview !== lastPreviewRef.current) {
	  previewFlashStartRef.current = time;
	  lastPreviewRef.current = tokenPreview;
	}
	let previewFlashIntensity = 0;
	if (previewFlashStartRef.current !== null) {
	  const flashElapsed = time - previewFlashStartRef.current;
	  if (flashElapsed < 3000) {
		const pulse = (Math.sin(flashElapsed * 2 * Math.PI * 2) + 1) / 2;
		previewFlashIntensity = 0.3 + pulse * 0.7;
	  } else {
		previewFlashStartRef.current = null;
	  }
	}
	const previewFlashColor = previewFlashIntensity > 0
	  ? toRGBColor(interpolateColor(
		  { r: 153, g: 153, b: 153 },
		  { r: 100, g: 200, b: 255 }, // 淡蓝色闪烁
		  previewFlashIntensity
		))
	  : undefined;

	// 修改 tokenDisplay
	const tokenDisplay = (
	  <Box flexDirection="row" key="tokens">
		{!hasRunningTeammates && <SpinnerModeGlyph mode={mode} />}
		<Text dimColor={tokenFlashIntensity === 0} color={tokenFlashColor}>
		  {tokenCount} 个 token
		</Text>
		{tokenPreview && (
		  <Text dimColor={previewFlashIntensity === 0} color={previewFlashColor}>
			{" "}“{tokenPreview}”
		  </Text>
		)}
	  </Box>
	);

  const parts = [
    ...(spinnerSuffix
      ? [
          <Text dimColor key="suffix">
            {spinnerSuffix}
          </Text>,
        ]
      : []),
    ...(showTimer
      ? [
          <Text dimColor key="elapsedTime">
            {timerText}
          </Text>,
        ]
      : []),
    ...(showTokens ? [tokenDisplay] : []),
    ...(showThinking && thinkingText
      ? [
          thinkingStatus === 'thinking' && !reducedMotion ? (
            <Text key="thinking" color={thinkingShimmerColor}>
              {thinkingOnly ? `(${thinkingText})` : thinkingText}
            </Text>
          ) : (
            <Text dimColor key="thinking">
              {thinkingText}
            </Text>
          ),
        ]
      : []),
  ];

  const status =
    foregroundedTeammate && !foregroundedTeammate.isIdle ? (
      <>
        <Text dimColor>（按 Esc 中断 </Text>
        <Text color={toInkColor(foregroundedTeammate.identity.color)}>
          {foregroundedTeammate.identity.agentName}
        </Text>
        <Text dimColor>）</Text>
      </>
    ) : !foregroundedTeammate && parts.length > 0 ? (
      thinkingOnly ? (
        <Byline>{parts}</Byline>
      ) : (
        <>
          <Text dimColor>（</Text>
          <Byline>{parts}</Byline>
          <Text dimColor>）</Text>
        </>
      )
    ) : null;

  return (
    <Box
      ref={viewportRef}
      flexDirection="row"
      flexWrap="wrap"
      marginTop={1}
      width="100%"
    >
      <SpinnerGlyph
        frame={frame}
        messageColor={messageColor}
        stalledIntensity={overrideColor ? 0 : stalledIntensity}
        reducedMotion={reducedMotion}
        time={time}
      />
      {useTimeGradient ? (
        <TimeGradientMessage
          message={message}
          messageColor={messageColor}
          elapsedTimeMs={effectiveElapsedMs}
          glimmerIndex={glimmerIndex}
        />
      ) : (
        <GlimmerMessage
          message={message}
          mode={mode}
          messageColor={messageColor}
          glimmerIndex={glimmerIndex}
          flashOpacity={flashOpacity}
          shimmerColor={shimmerColor}
          stalledIntensity={overrideColor ? 0 : stalledIntensity}
        />
      )}
      {status}
    </Box>
  );
}

function SpinnerModeGlyph({ mode }: { mode: SpinnerMode }) {
  const $ = _c(2);
  switch (mode) {
    case 'tool-input':
    case 'tool-use':
    case 'responding':
    case 'thinking': {
      let t1;
      if ($[0] === Symbol.for('react.memo_cache_sentinel')) {
        t1 = (
          <Box width={2}>
            <Text dimColor={true}>{figures.arrowDown}</Text>
          </Box>
        );
        $[0] = t1;
      } else {
        t1 = $[0];
      }
      return t1;
    }
    case 'requesting': {
      let t1;
      if ($[1] === Symbol.for('react.memo_cache_sentinel')) {
        t1 = (
          <Box width={2}>
            <Text dimColor={true}>{figures.arrowUp}</Text>
          </Box>
        );
        $[1] = t1;
      } else {
        t1 = $[1];
      }
      return t1;
    }
  }
}