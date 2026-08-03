import { c as _c } from "react/compiler-runtime";
import React, { useCallback } from 'react';
import { logEvent } from '../services/analytics/index.js';
import { Box, Link, Newline, Text } from '../ink.js';
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js';
import { updateSettingsForSource } from '../utils/settings/settings.js';
import { Select } from './CustomSelect/index.js';
import { Dialog } from './design-system/Dialog.js';
type Props = {
  onAccept(): void;
};
export function BypassPermissionsModeDialog(t0) {
  const $ = _c(7);
  const {
    onAccept
  } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = [];
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  React.useEffect(_temp, t1);
  let t2;
  if ($[1] !== onAccept) {
    t2 = function onChange(value) {
      bb3: switch (value) {
        case "accept":
          {
            logEvent("tengu_bypass_permissions_mode_dialog_accept", {});
            updateSettingsForSource("userSettings", {
              skipDangerousModePermissionPrompt: true
            });
            onAccept();
            break bb3;
          }
        case "decline":
          {
            gracefulShutdownSync(1);
          }
      }
    };
    $[1] = onAccept;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const onChange = t2;
  const handleEscape = _temp2;
  let t3;
  if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = <Box flexDirection="column" gap={1}><Text>在绕过权限模式下，Claude Code 不会在运行前征求您的批准，即可执行潜在危险命令。</Text><Newline /><Text>此模式仅适用于具有受限网络访问权限且易于恢复的沙盒容器或虚拟机。</Text><Newline /><Text>继续操作即表示您接受在绕过权限模式下运行时采取的所有行动的全部责任。</Text><Link url="https://code.claude.com/docs/en/security" /></Box>;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
    t4 = [{
      label: "否，退出",
      value: "decline"
    }, {
      label: "是，我接受",
      value: "accept"
    }];
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  let t5;
  if ($[5] !== onChange) {
    t5 = <Dialog title="警告：Claude Code 在跳过权限模式下运行" color="error" onCancel={handleEscape}>{t3}<Select options={t4} onChange={value_0 => onChange(value_0 as 'accept' | 'decline')} /></Dialog>;
    $[5] = onChange;
    $[6] = t5;
  } else {
    t5 = $[6];
  }
  return t5;
}
function _temp2() {
  gracefulShutdownSync(0);
}
function _temp() {
  logEvent("tengu_bypass_permissions_mode_dialog_shown", {});
}
