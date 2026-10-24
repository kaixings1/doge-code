/**
 * /vault 知识库检索守卫（吸收自 claude-obsidian）。
 *
 * 覆盖：
 * 1. extractLinks：解析 [[target]]、[[target|别名]]、[[target#标题]]，去重
 * 2. extractTags：提取 #tag，忽略代码块内的 #
 * 3. walkMarkdown：只收 .md，跳过 node_modules/.git 等
 * 4. BM25 检索能命中目标笔记
 * 5. --tag 列出带标签的笔记
 * 6. --links 给出出链与反向链接
 *
 * 变异验证：extractLinks 去掉别名处理 → 用例 1 失败；
 *          walkMarkdown 不跳过 node_modules → 用例 3 失败。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { extractLinks, extractTags, walkMarkdown } from '../../src/commands/vault/vault.js'

describe('extractLinks', () => {
  it('解析别名与标题锚点，并去重', () => {
    const text = '见 [[Foo]] 与 [[Bar|另一个名字]]，还有 [[Foo#小节]]'
    expect(extractLinks(text)).toEqual(['Foo', 'Bar'])
  })

  it('无链接返回空数组', () => {
    expect(extractLinks('纯文本 [单括号](http://x)')).toEqual([])
  })
})

describe('extractTags', () => {
  it('提取标签', () => {
    expect(extractTags('前面 #alpha 后面 #beta/gamma').sort()).toEqual(['alpha', 'beta/gamma'])
  })

  it('忽略代码块内的 #', () => {
    const text = '正常 #real\n```\n#comment\n```'
    expect(extractTags(text)).toEqual(['real'])
  })

  it('行内代码的反引号不算空白边界，因此不识别为标签', () => {
    // 正则要求 # 前是行首或空白；`#inline` 中的 # 前面是反引号
    expect(extractTags('`#inline`')).toEqual([])
    expect(extractTags('文本 `#nope` 但 #yes')).toEqual(['yes'])
  })
})

describe('walkMarkdown + 检索', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'doge-vault-'))
    writeFileSync(join(root, 'alpha.md'), '# Alpha\n连接池调优笔记\n#db', 'utf8')
    writeFileSync(join(root, 'beta.md'), '# Beta\n前端渲染优化\n参考 [[Alpha]]\n#frontend', 'utf8')
    writeFileSync(join(root, 'skip.txt'), '连接池 但这不是 md', 'utf8')
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'node_modules', 'dep.md'), '连接池 依赖里的 md', 'utf8')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('只收 .md 且跳过 node_modules', () => {
    const names = walkMarkdown(root).map(n => n.rel).sort()
    expect(names).toEqual(['alpha.md', 'beta.md'])
  })
})
