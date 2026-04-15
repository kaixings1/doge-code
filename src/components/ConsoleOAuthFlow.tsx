import { c as _c } from "react/compiler-runtime";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../services/analytics/index.js';
import { installOAuthTokens } from '../cli/handlers/auth.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { setClipboard } from '../ink/termio/osc.js';
import { useTerminalNotification } from '../ink/useTerminalNotification.js';
import { Box, Link, Text } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { getSSLErrorHint } from '../services/api/errorUtils.js';
import { sendNotification } from '../services/notifier.js';
import { OAuthService } from '../services/oauth/index.js';
import { getOauthAccountInfo, validateForceLoginOrg } from '../utils/auth.js';
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js';
import { normalizeApiKeyForConfig } from '../utils/authPortable.js';
import { readCustomApiStorage, writeCustomApiStorage } from '../utils/customApiStorage.js';
import { logError } from '../utils/log.js';
import { getSettings_DEPRECATED } from '../utils/settings/settings.js';
import { Select } from './CustomSelect/select.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import { Spinner } from './Spinner.js';
import TextInput from './TextInput.js';
type Props = {
  onDone(): void;
  startingMessage?: string;
  mode?: 'login' | 'setup-token';
  forceLoginMethod?: 'claudeai' | 'console';
};
type CompatibleApiProvider = 'anthropic' | 'openai';
type OAuthStatus = {
  state: 'idle';
} // Initial state, waiting to select login method
| {
  state: 'provider_select';
} // Select compatible API protocol/provider
| {
  state: 'custom_config';
  provider: CompatibleApiProvider;
  step: 'baseURL' | 'apiKey' | 'model';
} // Collect custom compatible API endpoint config
| {
  state: 'platform_setup';
} // Show platform setup info (Bedrock/Vertex/Foundry)
| {
  state: 'ready_to_start';
} // Flow started, waiting for browser to open
| {
  state: 'waiting_for_login';
  url: string;
} // Browser opened, waiting for user to login
| {
  state: 'creating_api_key';
} // Got access token, creating API key
| {
  state: 'about_to_retry';
  nextState: OAuthStatus;
} | {
  state: 'success';
  token?: string;
} | {
  state: 'error';
  message: string;
  toRetry?: OAuthStatus;
};
const PASTE_HERE_MSG = 'Paste code here if prompted > ';
export function ConsoleOAuthFlow({
  onDone,
  startingMessage,
  mode = 'login',
  forceLoginMethod: forceLoginMethodProp
}: Props): React.ReactNode {
  const settings = getSettings_DEPRECATED() || {};
  const forceLoginMethod = forceLoginMethodProp ?? settings.forceLoginMethod;
  const orgUUID = settings.forceLoginOrgUUID;
  const forcedMethodMessage = forceLoginMethod === 'claudeai' ? 'Login method pre-selected: Subscription Plan (Claude Pro/Max)' : forceLoginMethod === 'console' ? 'Login method pre-selected: API Usage Billing (Anthropic Console)' : null;
  const persistedCustomApiEndpoint = useMemo(() => ({
    ...(getGlobalConfig().customApiEndpoint ?? {}),
    ...readCustomApiStorage()
  }), []);
  const persistedProvider = persistedCustomApiEndpoint.provider;  // 不使用默认值，要求用户明确配置
  const terminal = useTerminalNotification();
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>(() => {
    if (mode === 'setup-token') {
      return {
        state: 'ready_to_start'
      };
    }
    if (forceLoginMethod === 'claudeai' || forceLoginMethod === 'console') {
      return {
        state: 'ready_to_start'
      };
    }
    return {
      state: 'provider_select'
    };
  });
  const safeOauthStatus = oauthStatus ?? {
    state: 'provider_select' as const
  };
  const [compatibleApiProvider, setCompatibleApiProvider] = useState<CompatibleApiProvider>(
    persistedProvider ?? 'openai'  // 初始值，仅在用户未配置时使用，但在 OAuth 流程中会要求用户明确选择
  );
  const [pastedCode, setPastedCode] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const [customBaseURL, setCustomBaseURL] = useState(persistedCustomApiEndpoint.baseURL ?? process.env.ANTHROPIC_BASE_URL ?? '');
  const [customApiKey, setCustomApiKey] = useState(persistedCustomApiEndpoint.apiKey ?? process.env.DOGE_API_KEY ?? '');
  const [customModel, setCustomModel] = useState(persistedCustomApiEndpoint.model ?? process.env.ANTHROPIC_MODEL ?? '');
  const [oauthService] = useState(() => new OAuthService());
  const [loginWithClaudeAi, setLoginWithClaudeAi] = useState(() => {
    // Use Claude AI auth for setup-token mode to support user:inference scope
    return mode === 'setup-token' || forceLoginMethod === 'claudeai';
  });
  // After a few seconds we suggest the user to copy/paste url if the
  // browser did not open automatically. In this flow we expect the user to
  // copy the code from the browser and paste it in the terminal
  const [showPastePrompt, setShowPastePrompt] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [isCustomInputPasting, setIsCustomInputPasting] = useState(false);
  const textInputColumns = useTerminalSize().columns - PASTE_HERE_MSG.length - 1;

  const startCompatibleApiConfig = useCallback((provider: CompatibleApiProvider) => {
    setCompatibleApiProvider(provider);
    setOAuthStatus({
      state: 'custom_config',
      provider,
      step: 'baseURL'
    });
  }, []);

  // Log forced login method on mount
  useEffect(() => {
    if (forceLoginMethod === 'claudeai') {
      logEvent('tengu_oauth_claudeai_forced', {});
    } else if (forceLoginMethod === 'console') {
      logEvent('tengu_oauth_console_forced', {});
    }
  }, [forceLoginMethod]);

  // Retry logic
  useEffect(() => {
    if (safeOauthStatus.state === 'about_to_retry') {
      const timer = setTimeout(setOAuthStatus, 1000, safeOauthStatus.nextState);
      return () => clearTimeout(timer);
    }
  }, [safeOauthStatus]);

  // Handle Enter to continue on success state
  useKeybinding('confirm:yes', () => {
    logEvent('tengu_oauth_success', {
      loginWithClaudeAi
    });
    onDone();
  }, {
    context: 'Confirmation',
    isActive: safeOauthStatus.state === 'success' && mode !== 'setup-token'
  });

  // Handle Enter to continue from platform setup
  useKeybinding('confirm:yes', () => {
    setOAuthStatus({
      state: 'idle'
    });
  }, {
    context: 'Confirmation',
    isActive: safeOauthStatus.state === 'platform_setup'
  });

  // Handle Enter to retry on error state
  useKeybinding('confirm:yes', () => {
    if (safeOauthStatus.state === 'error' && safeOauthStatus.toRetry) {
      setPastedCode('');
      setOAuthStatus({
        state: 'about_to_retry',
        nextState: safeOauthStatus.toRetry
      });
    }
  }, {
    context: 'Confirmation',
    isActive: safeOauthStatus.state === 'error' && !!safeOauthStatus.toRetry
  });
  useEffect(() => {
    if (pastedCode === 'c' && safeOauthStatus.state === 'waiting_for_login' && showPastePrompt && !urlCopied) {
      void setClipboard(safeOauthStatus.url).then(raw => {
        if (raw) process.stdout.write(raw);
        setUrlCopied(true);
        setTimeout(setUrlCopied, 2000, false);
      });
      setPastedCode('');
    }
  }, [pastedCode, safeOauthStatus, showPastePrompt, urlCopied]);
  const persistCustomEndpoint = useCallback(() => {
    const nextBaseURL = customBaseURL.trim();
    const nextApiKey = customApiKey.trim();
    const nextModel = customModel.trim();
    const normalizedKey = nextApiKey ? normalizeApiKeyForConfig(nextApiKey) : null;
    const nextSavedModels = nextModel ? [...new Set([...(persistedCustomApiEndpoint.savedModels ?? []), nextModel])] : persistedCustomApiEndpoint.savedModels ?? [];
    process.env.ANTHROPIC_BASE_URL = nextBaseURL;
    process.env.DOGE_API_KEY = nextApiKey;
    process.env.ANTHROPIC_MODEL = nextModel;
    saveGlobalConfig(current => ({
      ...current,
      customApiEndpoint: {
        provider: compatibleApiProvider,
        baseURL: nextBaseURL,
        apiKey: undefined,
        model: nextModel,
        savedModels: nextSavedModels
      },
      customApiKeyResponses: normalizedKey ? {
        approved: [...new Set([...(current.customApiKeyResponses?.approved ?? []), normalizedKey])],
        rejected: (current.customApiKeyResponses?.rejected ?? []).filter(key => key !== normalizedKey)
      } : current.customApiKeyResponses
    }));
    writeCustomApiStorage({
      provider: compatibleApiProvider,
      baseURL: nextBaseURL,
      apiKey: nextApiKey,
      model: nextModel,
      savedModels: nextSavedModels
    });
  }, [compatibleApiProvider, customApiKey, customBaseURL, customModel, persistedCustomApiEndpoint.savedModels]);
  const handleSubmitCustomConfig = useCallback((value: string) => {
    if (safeOauthStatus.state !== 'custom_config') {
      return;
    }
    if (safeOauthStatus.step === 'baseURL') {
      const nextValue = value.trim();
      if (!nextValue) {
        setOAuthStatus({
          state: 'error',
          message: '兼容地址不能为空',
          toRetry: {
            state: 'custom_config',
            provider: safeOauthStatus.provider,
            step: 'baseURL'
          }
        });
        return;
      }
      setCustomBaseURL(nextValue);
      setCursorOffset(0);
        setOAuthStatus({
          state: 'custom_config',
          provider: safeOauthStatus.provider,
          step: 'apiKey'
        });
      return;
    }
    if (safeOauthStatus.step === 'apiKey') {
      const nextValue = value.trim();
      if (!nextValue) {
        setOAuthStatus({
          state: 'error',
          message: 'API Key 不能为空',
          toRetry: {
            state: 'custom_config',
            provider: safeOauthStatus.provider,
            step: 'apiKey'
          }
        });
        return;
      }
      setCustomApiKey(nextValue);
      setCursorOffset(0);
        setOAuthStatus({
          state: 'custom_config',
          provider: safeOauthStatus.provider,
          step: 'model'
        });
      return;
    }
    const nextValue = value.trim();
    if (!nextValue) {
      setOAuthStatus({
        state: 'error',
        message: '模型不能为空',
        toRetry: {
          state: 'custom_config',
          provider: safeOauthStatus.provider,
          step: 'model'
        }
      });
      return;
    }
    setCustomModel(nextValue);
    persistCustomEndpoint();
    setOAuthStatus({
      state: 'success'
    });
    void sendNotification({
      message: safeOauthStatus.provider === 'openai' ? 'OpenAI-compatible endpoint saved' : 'Anthropic-compatible endpoint saved',
      notificationType: 'auth_success'
    }, terminal);
  }, [safeOauthStatus, persistCustomEndpoint, terminal]);
  async function handleSubmitCode(value: string, url: string) {
    try {
      // Expecting format "authorizationCode#state" from the authorization callback URL
      const [authorizationCode, state] = value.split('#');
      if (!authorizationCode || !state) {
        setOAuthStatus({
          state: 'error',
          message: '代码无效。请确保已复制完整代码',
          toRetry: {
            state: 'waiting_for_login',
            url
          }
        });
        return;
      }

      // Track which path the user is taking (manual code entry)
      logEvent('tengu_oauth_manual_entry', {});
      oauthService.handleManualAuthCodeInput({
        authorizationCode,
        state
      });
    } catch (err: unknown) {
      logError(err);
      setOAuthStatus({
        state: 'error',
        message: (err as Error).message,
        toRetry: {
          state: 'waiting_for_login',
          url
        }
      });
    }
  }
  const startOAuth = useCallback(async () => {
    try {
      logEvent('tengu_oauth_flow_start', {
        loginWithClaudeAi
      });
      const result = await oauthService.startOAuthFlow(async url_0 => {
        setOAuthStatus({
          state: 'waiting_for_login',
          url: url_0
        });
        setTimeout(setShowPastePrompt, 3000, true);
      }, {
        loginWithClaudeAi,
        inferenceOnly: mode === 'setup-token',
        expiresIn: mode === 'setup-token' ? 365 * 24 * 60 * 60 : undefined,
        // 1 year for setup-token
        orgUUID
      }).catch(err_1 => {
        const isTokenExchangeError = err_1.message.includes('Token exchange failed');
        // Enterprise TLS proxies (Zscaler et al.) intercept the token
        // exchange POST and cause cryptic SSL errors. Surface an
        // actionable hint so the user isn't stuck in a login loop.
        const sslHint_0 = getSSLErrorHint(err_1);
        setOAuthStatus({
          state: 'error',
          message: sslHint_0 ?? (isTokenExchangeError ? '交换授权码失败。请重试。' : err_1.message),
          toRetry: mode === 'setup-token' ? {
            state: 'ready_to_start'
          } : {
            state: 'idle'
          }
        });
        logEvent('tengu_oauth_token_exchange_error', {
          error: err_1.message,
          ssl_error: sslHint_0 !== null
        });
        throw err_1;
      });
      if (mode === 'setup-token') {
        // For setup-token mode, return the OAuth access token directly (it can be used as an API key)
        // Don't save to keychain - the token is displayed for manual use with CLAUDE_CODE_OAUTH_TOKEN
        setOAuthStatus({
          state: 'success',
          token: result.accessToken
        });
      } else {
        await installOAuthTokens(result);
        const orgResult = await validateForceLoginOrg();
        if (!orgResult.valid) {
          throw new Error('强制登录组织验证失败');
        }
        setOAuthStatus({
          state: 'success'
        });
        void sendNotification({
          message: 'Claude Code 登录成功',
          notificationType: 'auth_success'
        }, terminal);
      }
    } catch (err_0) {
      const errorMessage = (err_0 as Error).message;
      const sslHint = getSSLErrorHint(err_0);
      setOAuthStatus({
        state: 'error',
        message: sslHint ?? errorMessage,
        toRetry: {
          state: mode === 'setup-token' ? 'ready_to_start' : 'idle'
        }
      });
      logEvent('tengu_oauth_error', {
        error: errorMessage as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ssl_error: sslHint !== null
      });
    }
  }, [oauthService, setShowPastePrompt, loginWithClaudeAi, mode, orgUUID]);
  const pendingOAuthStartRef = useRef(false);
  useEffect(() => {
    if (safeOauthStatus.state === 'ready_to_start' && !pendingOAuthStartRef.current) {
      pendingOAuthStartRef.current = true;
      process.nextTick((startOAuth_0: () => Promise<void>, pendingOAuthStartRef_0: React.MutableRefObject<boolean>) => {
        void startOAuth_0();
        pendingOAuthStartRef_0.current = false;
      }, startOAuth, pendingOAuthStartRef);
    }
  }, [safeOauthStatus.state, startOAuth]);

  // Auto-exit for setup-token mode
  useEffect(() => {
    if (mode === 'setup-token' && safeOauthStatus.state === 'success') {
      // Delay to ensure static content is fully rendered before exiting
      const timer_0 = setTimeout((loginWithClaudeAi_0, onDone_0) => {
        logEvent('tengu_oauth_success', {
          loginWithClaudeAi: loginWithClaudeAi_0
        });
        // Don't clear terminal so the token remains visible
        onDone_0();
      }, 500, loginWithClaudeAi, onDone);
      return () => clearTimeout(timer_0);
    }
  }, [mode, safeOauthStatus, loginWithClaudeAi, onDone]);

  // Cleanup OAuth service when component unmounts
  useEffect(() => {
    return () => {
      oauthService.cleanup();
    };
  }, [oauthService]);
  return <Box flexDirection="column" gap={1}>
      {safeOauthStatus.state === 'waiting_for_login' && showPastePrompt && <Box flexDirection="column" key="urlToCopy" gap={1} paddingBottom={1}>
          <Box paddingX={1}>
            <Text dimColor>
              Browser didn&apos;t open? Use the url below to sign in{' '}
            </Text>
            {urlCopied ? <Text color="success">(已复制!)</Text> : <Text dimColor>
                <KeyboardShortcutHint shortcut="c" action="copy" parens />
              </Text>}
          </Box>
          <Link url={safeOauthStatus.url}>
            <Text dimColor>{safeOauthStatus.url}</Text>
          </Link>
        </Box>}
      {mode === 'setup-token' && safeOauthStatus.state === 'success' && safeOauthStatus.token && <Box key="tokenOutput" flexDirection="column" gap={1} paddingTop={1}>
            <Text color="success">
              ✓ 长期身份验证令牌创建成功!
            </Text>
            <Box flexDirection="column" gap={1}>
              <Text>你的 OAuth 令牌（有效期 1 年）：</Text>
              <Text color="warning">{safeOauthStatus.token}</Text>
              <Text dimColor>
                请安全存储此令牌。你将无法再次查看它。
              </Text>
              <Text dimColor>
                通过设置以下环境变量使用此令牌：export
                CLAUDE_CODE_OAUTH_TOKEN=&lt;token&gt;
              </Text>
            </Box>
          </Box>}
      <Box paddingLeft={1} flexDirection="column" gap={1}>
        <OAuthStatusMessage oauthStatus={safeOauthStatus} mode={mode} startingMessage={startingMessage} forcedMethodMessage={forcedMethodMessage} showPastePrompt={showPastePrompt} pastedCode={pastedCode} setPastedCode={setPastedCode} cursorOffset={cursorOffset} setCursorOffset={setCursorOffset} textInputColumns={textInputColumns} handleSubmitCode={handleSubmitCode} setOAuthStatus={setOAuthStatus} setLoginWithClaudeAi={setLoginWithClaudeAi} customBaseURL={customBaseURL} customApiKey={customApiKey} customModel={customModel} setCustomBaseURL={setCustomBaseURL} setCustomApiKey={setCustomApiKey} setCustomModel={setCustomModel} isCustomInputPasting={isCustomInputPasting} setIsCustomInputPasting={setIsCustomInputPasting} handleSubmitCustomConfig={handleSubmitCustomConfig} startCompatibleApiConfig={startCompatibleApiConfig} compatibleApiProvider={compatibleApiProvider} />
      </Box>
    </Box>;
}
type OAuthStatusMessageProps = {
  oauthStatus: OAuthStatus;
  mode: 'login' | 'setup-token';
  startingMessage: string | undefined;
  forcedMethodMessage: string | null;
  showPastePrompt: boolean;
  pastedCode: string;
  setPastedCode: (value: string) => void;
  cursorOffset: number;
  setCursorOffset: (offset: number) => void;
  textInputColumns: number;
  handleSubmitCode: (value: string, url: string) => void;
  setOAuthStatus: (status: OAuthStatus) => void;
  setLoginWithClaudeAi: (value: boolean) => void;
  customBaseURL: string;
  customApiKey: string;
  customModel: string;
  setCustomBaseURL: (value: string) => void;
  setCustomApiKey: (value: string) => void;
  setCustomModel: (value: string) => void;
  isCustomInputPasting: boolean;
  setIsCustomInputPasting: (value: boolean) => void;
  handleSubmitCustomConfig: (value: string) => void;
  startCompatibleApiConfig: (provider: CompatibleApiProvider) => void;
  compatibleApiProvider: CompatibleApiProvider;
};
function OAuthStatusMessage(t0) {
  const $ = _c(51);
  const {
    oauthStatus,
    mode,
    startingMessage,
    forcedMethodMessage,
    showPastePrompt,
    pastedCode,
    setPastedCode,
    cursorOffset,
    setCursorOffset,
    textInputColumns,
    handleSubmitCode,
    setOAuthStatus,
    setLoginWithClaudeAi,
    customBaseURL,
    customApiKey,
    customModel,
    setCustomBaseURL,
    setCustomApiKey,
    setCustomModel,
    isCustomInputPasting,
    setIsCustomInputPasting,
    handleSubmitCustomConfig,
    startCompatibleApiConfig,
    compatibleApiProvider
  } = t0;
  switch (oauthStatus.state) {
    case "provider_select":
      {
        return <Box flexDirection="column" gap={1} marginTop={1}><Text bold={true}>选择模型 API 格式</Text><Text>Claude Code 内部维护 Anthropic Messages 协议；如果选择 OpenAI，将使用中间层将内部 Messages 请求转换为 Chat Completions 请求，再将返回流转换回 Messages 事件。</Text><Box><Select options={[{
          label: <Text>类 Anthropic API · <Text dimColor={true}>直接使用与 `/v1/messages` 兼容的接口</Text></Text>,
          value: "anthropic"
        }, {
          label: <Text>类 OpenAI API · <Text dimColor={true}>将 Anthropic Messages 转换为 Chat Completions</Text></Text>,
          value: "openai"
        }]} onChange={value_0 => startCompatibleApiConfig(value_0 as CompatibleApiProvider)} /></Box></Box>;
      }
    case "custom_config":
      {
        const isOpenAIProvider = oauthStatus.provider === 'openai';
        const label = oauthStatus.step === 'baseURL' ? isOpenAIProvider ? 'Enter the OpenAI Chat Completions compatible base URL:' : 'Enter the Anthropic Messages compatible base URL:' : oauthStatus.step === 'apiKey' ? isOpenAIProvider ? 'Input OpenAI API Key:' : 'Input Anthropic API Key:' : 'Enter the default model name:';
        const value = oauthStatus.step === 'baseURL' ? customBaseURL : oauthStatus.step === 'apiKey' ? customApiKey : customModel;
        const onChange = oauthStatus.step === 'baseURL' ? setCustomBaseURL : oauthStatus.step === 'apiKey' ? setCustomApiKey : setCustomModel;
        const placeholder = oauthStatus.step === 'baseURL' ? isOpenAIProvider ? 'http(s)://your-openai-compatible-endpoint.example.com' : 'http(s)://your-anthropic-compatible-endpoint.example.com' : oauthStatus.step === 'apiKey' ? 'sk-...' : isOpenAIProvider ? 'gpt-4o-mini' : 'claude-3-5-sonnet-latest';
        const mask = oauthStatus.step === 'apiKey' ? '*' : undefined;
        return <Box flexDirection="column" gap={1} marginTop={1}><Text bold={true}>配置兼容接口</Text><Text>{compatibleApiProvider === 'openai' ? '当前选择：OpenAI Chat Completions 兼容格式' : '当前选择：Anthropic Messages 兼容格式'}</Text><Text>{label}</Text><Box flexDirection="row"><TextInput value={value} onChange={onChange} onSubmit={handleSubmitCustomConfig} onIsPastingChange={setIsCustomInputPasting} cursorOffset={cursorOffset} onChangeCursorOffset={setCursorOffset} columns={oauthStatus.step === 'baseURL' ? Math.max(20, textInputColumns - 12) : textInputColumns} focus={true} showCursor={true} placeholder={placeholder} mask={mask} dimColor={oauthStatus.step === 'model' && value.length === 0} />{oauthStatus.step === 'baseURL' ? <Text dimColor={true}>{isOpenAIProvider ? '/v1/chat/completions' : '/v1/messages'}</Text> : null}</Box><Text dimColor={true}>{isCustomInputPasting ? '按 Enter 保存当前项目并继续。' : '按 Enter 保存当前项目并继续。'}</Text></Box>;
      }
    case "idle":
      {
        const t1 = startingMessage ? startingMessage : "Claude Code 可以使用你的 Claude 订阅或通过 Console 账户按 API 用量计费。";
        let t2;
        if ($[0] !== t1) {
          t2 = <Text bold={true}>{t1}</Text>;
          $[0] = t1;
          $[1] = t2;
        } else {
          t2 = $[1];
        }
        let t3;
        if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
          t3 = <Text>选择登录方式：</Text>;
          $[2] = t3;
        } else {
          t3 = $[2];
        }
        let t4;
        if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
          t4 = {
            label: <Text>Claude 账户订阅 ·{" "}<Text dimColor={true}>Pro、Max、Team 或 Enterprise</Text>{false && <Text>{"\n"}<Text color="warning">[ANT-ONLY]</Text>{" "}<Text dimColor={true}>请使用此选项，除非您需要登录到特殊组织以访问敏感数据（如客户数据、HIPI 数据）</Text></Text>}{"\n"}</Text>,
            value: "claudeai"
          };
          $[3] = t4;
        } else {
          t4 = $[3];
        }
        let t5;
        if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
          t5 = {
            label: <Text>Anthropic Console account ·{" "}<Text dimColor={true}>API usage billing</Text>{"\n"}</Text>,
            value: "console"
          };
          $[4] = t5;
        } else {
          t5 = $[4];
        }
        let t6;
        if ($[5] === Symbol.for("react.memo_cache_sentinel")) {
          t6 = [t4, t5, {
            label: <Text>3rd-party platform ·{" "}<Text dimColor={true}>Amazon Bedrock, Microsoft Foundry, or Vertex AI</Text>{"\n"}</Text>,
            value: "platform"
          }];
          $[5] = t6;
        } else {
          t6 = $[5];
        }
        let t7;
        if ($[6] !== setLoginWithClaudeAi || $[7] !== setOAuthStatus) {
          t7 = <Box><Select options={t6} onChange={value_0 => {
              if (value_0 === "platform") {
                logEvent("tengu_oauth_platform_selected", {});
                setOAuthStatus({
                  state: "platform_setup"
                });
              } else {
                setOAuthStatus({
                  state: "ready_to_start"
                });
                if (value_0 === "claudeai") {
                  logEvent("tengu_oauth_claudeai_selected", {});
                  setLoginWithClaudeAi(true);
                } else {
                  logEvent("tengu_oauth_console_selected", {});
                  setLoginWithClaudeAi(false);
                }
              }
            }} /></Box>;
          $[6] = setLoginWithClaudeAi;
          $[7] = setOAuthStatus;
          $[8] = t7;
        } else {
          t7 = $[8];
        }
        let t8;
        if ($[9] !== t2 || $[10] !== t7) {
          t8 = <Box flexDirection="column" gap={1} marginTop={1}>{t2}{t3}{t7}</Box>;
          $[9] = t2;
          $[10] = t7;
          $[11] = t8;
        } else {
          t8 = $[11];
        }
        return t8;
      }
    case "platform_setup":
      {
        let t1;
        if ($[12] === Symbol.for("react.memo_cache_sentinel")) {
          t1 = <Text bold={true}>Using 3rd-party platforms</Text>;
          $[12] = t1;
        } else {
          t1 = $[12];
        }
        let t2;
        let t3;
        if ($[13] === Symbol.for("react.memo_cache_sentinel")) {
          t2 = <Text>Claude Code 支持 Amazon Bedrock、Microsoft Foundry 和 Vertex AI。设置所需的环境变量，然后重启 Claude Code。</Text>;
          t3 = <Text>如果您属于企业组织，请联系管理员获取设置说明。</Text>;
          $[13] = t2;
          $[14] = t3;
        } else {
          t2 = $[13];
          t3 = $[14];
        }
        let t4;
        if ($[15] === Symbol.for("react.memo_cache_sentinel")) {
          t4 = <Text bold={true}>文档：</Text>;
          $[15] = t4;
        } else {
          t4 = $[15];
        }
        let t5;
        if ($[16] === Symbol.for("react.memo_cache_sentinel")) {
          t5 = <Text>· Amazon Bedrock:{" "}<Link url="https://code.claude.com/docs/en/amazon-bedrock">https://code.claude.com/docs/en/amazon-bedrock</Link></Text>;
          $[16] = t5;
        } else {
          t5 = $[16];
        }
        let t6;
        if ($[17] === Symbol.for("react.memo_cache_sentinel")) {
          t6 = <Text>· Microsoft Foundry:{" "}<Link url="https://code.claude.com/docs/en/microsoft-foundry">https://code.claude.com/docs/en/microsoft-foundry</Link></Text>;
          $[17] = t6;
        } else {
          t6 = $[17];
        }
        let t7;
        if ($[18] === Symbol.for("react.memo_cache_sentinel")) {
          t7 = <Box flexDirection="column" marginTop={1}>{t4}{t5}{t6}<Text>· Vertex AI:{" "}<Link url="https://code.claude.com/docs/en/google-vertex-ai">https://code.claude.com/docs/en/google-vertex-ai</Link></Text></Box>;
          $[18] = t7;
        } else {
          t7 = $[18];
        }
        let t8;
        if ($[19] === Symbol.for("react.memo_cache_sentinel")) {
          t8 = <Box flexDirection="column" gap={1} marginTop={1}>{t1}<Box flexDirection="column" gap={1}>{t2}{t3}{t7}<Box marginTop={1}><Text dimColor={true}>按 <Text bold={true}>Enter</Text> 返回登录选项。</Text></Box></Box></Box>;
          $[19] = t8;
        } else {
          t8 = $[19];
        }
        return t8;
      }
    case "waiting_for_login":
      {
        let t1;
        if ($[20] !== forcedMethodMessage) {
          t1 = forcedMethodMessage && <Box><Text dimColor={true}>{forcedMethodMessage}</Text></Box>;
          $[20] = forcedMethodMessage;
          $[21] = t1;
        } else {
          t1 = $[21];
        }
        let t2;
        if ($[22] !== showPastePrompt) {
          t2 = !showPastePrompt && <Box><Spinner /><Text>Opening browser to sign in…</Text></Box>;
          $[22] = showPastePrompt;
          $[23] = t2;
        } else {
          t2 = $[23];
        }
        let t3;
        if ($[24] !== cursorOffset || $[25] !== handleSubmitCode || $[26] !== oauthStatus.url || $[27] !== pastedCode || $[28] !== setCursorOffset || $[29] !== setPastedCode || $[30] !== showPastePrompt || $[31] !== textInputColumns) {
          t3 = showPastePrompt && <Box><Text>{PASTE_HERE_MSG}</Text><TextInput value={pastedCode} onChange={setPastedCode} onSubmit={value => handleSubmitCode(value, oauthStatus.url)} cursorOffset={cursorOffset} onChangeCursorOffset={setCursorOffset} columns={textInputColumns} mask="*" /></Box>;
          $[24] = cursorOffset;
          $[25] = handleSubmitCode;
          $[26] = oauthStatus.url;
          $[27] = pastedCode;
          $[28] = setCursorOffset;
          $[29] = setPastedCode;
          $[30] = showPastePrompt;
          $[31] = textInputColumns;
          $[32] = t3;
        } else {
          t3 = $[32];
        }
        let t4;
        if ($[33] !== t1 || $[34] !== t2 || $[35] !== t3) {
          t4 = <Box flexDirection="column" gap={1}>{t1}{t2}{t3}</Box>;
          $[33] = t1;
          $[34] = t2;
          $[35] = t3;
          $[36] = t4;
        } else {
          t4 = $[36];
        }
        return t4;
      }
    case "creating_api_key":
      {
        let t1;
        if ($[37] === Symbol.for("react.memo_cache_sentinel")) {
          t1 = <Box flexDirection="column" gap={1}><Box><Spinner /><Text>Creating API key for Claude Code…</Text></Box></Box>;
          $[37] = t1;
        } else {
          t1 = $[37];
        }
        return t1;
      }
    case "about_to_retry":
      {
        let t1;
        if ($[38] === Symbol.for("react.memo_cache_sentinel")) {
          t1 = <Box flexDirection="column" gap={1}><Text color="permission">Retrying…</Text></Box>;
          $[38] = t1;
        } else {
          t1 = $[38];
        }
        return t1;
      }
    case "success":
      {
        let t1;
        if ($[39] !== mode || $[40] !== oauthStatus.token) {
          t1 = mode === "setup-token" && oauthStatus.token ? null : <>{getOauthAccountInfo()?.emailAddress ? <Text dimColor={true}>已登录为{" "}<Text>{getOauthAccountInfo()?.emailAddress}</Text></Text> : null}<Text color="success">登录成功。按 <Text bold={true}>Enter</Text> 继续…</Text></>;
          $[39] = mode;
          $[40] = oauthStatus.token;
          $[41] = t1;
        } else {
          t1 = $[41];
        }
        let t2;
        if ($[42] !== t1) {
          t2 = <Box flexDirection="column">{t1}</Box>;
          $[42] = t1;
          $[43] = t2;
        } else {
          t2 = $[43];
        }
        return t2;
      }
    case "error":
      {
        let t1;
        if ($[44] !== oauthStatus.message) {
          t1 = <Text color="error">OAuth error: {oauthStatus.message}</Text>;
          $[44] = oauthStatus.message;
          $[45] = t1;
        } else {
          t1 = $[45];
        }
        let t2;
        if ($[46] !== oauthStatus.toRetry) {
          t2 = oauthStatus.toRetry && <Box marginTop={1}><Text color="permission">按 <Text bold={true}>Enter</Text> 重试。</Text></Box>;
          $[46] = oauthStatus.toRetry;
          $[47] = t2;
        } else {
          t2 = $[47];
        }
        let t3;
        if ($[48] !== t1 || $[49] !== t2) {
          t3 = <Box flexDirection="column" gap={1}>{t1}{t2}</Box>;
          $[48] = t1;
          $[49] = t2;
          $[50] = t3;
        } else {
          t3 = $[50];
        }
        return t3;
      }
    default:
      {
        return null;
      }
  }
}
