import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from '../../ink.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { isOpus1mMergeEnabled } from '../../utils/model/model.js';
import { AnimatedAsterisk } from './AnimatedAsterisk.js';
const MAX_SHOW_COUNT = 6;
export function shouldShowKirakiraNotice(): boolean {
  return isOpus1mMergeEnabled() && (getGlobalConfig().opus1mMergeNoticeSeenCount ?? 0) < MAX_SHOW_COUNT;
}
export function KirakiraNotice() {
  const $ = _c(4);
  const [show] = useState(shouldShowKirakiraNotice);
  let t0;
  let t1;
  if ($[0] !== show) {
    t0 = () => {
      if (!show) {
        return;
      }
      const newCount = (getGlobalConfig().opus1mMergeNoticeSeenCount ?? 0) + 1;
      saveGlobalConfig(prev => {
        if ((prev.opus1mMergeNoticeSeenCount ?? 0) >= newCount) {
          return prev;
        }
        return {
          ...prev,
          opus1mMergeNoticeSeenCount: newCount
        };
      });
    };
    t1 = [show];
    $[0] = show;
    $[1] = t0;
    $[2] = t1;
  } else {
    t0 = $[1];
    t1 = $[2];
  }
  useEffect(t0, t1);
  if (!show) {
    return null;
  }
  let t2;
  if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = <Box paddingLeft={2}><AnimatedAsterisk char="☆" /><Text dimColor={true}>{" "}KiraKiraDokiDoki!</Text></Box>;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}
