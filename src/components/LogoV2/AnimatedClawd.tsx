import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Box } from '../../ink.js';
import { getInitialSettings } from '../../utils/settings/settings.js';
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';
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
  ...hold('blink', 0, 5),
  ...hold('sleep', 0, 5),
  ...hold('default', 0, 1),
];

const CLICK_ANIMATIONS: readonly (readonly Frame[])[] = [JUMP_WAVE, LOOK_AROUND];

// 空闲动画：自动左右看 + 偶尔举手（像打招呼）
const IDLE_LOOP: readonly Frame[] = [
  ...hold('default', 0, 30),    // 正常站立 1.8 秒
  ...hold('blink', 0, 10),      // 眨眼 0.6 秒
  ...hold('default', 0, 20),    // 恢复 1.2 秒
  ...hold('heart', 0, 10),      // 爱心眼 0.6 秒
  ...hold('default', 0, 20),
  ...hold('arms-up', 0, 5),     // 举一下手（打招呼）0.3 秒
  ...hold('default', 0, 25),
];

const FRAME_MS = 60;
// ponytail: 固定高度已移除——Clawd 实际高度约 19 行（含 sessionId），
// 固定 7 行会导致底部被裁剪且 bounceOffset 的 marginTop 在容器内无效

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
    t1 = <Box flexShrink={0}>{t0}</Box>;
    $[2] = bounceOffset;
    $[3] = t0;
    $[4] = t1;
  } else {
    t1 = $[4];
  }

  let t2;
  if ($[5] !== onClick || $[6] !== t1) {
    t2 = (
      <Box flexDirection="column" onClick={onClick}>
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
  const [frameIndex, setFrameIndex] = useState(0);
  const sequenceRef = useRef<readonly Frame[]>(IDLE_LOOP);
  const clickLockRef = useRef(false);
  const startRef = useRef(0);

  const onClick = () => {
    if (reducedMotion || clickLockRef.current) return;
    clickLockRef.current = true;
    const anim = CLICK_ANIMATIONS[Math.floor(Math.random() * CLICK_ANIMATIONS.length)]!;
    sequenceRef.current = anim;
    startRef.current = performance.now();
    setFrameIndex(0);
  };

  // ponytail: 单一节流循环（setInterval），不再用「每帧重挂 setTimeout + effect
  // 依赖 frameIndex」的链式写法。链式写法每 60ms 重建一次 effect 并触发一次
  // React 提交，叠加 Logo 在 OffscreenFreeze/scrollback 中的全量重置，导致
  // LOGO 区域实际刷新被拖到数十秒级。
  // 非全屏（scrollback）模式下 Logo 一旦滚出视口就不会再被绘制，动画只是纯开销，
  // 因此直接不启动 —— CondensedLogo 在该模式下渲染的本来也是静态 <Clawd>。
  useEffect(() => {
    if (reducedMotion || !isFullscreenEnvEnabled()) return;
    // 帧号由经过时间推导（定时器漂移自愈），积压的 tick 不会累积成快进。
    startRef.current = performance.now();
    const timer = setInterval(() => {
      const seq = sequenceRef.current;
      const elapsed = performance.now() - startRef.current;
      const idx = Math.floor(elapsed / FRAME_MS);
      if (idx >= seq.length) {
        const finishedClick = seq !== IDLE_LOOP;
        sequenceRef.current = IDLE_LOOP;
        startRef.current = performance.now();
        if (finishedClick) clickLockRef.current = false;
        setFrameIndex(0);
        return;
      }
      setFrameIndex(idx);
    }, FRAME_MS);
    return () => clearInterval(timer);
    // 仅在 reducedMotion 变化时重启；帧推进由 interval 内部完成
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const currentFrame = sequenceRef.current[frameIndex] ?? { pose: 'default', offset: 0 };
  return {
    pose: currentFrame.pose,
    bounceOffset: currentFrame.offset,
    onClick,
  };
}
