import axios from 'axios';
import { readFile, stat } from 'fs/promises';
import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { getLastAPIRequest } from '../bootstrap/state.js';
import { logEventTo1P } from '../services/analytics/firstPartyEventLogger.js';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../services/analytics/index.js';
import { getLastAssistantMessage, normalizeMessagesForAPI } from '../utils/messages.js';
import type { CommandResultDisplay } from '../commands.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Box, Text, useInput } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { queryHaiku } from '../services/api/claude.js';
import { startsWithApiErrorPrefix } from '../services/api/errors.js';
import type { Message } from '../types/message.js';
import { checkAndRefreshOAuthTokenIfNeeded } from '../utils/auth.js';
import { openBrowser } from '../utils/browser.js';
import { logForDebugging } from '../utils/debug.js';
import { env } from '../utils/env.js';
import { type GitRepoState, getGitState, getIsGit } from '../utils/git.js';
import { getAuthHeaders, getUserAgent } from '../utils/http.js';
import { getInMemoryErrors, logError } from '../utils/log.js';
import { isEssentialTrafficOnly } from '../utils/privacyLevel.js';
import { extractTeammateTranscriptsFromTasks, getTranscriptPath, loadAllSubagentTranscriptsFromDisk, MAX_TRANSCRIPT_READ_BYTES } from '../utils/sessionStorage.js';
import { jsonStringify } from '../utils/slowOperations.js';
import { asSystemPrompt } from '../utils/systemPromptType.js';
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js';
import { Byline } from './design-system/Byline.js';
import { Dialog } from './design-system/Dialog.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import TextInput from './TextInput.js';

// 此值通过测试 URL 长度限制实验得出
const GITHUB_URL_LIMIT = 7250;
const GITHUB_ISSUES_REPO_URL = "external" === 'ant' ? 'https://github.com/anthropics/claude-cli-internal/issues' : 'https://github.com/anthropics/claude-code/issues';
type Props = {
  abortSignal: AbortSignal;
  messages: Message[];
  initialDescription?: string;
  onDone(result: string, options?: {
    display?: CommandResultDisplay;
  }): void;
  backgroundTasks?: {
    [taskId: string]: {
      type: string;
      identity?: {
        agentId: string;
      };
      messages?: Message[];
    };
  };
};
type Step = 'userInput' | 'consent' | 'submitting' | 'done';
type FeedbackData = {
  // latestAssistantMessageId 是最近一次主模型调用返回的消息 ID
  latestAssistantMessageId: string | null;
  message_count: number;
  datetime: string;
  description: string;
  platform: string;
  gitRepo: boolean;
  version: string | null;
  transcript: Message[];
  subagentTranscripts?: {
    [agentId: string]: Message[];
  };
  rawTranscriptJsonl?: string;
};

// 用于脱敏字符串中敏感信息的工具函数
export function redactSensitiveInfo(text: string): string {
  let redacted = text;

  // Anthropic API 密钥 (sk-ant...)，含引号或不含引号
  // 首先处理带引号的情况
  redacted = redacted.replace(/"(sk-ant[^\s"']{24,})"/g, '"[已脱敏_API密钥]"');
  // 然后处理不带引号的情况 - 更通用的模式
  redacted = redacted.replace(
  // eslint-disable-next-line custom-rules/no-lookbehind-regex -- .replace(re, string) on /bug path: no-match returns same string (Object.is)
  /(?<![A-Za-z0-9"'])(sk-ant-?[A-Za-z0-9_-]{10,})(?![A-Za-z0-9"'])/g, '[已脱敏_API密钥]');

  // AWS 密钥 - AWSXXXX 格式 - 添加测试所需的模式
  redacted = redacted.replace(/AWS key: "(AWS[A-Z0-9]{20,})"/g, 'AWS key: "[已脱敏_AWS密钥]"');

  // AWS AKIAXXX 密钥
  redacted = redacted.replace(/(AKIA[A-Z0-9]{16})/g, '[已脱敏_AWS密钥]');

  // Google Cloud 密钥
  redacted = redacted.replace(
  // eslint-disable-next-line custom-rules/no-lookbehind-regex -- 同上
  /(?<![A-Za-z0-9])(AIza[A-Za-z0-9_-]{35})(?![A-Za-z0-9])/g, '[已脱敏_GCP密钥]');

  // Vertex AI 服务账号密钥
  redacted = redacted.replace(
  // eslint-disable-next-line custom-rules/no-lookbehind-regex -- 同上
  /(?<![A-Za-z0-9])([a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com)(?![A-Za-z0-9])/g, '[已脱敏_GCP服务账号]');

  // 请求头中的通用 API 密钥
  redacted = redacted.replace(/(["']?x-api-key["']?\s*[:=]\s*["']?)[^"',\s)}\]]+/gi, '$1[已脱敏_API密钥]');

  // Authorization 请求头及 Bearer 令牌
  redacted = redacted.replace(/(["']?authorization["']?\s*[:=]\s*["']?(bearer\s+)?)[^"',\s)}\]]+/gi, '$1[已脱敏_令牌]');

  // AWS 环境变量
  redacted = redacted.replace(/(AWS[_-][A-Za-z0-9_]+\s*[=:]\s*)["']?[^"',\s)}\]]+["']?/gi, '$1[已脱敏_AWS值]');

  // GCP 环境变量
  redacted = redacted.replace(/(GOOGLE[_-][A-Za-z0-9_]+\s*[=:]\s*)["']?[^"',\s)}\]]+["']?/gi, '$1[已脱敏_GCP值]');

  // 带有密钥的环境变量
  redacted = redacted.replace(/((API[-_]?KEY|TOKEN|SECRET|PASSWORD)\s*[=:]\s*)["']?[^"',\s)}\]]+["']?/gi, '$1[已脱敏]');
  return redacted;
}

// 获取已脱敏的错误日志，移除敏感信息
function getSanitizedErrorLogs(): Array<{
  error?: string;
  timestamp?: string;
}> {
  // 对错误日志进行脱敏以移除任何 API 密钥
  return getInMemoryErrors().map(errorInfo => {
    // 复制一份错误信息以避免修改原始对象
    const errorCopy = {
      ...errorInfo
    } as {
      error?: string;
      timestamp?: string;
    };

    // 如果存在错误信息且为字符串，则进行脱敏
    if (errorCopy && typeof errorCopy.error === 'string') {
      errorCopy.error = redactSensitiveInfo(errorCopy.error);
    }
    return errorCopy;
  });
}
async function loadRawTranscriptJsonl(): Promise<string | null> {
  try {
    const transcriptPath = getTranscriptPath();
    const {
      size
    } = await stat(transcriptPath);
    if (size > MAX_TRANSCRIPT_READ_BYTES) {
      logForDebugging(`跳过读取原始转录记录：文件过大 (${size} 字节)`, {
        level: 'warn'
      });
      return null;
    }
    return await readFile(transcriptPath, 'utf-8');
  } catch {
    return null;
  }
}
export function Feedback({
  abortSignal,
  messages,
  initialDescription,
  onDone,
  backgroundTasks = {}
}: Props): React.ReactNode {
  const [step, setStep] = useState<Step>('userInput');
  const [cursorOffset, setCursorOffset] = useState(0);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [envInfo, setEnvInfo] = useState<{
    isGit: boolean;
    gitState: GitRepoState | null;
  }>({
    isGit: false,
    gitState: null
  });
  const [title, setTitle] = useState<string | null>(null);
  const textInputColumns = useTerminalSize().columns - 4;
  useEffect(() => {
    async function loadEnvInfo() {
      const isGit = await getIsGit();
      let gitState: GitRepoState | null = null;
      if (isGit) {
        gitState = await getGitState();
      }
      setEnvInfo({
        isGit,
        gitState
      });
    }
    void loadEnvInfo();
  }, []);
  const submitReport = useCallback(async () => {
    setStep('submitting');
    setError(null);
    setFeedbackId(null);

    // 获取用于报告的已脱敏错误信息
    const sanitizedErrors = getSanitizedErrorLogs();

    // 从消息数组中提取最后一条助手消息的 ID
    const lastAssistantMessage = getLastAssistantMessage(messages);
    const lastAssistantMessageId = lastAssistantMessage?.requestId ?? null;
    const [diskTranscripts, rawTranscriptJsonl] = await Promise.all([loadAllSubagentTranscriptsFromDisk(), loadRawTranscriptJsonl()]);
    const teammateTranscripts = extractTeammateTranscriptsFromTasks(backgroundTasks);
    const subagentTranscripts = {
      ...diskTranscripts,
      ...teammateTranscripts
    };
    const reportData = {
      latestAssistantMessageId: lastAssistantMessageId,
      message_count: messages.length,
      datetime: new Date().toISOString(),
      description,
      platform: env.platform,
      gitRepo: envInfo.isGit,
      terminal: env.terminal,
      version: MACRO.VERSION,
      transcript: normalizeMessagesForAPI(messages),
      errors: sanitizedErrors,
      lastApiRequest: getLastAPIRequest(),
      ...(Object.keys(subagentTranscripts).length > 0 && {
        subagentTranscripts
      }),
      ...(rawTranscriptJsonl && {
        rawTranscriptJsonl
      })
    };
    const [result, t] = await Promise.all([submitFeedback(reportData, abortSignal), generateTitle(description, abortSignal)]);
    setTitle(t);
    if (result.success) {
      if (result.feedbackId) {
        setFeedbackId(result.feedbackId);
        logEvent('tengu_bug_report_submitted', {
          feedback_id: result.feedbackId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          last_assistant_message_id: lastAssistantMessageId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
        });
        // 仅用于第一方分析：自由文本已获批用于 BigQuery。通过 feedback_id 进行关联。
        logEventTo1P('tengu_bug_report_description', {
          feedback_id: result.feedbackId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          description: redactSensitiveInfo(description) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
        });
      }
      setStep('done');
    } else {
      if (result.isZdrOrg) {
        setError('具有自定义数据保留策略的组织不可用反馈收集。');
      } else {
        setError('无法提交反馈。请稍后重试。');
      }
      // 保留在 userInput 步骤，以便用户在保留已输入内容的情况下重试
      setStep('userInput');
    }
  }, [description, envInfo.isGit, messages]);

  // 处理取消操作 - 将由 Dialog 的自动 Esc 处理调用
  const handleCancel = useCallback(() => {
    // 完成时不允许取消 - 让其他按键关闭对话框
    if (step === 'done') {
      if (error) {
        onDone('提交反馈 / 错误报告时出错', {
          display: 'system'
        });
      } else {
        onDone('反馈 / 错误报告已提交', {
          display: 'system'
        });
      }
      return;
    }
    onDone('反馈 / 错误报告已取消', {
      display: 'system'
    });
  }, [step, error, onDone]);

  // 在文本输入期间，使用 Settings 上下文，只有 Escape（而非 'n'）会触发 confirm:no。
  // 这样可以在文本框中输入 'n' 的同时仍支持按 Escape 取消。
  useKeybinding('confirm:no', handleCancel, {
    context: 'Settings',
    isActive: step === 'userInput'
  });
  useInput((input, key) => {
    // 当步骤完成或发生错误时，允许任意按键关闭对话框
    if (step === 'done') {
      if (key.return && title) {
        // 按下 Enter 时打开 GitHub Issue 创建页面
        const issueUrl = createGitHubIssueUrl(feedbackId ?? '', title, description, getSanitizedErrorLogs());
        void openBrowser(issueUrl);
      }
      if (error) {
        onDone('提交反馈 / 错误报告时出错', {
          display: 'system'
        });
      } else {
        onDone('反馈 / 错误报告已提交', {
          display: 'system'
        });
      }
      return;
    }

    // 当处于 userInput 步骤且存在错误时，允许用户编辑并重试
    // （不因任意按键关闭 - 用户仍可按 Esc 取消）
    if (error && step !== 'userInput') {
      onDone('提交反馈 / 错误报告时出错', {
        display: 'system'
      });
      return;
    }
    if (step === 'consent' && (key.return || input === ' ')) {
      void submitReport();
    }
  });
  return <Dialog title="提交反馈 / 错误报告" onCancel={handleCancel} isCancelActive={step !== 'userInput'} inputGuide={exitState => exitState.pending ? <Text>按 {exitState.keyName} 再次退出</Text> : step === 'userInput' ? <Byline>
            <KeyboardShortcutHint shortcut="Enter" action="继续" />
            <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="取消" />
          </Byline> : step === 'consent' ? <Byline>
            <KeyboardShortcutHint shortcut="Enter" action="提交" />
            <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="取消" />
          </Byline> : null}>
      {step === 'userInput' && <Box flexDirection="column" gap={1}>
          <Text>请在下方描述问题：</Text>
          <TextInput value={description} onChange={value => {
        setDescription(value);
        // 当用户开始编辑时清除错误以允许重试
        if (error) {
          setError(null);
        }
      }} columns={textInputColumns} onSubmit={() => setStep('consent')} onExitMessage={() => onDone('反馈已取消', {
        display: 'system'
      })} cursorOffset={cursorOffset} onChangeCursorOffset={setCursorOffset} showCursor />
          {error && <Box flexDirection="column" gap={1}>
              <Text color="error">{error}</Text>
              <Text dimColor>
                编辑后按 Enter 重试，或按 Esc 取消
              </Text>
            </Box>}
        </Box>}

      {step === 'consent' && <Box flexDirection="column">
          <Text>本报告将包含：</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text>
              - 您的反馈/问题描述:{' '}
              <Text dimColor>{description}</Text>
            </Text>
            <Text>
              - 环境信息:{' '}
              <Text dimColor>
                {env.platform}, {env.terminal}, v{MACRO.VERSION}
              </Text>
            </Text>
            {envInfo.gitState && <Text>
                - Git 仓库信息:{' '}
                <Text dimColor>
                  {envInfo.gitState.branchName}
                  {envInfo.gitState.commitHash ? `, ${envInfo.gitState.commitHash.slice(0, 7)}` : ''}
                  {envInfo.gitState.remoteUrl ? ` @ ${envInfo.gitState.remoteUrl}` : ''}
                  {!envInfo.gitState.isHeadOnRemote && ', 未同步'}
                  {!envInfo.gitState.isClean && ', 有未提交的更改'}
                </Text>
              </Text>}
            <Text>- 当前会话记录</Text>
          </Box>
          <Box marginTop={1}>
            <Text wrap="wrap" dimColor>
              我们将使用您的反馈来调试相关问题或改进 Claude Code 的功能（例如降低未来出现类似问题的风险）。
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text>
              按 <Text bold>Enter</Text> 确认并提交。
            </Text>
          </Box>
        </Box>}

      {step === 'submitting' && <Box flexDirection="row" gap={1}>
          <Text>正在提交报告…</Text>
        </Box>}

      {step === 'done' && <Box flexDirection="column">
          {error ? <Text color="error">{error}</Text> : <Text color="success">感谢您的反馈！</Text>}
          {feedbackId && <Text dimColor>反馈 ID: {feedbackId}</Text>}
          <Box marginTop={1}>
            <Text>按 </Text>
            <Text bold>Enter </Text>
            <Text>
              打开浏览器并起草 GitHub Issue，或按任意键关闭。
            </Text>
          </Box>
        </Box>}
    </Dialog>;
}
export function createGitHubIssueUrl(feedbackId: string, title: string, description: string, errors: Array<{
  error?: string;
  timestamp?: string;
}>): string {
  const sanitizedTitle = redactSensitiveInfo(title);
  const sanitizedDescription = redactSensitiveInfo(description);
  const bodyPrefix = `**Bug 描述**\n${sanitizedDescription}\n\n` + `**环境信息**\n` + `- 平台: ${env.platform}\n` + `- 终端: ${env.terminal}\n` + `- 版本: ${MACRO.VERSION || 'unknown'}\n` + `- 反馈 ID: ${feedbackId}\n` + `\n**错误**\n\`\`\`json\n`;
  const errorSuffix = `\n\`\`\`\n`;
  const errorsJson = jsonStringify(errors);
  const baseUrl = `${GITHUB_ISSUES_REPO_URL}/new?title=${encodeURIComponent(sanitizedTitle)}&labels=user-reported,bug&body=`;
  const truncationNote = `\n**注意:** 内容已被截断。\n`;
  const encodedPrefix = encodeURIComponent(bodyPrefix);
  const encodedSuffix = encodeURIComponent(errorSuffix);
  const encodedNote = encodeURIComponent(truncationNote);
  const encodedErrors = encodeURIComponent(errorsJson);

  // 计算错误信息可用的剩余空间
  const spaceForErrors = GITHUB_URL_LIMIT - baseUrl.length - encodedPrefix.length - encodedSuffix.length - encodedNote.length;

  // 如果仅描述就已超出限制，则截断所有内容
  if (spaceForErrors <= 0) {
    const ellipsis = encodeURIComponent('…');
    const buffer = 50; // 额外的安全余量
    const maxEncodedLength = GITHUB_URL_LIMIT - baseUrl.length - ellipsis.length - encodedNote.length - buffer;
    const fullBody = bodyPrefix + errorsJson + errorSuffix;
    let encodedFullBody = encodeURIComponent(fullBody);
    if (encodedFullBody.length > maxEncodedLength) {
      encodedFullBody = encodedFullBody.slice(0, maxEncodedLength);
      // 避免在 %XX 序列中间截断
      const lastPercent = encodedFullBody.lastIndexOf('%');
      if (lastPercent >= encodedFullBody.length - 2) {
        encodedFullBody = encodedFullBody.slice(0, lastPercent);
      }
    }
    return baseUrl + encodedFullBody + ellipsis + encodedNote;
  }

  // 如果错误信息完全容纳得下，无需截断
  if (encodedErrors.length <= spaceForErrors) {
    return baseUrl + encodedPrefix + encodedErrors + encodedSuffix;
  }

  // 截断错误信息以适应空间（优先保留描述）
  // 直接截取已编码的错误信息，然后修剪以避免在 %XX 序列中间切断
  const ellipsis = encodeURIComponent('…');
  const buffer = 50; // 额外的安全余量
  let truncatedEncodedErrors = encodedErrors.slice(0, spaceForErrors - ellipsis.length - buffer);
  // 如果截断位置处于 % 编码序列中间，则回退到 % 之前
  const lastPercent = truncatedEncodedErrors.lastIndexOf('%');
  if (lastPercent >= truncatedEncodedErrors.length - 2) {
    truncatedEncodedErrors = truncatedEncodedErrors.slice(0, lastPercent);
  }
  return baseUrl + encodedPrefix + truncatedEncodedErrors + ellipsis + encodedSuffix + encodedNote;
}
async function generateTitle(description: string, abortSignal: AbortSignal): Promise<string> {
  try {
    const response = await queryHaiku({
      systemPrompt: asSystemPrompt(['根据此 Claude Code 的错误报告，生成一个简洁的技术性 Issue 标题（最多 80 字符），用于公开的 GitHub Issue。', 'Claude Code 是一个基于 Anthropic API 的智能编码 CLI 工具。', '标题应满足：', '- 以 [Bug] 或 [Feature Request] 开头作为标题的第一个部分', '- 简洁、具体且能描述实际问题', '- 使用适合软件问题的技术术语', '- 对于错误信息，提取关键错误（例如“缺少 Tool Result Block”而非完整信息）', '- 直接明了，便于开发者理解问题', '- 如果无法确定明确的问题，请使用“Bug Report: [简要描述]”', '- 任何 LLM API 错误均来自 Anthropic API，而非其他模型提供商', '您的回答将直接用作 GitHub Issue 的标题，因此不应包含任何其他评论或解释', '好的标题示例：“[Bug] Auto-Compact 触发过早”、“[Bug] Anthropic API 错误：缺少 Tool Result Block”、“[Bug] 错误：Opus 模型名称无效”']),
      userPrompt: description,
      signal: abortSignal,
      options: {
        hasAppendSystemPrompt: false,
        toolChoice: undefined,
        isNonInteractiveSession: false,
        agents: [],
        querySource: 'feedback',
        mcpTools: []
      }
    });
    const title = response.message.content[0]?.type === 'text' ? response.message.content[0].text : 'Bug Report';

    // 检查标题是否包含 API 错误消息
    if (startsWithApiErrorPrefix(title)) {
      return createFallbackTitle(description);
    }
    return title;
  } catch (error) {
    // 标题生成过程中发生任何错误，均使用后备标题
    logError(error);
    return createFallbackTitle(description);
  }
}
function createFallbackTitle(description: string): string {
  // 基于错误描述创建一个安全的后备标题

  // 尝试从第一行提取有意义的标题
  const firstLine = description.split('\n')[0] || '';

  // 如果第一行很短，直接使用
  if (firstLine.length <= 60 && firstLine.length > 5) {
    return firstLine;
  }

  // 对于较长的描述，创建截断版本
  // 尽可能在单词边界处截断
  let truncated = firstLine.slice(0, 60);
  if (firstLine.length > 60) {
    // 在 60 字符限制内寻找最后一个空格
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 30) {
      // 仅当不会过度缩短时才在单词边界处修剪
      truncated = truncated.slice(0, lastSpace);
    }
    truncated += '...';
  }
  return truncated.length < 10 ? 'Bug Report' : truncated;
}

// 辅助函数：对错误进行脱敏并记录，避免暴露 API 密钥
function sanitizeAndLogError(err: unknown): void {
  if (err instanceof Error) {
    // 创建一份副本，并对可能敏感的信息进行脱敏
    const safeError = new Error(redactSensitiveInfo(err.message));

    // 如果存在堆栈跟踪，也进行脱敏
    if (err.stack) {
      safeError.stack = redactSensitiveInfo(err.stack);
    }
    logError(safeError);
  } else {
    // 对于非 Error 对象，转换为字符串并脱敏
    const errorString = redactSensitiveInfo(String(err));
    logError(new Error(errorString));
  }
}
async function submitFeedback(data: FeedbackData, signal?: AbortSignal): Promise<{
  success: boolean;
  feedbackId?: string;
  isZdrOrg?: boolean;
}> {
  if (isEssentialTrafficOnly()) {
    return {
      success: false
    };
  }
  try {
    // 在获取认证头之前确保 OAuth 令牌是新鲜的
    // 这可以防止因缓存令牌过期导致的 401 错误
    await checkAndRefreshOAuthTokenIfNeeded();
    const authResult = getAuthHeaders();
    if (authResult.error) {
      return {
        success: false
      };
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': getUserAgent(),
      ...authResult.headers
    };
    const response = await axios.post('https://api.anthropic.com/api/claude_cli_feedback', {
      content: jsonStringify(data)
    }, {
      headers,
      timeout: 30000,
      // 30 秒超时以防止挂起
      signal
    });
    if (response.status === 200) {
      const result = response.data;
      if (result?.feedback_id) {
        return {
          success: true,
          feedbackId: result.feedback_id
        };
      }
      sanitizeAndLogError(new Error('提交反馈失败：请求未返回 feedback_id'));
      return {
        success: false
      };
    }
    sanitizeAndLogError(new Error('提交反馈失败：' + response.status));
    return {
      success: false
    };
  } catch (err) {
    // 处理取消/中止 - 不作为错误记录
    if (axios.isCancel(err)) {
      return {
        success: false
      };
    }
    if (axios.isAxiosError(err) && err.response?.status === 403) {
      const errorData = err.response.data;
      if (errorData?.error?.type === 'permission_error' && errorData?.error?.message?.includes('Custom data retention settings')) {
        sanitizeAndLogError(new Error('无法提交反馈：已启用自定义数据保留设置'));
        return {
          success: false,
          isZdrOrg: true
        };
      }
    }
    // 使用安全的错误记录函数以避免泄露 API 密钥
    sanitizeAndLogError(err);
    return {
      success: false
    };
  }
}