import { c as _c } from "react/compiler-runtime";
import * as React from 'react'
import { Box, Text, useAppTheme } from '../ink.js'

// ============================================================================
// Types
// ============================================================================

export interface GhostTextProps {
  /** Ghost text 内容 */
  suggestion: string
  /** 是否可见 */
  visible: boolean
  /** 光标位置 */
  cursorPosition: number
  /** 渲染前缀（在 ghost text 之前显示的文本） */
  prefix: string
}

// ============================================================================
// GhostText Component
// ============================================================================

export function GhostText(t0: GhostTextProps) {
  const $ = _c(5)
  const { suggestion, visible, cursorPosition, prefix } = t0
  const theme = useAppTheme()

  if (!visible || !suggestion) {
    return null
  }

  let textContent
  if ($[0] !== prefix || $[1] !== suggestion) {
    textContent = prefix + suggestion
    $[0] = prefix
    $[1] = suggestion
    $[2] = textContent
  } else {
    textContent = $[2]
  }

  return (
    <Box>
      <Text color={theme.tertiaryForeground} dimColor>
        {textContent.slice(0, cursorPosition)}
        <Text bold>{textContent.slice(cursorPosition)}</Text>
      </Text>
    </Box>
  )
}

// ============================================================================
// GhostText Hook
// ============================================================================

interface UseGhostTextOptions {
  /** 是否启用 ghost text */
  enabled?: boolean
  /** 防抖延迟 */
  debounceMs?: number
  /** 最小输入长度 */
  minInputLength?: number
}

interface UseGhostTextResult {
  /** 当前 ghost text 建议 */
  suggestion: string
  /** 是否正在生成 */
  isLoading: boolean
  /** 是否可见 */
  isVisible: boolean
  /** 接受建议 */
  accept: () => void
  /** 拒绝建议 */
  dismiss: () => void
  /** 更新输入以触发新的建议 */
  updateInput: (value: string) => void
}

export function useGhostText(options: UseGhostTextOptions = {}): UseGhostTextResult {
  const {
    enabled = true,
    debounceMs = 500,
    minInputLength = 3,
  } = options

  const [suggestion, setSuggestion] = React.useState<string>('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [isVisible, setIsVisible] = React.useState(false)
  const debounceTimerRef = React.useRef<number | undefined>(undefined)
  const abortControllerRef = React.useRef<AbortController | null>(null)

  const updateInput = React.useCallback(
    (value: string) => {
      // 清除之前的防抖
      if (debounceTimerRef.current !== undefined) {
        clearTimeout(debounceTimerRef.current)
      }

      // 如果输入太短，隐藏建议
      if (value.length < minInputLength) {
        setSuggestion('')
        setIsVisible(false)
        setIsLoading(false)
        return
      }

      // 防抖生成新建议
      debounceTimerRef.current = setTimeout(async () => {
        if (!enabled) return

        setIsLoading(true)
        setIsVisible(false)

        try {
          // 调用 AI 生成 ghost text
          const generated = await generateGhostText(value)

          if (generated) {
            setSuggestion(generated)
            setIsVisible(true)
          }
        } catch {
          // 静默失败
        } finally {
          setIsLoading(false)
        }
      }, debounceMs)
    },
    [enabled, debounceMs, minInputLength],
  )

  const accept = React.useCallback(() => {
    setIsVisible(false)
  }, [])

  const dismiss = React.useCallback(() => {
    setSuggestion('')
    setIsVisible(false)
  }, [])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== undefined) {
        clearTimeout(debounceTimerRef.current)
      }
      abortControllerRef.current?.abort()
    }
  }, [])

  return {
    suggestion,
    isLoading,
    isVisible,
    accept,
    dismiss,
    updateInput,
  }
}

// ============================================================================
// Ghost Text Generator
// ============================================================================

async function generateGhostText(input: string): Promise<string> {
  // 简单的本地启发式生成（无需 AI 调用）
  const completions = generateLocalCompletions(input)
  return completions[0]?.text ?? ''
}

interface LocalCompletion {
  text: string
  score: number
}

function generateLocalCompletions(input: string): LocalCompletion[] {
  const results: LocalCompletion[] = []
  const lower = input.toLowerCase()

  // Shell commands
  const shellCommands: Record<string, string> = {
    'git commit': 'git commit -m ""',
    'git push': 'git push origin main',
    'git pull': 'git pull origin main',
    'git checkout': 'git checkout ',
    'git branch': 'git branch ',
    'git merge': 'git merge ',
    'git rebase': 'git rebase ',
    'git status': 'git status',
    'git diff': 'git diff',
    'npm install': 'npm install ',
    'npm run': 'npm run ',
    'bun install': 'bun install ',
    'bun run': 'bun run ',
    'docker run': 'docker run ',
    'docker build': 'docker build -t ',
    'docker ps': 'docker ps',
    'kubectl get': 'kubectl get ',
    'kubectl apply': 'kubectl apply -f ',
    'mkdir': 'mkdir ',
    'cd ': 'cd ',
    'ls': 'ls -la',
    'cat ': 'cat ',
    'grep ': 'grep -r ',
    'find ': 'find . -name ',
    'vim ': 'vim ',
    'code ': 'code ',
    'echo ': 'echo ',
  }

  for (const [prefix, completion] of Object.entries(shellCommands)) {
    if (lower.startsWith(prefix)) {
      const suffix = completion.slice(prefix.length)
      results.push({
        text: suffix,
        score: 10 + prefix.length,
      })
    }
  }

  // Code patterns
  const codePatterns: { pattern: RegExp; suffix: string; score: number }[] = [
    { pattern: /^import\s+from\s+['"]/, suffix: '', score: 8 },
    { pattern: /^import\s+\{[^}]*\}\s+from\s+['"]/, suffix: '', score: 8 },
    { pattern: /^console\.log\(/, suffix: '', score: 5 },
    { pattern: /^async\s+function\s+\w+\(/, suffix: ' {\n  \n}', score: 7 },
    { pattern: /^function\s+\w+\(/, suffix: ' {\n  \n}', score: 7 },
    { pattern: /^const\s+\w+\s*=\s*await\s+/, suffix: '', score: 7 },
    { pattern: /^if\s*\(/, suffix: ') {\n  \n}', score: 6 },
    { pattern: /^for\s*\(/, suffix: ') {\n  \n}', score: 6 },
    { pattern: /^while\s*\(/, suffix: ') {\n  \n}', score: 6 },
    { pattern: /^try\s*\{\n/, suffix: '} catch (error) {\n  console.error(error)\n}', score: 6 },
  ]

  for (const { pattern, suffix, score } of codePatterns) {
    if (pattern.test(input)) {
      results.push({ text: suffix, score })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}
