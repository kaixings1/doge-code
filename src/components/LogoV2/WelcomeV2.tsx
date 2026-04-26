import { c as _c } from "react/compiler-runtime";
import React from 'react';
import { Box, Text, useTheme } from '../../ink.js';
import { env } from '../../utils/env.js';

const WELCOME_V2_WIDTH = 58;

// 新科幻图形（每行长度 58，不足用空格补齐）
const NEW_GRAPHIC = [
  "         ◆◇     ◇◆         ",
  "       ◆█▓▓█◆ ◆█▓▓█◆       ",
  "      █▓▒▒▓▓█▓▓▒▒▓▓█      ",
  "     █▓▒░░░▒▓▓▒░░░▒▓█     ",
  "    ◆█▓▒░ ╳ ░▓▓░ ╳ ░▒▓█◆    ",
  "     █▓▒░░░▒▓▓▒░░░▒▓█     ",
  "      █▓▒▒▓▓█▓▓▒▒▓▓█      ",
  "       ◆█▓▓█◆ ◆█▓▓█◆       ",
  "         ◇◆     ◆◇         ",
  "        ENERGY  CORE        ",
  "        ═══════════         ",
  // 以下行用空格填满至58字符，保持原图形行数一致
  "                                                          ",
  "                                                          ",
  "                                                          ",
  "                                                          ",
  "                                                          ",
];

export function WelcomeV2() {
  const $ = _c(35);
  const [theme] = useTheme();

  if (env.terminal === "Apple_Terminal") {
    let t0;
    if ($[0] !== theme) {
      t0 = <AppleTerminalWelcomeV2 theme={theme} welcomeMessage="欢迎使用 Claude Code" />;
      $[0] = theme;
      $[1] = t0;
    } else {
      t0 = $[1];
    }
    return t0;
  }

  if (["light", "light-daltonized", "light-ansi"].includes(theme)) {
    let t0;
    let t1;
    let t2;
    let t3;
    let t4;
    let t5;
    let t6;
    let t7;
    let t8;
    if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
      // 以下 t0~t8 全部替换为新图形的前9行
      t0 = <Text>{NEW_GRAPHIC[0]}</Text>;
      t1 = <Text>{NEW_GRAPHIC[1]}</Text>;
      t2 = <Text>{NEW_GRAPHIC[2]}</Text>;
      t3 = <Text>{NEW_GRAPHIC[3]}</Text>;
      t4 = <Text>{NEW_GRAPHIC[4]}</Text>;
      t5 = <Text>{NEW_GRAPHIC[5]}</Text>;
      t6 = <Text>{NEW_GRAPHIC[6]}</Text>;
      t7 = <Text>{NEW_GRAPHIC[7]}</Text>;
      t8 = <Text>{NEW_GRAPHIC[8]}</Text>;
      $[2] = t0;
      $[3] = t1;
      $[4] = t2;
      $[5] = t3;
      $[6] = t4;
      $[7] = t5;
      $[8] = t6;
      $[9] = t7;
      $[10] = t8;
    } else {
      t0 = $[2];
      t1 = $[3];
      t2 = $[4];
      t3 = $[5];
      t4 = $[6];
      t5 = $[7];
      t6 = $[8];
      t7 = $[9];
      t8 = $[10];
    }
    let t9;
    if ($[11] === Symbol.for("react.memo_cache_sentinel")) {
      t9 = <Text>{NEW_GRAPHIC[9]}</Text>;
      $[11] = t9;
    } else {
      t9 = $[11];
    }
    let t10;
    let t11;
    if ($[12] === Symbol.for("react.memo_cache_sentinel")) {
      t10 = <Text>{NEW_GRAPHIC[10]}</Text>;
      t11 = <Text>{NEW_GRAPHIC[11]}</Text>;
      $[12] = t10;
      $[13] = t11;
    } else {
      t10 = $[12];
      t11 = $[13];
    }
    let t12;
    if ($[14] === Symbol.for("react.memo_cache_sentinel")) {
      t12 = <Text>{NEW_GRAPHIC[12]}</Text>;
      $[14] = t12;
    } else {
      t12 = $[14];
    }
    let t13;
    if ($[15] === Symbol.for("react.memo_cache_sentinel")) {
      t13 = <Text>{NEW_GRAPHIC[13]}</Text>;
      $[15] = t13;
    } else {
      t13 = $[15];
    }
    let t14;
    if ($[16] === Symbol.for("react.memo_cache_sentinel")) {
      t14 = <Text>{NEW_GRAPHIC[14]}</Text>;
      $[16] = t14;
    } else {
      t14 = $[16];
    }
    let t15;
    if ($[17] === Symbol.for("react.memo_cache_sentinel")) {
      t15 = <Box width={WELCOME_V2_WIDTH}>
        <Text>
          <Text color="claude">{"欢迎来到 Claude Code"} </Text>
          <Text dimColor={true}>v{MACRO.VERSION} </Text>
          {t0}{t1}{t2}{t3}{t4}{t5}{t6}{t7}{t8}{t9}{t10}{t11}{t12}{t13}{t14}
          {/* 保留原尾部装饰（不影响主要图形） */}
          <Text>{"\u2026\u2026\u2026\u2026\u2026\u2026\u2026"}</Text>
          <Text color="clawd_body">{"\u2588 \u2588   \u2588 \u2588"}</Text>
          <Text>{"\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2591\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2592\u2026\u2026\u2026\u2026"}</Text>
        </Text>
      </Box>;
      $[17] = t15;
    } else {
      t15 = $[17];
    }
    return t15;
  }

  // 深色主题分支（同样替换图形）
  let t0;
  let t1;
  let t2;
  let t3;
  let t4;
  let t5;
  let t6;
  if ($[18] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <Text>{NEW_GRAPHIC[0]}</Text>;
    t1 = <Text>{NEW_GRAPHIC[1]}</Text>;
    t2 = <Text>{NEW_GRAPHIC[2]}</Text>;
    t3 = <Text>{NEW_GRAPHIC[3]}</Text>;
    t4 = <Text>{NEW_GRAPHIC[4]}</Text>;
    t5 = <Text>{NEW_GRAPHIC[5]}</Text>;
    t6 = <Text>{NEW_GRAPHIC[6]}</Text>;
    $[18] = t0;
    $[19] = t1;
    $[20] = t2;
    $[21] = t3;
    $[22] = t4;
    $[23] = t5;
    $[24] = t6;
  } else {
    t0 = $[18];
    t1 = $[19];
    t2 = $[20];
    t3 = $[21];
    t4 = $[22];
    t5 = $[23];
    t6 = $[24];
  }
  let t10;
  let t11;
  let t7;
  let t8;
  let t9;
  if ($[25] === Symbol.for("react.memo_cache_sentinel")) {
    t7 = <Text>{NEW_GRAPHIC[7]}</Text>;
    t8 = <Text>{NEW_GRAPHIC[8]}</Text>;
    t9 = <Text>{NEW_GRAPHIC[9]}</Text>;
    t10 = <Text>{NEW_GRAPHIC[10]}</Text>;
    t11 = <Text>{NEW_GRAPHIC[11]}</Text>;
    $[25] = t10;
    $[26] = t11;
    $[27] = t7;
    $[28] = t8;
    $[29] = t9;
  } else {
    t10 = $[25];
    t11 = $[26];
    t7 = $[27];
    t8 = $[28];
    t9 = $[29];
  }
  let t12;
  if ($[30] === Symbol.for("react.memo_cache_sentinel")) {
    t12 = <Text>{NEW_GRAPHIC[12]}</Text>;
    $[30] = t12;
  } else {
    t12 = $[30];
  }
  let t13;
  if ($[31] === Symbol.for("react.memo_cache_sentinel")) {
    t13 = <Text>{NEW_GRAPHIC[13]}</Text>;
    $[31] = t13;
  } else {
    t13 = $[31];
  }
  let t14;
  if ($[32] === Symbol.for("react.memo_cache_sentinel")) {
    t14 = <Text>{NEW_GRAPHIC[14]}</Text>;
    $[32] = t14;
  } else {
    t14 = $[32];
  }
  let t15;
  if ($[33] === Symbol.for("react.memo_cache_sentinel")) {
    t15 = <Text>{NEW_GRAPHIC[15]}</Text>;
    $[33] = t15;
  } else {
    t15 = $[33];
  }
  let t16;
  if ($[34] === Symbol.for("react.memo_cache_sentinel")) {
    t16 = <Box width={WELCOME_V2_WIDTH}>
      <Text>
        <Text color="claude">{"欢迎来到 Claude Code"} </Text>
        <Text dimColor={true}>v{MACRO.VERSION} </Text>
        {t0}{t1}{t2}{t3}{t4}{t5}{t6}{t7}{t8}{t9}{t10}{t11}{t12}{t13}{t14}{t15}
        <Text>{"\u2026\u2026\u2026\u2026\u2026\u2026\u2026"}</Text>
        <Text color="clawd_body">{"\u2588 \u2588   \u2588 \u2588"}</Text>
        <Text>{"\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026"}</Text>
      </Text>
    </Box>;
    $[34] = t16;
  } else {
    t16 = $[34];
  }
  return t16;
}

// AppleTerminalWelcomeV2 组件（同样替换图形）
type AppleTerminalWelcomeV2Props = {
  theme: string;
  welcomeMessage: string;
};

function AppleTerminalWelcomeV2(t0: AppleTerminalWelcomeV2Props) {
  const $ = _c(44);
  const { theme, welcomeMessage } = t0;
  const isLightTheme = ["light", "light-daltonized", "light-ansi"].includes(theme);

  // 复用相同的图形行
  let t1;
  let t2;
  let t3;
  let t4;
  let t5;
  let t6;
  let t7;
  let t8;
  let t9;
  let t10;
  let t11;
  let t12;
  let t13;
  let t14;
  let t15;
  let t16;
  let t17;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <Text>{NEW_GRAPHIC[0]}</Text>;
    t2 = <Text>{NEW_GRAPHIC[1]}</Text>;
    t3 = <Text>{NEW_GRAPHIC[2]}</Text>;
    t4 = <Text>{NEW_GRAPHIC[3]}</Text>;
    t5 = <Text>{NEW_GRAPHIC[4]}</Text>;
    t6 = <Text>{NEW_GRAPHIC[5]}</Text>;
    t7 = <Text>{NEW_GRAPHIC[6]}</Text>;
    t8 = <Text>{NEW_GRAPHIC[7]}</Text>;
    t9 = <Text>{NEW_GRAPHIC[8]}</Text>;
    t10 = <Text>{NEW_GRAPHIC[9]}</Text>;
    t11 = <Text>{NEW_GRAPHIC[10]}</Text>;
    t12 = <Text>{NEW_GRAPHIC[11]}</Text>;
    t13 = <Text>{NEW_GRAPHIC[12]}</Text>;
    t14 = <Text>{NEW_GRAPHIC[13]}</Text>;
    t15 = <Text>{NEW_GRAPHIC[14]}</Text>;
    t16 = <Text>{NEW_GRAPHIC[15]}</Text>;
    t17 = <Text>{"                                                          "}</Text>;
    $[0] = t1;
    $[1] = t2;
    $[2] = t3;
    $[3] = t4;
    $[4] = t5;
    $[5] = t6;
    $[6] = t7;
    $[7] = t8;
    $[8] = t9;
    $[9] = t10;
    $[10] = t11;
    $[11] = t12;
    $[12] = t13;
    $[13] = t14;
    $[14] = t15;
    $[15] = t16;
    $[16] = t17;
  } else {
    t1 = $[0];
    t2 = $[1];
    t3 = $[2];
    t4 = $[3];
    t5 = $[4];
    t6 = $[5];
    t7 = $[6];
    t8 = $[7];
    t9 = $[8];
    t10 = $[9];
    t11 = $[10];
    t12 = $[11];
    t13 = $[12];
    t14 = $[13];
    t15 = $[14];
    t16 = $[15];
    t17 = $[16];
  }

  let t18;
  if ($[17] === Symbol.for("react.memo_cache_sentinel")) {
    t18 = (
      <Box width={WELCOME_V2_WIDTH}>
        <Text>
          <Text color="claude">{welcomeMessage} </Text>
          <Text dimColor={true}>v{MACRO.VERSION} </Text>
          {t1}{t2}{t3}{t4}{t5}{t6}{t7}{t8}{t9}{t10}{t11}{t12}{t13}{t14}{t15}{t16}{t17}
          <Text>{"\u2026\u2026\u2026\u2026\u2026\u2026\u2026"}</Text>
          <Text backgroundColor="clawd_body"> </Text>
          <Text> </Text>
          <Text backgroundColor="clawd_body"> </Text>
          <Text>{"   "}</Text>
          <Text backgroundColor="clawd_body"> </Text>
          <Text> </Text>
          <Text backgroundColor="clawd_body"> </Text>
          <Text>{"\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2591\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2592\u2026\u2026\u2026\u2026"}</Text>
        </Text>
      </Box>
    );
    $[17] = t18;
  } else {
    t18 = $[17];
  }
  return t18;
}