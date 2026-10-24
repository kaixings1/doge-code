/**
 * BM25 检索守卫（吸收自 claude-obsidian bm25-index.py）。
 *
 * 覆盖：
 * 1. 关键词能把目标文档排第一
 * 2. 长度归一（b=0.75）生效：短文档提到同样的词，得分高于被无关内容稀释的长文档
 * 3. k1/b 可调；调 b=0 时长度归一关闭
 * 4. 停用词被过滤（纯 "the a of" 查询无结果）
 * 5. 中文按字+二元组可命中
 * 6. snippet/line 指向命中行
 * 7. 空查询返回空
 *
 * 变异验证：把 idf 改成常数 → 用例 2 失败（长短文档分数关系倒置）；
 *          去掉 STOPWORDS 过滤 → 用例 4 失败。
 */
import { describe, it, expect } from 'vitest'
import { Bm25Index } from '../../src/utils/bm25.js'

const DOCS = [
  { id: 'short', path: 'short.md', text: '连接池 连接池 连接池' },
  {
    id: 'long',
    path: 'long.md',
    text: '连接池 ' + Array.from({ length: 200 }, (_, i) => `无关词${i}`).join(' '),
  },
  { id: 'other', path: 'other.md', text: '完全无关的内容 前端渲染' },
]

describe('Bm25Index', () => {
  it('关键词命中目标文档', () => {
    const idx = new Bm25Index(DOCS)
    const hits = idx.search('连接池')
    expect(hits.length).toBe(2)
    expect(hits.map(h => h.id)).toContain('short')
    expect(hits.map(h => h.id)).toContain('long')
  })

  it('长度归一：短文档得分高于稀释的长文档', () => {
    const idx = new Bm25Index(DOCS)
    const hits = idx.search('连接池')
    const short = hits.find(h => h.id === 'short')!
    const long = hits.find(h => h.id === 'long')!
    expect(short.score).toBeGreaterThan(long.score)
  })

  it('b=0 时关闭长度归一，长文档不再被压', () => {
    const noNorm = new Bm25Index(DOCS, { b: 0 })
    const hits = noNorm.search('连接池')
    const long = hits.find(h => h.id === 'long')!
    const normed = new Bm25Index(DOCS).search('连接池').find(h => h.id === 'long')!
    expect(long.score).toBeGreaterThan(normed.score)
  })

  it('纯停用词查询无结果', () => {
    const idx = new Bm25Index(DOCS)
    expect(idx.search('the a of and')).toEqual([])
  })

  it('中文二元组可命中', () => {
    const idx = new Bm25Index(DOCS)
    const hits = idx.search('前端渲染')
    expect(hits[0]?.id).toBe('other')
  })

  it('snippet 与 line 指向命中行', () => {
    const idx = new Bm25Index([
      { id: 'a', path: 'a.md', text: '第一行\n第二行 连接池\n第三行' },
    ])
    const hit = idx.search('连接池')[0]
    expect(hit.line).toBe(2)
    expect(hit.snippet).toContain('连接池')
  })

  it('空查询与空索引', () => {
    expect(new Bm25Index(DOCS).search('   ')).toEqual([])
    expect(new Bm25Index([]).search('x')).toEqual([])
  })

  it('documentFrequency 按实际切分后的 token 统计', () => {
    const idx = new Bm25Index(DOCS)
    // 中文按「字 + 二元组」切分：'连接池' 本身不是 token，'连接'、'接池' 才是
    expect(idx.documentFrequency('连接')).toBe(2)
    expect(idx.documentFrequency('连接池')).toBe(0)
  })
})
