/**
 * Loop Engine Test Script
 * 直接测试循环引擎核心逻辑
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// 设置环境变量
process.env.DOGE_API_KEY = 'ak_2F63EQ8K46983Wm4GB3gQ7pN2Uu3C'
process.env.ANTHROPIC_MODEL = 'LongCat-2.0'

// 模拟 createTaskExecutor
async function createTaskExecutor() {
  const apiKey = process.env.DOGE_API_KEY || ''
  const baseURL = 'https://api.longcat.chat/openai/v1/chat/completions'
  const model = process.env.ANTHROPIC_MODEL || 'LongCat-2.0'

  return async (prompt, systemPrompt, task) => {
    console.log(`\n  [AI] 发送请求给 ${model}...`)
    console.log(`  [AI] 提示词: ${prompt.slice(0, 200)}...`)

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
            { role: 'system', content: '你是一个工程师。请执行真实的 bash 命令来创建文件。' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4000,
          stream: false,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.log(`  [AI] 错误: HTTP ${response.status}: ${errorText.slice(0, 200)}`)
        return { success: false, output: '', error: `HTTP ${response.status}: ${errorText.slice(0, 200)}` }
      }

      const data = await response.json()

      if (data.error) {
        console.log(`  [AI] API 错误: ${data.error.message}`)
        return { success: false, output: '', error: data.error.message }
      }

      const aiOutput = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || ''
      console.log(`  [AI] 返回 (${aiOutput.length} 字符): ${aiOutput.slice(0, 200)}...`)

      return { success: true, output: aiOutput }
    } catch (error) {
      console.log(`  [AI] 异常: ${error.message}`)
      return { success: false, output: '', error: error.message }
    }
  }
}

// 解析 bash 命令
function parseBashCommands(aiOutput) {
  const commands = []
  const patterns = [
    /```bash\s*\n?([\s\S]*?)```/gi,
    /```sh\s*\n?([\s\S]*?)```/gi,
    /```\s*\n?([\s\S]*?)```/gi,
  ]

  for (const pattern of patterns) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(aiOutput)) !== null) {
      const content = match[1].trim()
      if (content) {
        if (content.includes('<<') && content.includes('EOF')) {
          commands.push(content)
        } else {
          for (const line of content.split('\n')) {
            const trimmed = line.trim()
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
              commands.push(trimmed)
            }
          }
        }
      }
    }
  }

  return commands
}

// 执行 bash 命令
function executeCommand(cmd, timeout = 60000) {
  try {
    const isWin = process.platform === 'win32'
    const shellPath = isWin ? 'C:\\Program Files\\Git\\bin\\bash.exe' : undefined
    const output = execSync(cmd, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout,
      shell: shellPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { success: true, output }
  } catch (err) {
    return {
      success: false,
      output: (err.stdout ?? '') + '\n' + (err.stderr ?? ''),
      error: err.killed ? `超时` : `退出码: ${err.status ?? '?'}`,
    }
  }
}

// 主测试函数
async function testLoopEngine() {
  console.log('='.repeat(60))
  console.log('Loop Engine Test - 开始测试')
  console.log('='.repeat(60))

  const taskExecutor = await createTaskExecutor()

  // 测试任务：创建一个 Hello World HTML 文件
  const goal = '创建一个 Hello World HTML 文件，保存为 index.html'
  const prompt = `请执行 bash 命令完成以下任务：创建一个 Hello World HTML 文件。
文件内容应该是：
<!DOCTYPE html>
<html>
<head><title>Hello World</title></head>
<body><h1>Hello World!</h1></body>
</html>

请用 echo 或 cat 命令创建文件。用 bash 代码块包裹命令。`

  console.log(`\n📋 任务: ${goal}`)

  // 调用 AI
  console.log('\n🤖 [步骤 1] 调用 AI 获取执行计划...')
  const result = await taskExecutor(prompt, 'test', { id: 'test-1', description: goal })

  if (!result.success) {
    console.log(`\n❌ AI 调用失败: ${result.error}`)
    return false
  }

  const aiOutput = result.output
  console.log(`\n📄 AI 返回内容 (${aiOutput.length} 字符):`)
  console.log('-'.repeat(40))
  console.log(aiOutput)
  console.log('-'.repeat(40))

  // 解析 bash 命令
  console.log('\n🔍 [步骤 2] 解析 bash 命令...')
  let commands = parseBashCommands(aiOutput)

  if (commands.length === 0) {
    console.log('⚠️  没有找到 bash 命令，尝试第二次 AI 转换...')

    const conversionPrompt = `请将下面的计划转换为 bash 命令：\n\n${aiOutput}\n\n要求：只输出 bash 命令，用代码块包裹。`
    const secondResult = await taskExecutor(conversionPrompt, 'bash 专家', { id: 'test-1-conversion', description: 'Convert to bash' })

    if (secondResult.success) {
      commands = parseBashCommands(secondResult.output)
    }
  }

  if (commands.length === 0) {
    console.log('❌ 仍然没有找到 bash 命令')
    return false
  }

  console.log(`✅ 找到 ${commands.length} 个命令:`)
  commands.forEach((cmd, i) => console.log(`  ${i + 1}. ${cmd}`))

  // 执行命令
  console.log('\n⚡ [步骤 3] 执行命令...')
  let executedCount = 0
  let failedCount = 0
  const createdFiles = []

  for (const cmd of commands) {
    console.log(`\n  > ${cmd.slice(0, 80)}${cmd.length > 80 ? '...' : ''}`)
    const result = executeCommand(cmd, 30000)
    executedCount++

    if (result.success) {
      console.log(`    ✓ 成功 (${result.output.length} 字符输出)`)
      const fileMatch = cmd.match(/>\s*([^\s&|]+)/g)
      if (fileMatch) {
        for (const m of fileMatch) {
          const filePath = m.replace(/^>\s*/, '').trim()
          if (filePath && !filePath.startsWith('/dev/')) {
            createdFiles.push(filePath)
          }
        }
      }
    } else {
      console.log(`    ✗ 失败: ${result.error}`)
      failedCount++
    }
  }

  // 验证结果
  console.log('\n' + '='.repeat(60))
  console.log('📊 执行结果:')
  console.log(`  总命令: ${commands.length}`)
  console.log(`  成功: ${executedCount - failedCount}`)
  console.log(`  失败: ${failedCount}`)
  console.log(`  创建文件: ${createdFiles.length}`)

  if (createdFiles.length > 0) {
    console.log('\n📁 创建的文件:')
    for (const f of createdFiles) {
      const exists = fs.existsSync(f)
      const size = exists ? fs.statSync(f).size : 0
      console.log(`  ✓ ${f} (${size} 字节)${exists ? '' : ' [不存在]'}`)
    }
  }

  // 检查 index.html 是否被创建
  const indexPath = path.join(process.cwd(), 'index.html')
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf-8')
    console.log('\n✅✅✅ index.html 创建成功！')
    console.log('文件内容:')
    console.log('-'.repeat(40))
    console.log(content.slice(0, 500))
    console.log('-'.repeat(40))
    return true
  } else {
    console.log('\n❌ index.html 未创建')
    return false
  }
}

// 运行测试
testLoopEngine()
  .then(success => {
    console.log('\n' + '='.repeat(60))
    console.log(success ? '✅ 测试成功！' : '❌ 测试失败')
    console.log('='.repeat(60))
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('\n💥 测试异常:', err)
    process.exit(1)
  })
