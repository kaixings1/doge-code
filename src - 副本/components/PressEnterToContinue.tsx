import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { Text } from '../ink.js';
export function PressEnterToContinue() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <Text color="permission">按 <Text bold={true}>Enter</Text> 继续…</Text>;
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}
