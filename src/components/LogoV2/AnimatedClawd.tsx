import * as React from 'react';
import { useState } from 'react';
import { Box } from '../../ink.js';
import { getInitialSettings } from '../../utils/settings/settings.js';
import { Clawd, type ClawdPose } from './clawd.tsx';

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

const CLAWD_HEIGHT = 7; // 与 Clawd 组件图形高度一致

export function AnimatedClawd() {
  const { pose, bounceOffset, onClick } = useClawdAnimation();

  return (
    <Box marginTop={bounceOffset} flexShrink={0}>
      <Box height={CLAWD_HEIGHT} flexDirection="column" onClick={onClick}>
        <Clawd pose={pose} />
      </Box>
    </Box>
  );
}

function useClawdAnimation() {
  const [reducedMotion] = useState(() => getInitialSettings().prefersReducedMotion ?? false);
  const [currentPose] = useState<ClawdPose>('default'); // 静态显示，默认姿势

  const onClick = () => {
    // 禁用自动动画，仅保持静态显示
    // 如需点击动画效果，可在此处实现
  };

  return {
    pose: currentPose,
    bounceOffset: 0,
    onClick,
  };
}