import { c as _c } from "react/compiler-runtime";
import { feature } from 'bun:bundle';
import * as React from 'react';
import { getAllowedChannels, getQuestionPreviewFormat } from '../../bootstrap/state.js';
import { MessageResponse } from '../../components/MessageResponse.js';
import { BLACK_CIRCLE } from '../../constants/figures.js';
import { getModeColor } from '../../utils/permissions/PermissionMode.js';
import { z } from 'zod/v4';
import { Box, Text } from '../../ink.js';
import type { Tool } from '../../Tool.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { ASK_USER_QUESTION_TOOL_CHIP_WIDTH, ASK_USER_QUESTION_TOOL_NAME, ASK_USER_QUESTION_TOOL_PROMPT, DESCRIPTION, PREVIEW_FEATURE_PROMPT } from './prompt.js';
const questionOptionSchema = lazySchema(() => z.object({
  label: z.string().describe('用户看到并选择的选项显示文本。应简洁（1-5 个词）并清晰描述选择。'),
  description: z.string().describe('此选项含义或被选中后会发生什么的说明。用于提供权衡或影响的上下文。'),
  preview: z.string().optional().describe('此选项获得焦点时渲染的可选预览内容。用于帮助用户比较选项的模型、代码片段或视觉对比。参见工具描述中的预期内容格式。')
}));
const questionSchema = lazySchema(() => z.object({
  question: z.string().describe('向用户提问的完整问题。应清晰、具体，并以问号结尾。示例："我们应该使用哪个日期格式化库？" 如果 multiSelect 为 true，请相应措辞，如"你想启用哪些功能？"'),
  header: z.string().describe(`显示为芯片/标签的极短标签（最多 ${ASK_USER_QUESTION_TOOL_CHIP_WIDTH} 个字符）。示例："认证方式", "库", "方案"。`),
  options: z.array(questionOptionSchema()).min(2).max(4).describe(`The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice (unless multiSelect is enabled). There should be no 'Other' option, that will be provided automatically.`),
  multiSelect: z.boolean().default(false).describe('设为 true 以允许用户选择多个选项而非仅一个。用于选项不互斥的场景。')
}));
const annotationsSchema = lazySchema(() => {
  const annotationSchema = z.object({
    preview: z.string().optional().describe('所选选项的预览内容（如果问题使用了预览）。'),
    notes: z.string().optional().describe('用户添加到其选择的自由文本备注。')
  });
  return z.record(z.string(), annotationSchema).optional().describe('用户针对每个问题的可选注释（如预览选择的备注）。按问题文本索引。');
});
const UNIQUENESS_REFINE = {
  check: (data: {
    questions: {
      question: string;
      options: {
        label: string;
      }[];
    }[];
  }) => {
    const questions = data.questions.map(q => q.question);
    if (questions.length !== new Set(questions).size) {
      return false;
    }
    for (const question of data.questions) {
      const labels = question.options.map(opt => opt.label);
      if (labels.length !== new Set(labels).size) {
        return false;
      }
    }
    return true;
  },
  message: '问题文本必须唯一，每个问题内的选项标签也必须唯一'
} as const;
const commonFields = lazySchema(() => ({
  answers: z.record(z.string(), z.string()).optional().describe('权限组件收集的用户回答'),
  annotations: annotationsSchema(),
  metadata: z.object({
    source: z.string().optional().describe('此问题的可选来源标识符（如 /remember 命令的"remember"）。用于分析跟踪。')
  }).optional().describe('用于跟踪和分析的可选元数据。不显示给用户。')
}));
const inputSchema = lazySchema(() => z.strictObject({
  questions: z.array(questionSchema()).min(1).max(4).describe('要问用户的问题（1-4 个）'),
  ...commonFields()
}).refine(UNIQUENESS_REFINE.check, {
  message: UNIQUENESS_REFINE.message
}));
type InputSchema = ReturnType<typeof inputSchema>;
const outputSchema = lazySchema(() => z.object({
  questions: z.array(questionSchema()).describe('被问到的问题'),
  answers: z.record(z.string(), z.string()).describe('用户提供的回答（问题文本 -> 回答字符串；多选回答以逗号分隔）'),
  annotations: annotationsSchema()
}));
type OutputSchema = ReturnType<typeof outputSchema>;

// SDK schemas are identical to internal schemas now that `preview` and
// `annotations` are public (configurable via `toolConfig.askUserQuestion`).
export const _sdkInputSchema = inputSchema;
export const _sdkOutputSchema = outputSchema;
export type Question = z.infer<ReturnType<typeof questionSchema>>;
export type QuestionOption = z.infer<ReturnType<typeof questionOptionSchema>>;
export type Output = z.infer<OutputSchema>;
function AskUserQuestionResultMessage(t0) {
  const $ = _c(3);
  const {
    answers
  } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <Box flexDirection="row"><Text color={getModeColor("default")}>{BLACK_CIRCLE} </Text><Text>用户已回答 Claude 的问题：</Text></Box>;
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== answers) {
    t2 = <Box flexDirection="column" marginTop={1}>{t1}<MessageResponse><Box flexDirection="column">{Object.entries(answers).map(_temp)}</Box></MessageResponse></Box>;
    $[1] = answers;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}
function _temp(t0) {
  const [questionText, answer] = t0;
  return <Text key={questionText} color="inactive">· {questionText} → {answer}</Text>;
}
export const AskUserQuestionTool: Tool<InputSchema, Output> = buildTool({
  name: ASK_USER_QUESTION_TOOL_NAME,
  searchHint: '向用户提示多项选择问题',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    const format = getQuestionPreviewFormat();
    if (format === undefined) {
      // SDK consumer that hasn't opted into a preview format — omit preview
      // guidance (they may not render the field at all).
      return ASK_USER_QUESTION_TOOL_PROMPT;
    }
    return ASK_USER_QUESTION_TOOL_PROMPT + PREVIEW_FEATURE_PROMPT[format];
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  userFacingName() {
    return '';
  },
  isEnabled() {
    // When --channels is active the user is likely on Telegram/Discord, not
    // watching the TUI. The multiple-choice dialog would hang with nobody at
    // the keyboard. Channel permission relay already skips
    // requiresUserInteraction() tools (interactiveHandler.ts) so there's
    // no alternate approval path.
    if ((feature('KAIROS') || feature('KAIROS_CHANNELS')) && getAllowedChannels().length > 0) {
      return false;
    }
    return true;
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  toAutoClassifierInput(input) {
    return input.questions.map(q => q.question).join(' | ');
  },
  requiresUserInteraction() {
    return true;
  },
  async validateInput({
    questions
  }) {
    if (getQuestionPreviewFormat() !== 'html') {
      return {
        result: true
      };
    }
    for (const q of questions) {
      for (const opt of q.options) {
        const err = validateHtmlPreview(opt.preview);
        if (err) {
          return {
            result: false,
            message: `Option "${opt.label}" in question "${q.question}": ${err}`,
            errorCode: 1
          };
        }
      }
    }
    return {
      result: true
    };
  },
  async checkPermissions(input) {
    return {
      behavior: 'ask' as const,
      message: '回答问题？',
      updatedInput: input
    };
  },
  renderToolUseMessage() {
    return null;
  },
  renderToolUseProgressMessage() {
    return null;
  },
  renderToolResultMessage({
    answers
  }, _toolUseID) {
    return <AskUserQuestionResultMessage answers={answers} />;
  },
  renderToolUseRejectedMessage() {
    return <Box flexDirection="row" marginTop={1}>
        <Text color={getModeColor('default')}>{BLACK_CIRCLE}&nbsp;</Text>
        <Text>用户拒绝回答问题</Text>
      </Box>;
  },
  renderToolUseErrorMessage() {
    return null;
  },
  async call({
    questions,
    answers = {},
    annotations
  }, _context) {
    return {
      data: {
        questions,
        answers,
        ...(annotations && {
          annotations
        })
      }
    };
  },
  mapToolResultToToolResultBlockParam({
    answers,
    annotations
  }, toolUseID) {
    const answersText = Object.entries(answers).map(([questionText, answer]) => {
      const annotation = annotations?.[questionText];
      const parts = [`"${questionText}"="${answer}"`];
      if (annotation?.preview) {
        parts.push(`selected preview:\n${annotation.preview}`);
      }
      if (annotation?.notes) {
        parts.push(`user notes: ${annotation.notes}`);
      }
      return parts.join(' ');
    }).join(', ');
    return {
      type: 'tool_result',
      content: `用户已回答您的问题：${answersText}。您现在可以带着用户的答案继续了。`,
      tool_use_id: toolUseID
    };
  }
} satisfies ToolDef<InputSchema, Output>);

// Lightweight HTML fragment check. Not a parser — HTML5 parsers are
// error-recovering by spec and accept anything. We're checking model intent
// (did it emit HTML?) and catching the specific things we told it not to do.
function validateHtmlPreview(preview: string | undefined): string | null {
  if (preview === undefined) return null;
  if (/<\s*(html|body|!doctype)\b/i.test(preview)) {
    return '预览必须是 HTML 片段，而非完整文档（不允许 <html>、<body> 或 <!DOCTYPE>）';
  }
  // SDK consumers typically set this via innerHTML — disallow executable/style
  // tags so a preview can't run code or restyle the host page. Inline event
  // handlers (onclick etc.) are still possible; consumers should sanitize.
  if (/<\s*(script|style)\b/i.test(preview)) {
    return 'preview must not contain <script> or <style> tags. Use inline styles via the style attribute if needed.';
  }
  if (!/<[a-z][^>]*>/i.test(preview)) {
    return 'preview must contain HTML (previewFormat is set to "html"). Wrap content in a tag like <div> or <pre>.';
  }
  return null;
}
