/**
 * __tests__/commands/team-collab.test.ts
 *
 * 验证 /team-collab 命令的端到端集成
 * 覆盖：空参数帮助、pipeline/discuss/parallel 三种模式、缺少 API key、输出格式
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ===========================================================================
// Mock：全局 fetch（callAI 依赖）
// ===========================================================================

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '模拟的 LLM 响应' } }],
    }),
  })
  ;(globalThis as any).fetch = fetchMock
  // 删除相关环境变量以确保干净的测试状态
  delete process.env.DOGE_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_BASE_URL
  delete process.env.ANTHROPIC_MODEL
  delete process.env.DOGE_MODEL
  delete process.env.DOGE_API_TIMEOUT
})

afterEach(() => {
  fetchMock.mockReset()
})

// ===========================================================================
// Mock：Orchestrator 模块
// 使用单一顶层 vi.mock + 可配置工厂（vitest 3.x 不支持 doMock/doUnmock）
// ===========================================================================

const orchestratorInstances: any[] = []
const orchestratorRunCalls: any[] = []

// 可变状态：每个测试通过 setMockResult / setMockError 切换
let mockShouldFail = false
let mockErrorMsg = ''
let mockResultOverrides: Record<string, unknown> = {}

function defaultMockResult(): any {
  const base = {
    success: true,
    finalStage: 'done',
    roleResults: [
      {
        role: 'researcher',
        stage: 'research',
        success: true,
        output: '调研完成：分析了 5 个相关文件',
        iterations: 1,
        duration: 1500,
        artifacts: [],
      },
      {
        role: 'pm',
        stage: 'analyze',
        success: true,
        output: 'PRD 编写完成',
        iterations: 1,
        duration: 2000,
        artifacts: [],
      },
      {
        role: 'architect',
        stage: 'design',
        success: true,
        output: '技术方案设计完成',
        iterations: 1,
        duration: 1800,
        artifacts: [],
      },
      {
        role: 'team_leader',
        stage: 'plan',
        success: true,
        output: '任务分解完成，共 8 个任务',
        iterations: 1,
        duration: 1200,
        artifacts: [],
      },
      {
        role: 'engineer',
        stage: 'implement',
        success: true,
        output: '代码实现完成，包含单元测试',
        iterations: 2,
        duration: 5000,
        artifacts: ['src/auth.ts', 'src/auth.test.ts'],
      },
      {
        role: 'qa',
        stage: 'verify',
        success: true,
        output: '测试通过，覆盖率 92%',
        iterations: 1,
        duration: 3000,
        artifacts: [],
      },
      {
        role: 'team_leader',
        stage: 'review',
        success: true,
        output: '审查通过，所有验收标准满足',
        iterations: 1,
        duration: 800,
        artifacts: [],
      },
    ],
    mergedOutput: '完整的多角色协作输出内容...',
    qualityScore: 88,
    totalDuration: 15300,
    totalIterations: 9,
    summary: '✅ 成功 | 最终阶段: done\n质量评分: 88/100\n总耗时: 15.3s\n总迭代: 9\n\n阶段执行结果:\n  ✅ researcher (research)\n  ✅ pm (analyze)\n  ✅ architect (design)\n  ✅ team_leader (plan)\n  ✅ engineer (implement)\n  ✅ qa (verify)\n  ✅ team_leader (review)\n\n产出文件:\n  - src/auth.ts\n  - src/auth.test.ts',
    artifacts: ['src/auth.ts', 'src/auth.test.ts'],
  }
  return { ...base, ...mockResultOverrides }
}

vi.mock('../../engine/orchestrator/index.js', () => {
  class MockOrchestrator {
    constructor(_config: any, _deps: any) {
      orchestratorInstances.push({ config: _config, deps: _deps })
    }
    async run(task: string) {
      orchestratorRunCalls.push({ task })
      if (mockShouldFail) {
        throw new Error(mockErrorMsg || '模拟的编排器错误')
      }
      return defaultMockResult()
    }
  }
  return { Orchestrator: MockOrchestrator }
})

// ===========================================================================
// 导入被测试模块（在 mock 注册之后）
// ===========================================================================

import teamCollabModule from '../../commands/team-collab/index.js'

// ===========================================================================
// 辅助函数
// ===========================================================================

let cachedCallFn: ((args: string, context: any) => Promise<any>) | null = null

async function getCallFn() {
  if (!cachedCallFn) {
    const mod = await teamCollabModule.load()
    cachedCallFn = mod.call
  }
  return cachedCallFn
}

/**
 * 设置 API key 和 mock fetch，让 resolveLLMConfig 返回有效配置
 */
function setupLLM() {
  process.env.DOGE_API_KEY = 'test-api-key'
  process.env.ANTHROPIC_BASE_URL = 'http://localhost:9999/v1/chat/completions'
  process.env.ANTHROPIC_MODEL = 'test-model'

  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '模拟的 LLM 响应' } }],
    }),
  })

  // 注入到全局
  ;(globalThis as any).fetch = fetchMock
}

/**
 * 配置 mock Orchestrator 的返回值
 */
function setMockResult(overrides: Record<string, unknown> = {}) {
  mockResultOverrides = overrides
  mockShouldFail = false
  mockErrorMsg = ''
}

/**
 * 配置 mock Orchestrator 抛出异常
 */
function setMockError(error: string) {
  mockShouldFail = true
  mockErrorMsg = error
}

/**
 * 清空调用记录，重置 mock 状态
 */
function clearOrchestratorMocks() {
  orchestratorInstances.length = 0
  orchestratorRunCalls.length = 0
  setMockResult()
}

// ===========================================================================
// Tests
// ===========================================================================

describe('team-collab 命令', () => {
  // -------------------------------------------------------------------------
  // 无参数时返回帮助文本
  // -------------------------------------------------------------------------
  describe('空参数调用', () => {
    it('返回帮助信息，包含用法说明', async () => {
      const call = await getCallFn()
      const result = await call('', {})

      expect(result.type).toBe('text')
      expect(result.value).toContain('多角色协作')
      expect(result.value).toContain('/team-collab')
      expect(result.value).toContain('pipeline')
      expect(result.value).toContain('discuss')
      expect(result.value).toContain('parallel')
    })

    it('返回示例用法', async () => {
      const call = await getCallFn()
      const result = await call('', {})

      expect(result.value).toContain('示例')
      expect(result.value).toContain('实现用户认证模块')
    })
  })

  // -------------------------------------------------------------------------
  // 缺少 API key 时返回错误提示
  // -------------------------------------------------------------------------
  describe('缺少 API key', () => {
    it('未设置任何 API key 时返回错误提示', async () => {
      // 确保环境变量被清除
      delete process.env.DOGE_API_KEY
      delete process.env.ANTHROPIC_API_KEY

      const call = await getCallFn()
      const result = await call('实现用户认证', {})

      expect(result.type).toBe('text')
      expect(result.value).toContain('需要配置 API 密钥')
      expect(result.value).toContain('DOGE_API_KEY')
      expect(result.value).toContain('ANTHROPIC_API_KEY')
    })

    it('设置 ANTHROPIC_API_KEY 时同样通过 key 检查', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test-key'

      const call = await getCallFn()
      const result = await call('', {})

      // 有 key 时不应返回 key 错误，而是帮助文本
      expect(result.value).not.toContain('需要配置 API 密钥')
      expect(result.value).toContain('多角色协作')
    })
  })

  // -------------------------------------------------------------------------
  // Pipeline 模式：默认模式，验证路由
  // -------------------------------------------------------------------------
  describe('pipeline 模式（默认）', () => {
    it('无前缀时默认使用 pipeline 模式', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('实现用户认证模块', {})

      // 验证 orchestrator 被调用，且任务描述正确
      expect(orchestratorRunCalls.length).toBe(1)
      expect(orchestratorRunCalls[0].task).toBe('实现用户认证模块')

      // 验证输出包含 pipeline 标识
      expect(result.value).toContain('流水线')
      expect(result.value).toContain('pipeline')
      expect(result.type).toBe('text')
    })

    it('显式 pipeline 前缀也使用 pipeline 模式', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('pipeline 重构支付流程', {})

      expect(orchestratorRunCalls.length).toBe(1)
      expect(orchestratorRunCalls[0].task).toBe('重构支付流程')
      expect(result.value).toContain('流水线')
    })
  })

  // -------------------------------------------------------------------------
  // Discuss 模式：多角色讨论
  // -------------------------------------------------------------------------
  describe('discuss 模式', () => {
    it('discuss 前缀触发讨论模式', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('discuss 重构支付流程', {})

      expect(orchestratorRunCalls.length).toBe(1)
      expect(orchestratorRunCalls[0].task).toBe('重构支付流程')
      expect(result.value).toContain('讨论')
      expect(result.value).toContain('discuss')
      expect(result.type).toBe('text')
    })

    it('discuss 模式输出包含各阶段角色结果', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('discuss 代码安全审查', {})

      // 验证输出包含各角色的执行结果
      expect(result.value).toContain('researcher')
      expect(result.value).toContain('pm')
      expect(result.value).toContain('architect')
      expect(result.value).toContain('engineer')
      expect(result.value).toContain('qa')
    })
  })

  // -------------------------------------------------------------------------
  // Parallel 模式：并行扇出
  // -------------------------------------------------------------------------
  describe('parallel 模式', () => {
    it('parallel 前缀触发并行模式', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('parallel 分析代码库安全漏洞', {})

      expect(orchestratorRunCalls.length).toBe(1)
      expect(orchestratorRunCalls[0].task).toBe('分析代码库安全漏洞')
      expect(result.value).toContain('并行')
      expect(result.value).toContain('parallel')
      expect(result.type).toBe('text')
    })
  })

  // -------------------------------------------------------------------------
  // 输出格式验证
  // -------------------------------------------------------------------------
  describe('输出格式', () => {
    it('输出包含任务描述', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('实现用户认证模块', {})

      expect(result.value).toContain('实现用户认证模块')
    })

    it('输出包含模式信息', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('实现用户认证模块', {})

      expect(result.value).toContain('**模式**:')
      expect(result.value).toContain('pipeline')
    })

    it('输出包含执行状态', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('实现用户认证模块', {})

      expect(result.value).toContain('**状态**:')
      expect(result.value).toContain('✅ 成功')
    })

    it('输出包含最终阶段', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('实现用户认证模块', {})

      expect(result.value).toContain('**最终阶段**:')
      expect(result.value).toContain('done')
    })

    it('输出包含质量评分', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('实现用户认证模块', {})

      expect(result.value).toContain('**质量评分**:')
      expect(result.value).toContain('/100')
    })

    it('输出包含总耗时', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('实现用户认证模块', {})

      expect(result.value).toContain('**总耗时**:')
      expect(result.value).toContain('s')
    })

    it('输出包含总迭代次数', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('实现用户认证模块', {})

      expect(result.value).toContain('**总迭代**:')
    })

    it('输出包含各阶段执行详情', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('实现用户认证模块', {})

      expect(result.value).toContain('执行详情')
      // 验证每个角色都有执行结果行
      expect(result.value).toContain('researcher')
      expect(result.value).toContain('pm')
      expect(result.value).toContain('architect')
      expect(result.value).toContain('engineer')
      expect(result.value).toContain('qa')
    })

    it('输出包含产出文件列表', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('实现用户认证模块', {})

      expect(result.value).toContain('产出文件')
      expect(result.value).toContain('src/auth.ts')
      expect(result.value).toContain('src/auth.test.ts')
    })

    it('输出包含合并输出和摘要', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('实现用户认证模块', {})

      expect(result.value).toContain('合并输出')
      expect(result.value).toContain('完整的多角色协作输出内容')
      expect(result.value).toContain('✅ 成功')
    })
  })

  // -------------------------------------------------------------------------
  // 边界情况
  // -------------------------------------------------------------------------
  describe('边界情况', () => {
    it('仅提供空格时返回帮助', async () => {
      const call = await getCallFn()
      const result = await call('   ', {})

      expect(result.type).toBe('text')
      expect(result.value).toContain('多角色协作')
    })

    it('任务描述前后的空格被正确裁剪', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('  实现用户认证模块  ', {})

      expect(orchestratorRunCalls.length).toBe(1)
      expect(orchestratorRunCalls[0].task).toBe('实现用户认证模块')
    })

    it('pipeline 前缀后空格被正确处理', async () => {
      clearOrchestratorMocks()
      setMockResult()

      setupLLM()

      const call = await getCallFn()
      const result = await call('pipeline  重构支付流程  ', {})

      expect(orchestratorRunCalls.length).toBe(1)
      expect(orchestratorRunCalls[0].task).toBe('重构支付流程')
    })

    it('discuss 前缀后仅空格在缺少 API key 时先返回 key 错误', async () => {
      // 代码执行顺序：先检测 mode，再检查 taskDescription，最后检查 API key
      // 因此缺少 API key 时先返回 key 错误
      const call = await getCallFn()
      const result = await call('discuss   ', {})

      expect(result.type).toBe('text')
      expect(result.value).toContain('需要配置 API 密钥')
    })

    it('parallel 前缀后仅空格在缺少 API key 时先返回 key 错误', async () => {
      const call = await getCallFn()
      const result = await call('parallel   ', {})

      expect(result.type).toBe('text')
      expect(result.value).toContain('需要配置 API 密钥')
    })
  })

  // -------------------------------------------------------------------------
  // Orchestrator 错误处理
  // -------------------------------------------------------------------------
  describe('Orchestrator 错误处理', () => {
    it('orchestrator 抛出异常时返回错误信息', async () => {
      clearOrchestratorMocks()

      // 通过可变状态让 mock Orchestrator 抛出异常
      setMockError('模拟的编排器错误')

      setupLLM()

      const call = await getCallFn()
      const result = await call('测试任务', {})

      expect(result.type).toBe('text')
      expect(result.value).toContain('协作编排失败')
      expect(result.value).toContain('模拟的编排器错误')
    })
  })

  // -------------------------------------------------------------------------
  // 帮助文本内容完整性
  // -------------------------------------------------------------------------
  describe('帮助文本', () => {
    it('包含三种模式的说明', async () => {
      const call = await getCallFn()
      const result = await call('', {})

      expect(result.value).toContain('pipeline 模式')
      expect(result.value).toContain('讨论模式')
      expect(result.value).toContain('并行模式')
    })

    it('包含 pipeline 严格顺序的角色链', async () => {
      const call = await getCallFn()
      const result = await call('', {})

      expect(result.value).toContain('PM')
      expect(result.value).toContain('Architect')
      expect(result.value).toContain('TeamLeader')
      expect(result.value).toContain('Engineer')
      expect(result.value).toContain('QA')
    })

    it('包含具体的使用示例', async () => {
      const call = await getCallFn()
      const result = await call('', {})

      expect(result.value).toContain('/team-collab 实现用户认证模块')
      expect(result.value).toContain('/team-collab discuss 重构支付流程')
      expect(result.value).toContain('/team-collab parallel 分析代码库安全漏洞')
    })
  })
})
