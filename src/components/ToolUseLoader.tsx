import { c as _c } from "react/compiler-runtime";
import React from 'react';
import { BLACK_CIRCLE } from '../constants/figures.js';
import { Box, Text, useAnimationFrame } from '../ink.js';
// 盲文旋转器：执行中逐帧循环，取代原先「●↔空格」的 600ms 呼吸灯。
export const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export const BRAILLE_INTERVAL_MS = 80;
/** 由动画时间推导当前帧字符；同一时间值恒得同一帧（全局同步）。 */
export function brailleFrameAt(timeMs: number): string {
  return BRAILLE_FRAMES[Math.floor(timeMs / BRAILLE_INTERVAL_MS) % BRAILLE_FRAMES.length]!;
}
type Props = {
  isError: boolean;
  isUnresolved: boolean;
  shouldAnimate: boolean;
};
export function ToolUseLoader(t0) {
  const $ = _c(7);
  const {
    isError,
    isUnresolved,
    shouldAnimate
  } = t0;
  // 仅执行中（未结算且无错误）旋转；其余状态保持静态 ●。
  const animating = shouldAnimate && isUnresolved && !isError;
  const [ref, time] = useAnimationFrame(animating ? BRAILLE_INTERVAL_MS : null);
  const color = isUnresolved ? undefined : isError ? "error" : "success";
  const t1 = animating ? brailleFrameAt(time) : BLACK_CIRCLE;
  let t2;
  if ($[0] !== color || $[1] !== isUnresolved || $[2] !== t1) {
    t2 = <Text color={color} dimColor={isUnresolved}>{t1}</Text>;
    $[0] = color;
    $[1] = isUnresolved;
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== ref || $[5] !== t2) {
    t3 = <Box ref={ref} minWidth={2}>{t2}</Box>;
    $[4] = ref;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}
