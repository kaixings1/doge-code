import { c as _c } from "react/compiler-runtime";
import React from 'react';
import { Box, Link, Text } from '../ink.js';
import { Select } from './CustomSelect/index.js';
import { Dialog } from './design-system/Dialog.js';
type Props = {
  onDone: () => void;
};
export function CostThresholdDialog(t0) {
  const $ = _c(7);
  const {
    onDone
  } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <Box flexDirection="column"><Text>了解更多关于如何监控支出的信息：</Text><Link url="https://code.claude.com/docs/en/costs" /></Box>;
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = [{
      value: "ok",
      label: "明白了，谢谢！"
    }];
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] !== onDone) {
    t3 = <Select options={t2} onChange={onDone} />;
    $[2] = onDone;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] !== onDone || $[5] !== t3) {
    t4 = <Dialog title="本次会话已在 Anthropic API 上花费 $5。" onCancel={onDone}>{t1}{t3}</Dialog>;
    $[4] = onDone;
    $[5] = t3;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  return t4;
}
