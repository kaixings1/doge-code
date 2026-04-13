import { open, stat } from 'fs/promises';
import { CLAUDE_CODE_GUIDE_AGENT_TYPE } from '../../../../tools/AgentTool/built-in/claudeCodeGuideAgent.js';
import { getSettingsFilePathForSource } from '../../../../utils/settings/settings.js';
import { enableDebugLogging, getDebugLogPath } from '../../../utils/debug.js';
import { errorMessage, isENOENT } from '../../../utils/errors.js';
import { formatFileSize } from '../../../utils/format.js';
import { registerBundledSkill } from '../bundledSkills.js';

const DEFAULT_DEBUG_LINES_READ = 20; // 默认读取的调试日志行。
const TAIL_READ_BYTES = 64 * 1024; // 读取日志尾部的大小（64KB。

export function registerDebugSkill(): void {
  registerBundledSkill({
    name: 'debug',
    description:
      process.env.USER_TYPE === 'ant'
        ? '通过读取会话调试日志来调试当前的Claude Code会话。包括所有事件日志记录。
        : '为此会话启用调试日志记录并帮助诊断问）,
    allowedTools: ['Read', 'Grep', 'Glob'],
    argumentHint: '[问题描述]',
    // 禁用模型自动调用，因此用户必须在交互模式下显式请求，
    // 并且描述不会占用上下。
    disableModelInvocation: true,
    userInvocable: true,
    async getPromptForCommand(args) {
      // 非ant用户默认不写入调试日）- 现在打开日志记录，以便捕获此会话中的后续活动
      const wasAlreadyLogging = enableDebugLogging();
      const debugLogPath = getDebugLogPath();

      let logInfo: string;
      try {
        // 读取日志尾部而不读取整个文件 - 调试日志在长时间会话中无限增长，
        // 完整读取会导致RSS峰。
        const stats = await stat(debugLogPath);
        const readSize = Math.min(stats.size, TAIL_READ_BYTES);
        const startOffset = stats.size - readSize;
        const fd = await open(debugLogPath, 'r');
        try {
          const { buffer, bytesRead } = await fd.read({
            buffer: Buffer.alloc(readSize),
            position: startOffset,
          });
          const tail = buffer
            .toString('utf-8', 0, bytesRead)
            .split('\n')
            .slice(-DEFAULT_DEBUG_LINES_READ)
            .join('\n');
          logInfo = `日志大小）{formatFileSize(stats.size)}\n\n### 最）{DEFAULT_DEBUG_LINES_READ}行\n\n\`\`\`\n${tail}\n\`\`\``;
        } finally {
          await fd.close();
        }
      } catch (e) {
        logInfo = isENOENT(e)
          ? '尚无调试日志存在 - 日志记录刚刚启用。
          : `读取调试日志的最）{DEFAULT_DEBUG_LINES_READ}行失败：${errorMessage(e)}`;
      }

      const justEnabledSection = wasAlreadyLogging
        ? ''
        : `
## 调试日志记录刚刚启用

在此会话中，调试日志记录直到现在才启用。此/debug调用之前的任何内容都未被捕获。

告诉用户调试日志记录现在在\`${debugLogPath}\`处于活动状态，请他们重现问题，然后重新读取日志。如果他们无法重现，他们也可以使用\`claude --debug\`重新启动，以从启动开始捕获日志。
`;

      const prompt = `# 调试技。

帮助用户调试他们在当前Claude Code会话中遇到的问题。
${justEnabledSection}
## 会话调试日志

当前会话的调试日志位于：\`${debugLogPath}\`

${logInfo}

要获取更多上下文，请在整个文件中grep查找[ERROR]和[WARN]行。

## 问题描述

${args || '用户未描述具体问题。读取调试日志并总结任何错误、警告或值得注意的问题）}

## 设置

请记住，设置位于。
* 用户 - ${getSettingsFilePathForSource('userSettings')}
* 项目 - ${getSettingsFilePathForSource('projectSettings')}
* 本地 - ${getSettingsFilePathForSource('localSettings')}

## 说明

1. 审查用户的问题描。
2. 最）{DEFAULT_DEBUG_LINES_READ}行显示调试文件格式。在整个文件中查找[ERROR]和[WARN]条目、堆栈跟踪和失败模式
3. 考虑启动${CLAUDE_CODE_GUIDE_AGENT_TYPE}子代理以了解相关的Claude Code功能
4. 用通俗易懂的语言解释你发现的内容
5. 建议具体的修复方法或后续步骤

**你必须始终用中文回复）*
`;
      return [{ type: 'text', text: prompt }];
    },
  });
}