import { c as _c } from "react/compiler-runtime";
import React from 'react';
import { Box, Text } from '../../ink.js';

type SuccessStepProps = {
  secretExists: boolean;
  useExistingSecret: boolean;
  secretName: string;
  skipWorkflow?: boolean;
};

export function SuccessStep(t0) {
  const $ = _c(21);
  const {
    secretExists,
    useExistingSecret,
    secretName,
    skipWorkflow: t1
  } = t0;
  const skipWorkflow = t1 === undefined ? false : t1;

  let t2;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = <Box flexDirection="column" marginBottom={1}>
      <Text bold={true}>安装 GitHub 应用</Text>
      <Text dimColor={true}>成功</Text>
    </Box>;
    $[0] = t2;
  } else {
    t2 = $[0];
  }

  let t3;
  if ($[1] !== skipWorkflow) {
    t3 = !skipWorkflow && <Text color="success">✓ GitHub Actions 工作流已创建！</Text>;
    $[1] = skipWorkflow;
    $[2] = t3;
  } else {
    t3 = $[2];
  }

  let t4;
  if ($[3] !== secretExists || $[4] !== useExistingSecret) {
    t4 = secretExists && useExistingSecret && <Box marginTop={1}>
      <Text color="success">✓ 正在使用已有的 DOGE_API_KEY 密钥</Text>
    </Box>;
    $[3] = secretExists;
    $[4] = useExistingSecret;
    $[5] = t4;
  } else {
    t4 = $[5];
  }

  let t5;
  if ($[6] !== secretExists || $[7] !== secretName || $[8] !== useExistingSecret) {
    t5 = (!secretExists || !useExistingSecret) && <Box marginTop={1}>
      <Text color="success">✓ API 密钥已保存为 {secretName} 密钥</Text>
    </Box>;
    $[6] = secretExists;
    $[7] = secretName;
    $[8] = useExistingSecret;
    $[9] = t5;
  } else {
    t5 = $[9];
  }

  let t6;
  if ($[10] === Symbol.for("react.memo_cache_sentinel")) {
    t6 = <Box marginTop={1}>
      <Text>后续步骤：</Text>
    </Box>;
    $[10] = t6;
  } else {
    t6 = $[10];
  }

  let t7;
  if ($[11] !== skipWorkflow) {
    t7 = skipWorkflow ? (
      <>
        <Text>1. 如果尚未安装，请安装 Claude GitHub 应用</Text>
        <Text>2. 您的工作流文件保持不变</Text>
        <Text>3. API 密钥已配置并可以使用</Text>
      </>
    ) : (
      <>
        <Text>1. 已为您创建一个预填好的 PR 页面</Text>
        <Text>2. 如果尚未安装，请安装 Claude GitHub 应用</Text>
        <Text>3. 合并 PR 以启用 Claude 的 PR 辅助功能</Text>
      </>
    );
    $[11] = skipWorkflow;
    $[12] = t7;
  } else {
    t7 = $[12];
  }

  let t8;
  if ($[13] !== t3 || $[14] !== t4 || $[15] !== t5 || $[16] !== t7) {
    t8 = <Box flexDirection="column" borderStyle="round" paddingX={1}>
      {t2}
      {t3}
      {t4}
      {t5}
      {t6}
      {t7}
    </Box>;
    $[13] = t3;
    $[14] = t4;
    $[15] = t5;
    $[16] = t7;
    $[17] = t8;
  } else {
    t8 = $[17];
  }

  let t9;
  if ($[18] === Symbol.for("react.memo_cache_sentinel")) {
    t9 = <Box marginLeft={3}>
      <Text dimColor={true}>按任意键退出</Text>
    </Box>;
    $[18] = t9;
  } else {
    t9 = $[18];
  }

  let t10;
  if ($[19] !== t8) {
    t10 = <>
      {t8}
      {t9}
    </>;
    $[19] = t8;
    $[20] = t10;
  } else {
    t10 = $[20];
  }
  return t10;
}
