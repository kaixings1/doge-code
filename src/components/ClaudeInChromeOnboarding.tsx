import { c as _c } from "react/compiler-runtime";
import React from 'react';
import { logEvent } from '../services/analytics/index.js';
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- enter to continue
import { Box, Link, Newline, Text, useInput } from '../ink.js';
import { isChromeExtensionInstalled } from '../utils/claudeInChrome/setup.js';
import { saveGlobalConfig } from '../utils/config.js';
import { Dialog } from './design-system/Dialog.js';
const CHROME_EXTENSION_URL = 'https://claude.ai/chrome';
const CHROME_PERMISSIONS_URL = 'https://clau.de/chrome/permissions';
type Props = {
  onDone(): void;
};
export function ClaudeInChromeOnboarding(t0) {
  const $ = _c(20);
  const {
    onDone
  } = t0;
  const [isExtensionInstalled, setIsExtensionInstalled] = React.useState(false);
  let t1;
  let t2;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => {
      logEvent("tengu_claude_in_chrome_onboarding_shown", {});
      isChromeExtensionInstalled().then(setIsExtensionInstalled);
      saveGlobalConfig(_temp);
    };
    t2 = [];
    $[0] = t1;
    $[1] = t2;
  } else {
    t1 = $[0];
    t2 = $[1];
  }
  React.useEffect(t1, t2);
  let t3;
  if ($[2] !== onDone) {
    t3 = (_input, key) => {
      if (key.return) {
        onDone();
      }
    };
    $[2] = onDone;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  useInput(t3);
  let t4;
  if ($[4] !== isExtensionInstalled) {
    t4 = !isExtensionInstalled && <><Newline /><Newline />需要 Chrome 扩展。点击 <Link url={CHROME_EXTENSION_URL} />{" "}开始安装</>;
    $[4] = isExtensionInstalled;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  let t5;
  if ($[6] !== t4) {
    t5 = <Text>Claude in Chrome 与 Chrome 扩展配合使用，可让你直接从 Claude Code 控制浏览器。你可以浏览网站、填写表单、截取屏幕截图、录制 GIF，并通过控制台日志和网络请求进行调试。{t4}</Text>;
    $[6] = t4;
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  let t6;
  if ($[8] !== isExtensionInstalled) {
    t6 = isExtensionInstalled && <>{" "}(<Link url={CHROME_PERMISSIONS_URL} />)</>;
    $[8] = isExtensionInstalled;
    $[9] = t6;
  } else {
    t6 = $[9];
  }
  let t7;
  if ($[10] !== t6) {
    t7 = <Text dimColor={true}>站点级权限继承自 Chrome 扩展。在 Chrome 扩展设置中管理权限，以控制 Claude 可以浏览、点击和输入的网站{t6}。</Text>;
    $[10] = t6;
    $[11] = t7;
  } else {
    t7 = $[11];
  }
  let t8;
  if ($[12] === Symbol.for("react.memo_cache_sentinel")) {
    t8 = <Text bold={true} color="chromeYellow">/chrome</Text>;
    $[12] = t8;
  } else {
    t8 = $[12];
  }
  let t9;
  if ($[13] === Symbol.for("react.memo_cache_sentinel")) {
    t9 = <Text dimColor={true}>了解更多，请使用{" "}{t8}{" "}或访问 <Link url="https://code.claude.com/docs/zh-cn/chrome" /></Text>;
    $[13] = t9;
  } else {
    t9 = $[13];
  }
  let t10;
  if ($[14] !== t5 || $[15] !== t7) {
    t10 = <Box flexDirection="column" gap={1}>{t5}{t7}{t9}</Box>;
    $[14] = t5;
    $[15] = t7;
    $[16] = t10;
  } else {
    t10 = $[16];
  }
  let t11;
  if ($[17] !== onDone || $[18] !== t10) {
    t11 = <Dialog title="Claude in Chrome（Beta）" onCancel={onDone} color="chromeYellow">{t10}</Dialog>;
    $[17] = onDone;
    $[18] = t10;
    $[19] = t11;
  } else {
    t11 = $[19];
  }
  return t11;
}
function _temp(current) {
  return {
    ...current,
    hasCompletedClaudeInChromeOnboarding: true
  };
}
