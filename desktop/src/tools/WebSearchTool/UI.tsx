import React from 'react';
import { MessageResponse } from '../../components/MessageResponse.js';
import { TOOL_SUMMARY_MAX_LENGTH } from '../../constants/toolLimits.js';
import { Box, Text } from '../../ink.js';
import type { ProgressMessage } from '../../types/message.js';
import { truncate } from '../../utils/format.js';
import type { Output, SearchResult, WebSearchProgress } from './WebSearchTool.js';
function getSearchSummary(results: (SearchResult | string | null | undefined)[]): {
  searchCount: number;
  totalResultCount: number;
} {
  let searchCount = 0;
  let totalResultCount = 0;
  for (const result of results) {
    if (result != null && typeof result !== 'string') {
      searchCount++;
      totalResultCount += result.content?.length ?? 0;
    }
  }
  return {
    searchCount,
    totalResultCount
  };
}
export function renderToolUseMessage({
  query,
  allowed_domains,
  blocked_domains
}: Partial<{
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
}>, {
  verbose
}: {
  verbose: boolean;
}): React.ReactNode {
  if (!query) {
    return null;
  }
  let message = '';
  if (query) {
    message += `"${query}"`;
  }
  if (verbose) {
    if (allowed_domains && allowed_domains.length > 0) {
      message += `, 仅允许域名: ${allowed_domains.join(', ')}`;
    }
    if (blocked_domains && blocked_domains.length > 0) {
      message += `, 屏蔽域名: ${blocked_domains.join(', ')}`;
    }
  }
  return message;
}
export function renderToolUseProgressMessage(progressMessages: ProgressMessage<WebSearchProgress>[]): React.ReactNode {
  if (progressMessages.length === 0) {
    return null;
  }
  const lastProgress = progressMessages[progressMessages.length - 1];
  if (!lastProgress?.data) {
    return null;
  }
  const data = lastProgress.data;
  switch (data.type) {
    case 'query_update':
      return <MessageResponse>
          <Text dimColor>正在搜索：{data.query}</Text>
        </MessageResponse>;
    case 'search_results_received':
      return <MessageResponse>
          <Text dimColor={data.resultCount === 0}>
            {data.resultCount === 0
              ? <Text color="error">找到 {data.resultCount} 个结果（搜索词：{data.query}）</Text>
              : <><Text color="success">找到</Text> <Text bold>{data.resultCount}</Text> <Text color="success">个结果</Text>（搜索词：{data.query}）</>}
          </Text>
        </MessageResponse>;
    default:
      return null;
  }
}
export function renderToolResultMessage(output: Output): React.ReactNode {
  const {
    searchCount
  } = getSearchSummary(output.results ?? []);
  const timeDisplay = output.durationSeconds >= 1 ? `${Math.round(output.durationSeconds)}s` : `${Math.round(output.durationSeconds * 1000)}ms`;
  return <Box justifyContent="space-between" width="100%">
      <MessageResponse height={1}>
        <Text>
          执行了 {searchCount} 次搜索，耗时 {timeDisplay}
        </Text>
      </MessageResponse>
    </Box>;
}
export function getToolUseSummary(input: Partial<{
  query: string;
}> | undefined): string | null {
  if (!input?.query) {
    return null;
  }
  return truncate(input.query, TOOL_SUMMARY_MAX_LENGTH);
}
