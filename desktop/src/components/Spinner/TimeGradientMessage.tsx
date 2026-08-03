import * as React from 'react';
import { stringWidth } from '../../ink/stringWidth.js';
import { Text } from '../../ink.js';
import { getGraphemeSegmenter } from '../../utils/intl.js';
import type { Theme } from '../../utils/theme.js';

type Props = {
  message: string;
  messageColor: keyof Theme;
  elapsedTimeMs: number;
  glimmerIndex: number;
};

// 彩虹跑马灯颜色序列（7色）
const RAINBOW_COLORS: Array<keyof Theme> = [
  'rainbow_red',
  'rainbow_orange',
  'rainbow_yellow',
  'rainbow_green',
  'rainbow_blue',
  'rainbow_indigo',
  'rainbow_violet',
];

// 高亮 shimmer 颜色序列
const RAINBOW_SHIMMER: Array<keyof Theme> = [
  'rainbow_red_shimmer',
  'rainbow_orange_shimmer',
  'rainbow_yellow_shimmer',
  'rainbow_green_shimmer',
  'rainbow_blue_shimmer',
  'rainbow_indigo_shimmer',
  'rainbow_violet_shimmer',
];

// 阶段阈值（毫秒）
const RAINBOW_START = 5000;      // 5秒后开始彩虹
const RAINBOW_END = 240000;      // 4分钟后结束

/**
 * 获取当前位置的彩虹颜色（带呼吸效果：推到头后反方向回来）
 * @param charIndex 字符索引
 * @param timeOffset 时间偏移量
 * @param shimmer 是否使用高亮颜色
 */
function getBreathingRainbowColor(
  charIndex: number,
  timeOffset: number,
  shimmer: boolean = false,
): keyof Theme {
  const colors = shimmer ? RAINBOW_SHIMMER : RAINBOW_COLORS;
  const colorCount = colors.length;
  
  // 呼吸效果：先正向再反向
  // 周期长度 = 2 * (colorCount - 1)
  const cycleLength = 2 * (colorCount - 1);
  const position = (charIndex + timeOffset) % cycleLength;
  
  // 如果 position < colorCount，正向；否则反向
  const colorIndex = position < colorCount 
    ? position 
    : cycleLength - position;
  
  return colors[colorIndex]!;
}

/**
 * 时间渐变消息组件
 * 
 * 三个阶段：
 * 1. 0-5秒：白色/默认色（正常等待）
 * 2. 5秒-4分钟：彩虹跑马灯（每个字一个颜色，呼吸效果）
 * 3. 超过4分钟或消息结束：白色
 */
export function TimeGradientMessage({
  message,
  messageColor,
  elapsedTimeMs,
  glimmerIndex,
}: Props): React.ReactNode {
  // 调试输出
  //console.log('[TimeGradientMessage] elapsedTimeMs:', elapsedTimeMs, 'message:', message);
  
  // 阶段 1 & 3：白色/默认颜色（0-5秒 或 超过4分钟）
  if (elapsedTimeMs < RAINBOW_START || elapsedTimeMs >= RAINBOW_END) {
    //console.log('[TimeGradientMessage] 使用默认颜色');
    return <Text color={messageColor}>{message}</Text>;
  }

  // 阶段 2：彩虹跑马灯（5秒-4分钟）
  //console.log('[TimeGradientMessage] 使用彩虹跑马灯');
  // 计算时间偏移量（每200ms移动一格）
  const timeOffset = Math.floor(elapsedTimeMs / 200);
  
  // 跑马灯高亮区域
  const shimmerStart = glimmerIndex - 2;
  const shimmerEnd = glimmerIndex + 2;

  // 解析消息为 grapheme clusters
  const graphemes = [...getGraphemeSegmenter().segment(message)].map(s => ({
    segment: s.segment,
    width: stringWidth(s.segment)
  }));

  // 渲染每个 grapheme
  const elements: React.ReactNode[] = [];
  let colPos = 0;
  let keyIndex = 0;

  for (const { segment, width } of graphemes) {
    // 判断当前 grapheme 是否在高亮区域
    const isShimmer = colPos >= shimmerStart && colPos <= shimmerEnd;
    const color = getBreathingRainbowColor(colPos, timeOffset, isShimmer);
    
    elements.push(
      <Text key={keyIndex++} color={color}>{segment}</Text>
    );
    
    colPos += width;
  }

  return <>{elements}</>;
}
