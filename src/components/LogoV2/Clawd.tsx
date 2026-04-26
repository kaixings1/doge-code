import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { Box, Text } from '../../ink.js';
import { env } from '../../utils/env.js';

export type ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right';

type Props = {
  pose?: ClawdPose;
};

// 科幻机器人图形（7行 x 21列）
const GRAPHICS: Record<ClawdPose, string[]> = {
  default: [
    "        ▄▄▄▄▄        ",
    "      ▄█▀▀▀▀▀█▄      ",
    "     ██◉     ◉██     ",
    "     █  ▄▄▄▄▄  █     ",
    "     █  ███   ██     ",
    "      ▀█▄   ▄█▀      ",
    "        ▀▀▀▀▀        ",
  ],
  'look-left': [
    "        ▄▄▄▄▄        ",
    "      ▄█▀▀▀▀▀█▄      ",
    "     ██◀      ◉██     ",
    "     █  ▄▄▄▄▄  █     ",
    "     █  ███   ██     ",
    "      ▀█▄   ▄█▀      ",
    "        ▀▀▀▀▀        ",
  ],
  'look-right': [
    "        ▄▄▄▄▄        ",
    "      ▄█▀▀▀▀▀█▄      ",
    "     ██◉      ▶██     ",
    "     █  ▄▄▄▄▄  █     ",
    "     █  ███   ██     ",
    "      ▀█▄   ▄█▀      ",
    "        ▀▀▀▀▀        ",
  ],
  'arms-up': [
    "        ▄▄▄▄▄        ",
    "      ▄█▲▲▲▲▲█▄      ",
    "     ██◉     ◉██     ",
    "     █  ▄▄▄▄▄  █     ",
    "     █  ███   ██     ",
    "      ▀█▄   ▄█▀      ",
    "        ▀▀▀▀▀        ",
  ],
};

// 渐变颜色（粉红 → 淡蓝）
const START = { r: 255, g: 105, b: 180 };
const END   = { r: 135, g: 206, b: 235 };

function lerp(start: typeof START, end: typeof END, t: number): string {
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function renderLine(line: string, rowIdx: number, totalRows: number): React.ReactNode {
  const chars = line.split('');
  const width = chars.length;
  const nodes: React.ReactNode[] = [];
  for (let col = 0; col < width; col++) {
    const ch = chars[col];
    if (ch === ' ') {
      nodes.push(' ');
      continue;
    }
    const t = (rowIdx / (totalRows - 1) + col / (width - 1)) / 2;
    const color = lerp(START, END, t);
    nodes.push(<Text key={col} color={color}>{ch}</Text>);
  }
  return nodes;
}

export function Clawd(props: Props) {
  const $ = _c(12);
  const pose = props.pose ?? 'default';

  if (env.terminal === "Apple_Terminal") {
    let appleNode;
    if ($[0] !== pose) {
      const lines = GRAPHICS[pose].map((line, i) => (
        <Text key={i} color="clawd_body">{line}</Text>
      ));
      appleNode = (
        <Box flexDirection="column" alignItems="center">
          {lines}
        </Box>
      );
      $[0] = pose;
      $[1] = appleNode;
    } else {
      appleNode = $[1];
    }
    return appleNode;
  }

  let graphicNode;
  if ($[2] !== pose) {
    const rows = GRAPHICS[pose].map((line, idx) => (
      <Text key={idx}>{renderLine(line, idx, GRAPHICS[pose].length)}</Text>
    ));
    graphicNode = (
      <Box flexDirection="column" alignItems="center">
        {rows}
      </Box>
    );
    $[2] = pose;
    $[3] = graphicNode;
  } else {
    graphicNode = $[3];
  }
  return graphicNode;
}

// Apple Terminal 专用组件（保持兼容）
function AppleTerminalClawd({ pose }: { pose: ClawdPose }) {
  const $ = _c(2);
  let node;
  if ($[0] !== pose) {
    const lines = GRAPHICS[pose].map((line, i) => (
      <Text key={i} color="clawd_body">{line}</Text>
    ));
    node = (
      <Box flexDirection="column" alignItems="center">
        {lines}
      </Box>
    );
    $[0] = pose;
    $[1] = node;
  } else {
    node = $[1];
  }
  return node;
}