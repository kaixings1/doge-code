import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { useEffect } from 'react';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { usePackageUpdateNotice } from '../../hooks/usePackageUpdateNotice.js';
import { Box, Text } from '../../ink.js';
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';
import { formatPackageUpdateNotice } from '../../utils/packageUpdateNotice.js';
import { OffscreenFreeze } from '../OffscreenFreeze.js';
import { AnimatedClawd } from './AnimatedClawd.js';
import { Clawd } from './Clawd.js';
import { StatusInfoPanel } from './StatusInfoPanel.js';
import { GuestPassesUpsell, incrementGuestPassesSeenCount, useShowGuestPassesUpsell } from './GuestPassesUpsell.js';
import { incrementOverageCreditUpsellSeenCount, OverageCreditUpsell, useShowOverageCreditUpsell } from './OverageCreditUpsell.js';

export function CondensedLogo() {
  const $ = _c(20);
  const {
    columns
  } = useTerminalSize();
  const packageUpdateInfo = usePackageUpdateNotice();
  const showGuestPassesUpsell = useShowGuestPassesUpsell();
  const showOverageCreditUpsell = useShowOverageCreditUpsell();

  let t0;
  let t1;
  if ($[0] !== showGuestPassesUpsell) {
    t0 = () => {
      if (showGuestPassesUpsell) {
        incrementGuestPassesSeenCount();
      }
    };
    t1 = [showGuestPassesUpsell];
    $[0] = showGuestPassesUpsell;
    $[1] = t0;
    $[2] = t1;
  } else {
    t0 = $[1];
    t1 = $[2];
  }
  useEffect(t0, t1);
  let t2;
  let t3;
  if ($[3] !== showGuestPassesUpsell || $[4] !== showOverageCreditUpsell) {
    t2 = () => {
      if (showOverageCreditUpsell && !showGuestPassesUpsell) {
        incrementOverageCreditUpsellSeenCount();
      }
    };
    t3 = [showOverageCreditUpsell, showGuestPassesUpsell];
    $[3] = showGuestPassesUpsell;
    $[4] = showOverageCreditUpsell;
    $[5] = t2;
    $[6] = t3;
  } else {
    t2 = $[5];
    t3 = $[6];
  }
  useEffect(t2, t3);
  const textWidth = Math.max(columns - 15, 20);
  const packageUpdateNotice = packageUpdateInfo ? formatPackageUpdateNotice(packageUpdateInfo, textWidth) : null;

  let t4;
  if ($[7] === Symbol.for("react.memo_cache_sentinel")) {
    t4 = isFullscreenEnvEnabled() ? <AnimatedClawd /> : <Clawd />;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t10;
  if ($[8] !== showGuestPassesUpsell) {
    t10 = showGuestPassesUpsell && <GuestPassesUpsell />;
    $[8] = showGuestPassesUpsell;
    $[9] = t10;
  } else {
    t10 = $[9];
  }
  let t11;
  if ($[10] !== showGuestPassesUpsell || $[11] !== showOverageCreditUpsell || $[12] !== textWidth) {
    t11 = !showGuestPassesUpsell && showOverageCreditUpsell && <OverageCreditUpsell maxWidth={textWidth} twoLine={true} />;
    $[10] = showGuestPassesUpsell;
    $[11] = showOverageCreditUpsell;
    $[12] = textWidth;
    $[13] = t11;
  } else {
    t11 = $[13];
  }
  let t12;
  if ($[14] !== packageUpdateNotice || $[15] !== t10 || $[16] !== t11 || $[17] !== textWidth) {
    t12 = <OffscreenFreeze><Box flexDirection="row" gap={2} alignItems="flex-start">{t4}<Box flexDirection="column" marginTop={2}><StatusInfoPanel maxWidth={textWidth} />{packageUpdateNotice && <Text color="warning">{packageUpdateNotice}</Text>}{t10}{t11}</Box></Box></OffscreenFreeze>;
    $[14] = packageUpdateNotice;
    $[15] = t10;
    $[16] = t11;
    $[17] = textWidth;
    $[18] = t12;
  } else {
    t12 = $[18];
  }
  return t12;
}
