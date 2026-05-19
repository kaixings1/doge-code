/**
 * 伙伴显示卡片 — 由 /buddy（无参数）显示。
 * 镜像官方 vc8 组件：带精灵、统计数据和最后反应的边框框。
 */
import React from 'react';
import { Box, Text } from '../ink.js';
import { useInput } from '../ink.js';
import { renderSprite } from './sprites.js';
import { RARITY_COLORS, RARITY_STARS, RARITY_NAMES_CN, SPECIES_NAMES_CN, STAT_NAMES, type Companion } from './types.js';

const CARD_WIDTH = 40;
const CARD_PADDING_X = 2;

function StatBar({ name, value }: { name: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const filled = Math.round(clamped / 10);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
  return (
    <Text>
      {name.padEnd(10)} {bar} {String(value).padStart(3)}
    </Text>
  );
}

export function CompanionCard({
  companion,
  lastReaction,
  onDone,
}: {
  companion: Companion;
  lastReaction?: string;
  onDone?: (result?: string, options?: { display?: string }) => void;
}) {
  const color = RARITY_COLORS[companion.rarity];
  const stars = RARITY_STARS[companion.rarity];
  const sprite = renderSprite(companion, 0);

  // 按任意键关闭
  useInput(
    () => {
      onDone?.(undefined, { display: 'skip' });
    },
    { isActive: onDone !== undefined },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={CARD_PADDING_X}
      paddingY={1}
      width={CARD_WIDTH}
      flexShrink={0}
    >
      {/* 头部：稀有度 + 物种 */}
      <Box justifyContent="space-between">
        <Text bold color={color}>
          {stars} {RARITY_NAMES_CN[companion.rarity]}
        </Text>
        <Text color={color}>{SPECIES_NAMES_CN[companion.species]}</Text>
      </Box>

      {/* 闪亮指示器 */}
      {companion.shiny && (
        <Text color="warning" bold>
          {'\u2728'} ✨闪亮✨ {'\u2728'}
        </Text>
      )}

      {/* 精灵 */}
      <Box flexDirection="column" marginY={1}>
        {sprite.map((line, i) => (
          <Text key={i} color={color}>
            {line}
          </Text>
        ))}
      </Box>

      {/* 名称 */}
      <Text bold>{companion.name}</Text>

      {/* 性格 */}
      <Box marginY={1}>
        <Text dimColor italic>
          &quot;{companion.personality}&quot;
        </Text>
      </Box>

      {/* 属性 */}
      <Box flexDirection="column">
        {STAT_NAMES.map(name => (
          <StatBar key={name} name={name} value={companion.stats[name] ?? 0} />
        ))}
      </Box>

      {/* 最后回应 */}
      {lastReaction && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>最后说</Text>
          <Box borderStyle="round" borderColor="inactive" paddingX={1}>
            <Text dimColor italic>
              {lastReaction}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
