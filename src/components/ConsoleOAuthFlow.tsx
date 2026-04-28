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
import {
  readCustomApiStorage,
  writeCustomApiStorage,
  listSavedPresets,
  switchActivePreset,
} from '../utils/customApiStorage.js';
import { logError } from '../utils/log.js';
import { getSettings_DEPRECATED } from '../utils/settings/settings.js';
import { Select } from './CustomSelect/select.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import { Spinner } from './Spinner.js';
import TextInput from './TextInput.js';
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { logForDebugging } from '../utils/debug.js'

type Props = {
  onDone(): void;
  startingMessage?: string;
  mode?: 'login' | 'setup-token';
  forceLoginMethod?: 'claudeai' | 'console';
};

type CompatibleApiProvider = 'anthropic' | 'openai';

type OAuthStatus = {
  state: 'idle';
} | {
  state: 'provider_select';
} | {
  state: 'custom_config';
  provider: CompatibleApiProvider;
  step: 'baseURL' | 'apiKey' | 'model';
} | {
  state: 'platform_setup';
} | {
  state: 'ready_to_start';
} | {
  state: 'waiting_for_login';
  url: string;
} | {
  state: 'creating_api_key';
} | {
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

type PresetEndpoint = {
  label: string;
  provider: CompatibleApiProvider;
  baseURL: string;
  defaultModel: string;
  apiKeyRequired: boolean;
};

const PRESET_ENDPOINTS: PresetEndpoint[] = [
  { label: 'Local Proxy (8080)', provider: 'openai', baseURL: 'http://127.0.0.1:8080/v1/chat/completions', defaultModel: '', apiKeyRequired: false },
  { label: 'Local Anthropic (8080)', provider: 'anthropic', baseURL: 'http://127.0.0.1:8080/', defaultModel: 'claude-3-haiku', apiKeyRequired: false },
  { label: 'Ollama (11434)', provider: 'openai', baseURL: 'http://127.0.0.1:11434/v1/chat/completions', defaultModel: 'qwen3.5:0.8b', apiKeyRequired: false },
  { label: 'LMStudio Server (1234)', provider: 'openai', baseURL: 'http://127.0.0.1:1234/v1/chat/completions', defaultModel: 'claude-3-haiku ', apiKeyRequired: false },
  { label: 'LMStudio Anthropic (1234)', provider: 'anthropic', baseURL: 'http://127.0.0.1:1234/', defaultModel: 'claude-3-haiku ', apiKeyRequired: false },
  { label: 'CC Switch (15721)', provider: 'openai', baseURL: 'http://127.0.0.1:15721/v1/chat/completions', defaultModel: 'qwen9b', apiKeyRequired: false },
  { label: 'ModelScope (魔塔)', provider: 'openai', baseURL: 'https://api-inference.modelscope.cn/v1/chat/completions', defaultModel: 'Qwen/Qwen3.5-397B-A17B', apiKeyRequired: true },
  { label: 'NVIDIA NIM', provider: 'openai', baseURL: 'https://integrate.api.nvidia.com/v1/chat/completions', defaultModel: 'deepseek-ai/deepseek-v4-pro', apiKeyRequired: true },
  { label: '智谱 (BigModel)', provider: 'openai', baseURL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', defaultModel: 'glm-4-7-Flash', apiKeyRequired: true },
  { label: 'DeepSeek (api)', provider: 'openai', baseURL: 'https://api.deepseek.com/chat/completions', defaultModel: 'deepseek-chat', apiKeyRequired: true },
  { label: '火山引擎 (Ark)', provider: 'openai', baseURL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', defaultModel: 'ep-202...', apiKeyRequired: true },
];
 
//let hasAutoLoggedIn = false;
export function ConsoleOAuthFlow({
  onDone,
  startingMessage,
  mode = 'login',
  forceLoginMethod: forceLoginMethodProp,
}: Props) {
  const settings = getSettings_DEPRECATED() || {};
  const forceLoginMethod = forceLoginMethodProp ?? settings.forceLoginMethod;
  const orgUUID = settings.forceLoginOrgUUID;
  const forcedMethodMessage = forceLoginMethod === 'claudeai'
    ? 'Login method pre-selected: Subscription Plan (Claude Pro/Max)'
    : forceLoginMethod === 'console'
      ? 'Login method pre-selected: API Usage Billing (Anthropic Console)'
      : null;

  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>(() => {
    if (mode === 'setup-token') return { state: 'ready_to_start' };
    if (forceLoginMethod === 'claudeai' || forceLoginMethod === 'console')
      return { state: 'ready_to_start' };
    return { state: 'provider_select' };
  });
/*
useEffect(() => {
    if (
      mode === 'login' &&
      !forceLoginMethod &&
      !hasAutoLoggedIn &&
      process.env.ANTHROPIC_BASE_URL &&
      process.env.ANTHROPIC_BASE_URL !== 'http://0.0.0.0:1' &&
      process.env.DOGE_API_KEY !== undefined &&
      process.env.DOGE_API_KEY !== 'DOGE_FAKE_KEY'
    ) {
      hasAutoLoggedIn = true;
      onDone();
    }
  }, []); 

  useEffect(() => {
    if (
      mode === 'login' &&
      !forceLoginMethod &&
      process.env.DOGE_AUTO_LOGIN_DONE === '1'
    ) {
      delete process.env.DOGE_AUTO_LOGIN_DONE;  // 消费标志，确保只自动登录一次
      onDone();
    }
  }, []);*/
  const safeOauthStatus = oauthStatus ?? { state: 'provider_select' as const };

  const existingConfig = useMemo(() => readCustomApiStorage(), []);
  const persistedCustomApiEndpoint = useMemo(() => ({ ...existingConfig }), [existingConfig]);

 // useEffect(() => {
  //  const oldConfig = path.join(os.homedir(), '.doge', '.claude.json');
  //  const oldBackups = path.join(os.homedir(), '.doge', 'backups');
    //try { fs.unlinkSync(oldConfig); } catch {}
    //try { fs.rmdirSync(oldBackups, { recursive: true }); } catch {}
 // }, []);

  const persistedProvider = persistedCustomApiEndpoint.provider;
  const terminal = useTerminalNotification();

  const [compatibleApiProvider, setCompatibleApiProvider] = useState<CompatibleApiProvider>(
    persistedProvider ?? 'openai'
  );
  const [pastedCode, setPastedCode] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const [customBaseURL, setCustomBaseURL] = useState(
    process.env.ANTHROPIC_BASE_URL || persistedCustomApiEndpoint.baseURL || ''
  );
// 原代码在 useState 附近
const initialApiKey = (() => {
  const stored = persistedCustomApiEndpoint.apiKey;
  if (stored) return stored;
  const envKey = process.env.DOGE_API_KEY;
  return (envKey && envKey !== 'DOGE_FAKE_KEY') ? envKey : '';
})();

const [customApiKey, setCustomApiKey] = useState(initialApiKey);
  const [customModel, setCustomModel] = useState(
    persistedCustomApiEndpoint.model || process.env.ANTHROPIC_MODEL || ''
  );
  const [oauthService] = useState(() => new OAuthService());
  const [loginWithClaudeAi, setLoginWithClaudeAi] = useState(() => {
    return mode === 'setup-token' || forceLoginMethod === 'claudeai';
  });
  const [showPastePrompt, setShowPastePrompt] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [isCustomInputPasting, setIsCustomInputPasting] = useState(false);
  const textInputColumns = useTerminalSize().columns - PASTE_HERE_MSG.length - 1;
  const [currentPresetName, setCurrentPresetName] = useState<string>('');
  const savedPresets = useMemo(() => listSavedPresets(), []);

  const startCompatibleApiConfig = useCallback((provider: CompatibleApiProvider) => {
    setCompatibleApiProvider(provider);
    setOAuthStatus({ state: 'custom_config', provider, step: 'baseURL' });
  }, []);

  useEffect(() => {
    if (forceLoginMethod === 'claudeai') {
      logEvent('tengu_oauth_claudeai_forced', {});
    } else if (forceLoginMethod === 'console') {
      logEvent('tengu_oauth_console_forced', {});
    }
  }, [forceLoginMethod]);

  useEffect(() => {
    if (safeOauthStatus.state === 'about_to_retry') {
      const timer = setTimeout(setOAuthStatus, 1000, safeOauthStatus.nextState);
      return () => clearTimeout(timer);
    }
  }, [safeOauthStatus]);

  useKeybinding('confirm:yes', () => {
    logEvent('tengu_oauth_success', { loginWithClaudeAi });
    onDone();
  }, {
    context: 'Confirmation',
    isActive: safeOauthStatus.state === 'success' && mode !== 'setup-token'
  });

  useKeybinding('confirm:yes', () => {
    setOAuthStatus({ state: 'idle' });
  }, {
    context: 'Confirmation',
    isActive: safeOauthStatus.state === 'platform_setup'
  });

  useKeybinding('confirm:yes', () => {
    if (safeOauthStatus.state === 'error' && safeOauthStatus.toRetry) {
      setPastedCode('');
      setOAuthStatus({ state: 'about_to_retry', nextState: safeOauthStatus.toRetry });
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
    const nextSavedModels = nextModel
      ? [...new Set([...(persistedCustomApiEndpoint.savedModels ?? []), nextModel])]
      : persistedCustomApiEndpoint.savedModels ?? [];

    let nameToSave = currentPresetName?.trim();
    if (!nameToSave) {
      const saved = listSavedPresets().find(p => p.config.baseURL === nextBaseURL);
      nameToSave = saved?.name || 'custom';
    }

    process.env.ANTHROPIC_BASE_URL = nextBaseURL;
    process.env.DOGE_API_KEY = nextApiKey;
    process.env.ANTHROPIC_MODEL = nextModel;
    process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = compatibleApiProvider;

    saveGlobalConfig(current => ({
      ...current,
      customApiEndpoint: {
        provider: compatibleApiProvider,
        baseURL: nextBaseURL,
        apiKey: undefined,
        model: nextModel,
        savedModels: nextSavedModels,
      },
      customApiKeyResponses: normalizedKey
        ? {
            approved: [...new Set([...(current.customApiKeyResponses?.approved ?? []), normalizedKey])],
            rejected: (current.customApiKeyResponses?.rejected ?? []).filter(key => key !== normalizedKey),
          }
        : current.customApiKeyResponses,
    }));
	const finalProvider = compatibleApiProvider;
    writeCustomApiStorage(
      {
        provider: finalProvider ,
        baseURL: nextBaseURL,
        apiKey: nextApiKey,
        model: nextModel,
        savedModels: nextSavedModels,
      },
      nameToSave,
    );

    process.env.ANTHROPIC_BASE_URL = nextBaseURL;
    process.env.DOGE_API_KEY = nextApiKey;
    process.env.ANTHROPIC_MODEL = nextModel;
  }, [compatibleApiProvider, customApiKey, customBaseURL, customModel, persistedCustomApiEndpoint.savedModels, currentPresetName]);

  const handleSubmitCustomConfig = useCallback((value: string) => {
    if (safeOauthStatus.state !== 'custom_config') return;

    if (safeOauthStatus.step === 'baseURL') {
      const nextValue = value.trim();
      if (!nextValue) {
        setOAuthStatus({
          state: 'error',
          message: '兼容地址不能为空',
          toRetry: { state: 'custom_config', provider: safeOauthStatus.provider, step: 'baseURL' }
        });
        return;
      }
      setCustomBaseURL(nextValue);
      setCursorOffset(0);
      setOAuthStatus({ state: 'custom_config', provider: safeOauthStatus.provider, step: 'apiKey' });
      return;
    }

    if (safeOauthStatus.step === 'apiKey') {
      const nextValue = value.trim();
      setCustomApiKey(nextValue);
      setCursorOffset(0);
      setOAuthStatus({ state: 'custom_config', provider: safeOauthStatus.provider, step: 'model' });
      return;
    }

    const nextValue = value.trim();
    setCustomModel(nextValue);
    persistCustomEndpoint();
    setOAuthStatus({ state: 'success' });
    void sendNotification({
      message: safeOauthStatus.provider === 'openai' ? 'OpenAI-compatible endpoint saved' : 'Anthropic-compatible endpoint saved',
      notificationType: 'auth_success'
    }, terminal);
  }, [safeOauthStatus, persistCustomEndpoint, terminal]);

  async function handleSubmitCode(value: string, url: string) {
    try {
      const [authorizationCode, state] = value.split('#');
      if (!authorizationCode || !state) {
        setOAuthStatus({
          state: 'error',
          message: '代码无效。请确保已复制完整代码',
          toRetry: { state: 'waiting_for_login', url }
        });
        return;
      }
      logEvent('tengu_oauth_manual_entry', {});
      oauthService.handleManualAuthCodeInput({ authorizationCode, state });
    } catch (err: unknown) {
      logError(err);
      setOAuthStatus({
        state: 'error',
        message: (err as Error).message,
        toRetry: { state: 'waiting_for_login', url }
      });
    }
  }

  const startOAuth = useCallback(async () => {
    try {
      logEvent('tengu_oauth_flow_start', { loginWithClaudeAi });
      const result = await oauthService.startOAuthFlow(async url_0 => {
        setOAuthStatus({ state: 'waiting_for_login', url: url_0 });
        setTimeout(setShowPastePrompt, 3000, true);
      }, {
        loginWithClaudeAi,
        inferenceOnly: mode === 'setup-token',
        expiresIn: mode === 'setup-token' ? 365 * 24 * 60 * 60 : undefined,
        orgUUID
      }).catch(err_1 => {
        const isTokenExchangeError = err_1.message.includes('Token exchange failed');
        const sslHint_0 = getSSLErrorHint(err_1);
        setOAuthStatus({
          state: 'error',
          message: sslHint_0 ?? (isTokenExchangeError ? '交换授权码失败。请重试。' : err_1.message),
          toRetry: mode === 'setup-token' ? { state: 'ready_to_start' } : { state: 'idle' }
        });
        logEvent('tengu_oauth_token_exchange_error', {
          error: err_1.message,
          ssl_error: sslHint_0 !== null
        });
        throw err_1;
      });
      if (mode === 'setup-token') {
        setOAuthStatus({ state: 'success', token: result.accessToken });
      } else {
        await installOAuthTokens(result);
        const orgResult = await validateForceLoginOrg();
        if (!orgResult.valid) {
          throw new Error('强制登录组织验证失败');
        }
        setOAuthStatus({ state: 'success' });
        void sendNotification({ message: 'Claude Code 登录成功', notificationType: 'auth_success' }, terminal);
      }
    } catch (err_0) {
      const errorMessage = (err_0 as Error).message;
      const sslHint = getSSLErrorHint(err_0);
      setOAuthStatus({
        state: 'error',
        message: sslHint ?? errorMessage,
        toRetry: { state: mode === 'setup-token' ? 'ready_to_start' : 'idle' }
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
      process.nextTick(() => {
        void startOAuth();
        pendingOAuthStartRef.current = false;
      });
    }
  }, [safeOauthStatus.state, startOAuth]);

  useEffect(() => {
    if (mode === 'setup-token' && safeOauthStatus.state === 'success') {
      const timer = setTimeout(() => {
        logEvent('tengu_oauth_success', { loginWithClaudeAi });
        onDone();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [mode, safeOauthStatus, loginWithClaudeAi, onDone]);

  useEffect(() => {
    return () => { oauthService.cleanup(); };
  }, [oauthService]);

  return (
    <Box flexDirection="column" gap={1}>
      {safeOauthStatus.state === 'waiting_for_login' && showPastePrompt && (
        <Box flexDirection="column" key="urlToCopy" gap={1} paddingBottom={1}>
          <Box paddingX={1}>
            <Text dimColor>Browser didn&apos;t open? Use the url below to sign in </Text>
            {urlCopied ? <Text color="success">(已复制!)</Text> : <Text dimColor><KeyboardShortcutHint shortcut="c" action="copy" parens /></Text>}
          </Box>
          <Link url={safeOauthStatus.url}>
            <Text dimColor>{safeOauthStatus.url}</Text>
          </Link>
        </Box>
      )}
      {mode === 'setup-token' && safeOauthStatus.state === 'success' && safeOauthStatus.token && (
        <Box key="tokenOutput" flexDirection="column" gap={1} paddingTop={1}>
          <Text color="success">✓ 长期身份验证令牌创建成功!</Text>
          <Box flexDirection="column" gap={1}>
            <Text>你的 OAuth 令牌（有效期 1 年）：</Text>
            <Text color="warning">{safeOauthStatus.token}</Text>
            <Text dimColor>请安全存储此令牌。你将无法再次查看它。</Text>
            <Text dimColor>通过设置以下环境变量使用此令牌：export CLAUDE_CODE_OAUTH_TOKEN=&lt;token&gt;</Text>
          </Box>
        </Box>
      )}
      <Box paddingLeft={1} flexDirection="column" gap={1}>
        <OAuthStatusMessage
          oauthStatus={safeOauthStatus}
          mode={mode}
          startingMessage={startingMessage}
          forcedMethodMessage={forcedMethodMessage}
          showPastePrompt={showPastePrompt}
          pastedCode={pastedCode}
          setPastedCode={setPastedCode}
          cursorOffset={cursorOffset}
          setCursorOffset={setCursorOffset}
          textInputColumns={textInputColumns}
          handleSubmitCode={handleSubmitCode}
          setOAuthStatus={setOAuthStatus}
          setLoginWithClaudeAi={setLoginWithClaudeAi}
          customBaseURL={customBaseURL}
          customApiKey={customApiKey}
          customModel={customModel}
          setCustomBaseURL={setCustomBaseURL}
          setCustomApiKey={setCustomApiKey}
          setCustomModel={setCustomModel}
          isCustomInputPasting={isCustomInputPasting}
          setIsCustomInputPasting={setIsCustomInputPasting}
          handleSubmitCustomConfig={handleSubmitCustomConfig}
          startCompatibleApiConfig={startCompatibleApiConfig}
          compatibleApiProvider={compatibleApiProvider}
          setCompatibleApiProvider={setCompatibleApiProvider}
          savedPresets={savedPresets}
          setCurrentPresetName={setCurrentPresetName}
        />
      </Box>
    </Box>
  );
}

type OAuthStatusMessageProps = {
  savedPresets: { name: string; config: any }[];
  setCurrentPresetName: (name: string) => void;
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
  setCompatibleApiProvider: (provider: CompatibleApiProvider) => void;
};

function OAuthStatusMessage(t0: OAuthStatusMessageProps) {
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
    compatibleApiProvider,
    setCompatibleApiProvider,
    savedPresets,
    setCurrentPresetName,
  } = t0;

  switch (oauthStatus.state) {
    case "provider_select": {
      const savedOptions = savedPresets.map(({ name, config }) => ({
        label: (
          <Text>
            🔄 {name} · <Text dimColor>{config.baseURL}</Text> ({config.model || '无默认模型'})
          </Text>
        ),
        value: `saved:${name}`,
      }));

      const generalOptions = [
        {
          label: <Text>类 Anthropic API · <Text dimColor={true}>直接使用与 `/v1/messages` 兼容的接口</Text></Text>,
          value: "anthropic"
        },
        {
          label: <Text>类 OpenAI API · <Text dimColor={true}>将 Anthropic Messages 转换为 Chat Completions</Text></Text>,
          value: "openai"
        },
      ];

      const presetOptions = PRESET_ENDPOINTS.map((preset, index) => ({
        label: (
          <Text>
            {preset.label}{' '}
            <Text dimColor={true}>({preset.baseURL})</Text>
          </Text>
        ),
        value: `preset:${index}`,  // ✅ 修正：去掉了空格
      }));

      const allOptions = [...savedOptions, ...generalOptions, ...presetOptions];

      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold={true}>选择模型 API 格式</Text>
          <Text>Claude Code 内部维护 Anthropic Messages 协议；如果选择 OpenAI，将使用中间层将内部 Messages 请求转换为 Chat Completions 请求，再将返回流转换回 Messages 事件。</Text>
          {savedOptions.length > 0 && (
            <Text dimColor>已保存的端点（一键切换，无需重新输入 Key）：</Text>
          )}
          <Box>
            <Select
              options={allOptions}
              onChange={value => {
				if (typeof value === 'string' && value.startsWith('saved:')) {
					const presetName = value.slice(6);
					logForDebugging('[OAuthFlow] switching to saved preset: ' + presetName, { level: 'debug' });
					// 1. 切换 activePreset 并立即同步环境变量
					const ok = switchActivePreset(presetName);
					if (!ok) return;
					// 2. 重新从文件读取该预设的完整数据
					const config = readCustomApiStorage(presetName);
					logForDebugging('[OAuthFlow] loaded config: ' + JSON.stringify(config), { level: 'debug' });
					// 3. 将环境变量中的数据同步回 UI 状态（这样界面立刻显示正确模型）
					setCustomBaseURL(config.baseURL ?? '');
					setCustomApiKey(config.apiKey ?? '');
					setCustomModel(config.model ?? '');
					setCompatibleApiProvider((config.provider as any) || 'openai');
					setCurrentPresetName(presetName);
					// 4. 直接标记登录成功，返回主界面
					setOAuthStatus({ state: 'success' });
				}
                if (typeof value === 'string' && value.startsWith('preset:')) {
                  const idx = parseInt(value.split(':')[1], 10);
                  const preset = PRESET_ENDPOINTS[idx];
                  logForDebugging('[OAuthFlow] selected preset endpoint:', preset.label, preset.baseURL);

                  if (!preset) return;

                  setCustomBaseURL(preset.baseURL);
                  setCustomModel(preset.defaultModel);
                  setCompatibleApiProvider(preset.provider);
                  setCurrentPresetName(preset.label);

                  setOAuthStatus({
                    state: 'custom_config',
                    provider: preset.provider,
                    step: 'apiKey',
                  });
                } else {
                  setCurrentPresetName('');
                  startCompatibleApiConfig(value as CompatibleApiProvider);
                }
              }}
            />
          </Box>
        </Box>
      );
    }

    case "custom_config": {
      const isOpenAIProvider = oauthStatus.provider === 'openai';

      if (oauthStatus.step === 'model') {
        const savedModels = persistedCustomApiEndpoint.savedModels ?? []
        const hasSaved = savedModels.some((m: unknown) => typeof m === 'string' && m.trim())
        if (hasSaved && customModel.length === 0) {
          const modelOpts = savedModels
            .filter((m: unknown) => typeof m === 'string' && m.trim())
            .map((m: string) => ({ label: <Text>{m}</Text>, value: m }))
          modelOpts.push({
            label: <Text dimColor>手动输入其他模型名称...</Text>,
            value: '__manual__',
          })
          return (
            <Box flexDirection="column" gap={1} marginTop={1}>
              <Text bold={true}>选择模型</Text>
              <Text dimColor>从已保存的模型中选择，或手动输入其他模型名称：</Text>
              <Box>
                <Select
                  options={modelOpts}
                  onChange={value => {
                    if (value === '__manual__') {
                      setCustomModel('')
                      setCursorOffset(0)
                      setOAuthStatus({ state: 'custom_config', provider: oauthStatus.provider, step: 'model' })
                    } else {
                      setCustomModel(value)
                      setCursorOffset(0)
                      handleSubmitCustomConfig(value)
                    }
                  }}
                />
              </Box>
            </Box>
          )
        }
      }

      const label = oauthStatus.step === 'baseURL'
        ? (isOpenAIProvider ? '请输入完整的 OpenAI Chat Completions 端点 URL（含路径）：' : '请输入完整的 Anthropic Messages 端点 URL（含路径）：')
        : oauthStatus.step === 'apiKey'
          ? (isOpenAIProvider ? '请输入 OpenAI API Key：' : '请输入 Anthropic API Key：')
          : '请输入模型名称（留空则使用服务端默认）：';
      const value = oauthStatus.step === 'baseURL' ? customBaseURL : oauthStatus.step === 'apiKey' ? customApiKey : customModel;
      const onChange = oauthStatus.step === 'baseURL' ? setCustomBaseURL : oauthStatus.step === 'apiKey' ? setCustomApiKey : setCustomModel;
      const placeholder = oauthStatus.step === 'baseURL'
        ? (isOpenAIProvider ? 'http(s)://你的端点.example.com/v1/chat/completions' : 'http(s)://你的端点.example.com/v1/messages')
        : oauthStatus.step === 'apiKey'
          ? 'sk-...'
          : (isOpenAIProvider ? 'gpt-4o-mini' : 'claude-3-5-sonnet-latest');
      const mask = oauthStatus.step === 'apiKey' ? '*' : void 0;

      const hint = oauthStatus.step === 'baseURL' && customBaseURL.length > 0
        ? <Text dimColor>已自动填入端点: {customBaseURL}，可按需修改</Text>
        : null;

      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold={true}>配置兼容接口</Text>
          <Text>{compatibleApiProvider === 'openai' ? '当前选择：OpenAI Chat Completions 兼容格式' : '当前选择：Anthropic Messages 兼容格式'}</Text>
          {hint}
          <Text>{label}</Text>
          <Box flexDirection="row">
            <TextInput
              value={value}
              onChange={onChange}
              onSubmit={handleSubmitCustomConfig}
              onIsPastingChange={setIsCustomInputPasting}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
              columns={oauthStatus.step === 'baseURL' ? Math.max(20, textInputColumns - 12) : textInputColumns}
              focus={true}
              showCursor={true}
              placeholder={placeholder}
              mask={mask}
              dimColor={oauthStatus.step === 'model' && value.length === 0}
            />
          </Box>
          <Text dimColor={true}>{isCustomInputPasting ? '按 Enter 保存当前项目并继续。' : '按 Enter 保存当前项目并继续。'}</Text>
        </Box>
      );
    }

    case "idle": {
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
          label: <Text>Claude 账户订阅 ·{" "}<Text dimColor={true}>Pro、Max、Team 或 Enterprise</Text>{"\n"}</Text>,
          value: "claudeai"
        };
        $[3] = t4;
      } else {
        t4 = $[3];
      }
      let t5;
      if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
        t5 = {
          label: <Text>Anthropic Console 账户 ·{" "}<Text dimColor={true}>API 用量计费</Text>{"\n"}</Text>,
          value: "console"
        };
        $[4] = t5;
      } else {
        t5 = $[4];
      }
      let t6;
      if ($[5] === Symbol.for("react.memo_cache_sentinel")) {
        t6 = [t4, t5, {
          label: <Text>第三方平台 ·{" "}<Text dimColor={true}>Amazon Bedrock、Microsoft Foundry 或 Vertex AI</Text>{"\n"}</Text>,
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
              setOAuthStatus({ state: "platform_setup" });
            } else {
              setOAuthStatus({ state: "ready_to_start" });
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

    case "platform_setup": {
      let t1;
      if ($[12] === Symbol.for("react.memo_cache_sentinel")) {
        t1 = <Text bold={true}>使用第三方平台</Text>;
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

    case "waiting_for_login": {
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
        t2 = !showPastePrompt && <Box><Spinner /><Text>正在打开浏览器进行登录…</Text></Box>;
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

    case "creating_api_key": {
      let t1;
      if ($[37] === Symbol.for("react.memo_cache_sentinel")) {
        t1 = <Box flexDirection="column" gap={1}><Box><Spinner /><Text>正在为 Claude Code 创建 API Key…</Text></Box></Box>;
        $[37] = t1;
      } else {
        t1 = $[37];
      }
      return t1;
    }

    case "about_to_retry": {
      let t1;
      if ($[38] === Symbol.for("react.memo_cache_sentinel")) {
        t1 = <Box flexDirection="column" gap={1}><Text color="permission">正在重试…</Text></Box>;
        $[38] = t1;
      } else {
        t1 = $[38];
      }
      return t1;
    }

    case "success": {
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

    case "error": {
      let t1;
      if ($[44] !== oauthStatus.message) {
        t1 = <Text color="error">OAuth 错误：{oauthStatus.message}</Text>;
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
      return null;
  }
}