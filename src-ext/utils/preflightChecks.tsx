import { c as _c } from "react/compiler-runtime";
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { logEvent } from '../services/analytics/index.js';
import { Spinner } from '../components/Spinner.js';
import { getOauthConfig } from '../constants/oauth.js';
import { useTimeout } from '../hooks/useTimeout.js';
import { Box, Text } from '../ink.js';
import { getSSLErrorHint } from '../services/api/errorUtils.js';
import { getUserAgent } from './http.js';
import { logError } from './log.js';

export interface PreflightCheckResult {
  success: boolean;
  error?: string;
  sslHint?: string;
}

async function checkEndpoints(): Promise<PreflightCheckResult> {
  try {
    // 若设置了 ANTHROPIC_BASE_URL 环境变量则使用之（用于本地/llama-server/Ollama），否则使用 OAuth 配置
    const baseUrl = process.env.ANTHROPIC_BASE_URL || getOauthConfig().BASE_API_URL;
    const tokenUrl = new URL(baseUrl);
    // 对于本地 API 跳过 OAuth 端点检查 —— 仅检查基础 URL
    const endpoints = process.env.ANTHROPIC_BASE_URL 
      ? [`${baseUrl}/models`]  // OpenAI 兼容端点
      : [`${baseUrl}/api/hello`, `${tokenUrl.origin}/v1/oauth/hello`];

    const checkEndpoint = async (url: string): Promise<PreflightCheckResult> => {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': getUserAgent()
          }
        });
        if (response.status !== 200) {
          const hostname = new URL(url).hostname;
          return {
            success: false,
            error: `连接至 ${hostname} 失败：状态码 ${response.status}`
          };
        }
        return {
          success: true
        };
      } catch (error) {
        const hostname = new URL(url).hostname;
        const sslHint = getSSLErrorHint(error);
        return {
          success: false,
          error: `连接至 ${hostname} 失败：${error instanceof Error ? (error as ErrnoException).code || error.message : String(error)}`,
          sslHint: sslHint ?? undefined
        };
      }
    };

    const results = await Promise.all(endpoints.map(checkEndpoint));
    const failedResult = results.find(result => !result.success);
    if (failedResult) {
      // 向 Statsig 记录失败事件
      logEvent('tengu_preflight_check_failed', {
        isConnectivityError: false,
        hasErrorMessage: !!failedResult.error,
        isSSLError: !!failedResult.sslHint
      });
    }

    return failedResult || {
      success: true
    };
  } catch (error) {
    logError(error as Error);

    // 向 Statsig 记录失败事件
    logEvent('tengu_preflight_check_failed', {
      isConnectivityError: true
    });

    return {
      success: false,
      error: `连通性检查出错：${error instanceof Error ? (error as ErrnoException).code || error.message : String(error)}`
    };
  }
}

interface PreflightStepProps {
  onSuccess: () => void;
}

export function PreflightStep(t0) {
  const $ = _c(12);
  const {
    onSuccess
  } = t0;
  const [result, setResult] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const showSpinner = useTimeout(1000) && isChecking;
  let t1;
  let t2;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => {
      const run = async function run() {
        const checkResult = await checkEndpoints();
        setResult(checkResult);
        setIsChecking(false);
      };
      run();
    };
    t2 = [];
    $[0] = t1;
    $[1] = t2;
  } else {
    t1 = $[0];
    t2 = $[1];
  }
  useEffect(t1, t2);
  let t3;
  let t4;
  if ($[2] !== onSuccess || $[3] !== result) {
    t3 = () => {
      if (result?.success) {
        onSuccess();
      } else {
        if (result && !result.success) {
          const timer = setTimeout(_temp, 100);
          return () => clearTimeout(timer);
        }
      }
    };
    t4 = [result, onSuccess];
    $[2] = onSuccess;
    $[3] = result;
    $[4] = t3;
    $[5] = t4;
  } else {
    t3 = $[4];
    t4 = $[5];
  }
  useEffect(t3, t4);
  let t5;
  if ($[6] !== isChecking || $[7] !== result || $[8] !== showSpinner) {
    t5 = isChecking && showSpinner ? <Box paddingLeft={1}><Spinner /><Text>正在检查连通性……</Text></Box> : !result?.success && !isChecking && <Box flexDirection="column" gap={1}><Text color="error">无法连接到 Anthropic 服务</Text><Text color="error">{result?.error}</Text>{result?.sslHint ? <Box flexDirection="column" gap={1}><Text>{result.sslHint}</Text><Text color="suggestion">请参阅 https://code.claude.com/docs/en/network-config</Text></Box> : <Box flexDirection="column" gap={1}><Text>请检查您的互联网连接和网络设置。</Text><Text>注意：Claude Code 可能在您所在的国家/地区不可用。请查看支持的国家/地区列表：{" "}<Text color="suggestion">https://anthropic.com/supported-countries</Text></Text></Box>}</Box>;
    $[6] = isChecking;
    $[7] = result;
    $[8] = showSpinner;
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  let t6;
  if ($[10] !== t5) {
    t6 = <Box flexDirection="column" gap={1} paddingLeft={1}>{t5}</Box>;
    $[10] = t5;
    $[11] = t6;
  } else {
    t6 = $[11];
  }
  return t6;
}
function _temp() {
  return process.exit(1);
}