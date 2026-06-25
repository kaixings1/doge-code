import { c as _c } from "react/compiler-runtime";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js';
import { installOAuthTokens } from '../cli/handlers/auth.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { setClipboard } from '../ink/termio/osc.js';
import { useTerminalNotification } from '../ink/useTerminalNotification.js';
import { Box, Link, Text, useInput } from '../ink.js';
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
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logForDebugging } from '../utils/debug.js';
import { type PresetEndpoint, ALL_PRESETS, type CompatibleApiProvider } from '../constants/presets.js';

type Props = {
  onDone(): void;
  startingMessage?: string;
  mode?: 'login' | 'setup-token';
  forceLoginMethod?: 'claudeai' | 'console';
};

type CompatibleApiProvider = 'anthropic' | 'openai';

type OAuthStatus =
  | { state: 'idle' }
  | { state: 'provider_select' }
  | {
      state: 'custom_config';
      provider: CompatibleApiProvider;
      step: 'baseURL' | 'apiKey' | 'model' | 'model_input';
    }
  | { state: 'apikey_confirm'; apiKey: string; savedApiKeys?: string[] }
  | { state: 'platform_setup' }
  | { state: 'ready_to_start' }
  | { state: 'waiting_for_login'; url: string }
  | { state: 'creating_api_key' }
  | { state: 'about_to_retry'; nextState: OAuthStatus }
  | { state: 'success'; token?: string }
  | { state: 'error'; message: string; toRetry?: OAuthStatus };

const PASTE_HERE_MSG = '如果提示，请在此处粘贴代码 > ';

const PRESET_ENDPOINTS = ALL_PRESETS;

export function ConsoleOAuthFlow({
  onDone,
  startingMessage,
  mode = 'login',
  forceLoginMethod: forceLoginMethodProp,
}: Props) {
  const settings = getSettings_DEPRECATED() || {};
  const forceLoginMethod = forceLoginMethodProp ?? settings.forceLoginMethod;
  const orgUUID = settings.forceLoginOrgUUID;
  const forcedMethodMessage =
    forceLoginMethod === 'claudeai'
      ? '登录方式已预选择：订阅方案（Claude Pro/Max）'
      : forceLoginMethod === 'console'
        ? '登录方式已预选择：API 使用量计费（Anthropic Console）'
        : null;

  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>(() => {
    if (mode === 'setup-token') return { state: 'ready_to_start' };
    if (forceLoginMethod === 'claudeai' || forceLoginMethod === 'console')
      return { state: 'ready_to_start' };
    return { state: 'provider_select' };
  });

  const safeOauthStatus = oauthStatus ?? { state: 'provider_select' as const };
  const persistedCustomApiEndpoint = useMemo(() => readCustomApiStorage() ?? {}, []);
  const persistedProvider = persistedCustomApiEndpoint.provider;
  const terminal = useTerminalNotification();

  const [compatibleApiProvider, setCompatibleApiProvider] = useState<CompatibleApiProvider>(
    persistedProvider ?? 'openai',
  );
  const [pastedCode, setPastedCode] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const [customBaseURL, setCustomBaseURL] = useState(
    persistedCustomApiEndpoint.baseURL || '',
  );
  const initialApiKey = (() => {
    const stored = persistedCustomApiEndpoint.apiKey;
    if (stored) return stored;
    return '';
  })();
  const [customApiKey, setCustomApiKey] = useState(initialApiKey);
  const [customModel, setCustomModel] = useState(
    persistedCustomApiEndpoint.model || '',
  );
  const [oauthService] = useState(() => new OAuthService());
  const [loginWithClaudeAi, setLoginWithClaudeAi] = useState(
    () => mode === 'setup-token' || forceLoginMethod === 'claudeai',
  );
  const [showPastePrompt, setShowPastePrompt] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [isCustomInputPasting, setIsCustomInputPasting] = useState(false);
  const textInputColumns = useTerminalSize().columns - PASTE_HERE_MSG.length - 1;
  const [currentPresetName, setCurrentPresetName] = useState<string>('');

  const [presetsVersion, setPresetsVersion] = useState(0);
  const savedPresets = useMemo(() => listSavedPresets(), [presetsVersion]);
  const refreshPresets = useCallback(() => setPresetsVersion((v) => v + 1), []);

  const [apiKeySubStep, setApiKeySubStep] = useState<'select' | 'edit'>('select');
  const [editingApiKey, setEditingApiKey] = useState('');
  const [originalApiKeyForDelete, setOriginalApiKeyForDelete] = useState('');

  // 新增：模型编辑状态
  const [modelSubStep, setModelSubStep] = useState<'select' | 'edit'>('select');
  const [editingModel, setEditingModel] = useState('');
  const [originalModelForDelete, setOriginalModelForDelete] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);

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

  useKeybinding(
    'confirm:yes',
    () => {
      logEvent('tengu_oauth_success', { loginWithClaudeAi });
      onDone();
    },
    { context: 'Confirmation', isActive: safeOauthStatus.state === 'success' && mode !== 'setup-token' },
  );

  useKeybinding(
    'confirm:yes',
    () => setOAuthStatus({ state: 'idle' }),
    { context: 'Confirmation', isActive: safeOauthStatus.state === 'platform_setup' },
  );

  useKeybinding(
    'confirm:yes',
    () => {
      if (safeOauthStatus.state === 'error' && safeOauthStatus.toRetry) {
        setPastedCode('');
        setOAuthStatus({ state: 'about_to_retry', nextState: safeOauthStatus.toRetry });
      }
    },
    { context: 'Confirmation', isActive: safeOauthStatus.state === 'error' && !!safeOauthStatus.toRetry },
  );

  useEffect(() => {
    if (
      pastedCode === 'c' &&
      safeOauthStatus.state === 'waiting_for_login' &&
      showPastePrompt &&
      !urlCopied
    ) {
      void setClipboard(safeOauthStatus.url).then((raw) => {
        if (raw) process.stdout.write(raw);
        setUrlCopied(true);
        setTimeout(setUrlCopied, 2000, false);
      });
      setPastedCode('');
    }
  }, [pastedCode, safeOauthStatus, showPastePrompt, urlCopied]);

  const addCurrentApiKeyToSaved = useCallback(
    (baseURL: string, apiKey: string) => {
      if (!apiKey.trim()) return;
      let existingConfig = savedPresets.find((p) => p.config.baseURL === baseURL)?.config;
      if (!existingConfig) {
        existingConfig = {
          baseURL,
          provider: compatibleApiProvider,
          apiKey: '',
          savedApiKeys: [],
          model: customModel,
          savedModels: [],
        };
      }
      const savedKeys = existingConfig.savedApiKeys || [];
      if (!savedKeys.includes(apiKey) && existingConfig.apiKey !== apiKey) {
        const updatedSavedKeys = [...savedKeys, apiKey];
        writeCustomApiStorage(
          { ...existingConfig, savedApiKeys: updatedSavedKeys },
          currentPresetName || baseURL,
        );
        refreshPresets();
      }
    },
    [savedPresets, compatibleApiProvider, customModel, currentPresetName, refreshPresets],
  );

  const persistCustomEndpoint = useCallback(() => {
    const nextBaseURL = customBaseURL.trim();
    const nextApiKey = customApiKey.trim();
    const nextModel = customModel.trim();
    const normalizedKey = nextApiKey ? normalizeApiKeyForConfig(nextApiKey) : null;
    const nextSavedModels = nextModel
      ? [...new Set([...(persistedCustomApiEndpoint.savedModels ?? []), nextModel])]
      : persistedCustomApiEndpoint.savedModels ?? [];

    let existingSavedApiKeys: string[] = [];
    const existingPreset = savedPresets.find((p) => p.config.baseURL === nextBaseURL);
    if (existingPreset) {
      existingSavedApiKeys = existingPreset.config.savedApiKeys || [];
    }
    let updatedSavedApiKeys = [...existingSavedApiKeys];
    if (
      nextApiKey &&
      !updatedSavedApiKeys.includes(nextApiKey) &&
      existingPreset?.config.apiKey !== nextApiKey
    ) {
      updatedSavedApiKeys.push(nextApiKey);
    }

    let nameToSave = currentPresetName?.trim();
    if (!nameToSave) {
      const saved = listSavedPresets().find((p) => p.config.baseURL === nextBaseURL);
      nameToSave = saved?.name || 'custom';
    }

    // 不修改环境变量，只写入文件
    saveGlobalConfig((current) => ({
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
            rejected: (current.customApiKeyResponses?.rejected ?? []).filter(
              (key) => key !== normalizedKey,
            ),
          }
        : current.customApiKeyResponses,
    }));
    writeCustomApiStorage(
      {
        provider: compatibleApiProvider,
        baseURL: nextBaseURL,
        apiKey: nextApiKey,
        model: nextModel,
        savedModels: nextSavedModels,
        savedApiKeys: updatedSavedApiKeys,
      },
      nameToSave,
    );
    refreshPresets();
  }, [
    compatibleApiProvider,
    customApiKey,
    customBaseURL,
    customModel,
    persistedCustomApiEndpoint.savedModels,
    currentPresetName,
    savedPresets,
    refreshPresets,
  ]);

  const handleSubmitCustomConfig = useCallback(
    (value: string) => {
      if (safeOauthStatus.state !== 'custom_config') return;

      if (safeOauthStatus.step === 'baseURL') {
        const nextValue = value.trim();
        if (!nextValue) {
          setOAuthStatus({
            state: 'error',
            message: '兼容地址不能为空',
            toRetry: { state: 'custom_config', provider: safeOauthStatus.provider, step: 'baseURL' },
          });
          return;
        }
        setCustomBaseURL(nextValue);
        setCursorOffset(0);

        let candidateURL = nextValue;
        const isOpenAIPreset = PRESET_ENDPOINTS.some((p) => p.provider === 'openai' && !p.apiKeyRequired);
        if (
          isOpenAIPreset &&
          !candidateURL.includes('/chat/completions') &&
          !candidateURL.endsWith('/v1')
        ) {
          candidateURL = candidateURL.replace(/\/$/, '') + '/v1/chat/completions';
        }
        const matchedPreset = PRESET_ENDPOINTS.find(
          (p) => p.baseURL === candidateURL || candidateURL.startsWith(p.baseURL.replace(/\/+$/, '')),
        );

        if (matchedPreset) {
          setCustomApiKey('');
          setCustomModel(matchedPreset.defaultModel);
          setCompatibleApiProvider(matchedPreset.provider);
          setCurrentPresetName(matchedPreset.label);
          writeCustomApiStorage(
            {
              provider: matchedPreset.provider,
              baseURL: matchedPreset.baseURL,
              apiKey: '',
              model: matchedPreset.defaultModel,
              savedModels: [matchedPreset.defaultModel],
              savedApiKeys: [],
            },
            matchedPreset.label,
          );
          refreshPresets();
          // 统一进入 API Key 确认步骤
          setOAuthStatus({
            state: 'apikey_confirm',
            apiKey: '',
            savedApiKeys: [],
          });
        } else {
          setOAuthStatus({
            state: 'apikey_confirm',
            apiKey: customApiKey || '',
            savedApiKeys: [],
          });
        }
        return;
      }

      if (safeOauthStatus.step === 'apiKey') {
        const nextValue = value.trim();
        setCustomApiKey(nextValue);
        setCursorOffset(0);
        if (nextValue) addCurrentApiKeyToSaved(customBaseURL, nextValue);
        setOAuthStatus({
          state: 'custom_config',
          provider: compatibleApiProvider,
          step: 'model',
        });
        return;
      }

      // model 或 model_input 步骤
      const nextModel = value.trim();
      if (!nextModel) return;
      setCustomModel(nextModel);
      // 不设置环境变量，只保存到文件
      let targetPresetName = currentPresetName?.trim();
      if (!targetPresetName) {
        const existing = savedPresets.find((p) => p.config.baseURL === customBaseURL);
        targetPresetName = existing?.name || `custom-${Date.now()}`;
      }
      const targetConfig = readCustomApiStorage(targetPresetName);
      const updatedSavedModels = nextModel
        ? [...new Set([...(targetConfig.savedModels ?? []), nextModel])]
        : targetConfig.savedModels ?? [];
      writeCustomApiStorage(
        {
          ...targetConfig,
          baseURL: customBaseURL,
          apiKey: customApiKey,
          model: nextModel,
          savedModels: updatedSavedModels,
          provider: compatibleApiProvider,
          savedApiKeys: [...new Set([...(targetConfig.savedApiKeys || []), customApiKey])],
        },
        targetPresetName,
      );
      refreshPresets();

      setOAuthStatus({ state: 'success' });
      void sendNotification(
        {
          message: '兼容端点配置完成',
          notificationType: 'auth_success',
        },
        terminal,
      );
    },
    [
      safeOauthStatus,
      terminal,
      customBaseURL,
      customApiKey,
      compatibleApiProvider,
      customModel,
      addCurrentApiKeyToSaved,
      refreshPresets,
      savedPresets,
    ],
  );

  async function handleSubmitCode(value: string, url: string) {
    try {
      const [authorizationCode, state] = value.split('#');
      if (!authorizationCode || !state) {
        setOAuthStatus({
          state: 'error',
          message: '代码无效。请确保已复制完整代码',
          toRetry: { state: 'waiting_for_login', url },
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
        toRetry: { state: 'waiting_for_login', url },
      });
    }
  }

  const startOAuth = useCallback(async () => {
    try {
      logEvent('tengu_oauth_flow_start', { loginWithClaudeAi });
      const result = await oauthService
        .startOAuthFlow(
          async (url_0) => {
            setOAuthStatus({ state: 'waiting_for_login', url: url_0 });
            setTimeout(setShowPastePrompt, 3000, true);
          },
          {
            loginWithClaudeAi,
            inferenceOnly: mode === 'setup-token',
            expiresIn: mode === 'setup-token' ? 365 * 24 * 60 * 60 : undefined,
            orgUUID,
          },
        )
        .catch((err_1) => {
          const isTokenExchangeError = err_1.message.includes('Token exchange failed');
          const sslHint_0 = getSSLErrorHint(err_1);
          setOAuthStatus({
            state: 'error',
            message: sslHint_0 ?? (isTokenExchangeError ? '交换授权码失败。请重试。' : err_1.message),
            toRetry: mode === 'setup-token' ? { state: 'ready_to_start' } : { state: 'idle' },
          });
          logEvent('tengu_oauth_token_exchange_error', {
            error: err_1.message,
            ssl_error: sslHint_0 !== null,
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
        void sendNotification(
          { message: 'Claude Code 登录成功', notificationType: 'auth_success' },
          terminal,
        );
      }
    } catch (err_0) {
      const errorMessage = (err_0 as Error).message;
      const sslHint = getSSLErrorHint(err_0);
      setOAuthStatus({
        state: 'error',
        message: sslHint ?? errorMessage,
        toRetry: { state: mode === 'setup-token' ? 'ready_to_start' : 'idle' },
      });
      logEvent('tengu_oauth_error', {
        error: errorMessage as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ssl_error: sslHint !== null,
      });
    }
  }, [oauthService, setShowPastePrompt, loginWithClaudeAi, mode, orgUUID, terminal]);

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
    return () => {
      oauthService.cleanup();
    };
  }, [oauthService]);

  const handleBackspace = useCallback(() => {
    const status = safeOauthStatus;
    const isTextInputActive =
      (status.state === 'custom_config' &&
        (status.step === 'baseURL' || status.step === 'apiKey' || status.step === 'model_input')) ||
      (status.state === 'waiting_for_login' && showPastePrompt) ||
      (status.state === 'apikey_confirm' && apiKeySubStep === 'edit') ||
      (status.state === 'custom_config' && status.step === 'model' && modelSubStep === 'edit' && isEditingName);
    if (isTextInputActive) return;

    let prevState: OAuthStatus | null = null;

    switch (status.state) {
      case 'provider_select':
        break;
      case 'idle':
        break;
      case 'custom_config':
        if (status.step === 'baseURL') prevState = { state: 'provider_select' };
        else if (status.step === 'apiKey')
          prevState = { state: 'custom_config', provider: status.provider, step: 'baseURL' };
        else if (status.step === 'model') {
          if (modelSubStep === 'edit') {
            setModelSubStep('select');
            setEditingModel('');
            setOriginalModelForDelete('');
            setIsEditingName(false);
            return;
          } else {
            // 从模型列表返回到 API Key 确认步骤
            prevState = { state: 'apikey_confirm', apiKey: customApiKey, savedApiKeys: [] };
          }
        } else if (status.step === 'model_input')
          prevState = { state: 'custom_config', provider: status.provider, step: 'model' };
        break;
      case 'apikey_confirm':
        if (apiKeySubStep === 'select') {
          if (customBaseURL.trim())
            prevState = { state: 'custom_config', provider: compatibleApiProvider, step: 'baseURL' };
          else prevState = { state: 'provider_select' };
        } else if (apiKeySubStep === 'edit') {
          setApiKeySubStep('select');
          setEditingApiKey('');
          setOriginalApiKeyForDelete('');
          return;
        }
        break;
      case 'waiting_for_login':
        prevState = { state: 'idle' };
        break;
      case 'platform_setup':
        prevState = { state: 'idle' };
        break;
      case 'error':
        prevState = status.toRetry ? status.toRetry : { state: 'idle' };
        break;
      case 'creating_api_key':
        prevState = { state: 'waiting_for_login', url: '' };
        break;
      case 'about_to_retry':
      case 'success':
        break;
      default:
        break;
    }

    if (prevState) {
      setPastedCode('');
      setShowPastePrompt(false);
      setUrlCopied(false);
      setApiKeySubStep('select');
      setEditingApiKey('');
      setOriginalApiKeyForDelete('');
      setModelSubStep('select');
      setEditingModel('');
      setOriginalModelForDelete('');
      setIsEditingName(false);
      setOAuthStatus(prevState);
    }
  }, [
    safeOauthStatus,
    showPastePrompt,
    apiKeySubStep,
    customBaseURL,
    customApiKey,
    compatibleApiProvider,
    modelSubStep,
    isEditingName,
  ]);

  useInput((input, key) => {
    if (key.backspace) handleBackspace();
  });

  return (
    <Box flexDirection="column" gap={1}>
      {safeOauthStatus.state === 'waiting_for_login' && showPastePrompt && (
        <Box flexDirection="column" key="urlToCopy" gap={1} paddingBottom={1}>
          <Box paddingX={1}>
            <Text dimColor>浏览器未打开？使用下方 URL 登录</Text>
            {urlCopied ? (
              <Text color="success">(已复制!)</Text>
            ) : (
              <Text dimColor>
                <KeyboardShortcutHint shortcut="c" action="copy" parens />
              </Text>
            )}
          </Box>
          <Link url={safeOauthStatus.url}>
            <Text dimColor>{safeOauthStatus.url}</Text>
          </Link>
        </Box>
      )}
      {mode === 'setup-token' && safeOauthStatus.state === 'success' && safeOauthStatus.token && (
        <Box key="tokenOutput" flexDirection="column" gap={1} paddingTop={1}>
          <Text color="success">✓ 长期身份验证令牌创建成功！</Text>
          <Box flexDirection="column" gap={1}>
            <Text>你的 OAuth 令牌（有效期 1 年）：</Text>
            <Text color="warning">{safeOauthStatus.token}</Text>
            <Text dimColor>请安全存储此令牌。你将无法再次查看它。</Text>
            <Text dimColor>
              通过设置以下环境变量使用此令牌：export CLAUDE_CODE_OAUTH_TOKEN=&lt;token&gt;
            </Text>
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
          currentPresetName={currentPresetName}
          terminal={terminal}
          apiKeySubStep={apiKeySubStep}
          setApiKeySubStep={setApiKeySubStep}
          editingApiKey={editingApiKey}
          setEditingApiKey={setEditingApiKey}
          originalApiKeyForDelete={originalApiKeyForDelete}
          setOriginalApiKeyForDelete={setOriginalApiKeyForDelete}
          modelSubStep={modelSubStep}
          setModelSubStep={setModelSubStep}
          editingModel={editingModel}
          setEditingModel={setEditingModel}
          originalModelForDelete={originalModelForDelete}
          setOriginalModelForDelete={setOriginalModelForDelete}
          isEditingName={isEditingName}
          setIsEditingName={setIsEditingName}
          onGoBack={handleBackspace}
          refreshPresets={refreshPresets}
          onDone={onDone}
        />
      </Box>
    </Box>
  );
}

type OAuthStatusMessageProps = {
  savedPresets: { name: string; config: any }[];
  setCurrentPresetName: (name: string) => void;
  currentPresetName: string;
  terminal: ReturnType<typeof useTerminalNotification>;
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
  apiKeySubStep: 'select' | 'edit';
  setApiKeySubStep: (step: 'select' | 'edit') => void;
  editingApiKey: string;
  setEditingApiKey: (key: string) => void;
  originalApiKeyForDelete: string;
  setOriginalApiKeyForDelete: (key: string) => void;
  modelSubStep: 'select' | 'edit';
  setModelSubStep: (step: 'select' | 'edit') => void;
  editingModel: string;
  setEditingModel: (model: string) => void;
  originalModelForDelete: string;
  setOriginalModelForDelete: (model: string) => void;
  isEditingName: boolean;
  setIsEditingName: (v: boolean) => void;
  onGoBack: () => void;
  refreshPresets: () => void;
  onDone: () => void;
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
    currentPresetName,
    terminal,
    apiKeySubStep,
    setApiKeySubStep,
    editingApiKey,
    setEditingApiKey,
    originalApiKeyForDelete,
    setOriginalApiKeyForDelete,
    modelSubStep,
    setModelSubStep,
    editingModel,
    setEditingModel,
    originalModelForDelete,
    setOriginalModelForDelete,
    isEditingName,
    setIsEditingName,
    onGoBack,
    refreshPresets,
    onDone,
  } = t0;

  // 删除 API Key
  const deleteCurrentApiKey = useCallback(() => {
    const keyToDelete = originalApiKeyForDelete;
    if (!keyToDelete) return;

    const currentBaseURL = customBaseURL.replace(/\/+$/, '').toLowerCase();
    const preset = savedPresets.find(
      (p) => p.config.baseURL?.replace(/\/+$/, '').toLowerCase() === currentBaseURL,
    );
    if (!preset) return;

    const config = preset.config;
    const savedKeys = config.savedApiKeys || [];
    const updatedKeys = savedKeys.filter((k) => k !== keyToDelete);
    const isActiveKey = config.apiKey === keyToDelete;
    const newActiveKey = isActiveKey ? updatedKeys[0] || '' : config.apiKey;

    writeCustomApiStorage({ ...config, savedApiKeys: updatedKeys, apiKey: newActiveKey }, preset.name);
    if (isActiveKey) {
      setCustomApiKey(newActiveKey);
    }
    refreshPresets();
    setEditingApiKey('');
    setOriginalApiKeyForDelete('');
    setApiKeySubStep('select');
  }, [
    originalApiKeyForDelete,
    customBaseURL,
    savedPresets,
    setCustomApiKey,
    setEditingApiKey,
    setOriginalApiKeyForDelete,
    setApiKeySubStep,
    refreshPresets,
  ]);

  // 删除模型
  const deleteCurrentModel = useCallback(() => {
    const modelToDelete = originalModelForDelete?.trim();
    if (!modelToDelete) {
      setModelSubStep('select');
      setEditingModel('');
      setOriginalModelForDelete('');
      setIsEditingName(false);
      return;
    }

    const currentBaseURL = customBaseURL.replace(/\/+$/, '').toLowerCase();
    const preset = savedPresets.find((p) => {
      const presetBaseURL = p.config.baseURL?.replace(/\/+$/, '').toLowerCase();
      return presetBaseURL === currentBaseURL && p.config.provider === compatibleApiProvider;
    });

    if (!preset) {
      setModelSubStep('select');
      setEditingModel('');
      setOriginalModelForDelete('');
      setIsEditingName(false);
      return;
    }

    const config = preset.config;
    const savedModels: string[] = config.savedModels || [];
    const normalizedDelete = modelToDelete.toLowerCase();
    const updatedModels = savedModels.filter((m) => m.trim().toLowerCase() !== normalizedDelete);

    if (savedModels.length === updatedModels.length) {
      sendNotification(
        { message: `模型 "${modelToDelete}" 未找到，可能已被删除`, notificationType: 'info' },
        terminal,
      );
      setModelSubStep('select');
      setEditingModel('');
      setOriginalModelForDelete('');
      setIsEditingName(false);
      refreshPresets();
      return;
    }

    const currentActiveModel = config.model?.trim().toLowerCase();
    const isActiveModel = currentActiveModel === normalizedDelete;
    let newActiveModel = isActiveModel ? updatedModels[0] || '' : config.model;

    if (!newActiveModel) {
      const matchedPreset = PRESET_ENDPOINTS.find(
        (p) =>
          p.baseURL.replace(/\/+$/, '').toLowerCase() === currentBaseURL &&
          p.provider === compatibleApiProvider,
      );
      newActiveModel = matchedPreset?.defaultModel || '';
    }

    writeCustomApiStorage(
      {
        ...config,
        savedModels: updatedModels,
        model: newActiveModel,
      },
      preset.name,
    );

    if (isActiveModel) {
      setCustomModel(newActiveModel);
    }

    refreshPresets();
    setTimeout(() => refreshPresets(), 50);
    setEditingModel('');
    setOriginalModelForDelete('');
    setModelSubStep('select');
    setIsEditingName(false);

    sendNotification({ message: `模型 "${modelToDelete}" 已删除`, notificationType: 'info' }, terminal);
  }, [
    originalModelForDelete,
    customBaseURL,
    compatibleApiProvider,
    savedPresets,
    setCustomModel,
    refreshPresets,
    setEditingModel,
    setOriginalModelForDelete,
    setModelSubStep,
    terminal,
  ]);

  // 键盘监听：Ctrl+D 删除 API Key
  useInput(
    (input, key) => {
      if (oauthStatus.state === 'apikey_confirm' && apiKeySubStep === 'edit' && key.ctrl && (input === 'd' || input === 'D')) {
        deleteCurrentApiKey();
      }
    },
    {
      isActive: oauthStatus.state === 'apikey_confirm' && apiKeySubStep === 'edit',
    },
  );

  switch (oauthStatus.state) {
    case 'provider_select': {
      const activePresetName2 = (() => {
        try {
          const configPath = (() => {
            const envPath = process.env.DOGE_API_JSON;
            if (envPath && typeof envPath === 'string' && envPath.trim()) {
              return path.resolve(envPath.trim());
            }
            return path.join(process.cwd(), '.doge', 'api.json');
          })();
          const p = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          return p.activePreset;
        } catch {
          return null;
        }
      })();
      const savedOptions = savedPresets.map(({ name, config }) => ({
        label: (
          <Text>
            {name === activePresetName2 ? <Text color="green">▶ </Text> : null}
            {name} · <Text dimColor>{config.baseURL}</Text> ({config.model || '无默认模型'})
          </Text>
        ),
        value: `saved:${name}`,
      }));
      const generalOptions = [
        {
          label: (
            <Text>
              类 Anthropic API · <Text dimColor>直接使用与 `/v1/messages` 兼容的接口</Text>
            </Text>
          ),
          value: 'anthropic',
        },
        {
          label: (
            <Text>
              类 OpenAI API · <Text dimColor>将 Anthropic Messages 转换为 Chat Completions</Text>
            </Text>
          ),
          value: 'openai',
        },
      ];
      const presetOptions = PRESET_ENDPOINTS.map((preset, index) => ({
        label: (
          <Text>
            {preset.label}{' '}
            <Text dimColor={true}>({preset.baseURL})</Text>
          </Text>
        ),
        value: `preset:${index}`,
      }));
      const allOptions = [...savedOptions, ...generalOptions, ...presetOptions];
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold={true}>选择模型 API 格式</Text>
          <Text>
            Claude Code 内部维护 Anthropic Messages 协议；如果选择 OpenAI，将使用中间层将内部 Messages 请求转换为 Chat
            Completions 请求，再将返回流转换回 Messages 事件。
          </Text>
          {savedOptions.length > 0 && <Text dimColor>已保存的端点（一键切换，无需重新输入 Key）：</Text>}
          <Box>
            <Select
              options={allOptions}
              onChange={(value) => {
                if (typeof value === 'string' && value.startsWith('saved:')) {
                  const presetName = value.slice(6);
                  logForDebugging('[OAuthFlow] switching to saved preset: ' + presetName, { level: 'debug' });
                  const ok = switchActivePreset(presetName);
                  if (!ok) return;
                  const config = readCustomApiStorage(presetName);
                  logForDebugging('[OAuthFlow] loaded config: ' + JSON.stringify(config), { level: 'debug' });
                  setCustomBaseURL(config.baseURL ?? '');
                  setCustomApiKey(config.apiKey ?? '');
                  setCustomModel(config.model ?? '');
                  setCompatibleApiProvider(config.provider || 'openai');
                  setCurrentPresetName(presetName);
                  refreshPresets();
                  setTimeout(() => refreshPresets(), 50);
                  setOAuthStatus({
                    state: 'apikey_confirm',
                    apiKey: config.apiKey || '',
                    savedApiKeys: config.savedApiKeys || [],
                  });
                } else if (typeof value === 'string' && value.startsWith('preset:')) {
                  const idx = parseInt(value.split(':')[1], 10);
                  const preset = PRESET_ENDPOINTS[idx];
                  logForDebugging('[OAuthFlow] selected preset endpoint:', preset.label, preset.baseURL);
                  if (!preset) return;
                  setCustomBaseURL(preset.baseURL);
                  setCustomModel(preset.defaultModel);
                  setCompatibleApiProvider(preset.provider);
                  setCurrentPresetName(preset.label);
                  writeCustomApiStorage(
                    {
                      provider: preset.provider,
                      baseURL: preset.baseURL,
                      apiKey: '',
                      model: preset.defaultModel,
                      savedModels: [preset.defaultModel],
                      savedApiKeys: [],
                    },
                    preset.label,
                  );
                  refreshPresets();
                  setOAuthStatus({
                    state: 'apikey_confirm',
                    apiKey: '',
                    savedApiKeys: [],
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

    case 'custom_config': {
      const isOpenAIProvider = oauthStatus.provider === 'openai';
      const currentStep = oauthStatus.step;

      // 模型选择步骤
      if (currentStep === 'model') {
        const currentBaseURL = customBaseURL || readCustomApiStorage().baseURL || '';
        const matchedPreset = PRESET_ENDPOINTS.find(
          (p) => p.baseURL === currentBaseURL || currentBaseURL.startsWith(p.baseURL.replace(/\/+$/, '')),
        );
        const presetDefaultModel = matchedPreset?.defaultModel?.trim() || '';

        const allPresets = listSavedPresets();
        const savedModels = allPresets
          .filter(p => p.config.baseURL && p.config.baseURL.replace(/\/+$/, '').toLowerCase() === currentBaseURL.replace(/\/+$/, '').toLowerCase())
          .flatMap(p => p.config.savedModels || []);
        
        let allModelCandidates = [...savedModels];
        if (presetDefaultModel && !allModelCandidates.some(m => m.trim().toLowerCase() === presetDefaultModel.toLowerCase())) {
          allModelCandidates.push(presetDefaultModel);
        }
        const seen = new Map<string, string>();
        const uniqueModels = allModelCandidates.filter(m => {
          if (typeof m !== 'string' || !m.trim()) return false;
          const key = m.trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.set(key, m.trim());
          return true;
        });

        const currentModel = customModel || readCustomApiStorage().model || '';

        if (modelSubStep === 'edit') {
          const modelNameDisplay =
            editingModel.length > 30
              ? `${editingModel.slice(0, 20)}...${editingModel.slice(-10)}`
              : editingModel;

          if (isEditingName) {
            return (
              <Box flexDirection="column" gap={1} marginTop={1}>
                <Text bold>修改模型名称</Text>
                <TextInput
                  value={editingModel}
                  onChange={setEditingModel}
                  onSubmit={(val) => {
                    const finalModel = val.trim();
                    if (finalModel) {
                      handleSubmitCustomConfig(finalModel);
                    }
                    setIsEditingName(false);
                  }}
                  cursorOffset={cursorOffset}
                  onChangeCursorOffset={setCursorOffset}
                  columns={Math.max(30, textInputColumns - 4)}
                  focus
                  showCursor
                  placeholder="输入新的模型名称"
                />
                <Text dimColor>按 Enter 保存并返回</Text>
              </Box>
            );
          }

          return (
            <Box flexDirection="column" gap={1} marginTop={1}>
              <Text bold>管理模型</Text>
              <Text>当前模型：{modelNameDisplay}</Text>
              <Select
                options={[
                  { label: <Text color="success">使用该模型</Text>, value: 'use' },
                  { label: <Text>修改模型名称</Text>, value: 'rename' },
                  { label: <Text color="error">删除该模型</Text>, value: 'delete' },
                  { label: <Text>取消</Text>, value: 'cancel' },
                ]}
                onChange={(value) => {
                  switch (value) {
                    case 'use':
                      handleSubmitCustomConfig(editingModel.trim());
                      break;
                    case 'rename':
                      setIsEditingName(true);
                      break;
                    case 'delete':
                      deleteCurrentModel();
                      break;
                    case 'cancel':
                      setModelSubStep('select');
                      setEditingModel('');
                      setOriginalModelForDelete('');
                      break;
                  }
                }}
              />
              <Text dimColor>使用 ↑↓ 选择操作，按 Enter 执行</Text>
            </Box>
          );
        }

        const modelOptions = uniqueModels.map(m => ({
          label: <Text>{m === currentModel ? <Text color="green">✓ </Text> : null}{m}</Text>,
          value: m,
        }));
        modelOptions.push({ label: <Text bold>· 手动输入模型名称</Text>, value: '__manual__' });

        return (
          <Box flexDirection="column" gap={1} marginTop={1}>
            <Text bold>选择模型</Text>
            <Text dimColor>已保存的模型，按 Enter 进入编辑/删除；或选择手动输入新模型。</Text>
            <Select
              options={modelOptions}
              visibleOptionCount={9}
              onChange={(value) => {
                if (value === '__manual__') {
                  setCustomModel('');
                  setCursorOffset(0);
                  setOAuthStatus({
                    state: 'custom_config',
                    provider: oauthStatus.provider,
                    step: 'model_input',
                  });
                } else {
                  const selectedModel = value as string;
                  setEditingModel(selectedModel);
                  setOriginalModelForDelete(selectedModel);
                  setModelSubStep('edit');
                }
              }}
            />
          </Box>
        );
      }

      if (currentStep === 'model_input') {
        const INPUT_COLUMNS = Math.max(30, textInputColumns - 4);
        return (
          <Box flexDirection="column" gap={1} marginTop={1}>
            <Text bold>输入模型名称</Text>
            <Text dimColor>
              {customModel
                ? '当前选择：' + customModel + '，可直接按 Enter 确认或修改后按 Enter：'
                : '输入模型名称后按 Enter 保存并使用：'}
            </Text>
            <Box flexDirection="row">
              <TextInput
                value={customModel}
                onChange={setCustomModel}
                onSubmit={(v) => {
                  if (v.trim()) {
                    setCursorOffset(0);
                    handleSubmitCustomConfig(v.trim());
                  }
                }}
                cursorOffset={cursorOffset}
                onChangeCursorOffset={setCursorOffset}
                columns={INPUT_COLUMNS}
                focus={true}
                showCursor={true}
                placeholder="输入模型名称后按 Enter"
              />
            </Box>
          </Box>
        );
      }

      // baseURL / apiKey 步骤（fallback，通常不会进入，因为统一走了 apikey_confirm）
      const label =
        oauthStatus.step === 'baseURL'
          ? isOpenAIProvider
            ? '请输入完整的 OpenAI Chat Completions 端点 URL（含路径）：'
            : '请输入完整的 Anthropic Messages 端点 URL（含路径）：'
          : '请输入 API Key：';
      const value = oauthStatus.step === 'baseURL' ? customBaseURL : customApiKey;
      const onChange = oauthStatus.step === 'baseURL' ? setCustomBaseURL : setCustomApiKey;
      const placeholder =
        oauthStatus.step === 'baseURL'
          ? isOpenAIProvider
            ? 'http(s)://你的端点.example.com/v1/chat/completions'
            : 'http(s)://你的端点.example.com/v1/messages'
          : 'sk-...';
      const mask = oauthStatus.step === 'apiKey' ? '*' : undefined;
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>配置兼容接口</Text>
          <Text>
            {compatibleApiProvider === 'openai'
              ? '当前选择：OpenAI Chat Completions 兼容格式'
              : '当前选择：Anthropic Messages 兼容格式'}
          </Text>
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
              focus
              showCursor
              placeholder={placeholder}
              mask={mask}
            />
          </Box>
          <Text dimColor>按 Enter 继续。</Text>
        </Box>
      );
    }

    case 'apikey_confirm': {
      const formatApiKey = (key: string) => {
        if (!key) return '';
        const len = key.length;
        if (len <= 16) return '*'.repeat(len);
        const prefix = key.slice(0, 8);
        const suffix = key.slice(-8);
        const stars = '*'.repeat(len - 16);
        return `${prefix}${stars}${suffix}`;
      };

      const currentBaseURL = customBaseURL.replace(/\/+$/, '').toLowerCase();
      let allMatchingKeys: string[] = [];
      for (const preset of savedPresets) {
        const presetBaseURL = preset.config.baseURL?.replace(/\/+$/, '').toLowerCase();
        if (presetBaseURL === currentBaseURL) {
          if (preset.config.apiKey) allMatchingKeys.push(preset.config.apiKey);
          if (Array.isArray(preset.config.savedApiKeys)) allMatchingKeys.push(...preset.config.savedApiKeys);
        }
      }
      const savedKeys = [...new Set(allMatchingKeys)];

      const submitKeyAndGoToModel = (key: string) => {
        const trimmed = key.trim();
        setCustomApiKey(trimmed);
        setOAuthStatus({
          state: 'custom_config',
          provider: compatibleApiProvider,
          step: 'model',
        });
      };

      if (apiKeySubStep === 'edit') {
        const shortPreview =
          editingApiKey.length > 24
            ? `${editingApiKey.slice(0, 8)}...${editingApiKey.slice(-12)}`
            : editingApiKey;
        return (
          <Box flexDirection="column" gap={1} marginTop={1}>
            <Text bold>确认 API Key</Text>
            <Text dimColor>
              {editingApiKey
                ? `当前 Key：${shortPreview}，可直接按 Enter 确认或修改后按 Enter：`
                : '输入新的 API Key 后按 Enter：'}
            </Text>
            <TextInput
              value={editingApiKey}
              onChange={setEditingApiKey}
              onSubmit={(val) => submitKeyAndGoToModel(val)}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
              columns={textInputColumns}
              focus
              showCursor
              placeholder="sk-..."
            />
            <Text dimColor>
              按 Enter 保存并继续；按 <Text color="error">Ctrl+D</Text> 可删除该 Key；按 Backspace 返回选择列表。
            </Text>
          </Box>
        );
      }

      const selectOptions = [
        ...savedKeys.map((k) => ({ label: <Text>{formatApiKey(k)}</Text>, value: k })),
        { label: <Text color="green">+ 手动输入新 API Key</Text>, value: '__NEW__' },
        { label: <Text color="yellow">跳过（不使用 API Key）</Text>, value: '__SKIP__' },
      ];

      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>选择或输入 API Key</Text>
          <Text dimColor>
            选择已有 Key 后按 Enter 进入编辑确认页面，或选择手动输入新 Key，或选择跳过（不使用 Key）。
          </Text>
          <Select
            options={selectOptions}
            onChange={(selected) => {
              const val = typeof selected === 'string' ? selected : (selected as any)?.value;
              if (val === '__NEW__') {
                setEditingApiKey('');
                setOriginalApiKeyForDelete('');
                setApiKeySubStep('edit');
              } else if (val === '__SKIP__') {
                setCustomApiKey('');
                setOAuthStatus({
                  state: 'custom_config',
                  provider: compatibleApiProvider,
                  step: 'model',
                });
              } else if (val) {
                setEditingApiKey(val);
                setOriginalApiKeyForDelete(val);
                setApiKeySubStep('edit');
              }
            }}
          />
        </Box>
      );
    }

    case 'idle': {
      const t1 = startingMessage ? startingMessage : 'Claude Code 可以使用你的 Claude 订阅或通过 Console 账户按 API 用量计费。';
      let t2;
      if ($[0] !== t1) {
        t2 = <Text bold>{t1}</Text>;
        $[0] = t1;
        $[1] = t2;
      } else {
        t2 = $[1];
      }
      let t3;
      if ($[2] === Symbol.for('react.memo_cache_sentinel')) {
        t3 = <Text>选择登录方式：</Text>;
        $[2] = t3;
      } else {
        t3 = $[2];
      }
      let t4;
      if ($[3] === Symbol.for('react.memo_cache_sentinel')) {
        t4 = {
          label: (
            <Text>
              Claude 账户订阅 · <Text dimColor>Pro、Max、Team 或 Enterprise</Text>
              {'\n'}
            </Text>
          ),
          value: 'claudeai',
        };
        $[3] = t4;
      } else {
        t4 = $[3];
      }
      let t5;
      if ($[4] === Symbol.for('react.memo_cache_sentinel')) {
        t5 = {
          label: (
            <Text>
              Anthropic Console 账户 · <Text dimColor>API 用量计费</Text>
              {'\n'}
            </Text>
          ),
          value: 'console',
        };
        $[4] = t5;
      } else {
        t5 = $[4];
      }
      let t6;
      if ($[5] === Symbol.for('react.memo_cache_sentinel')) {
        t6 = [
          t4,
          t5,
          {
            label: (
              <Text>
                第三方平台 · <Text dimColor>Amazon Bedrock、Microsoft Foundry 或 Vertex AI</Text>
                {'\n'}
              </Text>
            ),
            value: 'platform',
          },
        ];
        $[5] = t6;
      } else {
        t6 = $[5];
      }
      let t7;
      if ($[6] !== setLoginWithClaudeAi || $[7] !== setOAuthStatus) {
        t7 = (
          <Box>
            <Select
              options={t6}
              onChange={(value_0) => {
                if (value_0 === 'platform') {
                  logEvent('tengu_oauth_platform_selected', {});
                  setOAuthStatus({ state: 'platform_setup' });
                } else {
                  setOAuthStatus({ state: 'ready_to_start' });
                  if (value_0 === 'claudeai') {
                    logEvent('tengu_oauth_claudeai_selected', {});
                    setLoginWithClaudeAi(true);
                  } else {
                    logEvent('tengu_oauth_console_selected', {});
                    setLoginWithClaudeAi(false);
                  }
                }
              }}
            />
          </Box>
        );
        $[6] = setLoginWithClaudeAi;
        $[7] = setOAuthStatus;
        $[8] = t7;
      } else {
        t7 = $[8];
      }
      let t8;
      if ($[9] !== t2 || $[10] !== t7) {
        t8 = (
          <Box flexDirection="column" gap={1} marginTop={1}>
            {t2}
            {t3}
            {t7}
          </Box>
        );
        $[9] = t2;
        $[10] = t7;
        $[11] = t8;
      } else {
        t8 = $[11];
      }
      return t8;
    }

    case 'platform_setup': {
      let t1;
      if ($[12] === Symbol.for('react.memo_cache_sentinel')) {
        t1 = <Text bold>使用第三方平台</Text>;
        $[12] = t1;
      } else {
        t1 = $[12];
      }
      let t2, t3;
      if ($[13] === Symbol.for('react.memo_cache_sentinel')) {
        t2 = (
          <Text>
            Claude Code 支持 Amazon Bedrock、Microsoft Foundry 和 Vertex AI。设置所需的环境变量，然后重启 Claude Code。
          </Text>
        );
        t3 = <Text>如果您属于企业组织，请联系管理员获取设置说明。</Text>;
        $[13] = t2;
        $[14] = t3;
      } else {
        t2 = $[13];
        t3 = $[14];
      }
      let t4;
      if ($[15] === Symbol.for('react.memo_cache_sentinel')) {
        t4 = <Text bold>文档：</Text>;
        $[15] = t4;
      } else {
        t4 = $[15];
      }
      let t5;
      if ($[16] === Symbol.for('react.memo_cache_sentinel')) {
        t5 = (
          <Text>
            · Amazon Bedrock:{' '}
            <Link url="https://code.claude.com/docs/en/amazon-bedrock">
              https://code.claude.com/docs/en/amazon-bedrock
            </Link>
          </Text>
        );
        $[16] = t5;
      } else {
        t5 = $[16];
      }
      let t6;
      if ($[17] === Symbol.for('react.memo_cache_sentinel')) {
        t6 = (
          <Text>
            · Microsoft Foundry:{' '}
            <Link url="https://code.claude.com/docs/en/microsoft-foundry">
              https://code.claude.com/docs/en/microsoft-foundry
            </Link>
          </Text>
        );
        $[17] = t6;
      } else {
        t6 = $[17];
      }
      let t7;
      if ($[18] === Symbol.for('react.memo_cache_sentinel')) {
        t7 = (
          <Box flexDirection="column" marginTop={1}>
            {t4}
            {t5}
            {t6}
            <Text>
              · Vertex AI:{' '}
              <Link url="https://code.claude.com/docs/en/google-vertex-ai">
                https://code.claude.com/docs/en/google-vertex-ai
              </Link>
            </Text>
          </Box>
        );
        $[18] = t7;
      } else {
        t7 = $[18];
      }
      let t8;
      if ($[19] === Symbol.for('react.memo_cache_sentinel')) {
        t8 = (
          <Box flexDirection="column" gap={1} marginTop={1}>
            {t1}
            <Box flexDirection="column" gap={1}>
              {t2}
              {t3}
              {t7}
              <Box marginTop={1}>
                <Text dimColor>
                  按 <Text bold>Enter</Text> 返回登录选项。
                </Text>
              </Box>
            </Box>
          </Box>
        );
        $[19] = t8;
      } else {
        t8 = $[19];
      }
      return t8;
    }

    case 'waiting_for_login': {
      let t1;
      if ($[20] !== forcedMethodMessage) {
        t1 = forcedMethodMessage && (
          <Box>
            <Text dimColor>{forcedMethodMessage}</Text>
          </Box>
        );
        $[20] = forcedMethodMessage;
        $[21] = t1;
      } else {
        t1 = $[21];
      }
      let t2;
      if ($[22] !== showPastePrompt) {
        t2 = !showPastePrompt && (
          <Box>
            <Spinner />
            <Text>正在打开浏览器进行登录…</Text>
          </Box>
        );
        $[22] = showPastePrompt;
        $[23] = t2;
      } else {
        t2 = $[23];
      }
      let t3;
      if (
        $[24] !== cursorOffset ||
        $[25] !== handleSubmitCode ||
        $[26] !== oauthStatus.url ||
        $[27] !== pastedCode ||
        $[28] !== setCursorOffset ||
        $[29] !== setPastedCode ||
        $[30] !== showPastePrompt ||
        $[31] !== textInputColumns
      ) {
        t3 = showPastePrompt && (
          <Box>
            <Text>{PASTE_HERE_MSG}</Text>
            <TextInput
              value={pastedCode}
              onChange={setPastedCode}
              onSubmit={(value) => handleSubmitCode(value, oauthStatus.url)}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
              columns={textInputColumns}
              mask="*"
            />
          </Box>
        );
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
        t4 = (
          <Box flexDirection="column" gap={1}>
            {t1}
            {t2}
            {t3}
          </Box>
        );
        $[33] = t1;
        $[34] = t2;
        $[35] = t3;
        $[36] = t4;
      } else {
        t4 = $[36];
      }
      return t4;
    }

    case 'creating_api_key': {
      let t1;
      if ($[37] === Symbol.for('react.memo_cache_sentinel')) {
        t1 = (
          <Box flexDirection="column" gap={1}>
            <Box>
              <Spinner />
              <Text>正在为 Claude Code 创建 API Key…</Text>
            </Box>
          </Box>
        );
        $[37] = t1;
      } else {
        t1 = $[37];
      }
      return t1;
    }

    case 'about_to_retry': {
      let t1;
      if ($[38] === Symbol.for('react.memo_cache_sentinel')) {
        t1 = (
          <Box flexDirection="column" gap={1}>
            <Text color="permission">正在重试…</Text>
          </Box>
        );
        $[38] = t1;
      } else {
        t1 = $[38];
      }
      return t1;
    }

    case 'success': {
      let t1;
      if ($[39] !== mode || $[40] !== oauthStatus.token) {
        t1 =
          mode === 'setup-token' && oauthStatus.token ? null : (
            <>
              {getOauthAccountInfo()?.emailAddress ? (
                <Text dimColor>
                  已登录为 <Text>{getOauthAccountInfo()?.emailAddress}</Text>
                </Text>
              ) : null}
              <Text color="success">
                登录成功。按 <Text bold>Enter</Text> 继续…
              </Text>
            </>
          );
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

    case 'error': {
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
        t2 = oauthStatus.toRetry && (
          <Box marginTop={1}>
            <Text color="permission">
              按 <Text bold>Enter</Text> 重试。
            </Text>
          </Box>
        );
        $[46] = oauthStatus.toRetry;
        $[47] = t2;
      } else {
        t2 = $[47];
      }
      let t3;
      if ($[48] !== t1 || $[49] !== t2) {
        t3 = (
          <Box flexDirection="column" gap={1}>
            {t1}
            {t2}
          </Box>
        );
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