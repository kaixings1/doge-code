/**
 * AI 任务执行器 - 共享模块
 *
 * 功能：
 * 1. 调用 LongCat AI API 获取执行计划（带指数退避重试）
 * 2. 解析 bash 命令并执行（带超时和错误恢复）
 * 3. 如果第一次没有 bash 命令，进行第二次 AI 转换调用
 * 4. 错误自动恢复：AI 分析失败原因并生成修复命令
 * 5. Windows 自动使用 Git Bash
 * 6. 完整的错误处理和调试输出
 *
 * 稳定性特性：
 * - API 调用指数退避重试（最多 3 次）
 * - 请求超时控制（默认 30s）
 * - 优雅降级：API 失败时返回有意义错误
 * - 命令执行超时和终止信号
 * - 自动文件追踪和清理
 */

import { execSync } from 'child_process'
import { mkdir, writeFile, rm, readdir } from 'fs/promises'
import { ToolUseContext } from '../../Tool.js'

export interface TaskExecutorResult {
  success: boolean
  output: string
  error?: string
  createdFiles: string[]
  commandsExecuted: number
  commandsFailed: number
}

export interface ExecutorOptions {
  maxRetries?: number        // 最大重试次数（默认 3）
  taskTimeout?: number       // 单个任务超时（毫秒，默认 120000）
  apiTimeout?: number        // API 调用超时（毫秒，默认 30000）
  autoCleanup?: boolean      // 执行完成后清理临时文件（默认 false）
  outputPath?: string        // 输出报告文件路径
}

// ─── 工具函数 ───

/**
 * 带指数退避的异步重试
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number = 1000,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 从任务描述中推断文件名（兜底用）
 */
function inferFileName(description: string): string {
  const lower = description.toLowerCase()
  if (lower.includes('html') || lower.includes('hello world')) return 'hello.html'
  if (lower.includes('js') || lower.includes('javascript')) return 'index.js'
  if (lower.includes('ts') || lower.includes('typescript')) return 'index.ts'
  if (lower.includes('css') || lower.includes('样式')) return 'style.css'
  if (lower.includes('json') || lower.includes('配置')) return 'config.json'
  if (lower.includes('md') || lower.includes('readme') || lower.includes('文档')) return 'README.md'
  return 'output.txt'
}

// ─── 主执行器 ───

export function createAITaskExecutor(context: ToolUseContext, options: ExecutorOptions = {}) {
  const {
    maxRetries = 3,
    taskTimeout = 120000,
    apiTimeout = 30000,
    autoCleanup = false,
  } = options

  const apiKey = process.env.DOGE_API_KEY || process.env.ANTHROPIC_API_KEY || ''
  const baseURL = process.env.ANTHROPIC_BASE_URL || 'https://api.longcat.chat/openai/v1/chat/completions'
  const model = context.options.mainLoopModel || process.env.ANTHROPIC_MODEL || 'step-3.7-flash'

  // 追踪创建的文件，用于清理
  const sessionCreatedFiles: string[] = []

  /**
   * 调用 LongCat AI API（带重试和超时）
   */
  async function callAI(systemContent: string, userContent: string): Promise<string> {
    return withRetry(async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), apiTimeout)

      try {
        const response = await fetch(baseURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemContent },
              { role: 'user', content: userContent },
            ],
            max_tokens: 4000,
            stream: false,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          // 429/5xx 可重试
          if (response.status === 429 || response.status >= 500) {
            throw new Error(`API ${response.status} (retryable): ${errorText.slice(0, 200)}`)
          }
          throw new Error(`API ${response.status}: ${errorText.slice(0, 200)}`)
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
          error?: { message?: string }
        }

        if (data.error) {
          throw new Error(`API 错误: ${data.error.message || 'unknown'}`)
        }

        return data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || ''
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    }, maxRetries)
  }

  /**
   * 从 AI 输出中解析 bash 命令
   */
  function parseBashCommands(aiOutput: string): string[] {
    const commands: string[] = []
    const seenBlocks = new Set<string>()

    // Single regex: match any fenced code block (ignore language marker)
    const blockRegex = /```[a-z]*\s*\n?([\s\S]*?)```/gi

    let match
    while ((match = blockRegex.exec(aiOutput)) !== null) {
      const content = match[1].trim()
      if (!content || seenBlocks.has(content)) continue
      seenBlocks.add(content)

      // Handle heredoc syntax (contains << and EOF)
      if (content.includes('<<') && content.includes('EOF')) {
        commands.push(content)
      } else {
        // Split multi-line commands, filter comments/empty/HTML tags
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (
            trimmed &&
            !trimmed.startsWith('#') &&
            !trimmed.startsWith('//') &&
            !trimmed.startsWith('<') &&
            !trimmed.startsWith('>')
          ) {
            commands.push(trimmed)
          }
        }
      }
    }

    return commands
  }

  /**
   * 从命令中提取创建的文件路径（过滤掉 HTML 标签）
   */
  function extractCreatedFiles(cmd: string): string[] {
    const files: string[] = []

    if (cmd.includes('<<') && cmd.includes('EOF')) {
      // heredoc 模式：提取 > 后面的文件名
      const match = cmd.match(/>\s*([^\s&|<>]+)/)
      if (match?.[1]) {
        const fp = match[1].trim()
        // 过滤掉明显不是文件路径的
        if (fp && !fp.startsWith('<') && fp.includes('.')) {
          files.push(fp)
        }
      }
    } else if (cmd.includes('>') && !cmd.includes('>>')) {
      // 重定向模式：提取 > 后面的文件名
      const matches = cmd.match(/>\s*([^\s&|<>]+)/g)
      if (matches) {
        for (const m of matches) {
          const fp = m.replace(/^>\s*/, '').trim()
          if (fp && !fp.startsWith('<') && fp.includes('.') && !fp.startsWith('-')) {
            files.push(fp)
          }
        }
      }
    }

    return [...new Set(files)]
  }

  /**
   * 执行单个 bash 命令
   */
  function executeCommand(cmd: string, timeout: number): { success: boolean; output: string; error?: string } {
    const isWin = process.platform === 'win32'
    const shellPath = isWin ? 'C:\\Program Files\\Git\\bin\\bash.exe' : undefined

    // For heredoc commands, write to a script file and execute with Bash
    if (cmd.includes('<<') && (cmd.includes('EOF') || cmd.includes('ENDOFFILE'))) {
      const fs = require('fs')
      const path = require('path')
      const scriptPath = path.join(process.cwd(), `._loop_cmd_${Date.now()}.sh`)
      try {
        fs.writeFileSync(scriptPath, cmd + '\n', 'utf-8')
        const result = execSync(`"${shellPath || 'bash'}" "${scriptPath}"`, {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout,
          stdio: ['pipe', 'pipe', 'pipe'],
          killSignal: 'SIGTERM',
        })
        try { fs.unlinkSync(scriptPath) } catch {}
        return { success: true, output: result }
      } catch (execErr: unknown) {
        try { fs.unlinkSync(scriptPath) } catch {}
        const err = execErr as { stdout?: string; stderr?: string; status?: number; killed?: boolean }
        return {
          success: false,
          output: (err.stdout ?? '') + '\n' + (err.stderr ?? ''),
          error: err.killed ? `超时 (${timeout}ms)` : `退出码: ${err.status ?? 'unknown'}`,
        }
      }
    }

    // Simple command - execute directly
    try {
      const result = execSync(cmd, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout,
        shell: shellPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        killSignal: 'SIGTERM',
      })
      return { success: true, output: result }
    } catch (execErr: unknown) {
      const err = execErr as { stdout?: string; stderr?: string; status?: number; killed?: boolean }
      return {
        success: false,
        output: (err.stdout ?? '') + '\n' + (err.stderr ?? ''),
        error: err.killed ? `超时 (${timeout}ms)` : `退出码: ${err.status ?? 'unknown'}`,
      }
    }
  }

  /**
   * AI 错误恢复 - 分析失败原因并生成修复命令
   */
  async function recoverFromError(
    failedCommand: string,
    errorOutput: string,
    taskDescription: string,
    attemptNumber: number,
  ): Promise<{ commands: string[]; analysis: string }> {
    const recoveryPrompt = `执行 bash 命令时出错：

**失败命令:**
\`\`\`
${failedCommand}
\`\`\`

**错误输出:**
\`\`\`
${errorOutput.slice(0, 1000)}
\`\`\`

**任务上下文:**
${taskDescription}

**尝试次数:** ${attemptNumber}/${maxRetries}

请分析错误原因并输出修复用的 bash 命令。用 \`\`\`bash 代码块包裹修复命令。`

    try {
      const recoveryOutput = await callAI(
        '你是一个 DevOps 工程师，擅长调试和修复 bash 命令错误。',
        recoveryPrompt,
      )

      const commands = parseBashCommands(recoveryOutput)
      const analysis = recoveryOutput.split('```')[0].slice(0, 200)

      return { commands, analysis }
    } catch {
      return { commands: [], analysis: '恢复调用失败' }
    }
  }

  /**
   * 主执行函数
   */
  return async function executeTask(
    prompt: string,
    systemPrompt: string,
    task: { id: string; description: string },
  ): Promise<TaskExecutorResult> {
    const outputLines: string[] = []
    const createdFiles: string[] = []
    let commandsExecuted = 0
    let commandsFailed = 0

    try {
      // ─── 第一次 AI 调用 ───
      // 支持角色化：systemPrompt 非空时作为角色身份，否则回退默认 DevOps 工程师。
      const role = systemPrompt && systemPrompt.trim()
        ? systemPrompt.trim()
        : '你是一个专业的 DevOps 工程师。请执行真实的 bash 命令来创建文件。'
      const executionPrompt = `${role}

请完成以下任务，必须输出可执行的 bash 命令来创建文件。

⚠️ 重要：你必须只输出 bash 命令，用 \`\`\`bash 代码块包裹。不要输出文字描述、计划或分析。只有 bash 命令会被执行。

## 任务
${task.description}

## 上下文
${prompt}

## 输出格式（必须遵守）
\`\`\`bash
mkdir -p 目录路径
echo '文件内容' > 文件路径
# 或者使用 heredoc：
cat << 'EOF' > 文件路径
多行文件内容
EOF
\`\`\`

现在立即输出 bash 命令:`

      outputLines.push(`🤖 [AI] 调用 API (model: ${model})`)

      // 保存请求用于调试
      try {
        await writeFile(`loop-request-${task.id}.json`, JSON.stringify({ model, prompt: executionPrompt }, null, 2), 'utf-8')
      } catch { /* ignore */ }

      let aiOutput = await callAI(role, executionPrompt)

      // 保存 AI 响应用于调试
      try {
        await writeFile(`loop-response-${task.id}.json`, JSON.stringify({ output: aiOutput }, null, 2), 'utf-8')
      } catch { /* ignore */ }

      outputLines.push(`🤖 [AI] 返回 (${aiOutput.length} 字符)`)

      // ─── 解析 bash 命令 ───
      let commands = parseBashCommands(aiOutput)

      // ─── 如果没有 bash 命令，进行第二次 AI 调用 ───
      if (commands.length === 0 && aiOutput.length > 0) {
        outputLines.push(`⚠️  无 bash 命令，进行第二次 AI 转换...`)

        const conversionPrompt = `请将下面的计划转换为可执行的 bash 命令：

---

${aiOutput}

---

要求：
1. 只输出 bash 命令，用 \`\`\`bash 代码块包裹
2. 每个文件用 echo 或 cat heredoc 创建
3. 命令要能在 Linux/Git Bash 上执行

输出格式：
\`\`\`bash
mkdir -p 目录
echo '内容' > 文件路径
\`\`\``

        try {
          const secondOutput = await callAI('你是一个 bash 专家。将计划转换为 bash 命令。', conversionPrompt)
          commands = parseBashCommands(secondOutput)
          outputLines.push(`🤖 [AI] 第二次调用 (${secondOutput.length} 字符, ${commands.length} 个命令)`)
        } catch (secondErr) {
          outputLines.push(`✗ 第二次调用失败: ${secondErr instanceof Error ? secondErr.message : String(secondErr)}`)
        }
      }

      // ─── 执行 bash 命令（带重试）───
      if (commands.length > 0) {
        outputLines.push(`⚡ [执行] ${commands.length} 个命令:`)

        for (const cmd of commands) {
          outputLines.push(`  > ${cmd.slice(0, 100)}${cmd.length > 100 ? '...' : ''}`)

          // 第一次尝试
          let result = executeCommand(cmd, taskTimeout)
          commandsExecuted++

          // 失败时进行 AI 错误恢复重试
          if (!result.success) {
            outputLines.push(`    ✗ ${result.error}`)

            for (let retry = 1; retry <= maxRetries; retry++) {
              outputLines.push(`    🔄 AI 恢复重试 ${retry}/${maxRetries}...`)

              try {
                const recovery = await recoverFromError(
                  cmd,
                  result.output,
                  task.description,
                  retry,
                )

                if (recovery.commands.length > 0) {
                  outputLines.push(`    💡 修复: ${recovery.analysis}`)
                  for (const fixCmd of recovery.commands) {
                    outputLines.push(`    > ${fixCmd.slice(0, 80)}...`)
                    const fixResult = executeCommand(fixCmd, taskTimeout)
                    commandsExecuted++

                    if (fixResult.success) {
                      result = { success: true, output: fixResult.output }
                      outputLines.push(`    ✓ 修复成功`)
                      break
                    } else {
                      outputLines.push(`    ✗ 修复失败: ${fixResult.error}`)
                    }
                  }
                }
              } catch (recoveryErr) {
                outputLines.push(`    ✗ 恢复失败`)
              }

              if (result.success) break
            }
          }

          if (result.success) {
            outputLines.push(`    ✓ (${result.output.length} 字符)`)
            // 检测是否创建了文件（使用改进的提取函数）
            const files = extractCreatedFiles(cmd)
            for (const f of files) {
              createdFiles.push(f)
              sessionCreatedFiles.push(f)
            }
          } else {
            commandsFailed++
            outputLines.push(`    ✗ 最终失败`)
          }
        }
      } else if (aiOutput.length > 0) {
        // AI 返回了文本但没有 bash 命令 → 兜底：用简单 bash 命令创建文件
        outputLines.push(`⚠️  AI 未返回 bash 命令，生成兜底文件...`)

        // 从任务描述中推断文件名
        const inferredName = inferFileName(task.description)
        const fallbackPath = `output-${Date.now()}-${inferredName}`

        // 尝试从 AI 输出中提取可保存的内容
        const contentToSave = aiOutput.length > 0 ? aiOutput : `// ${task.description}\n// AI 未能生成具体内容\n`

        const fallbackCmd = `cat << 'EOF' > ${fallbackPath}
${contentToSave}
EOF`

        outputLines.push(`  > 兜底命令: ${fallbackCmd.slice(0, 100)}...`)
        const fallbackResult = executeCommand(fallbackCmd, taskTimeout)
        commandsExecuted++

        if (fallbackResult.success) {
          createdFiles.push(fallbackPath)
          sessionCreatedFiles.push(fallbackPath)
          outputLines.push(`  ✓ 兜底文件已创建: ${fallbackPath}`)
        } else {
          outputLines.push(`  ✗ 兜底创建失败: ${fallbackResult.error}`)
        }
      } else {
        // AI 返回为空
        outputLines.push(`❌ AI 返回为空`)
        return {
          success: false,
          output: outputLines.join('\n'),
          error: 'AI 返回了空内容',
          createdFiles: [],
          commandsExecuted: 0,
          commandsFailed: 0,
        }
      }

      // ─── 清理临时文件（如果启用）───
      if (autoCleanup && createdFiles.length > 0) {
        const tempPatterns = ['loop-api-response-', 'loop-request-', 'loop-report-', 'loop-error-']
        try {
          const tempFiles = (await readdir(process.cwd())).filter(f => tempPatterns.some(p => f.startsWith(p)))
          for (const tempFile of tempFiles) {
            try {
              await rm(tempFile)
              outputLines.push(`  🗑️ 清理: ${tempFile}`)
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }

      // ─── 保存执行报告（如果指定路径）───
      if (options.outputPath) {
        try {
          const reportContent = `# 循环执行报告\n\n## 任务\n${task.description}\n\n## 执行过程\n\n${outputLines.join('\n')}\n\n## 创建的文件\n\n${[...new Set(createdFiles)].join('\n')}`
          await writeFile(options.outputPath, reportContent, 'utf-8')
          outputLines.push(`\n📝 报告已保存: ${options.outputPath}`)
        } catch { /* ignore */ }
      }

      // ─── 返回结果 ───
      const uniqueFiles = [...new Set(createdFiles)]
      if (uniqueFiles.length > 0) {
        outputLines.push(`\n📁 创建了 ${uniqueFiles.length} 个文件:`)
        for (const f of uniqueFiles) {
          outputLines.push(`   • ${f}`)
        }
      }

      return {
        success: commandsFailed === 0,
        output: outputLines.join('\n').slice(0, 8000),
        createdFiles: uniqueFiles,
        commandsExecuted,
        commandsFailed,
      }
    } catch (error) {
      outputLines.push(`💥 [异常] ${error instanceof Error ? error.message : String(error)}`)
      return {
        success: false,
        output: outputLines.join('\n'),
        error: error instanceof Error ? error.message : String(error),
        createdFiles: [],
        commandsExecuted,
        commandsFailed,
      }
    }
  }
}
