import { c as _c } from "react/compiler-runtime";
import React, { useCallback, useEffect, useState } from 'react';
import { type OptionWithDescription, Select } from '../../components/CustomSelect/index.js';
import { Pane } from '../../components/design-system/Pane.js';
import { Spinner } from '../../components/Spinner.js';
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js';
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- enter to proceed through setup steps
import { Box, Text, useInput } from '../../ink.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import { detectPythonPackageManager, getPythonApiInstructions, installIt2, markIt2SetupComplete, type PythonPackageManager, setPreferTmuxOverIterm2, verifyIt2Setup } from './backends/it2Setup.js';
type SetupStep = 'initial' | 'installing' | 'install-failed' | 'verify-api' | 'api-instructions' | 'verifying' | 'success' | 'failed';
type Props = {
  onDone: (result: 'installed' | 'use-tmux' | 'cancelled') => void;
  tmuxAvailable: boolean;
};
export function It2SetupPrompt(t0) {
  const $ = _c(44);
  const {
    onDone,
    tmuxAvailable
  } = t0;
  const [step, setStep] = useState("initial");
  const [packageManager, setPackageManager] = useState(null);
  const [error, setError] = useState(null);
  const exitState = useExitOnCtrlCDWithKeybindings();
  let t1;
  let t2;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => {
      detectPythonPackageManager().then(pm => {
        setPackageManager(pm);
      });
    };
    t2 = [];
    $[0] = t1;
    $[1] = t2;
  } else {
    t1 = $[0];
    t2 = $[1];
  }
  useEffect(t1, t2);
  let t3;
  if ($[2] !== onDone) {
    t3 = () => {
      onDone("cancelled");
    };
    $[2] = onDone;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  const handleCancel = t3;
  const t4 = step !== "installing" && step !== "verifying";
  let t5;
  if ($[4] !== t4) {
    t5 = {
      context: "Confirmation",
      isActive: t4
    };
    $[4] = t4;
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  useKeybinding("confirm:no", handleCancel, t5);
  let t6;
  if ($[6] !== onDone || $[7] !== step) {
    t6 = (_input, key) => {
      if (step === "api-instructions" && key.return) {
        setStep("verifying");
        verifyIt2Setup().then(result => {
          if (result.success) {
            markIt2SetupComplete();
            setStep("success");
            setTimeout(onDone, 1500, "installed" as const);
          } else {
            setError(result.error || "验证失败");
            setStep("failed");
          }
        });
      }
    };
    $[6] = onDone;
    $[7] = step;
    $[8] = t6;
  } else {
    t6 = $[8];
  }
  useInput(t6);
  let t7;
  if ($[9] !== packageManager) {
    t7 = async function handleInstall() {
      if (!packageManager) {
        setError("未找到 Python 包管理器（uvx、pipx 或 pip）");
        setStep("failed");
        return;
      }
      setStep("installing");
      const result_0 = await installIt2(packageManager);
      if (result_0.success) {
        setStep("api-instructions");
      } else {
        setError(result_0.error || "安装失败");
        setStep("install-failed");
      }
    };
    $[9] = packageManager;
    $[10] = t7;
  } else {
    t7 = $[10];
  }
  const handleInstall = t7;
  let t8;
  if ($[11] !== onDone) {
    t8 = function handleUseTmux() {
      setPreferTmuxOverIterm2(true);
      onDone("use-tmux");
    };
    $[11] = onDone;
    $[12] = t8;
  } else {
    t8 = $[12];
  }
  const handleUseTmux = t8;
  let T0;
  let T1;
  let t10;
  let t11;
  let t12;
  let t13;
  let t14;
  let t9;
  if ($[13] !== error || $[14] !== handleInstall || $[15] !== handleUseTmux || $[16] !== onDone || $[17] !== packageManager || $[18] !== step || $[19] !== tmuxAvailable) {
    const renderContent = () => {
      switch (step) {
        case "initial":
          {
            return renderInitialPrompt();
          }
        case "installing":
          {
            return renderInstalling();
          }
        case "install-failed":
          {
            return renderInstallFailed();
          }
        case "api-instructions":
          {
            return renderApiInstructions();
          }
        case "verifying":
          {
            return renderVerifying();
          }
        case "success":
          {
            return renderSuccess();
          }
        case "failed":
          {
            return renderFailed();
          }
        default:
          {
            return null;
          }
      }
    };
    function renderInitialPrompt() {
      const options = [{
        label: "立即安装 it2",
        value: "install",
        description: packageManager ? `使用 ${packageManager} 安装 it2 CLI 工具` : "需要 Python（uvx、pipx 或 pip）"
      }];
      if (tmuxAvailable) {
        options.push({
          label: "使用 tmux 代替",
          value: "tmux",
          description: "在独立的 tmux 会话中打开队友"
        });
      }
      options.push({
        label: "取消",
        value: "cancel",
        description: "暂时跳过队友生成"
      });
      return <Box flexDirection="column" gap={1}><Text>要在 iTerm2 中使用原生分割面板显示队友，你需要{" "}<Text bold={true}>it2</Text> CLI 工具。</Text><Text dimColor={true}>这能让队友显示在当前窗口的分割面板中。</Text><Box marginTop={1}><Select options={options} onChange={value => {
            bb61: switch (value) {
              case "install":
                {
                  handleInstall();
                  break bb61;
                }
              case "tmux":
                {
                  handleUseTmux();
                  break bb61;
                }
              case "cancel":
                {
                  onDone("cancelled");
                }
            }
          }} onCancel={() => onDone("cancelled")} /></Box></Box>;
    }
    function renderInstalling() {
      return <Box flexDirection="column" gap={1}><Box><Spinner /><Text> 正在使用 {packageManager} 安装 it2…</Text></Box><Text dimColor={true}>这可能需要一些时间。</Text></Box>;
    }
    function renderInstallFailed() {
      const options_0 = [{
        label: "重试",
        value: "retry",
        description: "重试安装"
      }];
      if (tmuxAvailable) {
        options_0.push({
          label: "使用 tmux 代替",
          value: "tmux",
          description: "使用 tmux 作为队友面板的备选方案"
        });
      }
      options_0.push({
        label: "取消",
        value: "cancel",
        description: "暂时跳过队友生成"
      });
      return <Box flexDirection="column" gap={1}><Text color="error">安装失败</Text>{error && <Text dimColor={true}>{error}</Text>}<Text dimColor={true}>你可以尝试手动安装：{" "}{packageManager === "uvx" ? "uv tool install it2" : packageManager === "pipx" ? "pipx install it2" : "pip install --user it2"}</Text><Box marginTop={1}><Select options={options_0} onChange={value_0 => {
            bb89: switch (value_0) {
              case "retry":
                {
                  handleInstall();
                  break bb89;
                }
              case "tmux":
                {
                  handleUseTmux();
                  break bb89;
                }
              case "cancel":
                {
                  onDone("cancelled");
                }
            }
          }} onCancel={() => onDone("cancelled")} /></Box></Box>;
    }
    function renderApiInstructions() {
      const instructions = getPythonApiInstructions();
      return <Box flexDirection="column" gap={1}><Text color="success">✓ it2 安装成功</Text><Box flexDirection="column" marginTop={1}>{instructions.map(_temp)}</Box><Box marginTop={1}><Text dimColor={true}>准备好后按回车验证…</Text></Box></Box>;
    }
    function renderVerifying() {
      return <Box><Spinner /><Text> 正在验证 it2 能否与 iTerm2 通信…</Text></Box>;
    }
    function renderSuccess() {
      return <Box flexDirection="column"><Text color="success">✓ iTerm2 分割面板支持已就绪</Text><Text dimColor={true}>队友现在将显示为分割面板。</Text></Box>;
    }
    function renderFailed() {
      const options_1 = [{
        label: "重试",
        value: "retry",
        description: "再次验证连接"
      }];
      if (tmuxAvailable) {
        options_1.push({
          label: "使用 tmux 代替",
          value: "tmux",
          description: "使用 tmux 作为队友面板的备选方案"
        });
      }
      options_1.push({
        label: "取消",
        value: "cancel",
        description: "暂时跳过队友生成"
      });
      return <Box flexDirection="column" gap={1}><Text color="error">验证失败</Text>{error && <Text dimColor={true}>{error}</Text>}<Text>请确保：</Text><Box flexDirection="column" paddingLeft={2}><Text>· 已在 iTerm2 偏好设置中启用 Python API</Text><Text>· 启用后可能需要重启 iTerm2</Text></Box><Box marginTop={1}><Select options={options_1} onChange={value_1 => {
            bb115: switch (value_1) {
              case "retry":
                {
                  setStep("verifying");
                  verifyIt2Setup().then(result_1 => {
                    if (result_1.success) {
                      markIt2SetupComplete();
                      setStep("success");
                      setTimeout(onDone, 1500, "installed" as const);
                    } else {
                      setError(result_1.error || "验证失败");
                      setStep("failed");
                    }
                  });
                  break bb115;
                }
              case "tmux":
                {
                  handleUseTmux();
                  break bb115;
                }
              case "cancel":
                {
                  onDone("cancelled");
                }
            }
          }} onCancel={() => onDone("cancelled")} /></Box></Box>;
    }
    T1 = Pane;
    t14 = "permission";
    T0 = Box;
    t9 = "column";
    t10 = 1;
    t11 = 1;
    if ($[28] === Symbol.for("react.memo_cache_sentinel")) {
      t12 = <Text bold={true} color="permission">iTerm2 分割面板设置</Text>;
      $[28] = t12;
    } else {
      t12 = $[28];
    }
    t13 = renderContent();
    $[13] = error;
    $[14] = handleInstall;
    $[15] = handleUseTmux;
    $[16] = onDone;
    $[17] = packageManager;
    $[18] = step;
    $[19] = tmuxAvailable;
    $[20] = T0;
    $[21] = T1;
    $[22] = t10;
    $[23] = t11;
    $[24] = t12;
    $[25] = t13;
    $[26] = t14;
    $[27] = t9;
  } else {
    T0 = $[20];
    T1 = $[21];
    t10 = $[22];
    t11 = $[23];
    t12 = $[24];
    t13 = $[25];
    t14 = $[26];
    t9 = $[27];
  }
  let t15;
  if ($[29] !== exitState || $[30] !== step) {
    t15 = step !== "installing" && step !== "verifying" && step !== "success" && <Text dimColor={true} italic={true}>{exitState.pending ? <>再次按 {exitState.keyName} 退出</> : <>按 Esc 取消</>}</Text>;
    $[29] = exitState;
    $[30] = step;
    $[31] = t15;
  } else {
    t15 = $[31];
  }
  let t16;
  if ($[32] !== T0 || $[33] !== t10 || $[34] !== t11 || $[35] !== t12 || $[36] !== t13 || $[37] !== t15 || $[38] !== t9) {
    t16 = <T0 flexDirection={t9} gap={t10} paddingBottom={t11}>{t12}{t13}{t15}</T0>;
    $[32] = T0;
    $[33] = t10;
    $[34] = t11;
    $[35] = t12;
    $[36] = t13;
    $[37] = t15;
    $[38] = t9;
    $[39] = t16;
  } else {
    t16 = $[39];
  }
  let t17;
  if ($[40] !== T1 || $[41] !== t14 || $[42] !== t16) {
    t17 = <T1 color={t14}>{t16}</T1>;
    $[40] = T1;
    $[41] = t14;
    $[42] = t16;
    $[43] = t17;
  } else {
    t17 = $[43];
  }
  return t17;
}
function _temp(line, i) {
  return <Text key={i}>{line}</Text>;
}
