import { c as _c } from "react/compiler-runtime";
import type { ThinkingBlock, ThinkingBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import React from 'react';
import { Box, Text, useAnimationFrame } from '../../ink.js';
import { CtrlOToExpand } from '../CtrlOToExpand.js';
import { Markdown } from '../Markdown.js';
import { BRAILLE_INTERVAL_MS, brailleFrameAt } from '../ToolUseLoader.js';
type Props = {
  // Accept either full ThinkingBlock/ThinkingBlockParam or a minimal shape with just type and thinking
  param: ThinkingBlock | ThinkingBlockParam | {
    type: 'thinking';
    thinking: string;
  };
  addMargin: boolean;
  isTranscriptMode: boolean;
  verbose: boolean;
  /** When true, hide this thinking block entirely (used for past thinking in transcript mode) */
  hideInTranscript?: boolean;
  /** When true, prefix the label with a braille spinner (live reasoning). */
  isAnimating?: boolean;
};
export function AssistantThinkingMessage(t0) {
  const $ = _c(13);
  const {
    param: t1,
    addMargin: t2,
    isTranscriptMode,
    verbose,
    hideInTranscript: t3,
    isAnimating: t4
  } = t0;
  const {
    thinking
  } = t1;
  const addMargin = t2 === undefined ? false : t2;
  const hideInTranscript = t3 === undefined ? false : t3;
  const animating = t4 === undefined ? false : t4;
  const [ref, time] = useAnimationFrame(animating ? BRAILLE_INTERVAL_MS : null);
  const spinner = animating ? brailleFrameAt(time) : "\u2234";
  if (!thinking) {
    return null;
  }
  if (hideInTranscript) {
    return null;
  }
  const shouldShowFullThinking = isTranscriptMode || verbose;
  if (!shouldShowFullThinking) {
    const t5 = addMargin ? 1 : 0;
    let t6;
    if ($[0] !== spinner) {
      t6 = <Text dimColor={true} italic={true}>{spinner} 推理思考中 <CtrlOToExpand /></Text>;
      $[0] = spinner;
      $[1] = t6;
    } else {
      t6 = $[1];
    }
    let t7;
    if ($[2] !== t5 || $[3] !== t6) {
      t7 = <Box ref={ref} marginTop={t5}>{t6}</Box>;
      $[2] = t5;
      $[3] = t6;
      $[4] = t7;
    } else {
      t7 = $[4];
    }
    return t7;
  }
  const t5 = addMargin ? 1 : 0;
  let t6;
  if ($[5] !== spinner) {
    t6 = <Text dimColor={true} italic={true}>{spinner} 推理思考中…</Text>;
    $[5] = spinner;
    $[6] = t6;
  } else {
    t6 = $[6];
  }
  let t7;
  if ($[7] !== thinking) {
    t7 = <Box paddingLeft={2}><Markdown dimColor={true}>{thinking}</Markdown></Box>;
    $[7] = thinking;
    $[8] = t7;
  } else {
    t7 = $[8];
  }
  let t8;
  if ($[9] !== t5 || $[10] !== t6 || $[11] !== t7) {
    t8 = <Box ref={ref} flexDirection="column" gap={1} marginTop={t5} width="100%">{t6}{t7}</Box>;
    $[9] = t5;
    $[10] = t6;
    $[11] = t7;
    $[12] = t8;
  } else {
    t8 = $[12];
  }
  return t8;
}
