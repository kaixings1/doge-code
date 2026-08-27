import { c as _c } from "react/compiler-runtime";
import figures from '../../vendor/figures.js';
import * as React from 'react';
import { useContext } from 'react';
import { useQueuedMessage } from '../../context/QueuedMessageContext.js';
import { Ansi, Box, Text, useTheme } from '../../ink.js';
import { beautifyInlineText } from '../../utils/inlineBeautify.js';
import { formatBriefTimestamp } from '../../utils/formatBriefTimestamp.js';
import { findThinkingTriggerPositions, getRainbowColor, isUltrathinkEnabled } from '../../utils/thinking.js';
import { MessageActionsSelectedContext } from '../messageActions.js';
type Props = {
  text: string;
  useBriefLayout?: boolean;
  timestamp?: string;
};
export function HighlightedThinkingText(t0) {
  const $ = _c(31);
  const {
    text,
    useBriefLayout,
    timestamp
  } = t0;
  const isQueued = useQueuedMessage()?.isQueued ?? false;
  const isSelected = useContext(MessageActionsSelectedContext);
  const pointerColor = isSelected ? "suggestion" : "subtle";
  // 用户聊天内容美化：中文"词语："标绿、确认/询问词标琥珀色
  const [theme] = useTheme();
  if (useBriefLayout) {
    let t1;
    if ($[0] !== timestamp) {
      t1 = timestamp ? formatBriefTimestamp(timestamp) : "";
      $[0] = timestamp;
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    const ts = t1;
    const t2 = isQueued ? "subtle" : "briefLabelYou";
    let t3;
    if ($[2] !== t2) {
      t3 = <Text color={t2}>你</Text>;
      $[2] = t2;
      $[3] = t3;
    } else {
      t3 = $[3];
    }
    let t4;
    if ($[4] !== ts) {
      t4 = ts ? <Text dimColor={true}> {ts}</Text> : null;
      $[4] = ts;
      $[5] = t4;
    } else {
      t4 = $[5];
    }
    let t5;
    if ($[6] !== t3 || $[7] !== t4) {
      t5 = <Box flexDirection="row">{t3}{t4}</Box>;
      $[6] = t3;
      $[7] = t4;
      $[8] = t5;
    } else {
      t5 = $[8];
    }
    const t6 = isQueued ? "subtle" : "text";
    let t7;
    if ($[9] !== t6 || $[10] !== text) {
      t7 = <Ansi>{beautifyInlineText(text, theme)}</Ansi>;
      $[9] = t6;
      $[10] = text;
      $[11] = t7;
    } else {
      t7 = $[11];
    }
    let t8;
    if ($[12] !== t5 || $[13] !== t7) {
      t8 = <Box flexDirection="column" paddingLeft={2}>{t5}{t7}</Box>;
      $[12] = t5;
      $[13] = t7;
      $[14] = t8;
    } else {
      t8 = $[14];
    }
    return t8;
  }
  let parts;
  let t1;
  if ($[15] !== pointerColor || $[16] !== text) {
    t1 = Symbol.for("react.early_return_sentinel");
    bb0: {
      const triggers = isUltrathinkEnabled() ? findThinkingTriggerPositions(text) : [];
      if (triggers.length === 0) {
        let t2;
        if ($[19] !== pointerColor) {
          t2 = <Text color={pointerColor}>{figures.pointer} </Text>;
          $[19] = pointerColor;
          $[20] = t2;
        } else {
          t2 = $[20];
        }
        let t3;
        if ($[21] !== text) {
          t3 = <Ansi>{beautifyInlineText(text, theme)}</Ansi>;
          $[21] = text;
          $[22] = t3;
        } else {
          t3 = $[22];
        }
        let t4;
        if ($[23] !== t2 || $[24] !== t3) {
          t4 = <Box flexDirection="row">{t2}{t3}</Box>;
          $[23] = t2;
          $[24] = t3;
          $[25] = t4;
        } else {
          t4 = $[25];
        }
        t1 = t4;
        break bb0;
      }
      parts = [];
      let cursor = 0;
      for (const t of triggers) {
        if (t.start > cursor) {
          parts.push(<Box key={`plain-${cursor}`} flexDirection="row"><Ansi>{beautifyInlineText(text.slice(cursor, t.start), theme)}</Ansi></Box>);
        }
        for (let i = t.start; i < t.end; i++) {
          parts.push(<Text key={`rb-${i}`} color={getRainbowColor(i - t.start)}>{text[i]}</Text>);
        }
        cursor = t.end;
      }
      if (cursor < text.length) {
        parts.push(<Box key={`plain-${cursor}`} flexDirection="row"><Ansi>{beautifyInlineText(text.slice(cursor), theme)}</Ansi></Box>);
      }
    }
    $[15] = pointerColor;
    $[16] = text;
    $[17] = parts;
    $[18] = t1;
  } else {
    parts = $[17];
    t1 = $[18];
  }
  if (t1 !== Symbol.for("react.early_return_sentinel")) {
    return t1;
  }
  let t2;
  if ($[26] !== pointerColor) {
    t2 = <Text color={pointerColor}>{figures.pointer} </Text>;
    $[26] = pointerColor;
    $[27] = t2;
  } else {
    t2 = $[27];
  }
  let t3;
  if ($[28] !== parts || $[29] !== t2) {
    t3 = <Box flexDirection="row">{t2}{parts}</Box>;
    $[28] = parts;
    $[29] = t2;
    $[30] = t3;
  } else {
    t3 = $[30];
  }
  return t3;
}
