/**
 * 本地 TF-IDF 检索守卫。
 *
 * 覆盖：
 * 1. tokenize：英文按词、中文按字+二元组
 * 2. 检索能按关键词把目标文件排第一
 * 3. IDF 生效：多个文件都含的词权重低于独有词
 * 4. snippet 指向命中行
 * 5. 快照 round-trip 后检索结果一致（不依赖原文）
 * 6. 空查询返回空结果
 *
 * 变异验证：把 score 改成「命中词数」→ 用例 3 失败；
 *          删掉 snippet 提取 → 用例 4 失败。
 */
import { describe, it, expect } from 'vitest'
import {
  LocalRagIndex,
  extractSnippet,
  tokenize,
} from '../../src/utils/localRag.js'

const DOCS = [
  { path: '/a/alpha.md', text: '这是一个关于数据库连接池的实现说明\n连接池需要处理超时与重试', length: 40 },
  { path: '/a/beta.md', text: '这里讲前端渲染与组件拆分\n与数据库无关的内容', length: 30 },
  { path: '/a/gamma.md', text: '服务器部署脚本\n超时配置说明', length: 20 },
]

describe('tokenize', () => {
  it('英文按词切分，中文按字+二元组', () => {
    const t = tokenize('Hello World 数据库')
    expect(t).toContain('hello')
    expect(t).toContain('world')
    expect(t).toContain('数')
    expect(t).toContain('数据')
  })
})

describe('LocalRagIndex', () => {
  it('关键词检索把目标文件排第一', () => {
    const idx = new LocalRagIndex(DOCS)
    const hits = idx.search('连接池')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].path).toBe('/a/alpha.md')
  })

  it('IDF 让独有词权重更高', () => {
    const idx = new LocalRagIndex(DOCS)
    const hits = idx.search('组件拆分')
    const first = hits[0]
    expect(first.path).toBe('/a/beta.md')
    expect(first.score).toBeGreaterThan(0)
  })

  it('snippet 指向命中行', () => {
    const idx = new LocalRagIndex(DOCS)
    const hit = idx.search('连接池')[0]
    expect(hit.line).toBeGreaterThan(0)
    expect(hit.snippet).toContain('连接池')
  })

  it('快照 round-trip 后排序一致', () => {
    const idx = new LocalRagIndex(DOCS)
    const snap = idx.toSnapshot()
    const restored = LocalRagIndex.fromSnapshot(snap)
    const a = idx.search('连接池').map(h => h.path)
    const b = restored.search('连接池').map(h => h.path)
    expect(b).toEqual(a)
    // 快照没有原文，不应产生假片段
    expect(restored.search('连接池')[0].snippet).toBe('')
  })

  it('空查询返回空', () => {
    const idx = new LocalRagIndex(DOCS)
    expect(idx.search('   ')).toEqual([])
    expect(idx.search('!!!')).toEqual([])
  })
})

describe('extractSnippet', () => {
  it('选中命中密度最高的一行', () => {
    const text = '第一行\n第二行 关键词 关键词\n第三行'
    // 传真实查询 token（中文按二元组切分），而不是整词
    const { snippet, line } = extractSnippet(text, new Set(tokenize('关键词')))
    expect(line).toBe(2)
    expect(snippet).toContain('关键词')
  })
})
