import { useCallback, useState } from 'react'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import { verifyApiKey } from '../services/api/claude.js'
import {
  getAnthropicApiKeyWithSource,
  getApiKeyFromApiKeyHelper,
  isAnthropicAuthEnabled,
  isClaudeAISubscriber,
} from '../utils/auth.js'

export type VerificationStatus =
  | 'loading'
  | 'valid'
  | 'invalid'
  | 'missing'
  | 'error'

export type ApiKeyVerificationResult = {
  status: VerificationStatus
  reverify: () => Promise<void>
  error: Error | null
}

export function useApiKeyVerification(): ApiKeyVerificationResult {
  const [status, setStatus] = useState<VerificationStatus>(() => {
    if (!isAnthropicAuthEnabled() || isClaudeAISubscriber()) {
      return 'valid'
    }
    // 使用 skipRetrievingKeyFromApiKeyHelper 避免在信任对话框显示前
    // 执行 apiKeyHelper（安全：防止通过 settings.json 实现 RCE）
    const { key, source } = getAnthropicApiKeyWithSource({
      skipRetrievingKeyFromApiKeyHelper: true,
    })
    // 如果配置了 apiKeyHelper，即使尚未执行，我们也有密钥来源
    // ——返回 'loading' 表示稍后验证
    if (key || source === 'apiKeyHelper') {
      return 'loading'
    }
    return 'missing'
  })
  const [error, setError] = useState<Error | null>(null)

  const verify = useCallback(async (): Promise<void> => {
    if (!isAnthropicAuthEnabled() || isClaudeAISubscriber()) {
      setStatus('valid')
      return
    }
    // 预热 apiKeyHelper 缓存（未配置则为空操作），然后从所有来源读取。
    // getAnthropicApiKeyWithSource() 读取已预热的缓存。
    await getApiKeyFromApiKeyHelper(getIsNonInteractiveSession())
    const { key: apiKey, source } = getAnthropicApiKeyWithSource()
    if (!apiKey) {
      if (source === 'apiKeyHelper') {
        setStatus('error')
        setError(new Error('API key helper did not return a valid key'))
        return
      }
      const newStatus = 'missing'
      setStatus(newStatus)
      return
    }

    try {
      const isValid = await verifyApiKey(apiKey, false)
      const newStatus = isValid ? 'valid' : 'invalid'
      setStatus(newStatus)
      return
    } catch (error) {
      // 当 API 返回错误响应但并非无效 API 密钥错误时触发
      // 这种情况下，我们仍将 API 密钥标记为无效——但同时记录错误
      // 以便向用户显示更有帮助的信息
      setError(error as Error)
      const newStatus = 'error'
      setStatus(newStatus)
      return
    }
  }, [])

  return {
    status,
    reverify: verify,
    error,
  }
}
