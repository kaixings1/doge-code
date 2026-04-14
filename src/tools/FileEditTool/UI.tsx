import { c as _c } from "react/compiler-runtime";
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type { StructuredPatchHunk } from 'diff';
import * as React from 'react';
import { Suspense, use, useState } from 'react';
import { FileEditToolUseRejectedMessage } from '../../components/FileEditToolUseRejectedMessage.js';
import { MessageResponse } from '../../components/MessageResponse.js';
import { extractTag } from '../../utils/messages.js';
import { FallbackToolUseErrorMessage } from '../../components/FallbackToolUseErrorMessage.js';
import { FileEditToolUpdatedMessage } from '../../components/FileEditToolUpdatedMessage.js';
import { FilePathLink } from '../../components/FilePathLink.js';
import { Text } from '../../ink.js';
import type { Tools } from '../../Tool.js';
import type { Message, ProgressMessage } from '../../types/message.js';
import { adjustHunkLineNumbers, CONTEXT_LINES } from '../../utils/diff.js';
import { FILE_NOT_FOUND_CWD_NOTE, getDisplayPath } from '../../utils/file.js';
import { logError } from '../../utils/log.js';
import { getPlansDirectory } from '../../utils/plans.js';
import { readEditContext } from '../../utils/readEditContext.js';
import { firstLineOf } from '../../utils/stringUtils.js';
import type { ThemeName } from '../../utils/theme.js';
import type { FileEditOutput } from './types.js';
import { findActualString, getPatchForEdit, preserveQuoteStyle } from './utils.js';

export function userFacingName(input: Partial<{
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all: boolean;
  edits: unknown[];
}> | undefined): string {
  if (!input) {
    return '更新';
  }
  if (input.file_path?.startsWith(getPlansDirectory())) {
    return '更新计划';
  }
  // Hashline edits always modify an existing file (line-ref based)
  if (input.edits != null) {
    return '更新';
  }
  if (input.old_string === '') {
    return '创建';
  }
  return '更新';
}

export function getToolUseSummary(input: Partial<{
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all: boolean;
}> | undefined): string | null {
  if (!input?.file_path) {
    return null;
  }
  return getDisplayPath(input.file_path);
}

export function renderToolUseMessage({
  file_path
}: {
  file_path?: string;
}, {
  verbose
}: {
  verbose: boolean;
}): React.ReactNode {
  if (!file_path) {
    return null;
  }
  // For plan files, path is already in userFacingName
  if (file_path.startsWith(getPlansDirectory())) {
    return '';
  }
  return <FilePathLink filePath={file_path}>
      {verbose ? file_path : getDisplayPath(file_path)}
    </FilePathLink>;
}

export function renderToolResultMessage({
  filePath,
  structuredPatch,
  originalFile
}: FileEditOutput, _progressMessagesForMessage: ProgressMessage[], {
  style,
  verbose
}: {
  style?: 'condensed';
  verbose: boolean;
}): React.ReactNode {
  // For plan files, show /plan hint above the diff
  const isPlanFile = filePath.startsWith(getPlansDirectory());
  return <FileEditToolUpdatedMessage filePath={filePath} structuredPatch={structuredPatch} firstLine={originalFile.split('\n')[0] ?? null} fileContent={originalFile} style={style} verbose={verbose} previewHint={isPlanFile ? '/plan 预览' : undefined} />;
}

export function renderToolUseRejectedMessage(input: {
  file_path: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  edits?: unknown[];
}, options: {
  columns: number;
  messages: Message[];
  progressMessagesForMessage: ProgressMessage[];
  style?: 'condensed';
  theme: ThemeName;
  tools: Tools;
  verbose: boolean;
}): React.ReactElement {
  const {
    style,
    verbose
  } = options;
  const filePath = input.file_path;
  const oldString = input.old_string ?? '';
  const newString = input.new_string ?? '';
  const replaceAll = input.replace_all ?? false;

  // Defensive: if input has an unexpected shape, show a simple rejection message
  if ('edits' in input && input.edits != null) {
    return <FileEditToolUseRejectedMessage file_path={filePath} operation="update" firstLine={null} verbose={verbose} />;
  }
  const isNewFile = oldString === '';

  // For new file creation, show content preview instead of diff
  if (isNewFile) {
    return <FileEditToolUseRejectedMessage file_path={filePath} operation="write" content={newString} firstLine={firstLineOf(newString)} verbose={verbose} />;
  }
  return <EditRejectionDiff filePath={filePath} oldString={oldString} newString={newString} replaceAll={replaceAll} style={style} verbose={verbose} />;
}

export function renderToolUseErrorMessage(result: ToolResultBlockParam['content'], options: {
  progressMessagesForMessage: ProgressMessage[];
  tools: Tools;
  verbose: boolean;
}): React.ReactElement {
  const {
    verbose
  } = options;
  if (!verbose && typeof result === 'string' && extractTag(result, 'tool_use_error')) {
    const errorMessage = extractTag(result, 'tool_use_error');
    // Show a less scary message for intended behavior
    if (errorMessage?.includes('文件尚未读取！')) {
      return <MessageResponse>
          <Text dimColor>必须先读取文件才能进行编辑</Text>
        </MessageResponse>;
    }
    if (errorMessage?.includes(FILE_NOT_FOUND_CWD_NOTE)) {
      return <MessageResponse>
          <Text color="error">未找到指定的文件</Text>
        </MessageResponse>;
    }
    // Handle "no changes to make" error specifically
    if (errorMessage?.includes('没有更改要做') || errorMessage?.includes('old_string 和 new_string 完全相同')) {
      return <MessageResponse>
          <Text color="warning">无需更改：新旧内容相同</Text>
        </MessageResponse>;
    }
    // Show the actual error message for better debugging (first line only)
    return <MessageResponse>
        <Text color="error">编辑文件时发生错误：{errorMessage?.split('\n')[0]}</Text>
      </MessageResponse>;
  }
  return <FallbackToolUseErrorMessage result={result} verbose={verbose} />;
}

type RejectionDiffData = {
  patch: StructuredPatchHunk[];
  firstLine: string | null;
  fileContent: string | undefined;
};

function EditRejectionDiff(t0) {
  const $ = _c(16);
  const {
    filePath,
    oldString,
    newString,
    replaceAll,
    style,
    verbose
  } = t0;
  let t1;
  if ($[0] !== filePath || $[1] !== newString || $[2] !== oldString || $[3] !== replaceAll) {
    t1 = () => loadRejectionDiff(filePath, oldString, newString, replaceAll);
    $[0] = filePath;
    $[1] = newString;
    $[2] = oldString;
    $[3] = replaceAll;
    $[4] = t1;
  } else {
    t1 = $[4];
  }
  const [dataPromise] = useState(t1);
  let t2;
  if ($[5] !== filePath || $[6] !== verbose) {
    t2 = <FileEditToolUseRejectedMessage file_path={filePath} operation="update" firstLine={null} verbose={verbose} />;
    $[5] = filePath;
    $[6] = verbose;
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  let t3;
  if ($[8] !== dataPromise || $[9] !== filePath || $[10] !== style || $[11] !== verbose) {
    t3 = <EditRejectionBody promise={dataPromise} filePath={filePath} style={style} verbose={verbose} />;
    $[8] = dataPromise;
    $[9] = filePath;
    $[10] = style;
    $[11] = verbose;
    $[12] = t3;
  } else {
    t3 = $[12];
  }
  let t4;
  if ($[13] !== t2 || $[14] !== t3) {
    t4 = <Suspense fallback={t2}>{t3}</Suspense>;
    $[13] = t2;
    $[14] = t3;
    $[15] = t4;
  } else {
    t4 = $[15];
  }
  return t4;
}

function EditRejectionBody(t0) {
  const $ = _c(7);
  const {
    promise,
    filePath,
    style,
    verbose
  } = t0;
  const {
    patch,
    firstLine,
    fileContent
  } = use(promise);
  let t1;
  if ($[0] !== fileContent || $[1] !== filePath || $[2] !== firstLine || $[3] !== patch || $[4] !== style || $[5] !== verbose) {
    t1 = <FileEditToolUseRejectedMessage file_path={filePath} operation="update" patch={patch} firstLine={firstLine} fileContent={fileContent} style={style} verbose={verbose} />;
    $[0] = fileContent;
    $[1] = filePath;
    $[2] = firstLine;
    $[3] = patch;
    $[4] = style;
    $[5] = verbose;
    $[6] = t1;
  } else {
    t1 = $[6];
  }
  return t1;
}

async function loadRejectionDiff(filePath: string, oldString: string, newString: string, replaceAll: boolean): Promise<RejectionDiffData> {
  try {
    // Chunked read — context window around the first occurrence. replaceAll
    // still shows matches *within* the window via getPatchForEdit; we accept
    // losing the all-occurrences view to keep the read bounded.
    const ctx = await readEditContext(filePath, oldString, CONTEXT_LINES);
    if (ctx === null || ctx.truncated || ctx.content === '') {
      // ENOENT / not found / truncated — diff just the tool inputs.
      const {
        patch
      } = getPatchForEdit({
        filePath,
        fileContents: oldString,
        oldString,
        newString
      });
      return {
        patch,
        firstLine: null,
        fileContent: undefined
      };
    }
    const actualOld = findActualString(ctx.content, oldString) || oldString;
    const actualNew = preserveQuoteStyle(oldString, actualOld, newString);
    const {
      patch
    } = getPatchForEdit({
      filePath,
      fileContents: ctx.content,
      oldString: actualOld,
      newString: actualNew,
      replaceAll
    });
    return {
      patch: adjustHunkLineNumbers(patch, ctx.lineOffset - 1),
      firstLine: ctx.lineOffset === 1 ? firstLineOf(ctx.content) : null,
      fileContent: ctx.content
    };
  } catch (e) {
    // User may have manually applied the change while the diff was shown.
    logError(e as Error);
    return {
      patch: [],
      firstLine: null,
      fileContent: undefined
    };
  }
}
