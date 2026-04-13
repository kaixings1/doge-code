import { c as _c } from "react/compiler-runtime";
import { feature } from 'bun:bundle';
import * as React from 'react';
import { Box, Text } from '../../ink.js';
import { getPlatform } from '../../utils/platform.js';
import { isKeybindingCustomizationEnabled } from '../../keybindings/loadUserBindings.js';
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js';
import { isFastModeAvailable, isFastModeEnabled } from '../../utils/fastMode.js';
import { getNewlineInstructions } from './utils.js';

/** Format a shortcut for display in the help menu (e.g., "Ctrl+o" → "Ctrl + o") */
function formatShortcut(shortcut: string): string {
  return shortcut.replace(/\+/g, ' + ');
}
type Props = {
  dimColor?: boolean;
  fixedWidth?: boolean;
  gap?: number;
  paddingX?: number;
};
export function PromptInputHelpMenu(props) {
  const $ = _c(99);
  const {
    dimColor,
    fixedWidth,
    gap,
    paddingX
  } = props;
  const t0 = useShortcutDisplay("app:toggleTranscript", "Global", "Ctrl+o");
  let t1;
  if ($[0] !== t0) {
    t1 = formatShortcut(t0);
    $[0] = t0;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const transcriptShortcut = t1;
  const t2 = useShortcutDisplay("app:toggleTodos", "Global", "Ctrl+t");
  let t3;
  if ($[2] !== t2) {
    t3 = formatShortcut(t2);
    $[2] = t2;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  const todosShortcut = t3;
  const t4 = useShortcutDisplay("chat:undo", "Chat", "Ctrl+_");
  let t5;
  if ($[4] !== t4) {
    t5 = formatShortcut(t4);
    $[4] = t4;
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  const undoShortcut = t5;
  const t6 = useShortcutDisplay("chat:stash", "Chat", "Ctrl+s");
  let t7;
  if ($[6] !== t6) {
    t7 = formatShortcut(t6);
    $[6] = t6;
    $[7] = t7;
  } else {
    t7 = $[7];
  }
  const stashShortcut = t7;
  const t8 = useShortcutDisplay("chat:cycleMode", "Chat", "Shift+Tab");
  let t9;
  if ($[8] !== t8) {
    t9 = formatShortcut(t8);
    $[8] = t8;
    $[9] = t9;
  } else {
    t9 = $[9];
  }
  const cycleModeShortcut = t9;
  const t10 = useShortcutDisplay("chat:modelPicker", "Chat", "Alt+p");
  let t11;
  if ($[10] !== t10) {
    t11 = formatShortcut(t10);
    $[10] = t10;
    $[11] = t11;
  } else {
    t11 = $[11];
  }
  const modelPickerShortcut = t11;
  const t12 = useShortcutDisplay("chat:fastMode", "Chat", "Alt+o");
  let t13;
  if ($[12] !== t12) {
    t13 = formatShortcut(t12);
    $[12] = t12;
    $[13] = t13;
  } else {
    t13 = $[13];
  }
  const fastModeShortcut = t13;
  const t14 = useShortcutDisplay("chat:externalEditor", "Chat", "Ctrl+g");
  let t15;
  if ($[14] !== t14) {
    t15 = formatShortcut(t14);
    $[14] = t14;
    $[15] = t15;
  } else {
    t15 = $[15];
  }
  const externalEditorShortcut = t15;
  const t16 = useShortcutDisplay("app:toggleTerminal", "Global", "meta+j");
  let t17;
  if ($[16] !== t16) {
    t17 = formatShortcut(t16);
    $[16] = t16;
    $[17] = t17;
  } else {
    t17 = $[17];
  }
  const terminalShortcut = t17;
  const t18 = useShortcutDisplay("chat:imagePaste", "Chat", "Ctrl+v");
  let t19;
  if ($[18] !== t18) {
    t19 = formatShortcut(t18);
    $[18] = t18;
    $[19] = t19;
  } else {
    t19 = $[19];
  }
  const imagePasteShortcut = t19;
  let t20;
  if ($[20] !== dimColor || $[21] !== terminalShortcut) {
    t20 = feature("TERMINAL_PANEL") ? getFeatureValue_CACHED_MAY_BE_STALE("tengu_terminal_panel", false) ? <Box><Text dimColor={dimColor}>{terminalShortcut} 打开终端</Text></Box> : null : null;
    $[20] = dimColor;
    $[21] = terminalShortcut;
    $[22] = t20;
  } else {
    t20 = $[22];
  }
  const terminalShortcutElement = t20;
  const t21 = fixedWidth ? 24 : undefined;
  let t22;
  if ($[23] !== dimColor) {
    t22 = <Box><Text dimColor={dimColor}>! 命令行模式</Text></Box>;
    $[23] = dimColor;
    $[24] = t22;
  } else {
    t22 = $[24];
  }
  let t23;
  if ($[25] !== dimColor) {
    t23 = <Box><Text dimColor={dimColor}>/ 命令菜单</Text></Box>;
    $[25] = dimColor;
    $[26] = t23;
  } else {
    t23 = $[26];
  }
  let t24;
  if ($[27] !== dimColor) {
    t24 = <Box><Text dimColor={dimColor}>@ 文件路径</Text></Box>;
    $[27] = dimColor;
    $[28] = t24;
  } else {
    t24 = $[28];
  }
  let t25;
  if ($[29] !== dimColor) {
    t25 = <Box><Text dimColor={dimColor}>Esc Esc 清空输入</Text></Box>;
    $[29] = dimColor;
    $[30] = t25;
  } else {
    t25 = $[30];
  }
  let t26;
  if ($[31] !== dimColor) {
    t26 = <Box><Text dimColor={dimColor}>/btw 附加问题</Text></Box>;
    $[31] = dimColor;
    $[32] = t26;
  } else {
    t26 = $[32];
  }
  let t27;
  if ($[33] !== t21 || $[34] !== t22 || $[35] !== t23 || $[36] !== t24 || $[37] !== t25 || $[38] !== t26) {
    t27 = <Box flexDirection="column" width={t21}>{t22}{t23}{t24}{t25}{t26}</Box>;
    $[33] = t21;
    $[34] = t22;
    $[35] = t23;
    $[36] = t24;
    $[37] = t25;
    $[38] = t26;
    $[39] = t27;
  } else {
    t27 = $[39];
  }
  const t28 = fixedWidth ? 35 : undefined;
  let t29;
  if ($[40] !== dimColor) {
    t29 = <Box><Text dimColor={dimColor}>Tab 切换审批模式</Text></Box>;
    $[40] = dimColor;
    $[41] = t29;
  } else {
    t29 = $[41];
  }
  let t30;
  if ($[42] !== dimColor) {
    t30 = <Box><Text dimColor={dimColor}>Ctrl+c 退出</Text></Box>;
    $[42] = dimColor;
    $[43] = t30;
  } else {
    t30 = $[44];
  }
  let t31;
  if ($[45] !== dimColor) {
    t31 = <Box><Text dimColor={dimColor}>Ctrl+enter 换行 ⏎</Text></Box>;
    $[45] = dimColor;
    $[46] = t31;
  } else {
    t31 = $[47];
  }
  let t32;
  if ($[48] !== dimColor) {
    t32 = <Box><Text dimColor={dimColor}>Ctrl+l 清屏</Text></Box>;
    $[48] = dimColor;
    $[49] = t32;
  } else {
    t32 = $[50];
  }
  let t33;
  if ($[51] === Symbol.for("react.memo_cache_sentinel")) {
    t33 = getNewlineInstructions();
    $[51] = t33;
  } else {
    t33 = $[51];
  }
  let t34;
  if ($[52] !== dimColor) {
    t34 = <Box><Text dimColor={dimColor}>{t33}</Text></Box>;
    $[52] = dimColor;
    $[53] = t34;
  } else {
    t34 = $[53];
  }
  let t35;
  if ($[54] !== t28 || $[55] !== t29 || $[56] !== t30 || $[57] !== t31 || $[58] !== t32 || $[59] !== t34 || $[60] !== terminalShortcutElement) {
    t35 = <Box flexDirection="column" width={t28}>{t29}{t30}{t31}{t32}{terminalShortcutElement}{t34}</Box>;
    $[54] = t28;
    $[55] = t29;
    $[56] = t30;
    $[57] = t31;
    $[58] = t32;
    $[59] = t34;
    $[60] = terminalShortcutElement;
    $[61] = t35;
  } else {
    t35 = $[61];
  }
  let t36;
  if ($[62] !== dimColor) {
    t36 = <Box><Text dimColor={dimColor}>Ctrl+r 搜索历史</Text></Box>;
    $[62] = dimColor;
    $[63] = t36;
  } else {
    t36 = $[64];
  }
  let t37;
  if ($[65] !== dimColor) {
    t37 = <Box><Text dimColor={dimColor}>Ctrl+y 重试上一次请求</Text></Box>;
    $[65] = dimColor;
    $[66] = t37;
  } else {
    t37 = $[66];
  }
  let t38;
  if ($[67] !== dimColor) {
    t38 = <Box><Text dimColor={dimColor}>Alt+v 粘贴图片</Text></Box>;
    $[67] = dimColor;
    $[68] = t38;
  } else {
    t38 = $[69];
  }
  let t39;
  if ($[70] !== dimColor) {
    t39 = <Box><Text dimColor={dimColor}>Ctrl+x 外部编辑器</Text></Box>;
    $[70] = dimColor;
    $[71] = t39;
  } else {
    t39 = $[72];
  }
  let t40;
  if ($[73] !== dimColor) {
    t40 = <Box><Text dimColor={dimColor}>切换模型</Text></Box>;
    $[73] = dimColor;
    $[74] = t40;
  } else {
    t40 = $[75];
  }
  let t41;
  if ($[76] !== dimColor) {
    t41 = <Box><Text dimColor={dimColor}>暂存提示词</Text></Box>;
    $[76] = dimColor;
    $[77] = t41;
  } else {
    t41 = $[78];
  }
  let t42;
  if ($[79] !== dimColor) {
    t42 = <Box><Text dimColor={dimColor}>详细输出</Text></Box>;
    $[79] = dimColor;
    $[80] = t42;
  } else {
    t42 = $[81];
  }
  let t43;
  if ($[82] !== dimColor) {
    t43 = <Box><Text dimColor={dimColor}>切换任务</Text></Box>;
    $[82] = dimColor;
    $[83] = t43;
  } else {
    t43 = $[84];
  }
  let t44;
  if ($[85] !== t36 || $[86] !== t37 || $[87] !== t38 || $[88] !== t39 || $[89] !== t40 || $[90] !== t41 || $[91] !== t42 || $[92] !== t43) {
    t44 = <Box flexDirection="column">{t36}{t37}{t38}{t39}{t40}{t41}{t42}{t43}</Box>;
    $[85] = t36;
    $[86] = t37;
    $[87] = t38;
    $[88] = t39;
    $[89] = t40;
    $[90] = t41;
    $[91] = t42;
    $[92] = t43;
    $[93] = t44;
  } else {
    t44 = $[93];
  }
  let t45;
  if ($[93] !== gap || $[94] !== paddingX || $[95] !== t27 || $[96] !== t35 || $[97] !== t44) {
    t45 = <Box paddingX={paddingX} flexDirection="row" gap={gap}>{t27}{t35}{t44}</Box>;
    $[93] = gap;
    $[94] = paddingX;
    $[95] = t27;
    $[96] = t35;
    $[97] = t44;
    $[98] = t45;
  } else {
    t45 = $[98];
  }
  return t45;
}
