import type { Command } from '../commands.js'

const ALLOWED_TOOLS = [
  'Bash(*)',
  'FileRead(*)',
  'FileEdit(*)',
  'FileWrite(*)',
  'Glob(*)',
  'Grep(*)',
]

function getPromptContent(args: string): string {
  const firstArg = (args || '').trim().split(/\s+/)[0] || ''
  const rest = (args || '').trim().split(/\s+/).slice(1).join(' ')

  return `## 任务：生成并运行测试

你是一个自动化测试工程师。你的任务是为指定的文件或模块生成测试，运行测试，并修复失败的测试，直到全部通过。

### 目标
${firstArg ? '为以下代码生成测试: ' + firstArg : '分析当前代码变更并自动生成对应的测试'}

### 流程

#### 第 1 步：分析代码
1. 读取目标文件，理解功能（导出项、参数、返回值、边界条件）
2. 检查是否已有测试文件
3. 检查项目中使用的测试框架（package.json 中的 vitest/jest、pytest、cargo test、go test 等）

#### 第 2 步：生成测试
1. 生成全面的测试用例覆盖：正常路径、边界条件、错误路径、边缘情况
2. 测试文件命名规则：.test.ts / .spec.ts / test_*.py / *_test.go
3. 测试放在与被测文件同目录或 __tests__/ 目录

#### 第 3 步：运行测试
- TS/JS: npx vitest run 2>&1 或 npx jest 2>&1
- Python: python -m pytest <file> -v 2>&1
- Rust: cargo test 2>&1
- Go: go test ./... -v 2>&1

#### 第 4 步：修复循环
如果测试失败，分析原因、修复、重新运行，最多 5 轮。5 轮后仍有失败则输出剩余失败原因。

### 规则
- 不要删除已有测试代码
- Mock 外部依赖（数据库、API、文件系统）
- UI 组件生成渲染测试和交互测试`
}

const command = {
  type: 'prompt',
  name: 'test-gen',
  description: '为代码自动生成测试用例并运行验证，失败则自动修复',
  allowedTools: ALLOWED_TOOLS,
  contentLength: 0,
  progressMessage: '正在生成测试',
  source: 'builtin',
  getPromptForCommand(args: string): string {
    return getPromptContent(args || '')
  },
} satisfies Command

export default command
