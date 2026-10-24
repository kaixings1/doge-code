import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * CLAUDE_CODE_DISABLE_FILE_MENTIONS 端到端（对齐官方 v2.1.299）
 *
 * 补上 mention-path-only.test.ts 的盲区：那里只测了路径构造纯函数，
 * 没验证「设置环境变量后 getAttachments 真的返回路径附件、且不读文件内容」。
 *
 * 断言的是**真实 getAttachments 的返回**，不是复刻逻辑。
 */

// 避免真实技能发现/MCP 等附件路径产生噪音或慢加载
vi.mock('../../src/services/skillSearch/prefetch.js', () => ({
  getTurnZeroSkillDiscovery: () => null,
}))

vi.mock('../../src/commands.js', () => ({
  getSkillToolCommands: async () => [],
  getMcpSkillCommands: () => [],
  clearCommandMemoizationCaches: () => {},
}))

let dir: string
let fileA: string
let fileB: string

/** 最小可用 ToolUseContext：开启标志后流程不会触碰大部分方法。 */
function makeContext() {
  return {
    getAppState: () => ({
      toolPermissionContext: {
        mode: 'default',
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
        additionalDirectories: [],
      },
    }),
    options: {
      agentDefinitions: { activeAgents: [] },
      tools: [],
      isNonInteractiveSession: true,
    },
    // 对照组会走 generateFileAttachment，它依赖 readFileState（Map#get）。
    // 缺这个字段会抛 TypeError，被 maybe() 吞掉后表现为"没有附件"。
    readFileState: new Map(),
    abortController: new AbortController(),
    messages: [],
  } as never
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mention-e2e-'))
  fileA = join(dir, 'alpha.ts')
  fileB = join(dir, 'beta.md')
  // 写入带特征的内容：若被预读进上下文，断言能立刻发现
  writeFileSync(fileA, 'SECRET_MARKER_ALPHA_内容不应出现在附件里')
  writeFileSync(fileB, '# BETA HEADING 同样不应出现')
})

// 预热：getAttachments 首次调用在 vitest 里要 20s+（重依赖转译 + mock 装载），
// 属测试环境开销而非被测行为。放 beforeAll 里让用例本身只做断言。
beforeAll(async () => {
  process.env.CLAUDE_CODE_DISABLE_FILE_MENTIONS = '1'
  const { getAttachments } = await import('../../src/utils/attachments.js')
  const warm = mkdtempSync(join(tmpdir(), 'mention-warm-'))
  const f = join(warm, 'warm.ts')
  writeFileSync(f, 'warm')
  try {
    await getAttachments(`@${f}`, makeContext(), null, [])
  } finally {
    rmSync(warm, { recursive: true, force: true })
    delete process.env.CLAUDE_CODE_DISABLE_FILE_MENTIONS
  }
}, 60_000)

afterEach(() => {
  delete process.env.CLAUDE_CODE_DISABLE_FILE_MENTIONS
  rmSync(dir, { recursive: true, force: true })
})

describe('getAttachments 端到端：@提及仅路径', () => {
  // 刻意不做「未设标志时读取内容」的对照组：
  //   · 真实读盘路径（generateFileAttachment）在 vitest 里首次调用要 20s+
  //     （PDF 类型探测等），而这条行为与本改动的开关无关；
  //   · spyOn 对 ESM 导出无效（内部调用的是本地绑定，不是导出对象属性），
  //     无法廉价地观察调用。
  // 该对照组要防的「管线根本没工作导致假通过」风险，由两个事实覆盖：
  //   ① 设标志时确实返回了 1 个 mention_path_only（管线在工作）
  //   ② mention-path-only.test.ts 单独验证了附件构造与后缀剥离
  it.skip('未设置标志时读取内容（对照组已省略，原因见上）', () => {})

  it('设置标志后返回 mention_path_only，且不含文件内容', async () => {
    process.env.CLAUDE_CODE_DISABLE_FILE_MENTIONS = '1'
    const { getAttachments } = await import('../../src/utils/attachments.js')

    const result = await getAttachments(`@${fileA}`, makeContext(), null, [])

    const pathOnly = result.filter(
      (a: { type?: string }) => a.type === 'mention_path_only',
    ) as Array<{ type: string; filename: string; displayPath: string }>

    expect(pathOnly.length).toBe(1)
    expect(pathOnly[0]!.filename).toBe(fileA)
    // 关键：内容绝不能被读进来
    expect(JSON.stringify(result)).not.toContain('SECRET_MARKER_ALPHA')
    // 也不应出现带内容的 file 附件
    expect(result.some((a: { type?: string }) => a.type === 'file')).toBe(false)
  }, 30_000)

  it('多个 @提及时逐个转成路径附件', async () => {
    process.env.CLAUDE_CODE_DISABLE_FILE_MENTIONS = '1'
    const { getAttachments } = await import('../../src/utils/attachments.js')

    const result = await getAttachments(
      `@${fileA} 和 @${fileB}`,
      makeContext(),
      null,
      [],
    )
    const pathOnly = result.filter(
      (a: { type?: string }) => a.type === 'mention_path_only',
    ) as Array<{ filename: string }>

    expect(pathOnly.length).toBe(2)
    const names = pathOnly.map(p => p.filename).sort()
    expect(names).toEqual([fileA, fileB].sort())
  }, 30_000)

  it('文件不存在时仍返回路径附件（不读盘，不报错）', async () => {
    process.env.CLAUDE_CODE_DISABLE_FILE_MENTIONS = '1'
    const { getAttachments } = await import('../../src/utils/attachments.js')

    const ghost = join(dir, 'not-exist.ts')
    const result = await getAttachments(`@${ghost}`, makeContext(), null, [])
    const pathOnly = result.filter(
      (a: { type?: string }) => a.type === 'mention_path_only',
    ) as Array<{ filename: string }>

    // 官方语义就是"只给路径"——不校验存在性
    expect(pathOnly.length).toBe(1)
    expect(pathOnly[0]!.filename).toBe(ghost)
  }, 30_000)

  it('带 #L 行号后缀时附件里不含行号', async () => {
    process.env.CLAUDE_CODE_DISABLE_FILE_MENTIONS = '1'
    const { getAttachments } = await import('../../src/utils/attachments.js')

    const result = await getAttachments(
      `@${fileA}#L10-20`,
      makeContext(),
      null,
      [],
    )
    const pathOnly = result.filter(
      (a: { type?: string }) => a.type === 'mention_path_only',
    ) as Array<{ filename: string }>

    expect(pathOnly.length).toBe(1)
    expect(pathOnly[0]!.filename).toBe(fileA)
    expect(pathOnly[0]!.filename).not.toContain('#L')
  }, 30_000)
})
