import { c as _c } from "react/compiler-runtime";
import React from 'react';
import { logEvent } from '../services/analytics/index.js';
import { Box, Link, Text } from '../ink.js';
import { updateSettingsForSource } from '../utils/settings/settings.js';
import { Select } from './CustomSelect/index.js';
import { Dialog } from './design-system/Dialog.js';

// NOTE: This copy is legally reviewed — do not modify without Legal team approval.
export const AUTO_MODE_DESCRIPTION = "自动模式允许 Claude 自动处理权限提示 — Claude 会在执行前检查每个工具调用是否存在风险操作和提示注入。Claude 判定为安全的操作会被执行，而判定为风险的会被阻止，Claude 可能会尝试不同的方法。适合长时间运行的任务。会话成本略高。Claude 可能会犯错导致有害命令运行，建议仅在隔离环境中使用。按 Shift+Tab 切换模式。";
type Props = {
  onAccept(): void;
  onDecline(): void;
  // Startup gate: decline exits the process, so relabel accordingly.
  declineExits?: boolean;
};
export function AutoModeOptInDialog(t0) {
  const $ = _c(18);
  const {
    onAccept,
    onDecline,
    declineExits
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
  if ($[1] !== onAccept || $[2] !== onDecline) {
    t2 = function onChange(value) {
      bb3: switch (value) {
        case "accept":
          {
            logEvent("tengu_auto_mode_opt_in_dialog_accept", {});
            updateSettingsForSource("userSettings", {
              skipAutoPermissionPrompt: true
            });
            onAccept();
            break bb3;
          }
        case "accept-default":
          {
            logEvent("tengu_auto_mode_opt_in_dialog_accept_default", {});
            updateSettingsForSource("userSettings", {
              skipAutoPermissionPrompt: true,
              permissions: {
                defaultMode: "auto"
              }
            });
            onAccept();
            break bb3;
          }
        case "decline":
          {
            logEvent("tengu_auto_mode_opt_in_dialog_decline", {});
            onDecline();
          }
      }
    };
    $[1] = onAccept;
    $[2] = onDecline;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const onChange = t2;
  let t3;
  if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = <Box flexDirection="column" gap={1}><Text>{AUTO_MODE_DESCRIPTION}</Text><Link url="https://code.claude.com/docs/en/security" /></Box>;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] === Symbol.for("react.memo_cache_sentinel")) {
    t4 = true ? [{
      label: "是的，并设为默认模式",
      value: "accept-default" as const
    }] : [];
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  let t5;
  if ($[6] === Symbol.for("react.memo_cache_sentinel")) {
    t5 = {
      label: "是的，启用自动模式",
      value: "accept" as const
    };
    $[6] = t5;
  } else {
    t5 = $[6];
  }
  const t6 = declineExits ? "不，退出" : "不，返回";
  let t7;
  if ($[7] !== t6) {
    t7 = [...t4, t5, {
      label: t6,
      value: "decline" as const
    }];
    $[7] = t6;
    $[8] = t7;
  } else {
    t7 = $[8];
  }
  let t8;
  if ($[9] !== onChange) {
    t8 = value_0 => onChange(value_0 as 'accept' | 'accept-default' | 'decline');
    $[9] = onChange;
    $[10] = t8;
  } else {
    t8 = $[10];
  }
  let t9;
  if ($[11] !== onDecline || $[12] !== t7 || $[13] !== t8) {
    t9 = <Select options={t7} onChange={t8} onCancel={onDecline} />;
    $[11] = onDecline;
    $[12] = t7;
    $[13] = t8;
    $[14] = t9;
  } else {
    t9 = $[14];
  }
  let t10;
  if ($[15] !== onDecline || $[16] !== t9) {
    t10 = <Dialog title="启用自动模式？" color="warning" onCancel={onDecline}>{t3}{t9}</Dialog>;
    $[15] = onDecline;
    $[16] = t9;
    $[17] = t10;
  } else {
    t10 = $[17];
  }
  return t10;
}
function _temp() {
  logEvent("tengu_auto_mode_opt_in_dialog_shown", {});
}
