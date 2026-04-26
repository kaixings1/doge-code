import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Box } from '../../ink.js';
import { getInitialSettings } from '../../utils/settings/settings.js';
import { Clawd, type ClawdPose } from './Clawd.js';

type Frame = {
  pose: ClawdPose;
  offset: number;
};

function hold(pose: ClawdPose, offset: number, frames: number): Frame[] {
  return Array.from({ length: frames }, () => ({ pose, offset }));
}

// 点击动画：跳跃 + 举手
const JUMP_WAVE: readonly Frame[] = [
  ...hold('default', 2, 2),
  ...hold('arms-up', 0, 3),
  ...hold('default', 0, 1),
  ...hold('default', 2, 2),
  ...hold('arms-up', 0, 3),
  ...hold('default', 0, 1),
];

// 点击动画：左右看
const LOOK_AROUND: readonly Frame[] = [
  ...hold('look-right', 0, 5),
  ...hold('look-left', 0, 5),
  ...hold('default', 0, 1),
];

const CLICK_ANIMATIONS: readonly (readonly Frame[])[] = [JUMP_WAVE, LOOK_AROUND];

// 空闲动画：自动左右看 + 偶尔举手（像打招呼）
const IDLE_LOOP: readonly Frame[] = [
  ...hold('default', 0, 30),    // 正常站立 1.8 秒
  ...hold('look-left', 0, 10),  // 向左看 0.6 秒
  ...hold('default', 0, 20),    // 恢复 1.2 秒
  ...hold('look-right', 0, 10), // 向右看 0.6 秒
  ...hold('default', 0, 20),
  ...hold('arms-up', 0, 5),     // 举一下手（打招呼）0.3 秒
  ...hold('default', 0, 25),
];

const FRAME_MS = 60;
const incrementFrame = (i: number) => i + 1;
const CLAWD_HEIGHT = 7; // 与 Clawd 组件图形高度一致

export function AnimatedClawd() {
  const $ = _c(8);
  const { pose, bounceOffset, onClick } = useClawdAnimation();

  let t0;
  if ($[0] !== pose) {
    t0 = <Clawd pose={pose} />;
    $[0] = pose;
    $[1] = t0;
  } else {
    t0 = $[1];
  }

  let t1;
  if ($[2] !== bounceOffset || $[3] !== t0) {
    t1 = <Box marginTop={bounceOffset} flexShrink={0}>{t0}</Box>;
    $[2] = bounceOffset;
    $[3] = t0;
    $[4] = t1;
  } else {
    t1 = $[4];
  }

  let t2;
  if ($[5] !== onClick || $[6] !== t1) {
    t2 = (
      <Box height={CLAWD_HEIGHT} flexDirection="column" onClick={onClick}>
        {t1}
      </Box>
    );
    $[5] = onClick;
    $[6] = t1;
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  return t2;
}

function useClawdAnimation() {
  const [reducedMotion] = useState(() => getInitialSettings().prefersReducedMotion ?? false);
  const [frameIndex, setFrameIndex] = useState(0); // 始终运行帧序列
  const sequenceRef = useRef<readonly Frame[]>(IDLE_LOOP);
  const clickLockRef = useRef(false);

  const onClick = () => {
    if (reducedMotion || clickLockRef.current) return;
    clickLockRef.current = true;
    const anim = CLICK_ANIMATIONS[Math.floor(Math.random() * CLICK_ANIMATIONS.length)]!;
    sequenceRef.current = anim;
    setFrameIndex(0);
  };

  useEffect(() => {
    if (reducedMotion) return;
    if (frameIndex >= sequenceRef.current.length) {
      // 动画结束，恢复 idle 循环
      sequenceRef.current = IDLE_LOOP;
      setFrameIndex(0);
      clickLockRef.current = false;
      return;
    }
    const timer = setTimeout(() => setFrameIndex(incrementFrame), FRAME_MS);
    return () => clearTimeout(timer);
  }, [frameIndex, reducedMotion]);

  const currentFrame = sequenceRef.current[frameIndex] ?? { pose: 'default', offset: 0 };
  return {
    pose: currentFrame.pose,
    bounceOffset: currentFrame.offset,
    onClick,
  };
}