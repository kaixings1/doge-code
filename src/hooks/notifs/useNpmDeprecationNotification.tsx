import { isInBundledMode } from '../../utils/bundledMode.js';
import { getCliCommandName } from '../../utils/cliCommandName.js';
import { getCurrentInstallationType } from '../../utils/doctorDiagnostic.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { useStartupNotification } from './useStartupNotification.js';
const NPM_DEPRECATION_MESSAGE = 'Claude Code 已从 npm 切换到原生安装程序。运行 `claude install` 或查看 https://docs.anthropic.com/en/docs/claude-code/getting-started 了解更多选项。';
export function useNpmDeprecationNotification() {
  useStartupNotification(_temp);
}
async function _temp() {
  if (isInBundledMode() || isEnvTruthy(process.env.DISABLE_INSTALLATION_CHECKS)) {
    return null;
  }
  if (getCliCommandName() !== 'claude') {
    return null;
  }
  const installationType = await getCurrentInstallationType();
  if (installationType === "development") {
    return null;
  }
  return {
    timeoutMs: 15000,
    key: "npm-deprecation-warning",
    text: NPM_DEPRECATION_MESSAGE,
    color: "warning",
    priority: "high"
  };
}
