import { execa } from 'execa';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Select } from '../../components/CustomSelect/index.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { LoadingState } from '../../components/design-system/LoadingState.js';
import { Box, Text } from '../../ink.js';
import { logEvent, type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS as SafeString } from '../../services/analytics/index.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { openBrowser } from '../../utils/browser.js';
import { getGhAuthStatus } from '../../utils/github/ghAuthStatus.js';
import { createDefaultEnvironment, getCodeWebUrl, type ImportTokenError, importGithubToken, isSignedIn, RedactedGithubToken } from './api.js';
type CheckResult = {
  status: 'not_signed_in';
} | {
  status: 'has_gh_token';
  token: RedactedGithubToken;
} | {
  status: 'gh_not_installed';
} | {
  status: 'gh_not_authenticated';
};
async function checkLoginState(): Promise<CheckResult> {
  if (!(await isSignedIn())) {
    return {
      status: 'not_signed_in'
    };
  }
  const ghStatus = await getGhAuthStatus();
  if (ghStatus === 'not_installed') {
    return {
      status: 'gh_not_installed'
    };
  }
  if (ghStatus === 'not_authenticated') {
    return {
      status: 'gh_not_authenticated'
    };
  }

  // ghStatus === 'authenticated'. getGhAuthStatus spawns with stdout:'ignore'
  // (telemetry-safe); spawn once more with stdout:'pipe' to read the token.
  const {
    stdout
  } = await execa('gh', ['auth', 'token'], {
    stdout: 'pipe',
    stderr: 'ignore',
    timeout: 5000,
    reject: false
  });
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {
      status: 'gh_not_authenticated'
    };
  }
  return {
    status: 'has_gh_token',
    token: new RedactedGithubToken(trimmed)
  };
}
function errorMessage(err: ImportTokenError, codeUrl: string): string {
  switch (err.kind) {
    case 'not_signed_in':
      return `登录失败。请访问 ${codeUrl} 并使用 GitHub App 登录`;
    case 'invalid_token':
      return 'GitHub 拒绝了该令牌。运行 `gh auth login` 后重试。';
    case 'server':
      return `服务器错误 (${err.status})。请稍后重试。`;
    case 'network':
      return '无法连接到服务器。请检查您的网络连接。';
  }
}
type Step = {
  name: 'checking';
} | {
  name: 'confirm';
  token: RedactedGithubToken;
} | {
  name: 'uploading';
};
function Web({
  onDone
}: {
  onDone: LocalJSXCommandOnDone;
}) {
  const [step, setStep] = useState<Step>({
    name: 'checking'
  });
  useEffect(() => {
    logEvent('tengu_remote_setup_started', {});
    void checkLoginState().then(async result => {
      switch (result.status) {
        case 'not_signed_in':
          logEvent('tengu_remote_setup_result', {
            result: 'not_signed_in' as SafeString
          });
          onDone('未登录 Claude。请先运行 /login。');
          return;
        case 'gh_not_installed':
        case 'gh_not_authenticated':
          {
            const url = `${getCodeWebUrl()}/onboarding?step=alt-auth`;
            await openBrowser(url);
            logEvent('tengu_remote_setup_result', {
              result: result.status as SafeString
            });
            onDone(result.status === 'gh_not_installed' ? `未找到 GitHub CLI。请通过 https://cli.github.com/ 安装，然后运行 \`gh auth login\`，或在网页上连接 GitHub: ${url}` : `未认证 GitHub CLI。运行 \`gh auth login\` 后重试，或在网页上连接 GitHub: ${url}`);
            return;
          }
        case 'has_gh_token':
          setStep({
            name: 'confirm',
            token: result.token
          });
      }
    });
    // onDone is stable across renders; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleCancel = () => {
    logEvent('tengu_remote_setup_result', {
      result: 'cancelled' as SafeString
    });
    onDone();
  };
  const handleConfirm = async (token: RedactedGithubToken) => {
    setStep({
      name: 'uploading'
    });
    const result = await importGithubToken(token);
    if (!result.ok) {
      logEvent('tengu_remote_setup_result', {
        result: 'import_failed' as SafeString,
        error_kind: result.error.kind as SafeString
      });
      onDone(errorMessage(result.error, getCodeWebUrl()));
      return;
    }

    // Token import succeeded. Environment creation is best-effort — if it
    // fails, the web state machine routes to env-setup on landing, which is
    // one extra click but still better than the OAuth dance.
    await createDefaultEnvironment();
    const url = getCodeWebUrl();
    await openBrowser(url);
    logEvent('tengu_remote_setup_result', {
      result: 'success' as SafeString
    });
    onDone(`已连接为 ${result.result.github_username}。已打开 ${url}`);
  };
  if (step.name === 'checking') {
    return <LoadingState message="正在检查登录状态…" />;
  }
  if (step.name === 'uploading') {
    return <LoadingState message="正在将 GitHub 连接到 Claude…" />;
  }
  const token = step.token;
  return <Dialog title="将网页版 Claude 连接到 GitHub？" onCancel={handleCancel} hideInputGuide>
      <Box flexDirection="column">
        <Text>
          网页版 Claude 需要连接到您的 GitHub 账户以代表您克隆和推送代码。
        </Text>
        <Text dimColor>
          您的本地凭证将用于向 GitHub 进行身份验证
        </Text>
      </Box>
      <Select options={[{
      label: '继续',
      value: 'send'
    }, {
      label: '取消',
      value: 'cancel'
    }]} onChange={value => {
      if (value === 'send') {
        void handleConfirm(token);
      } else {
        handleCancel();
      }
    }} onCancel={handleCancel} />
    </Dialog>;
}
export async function call(onDone: LocalJSXCommandOnDone): Promise<React.ReactNode> {
  return <Web onDone={onDone} />;
}
