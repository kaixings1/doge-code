import { describe, it, expect } from 'vitest'
import {
  tokenize,
  analyzeQuery,
  indexContent,
  buildIndex,
  searchIndex,
  searchSymbolsInIndex,
} from '../../engine/semanticSearch.js'
import type { IndexData } from '../../engine/semanticSearch.js'

const sampleFiles = [
  indexContent(`
// 用户注册逻辑
export function registerUser(username: string, password: string) {
  const salt = generateSalt()
  return hashPassword(password, salt)
}

export function loginUser(username: string, password: string) {
  return authenticate(username, password)
}
`, 'src/auth/register.ts', 1000, 300),
  indexContent(`
export interface User {
  id: number
  name: string
  email: string
}

export class UserService {
  findById(id: number): User | null {
    return null
  }
}
`, 'src/models/user.ts', 2000, 250),
  indexContent(`
import { registerUser } from './auth/register'
export function handleRegistration(req: any) {
  return registerUser(req.body.username, req.body.password)
}
`, 'src/api/handler.ts', 3000, 200),
]

function buildSampleIndex(): IndexData {
  return buildIndex(sampleFiles)
}

describe('tokenize', () => {
  it('提取英文词与驼峰拆分', () => {
    const tokens = tokenize('fetchUserData request')
    expect(tokens).toContain('fetch')
    expect(tokens).toContain('user')
    expect(tokens).toContain('data')
    expect(tokens).toContain('request')
  })

  it('过滤 stop words', () => {
    const tokens = tokenize('the function return value')
    expect(tokens).not.toContain('the')
    expect(tokens).not.toContain('function')
    expect(tokens).not.toContain('return')
    expect(tokens).toContain('value')
  })

  it('中文 unigram + bigram', () => {
    const tokens = tokenize('注册用户')
    expect(tokens).toContain('注')
    expect(tokens).toContain('册')
    expect(tokens).toContain('用')
    expect(tokens).toContain('户')
    expect(tokens).toContain('注册')
    expect(tokens).toContain('册用')
    expect(tokens).toContain('用户')
  })
})

describe('analyzeQuery', () => {
  it('提取关键词与目标符号', () => {
    const analysis = analyzeQuery('找出所有 registerUser 相关的函数')
    expect(analysis.targets).toContain('registerUser')
    expect(analysis.action).toBeTruthy()
    expect(analysis.terms.length).toBeGreaterThan(0)
  })

  it('识别驼峰符号名', () => {
    const analysis = analyzeQuery('UserService 在哪定义')
    expect(analysis.targets.some(t => t.toLowerCase().includes('userservice'))).toBe(true)
  })
})

describe('indexContent / buildIndex', () => {
  it('分块与符号提取', () => {
    const file = indexContent('export function foo() {}\nexport class Bar {}', 'src/x.ts')
    expect(file.symbols.map(s => s.name)).toContain('foo')
    expect(file.symbols.map(s => s.name)).toContain('Bar')
    expect(file.chunks.length).toBeGreaterThan(0)
  })

  it('buildIndex 计算 docFreq 与 avgChunkLen', () => {
    const index = buildSampleIndex()
    expect(index.files.length).toBe(3)
    expect(index.totalChunks).toBeGreaterThan(0)
    expect(index.avgChunkLen).toBeGreaterThan(0)
    expect(index.docFreq.get('registeruser')).toBeGreaterThanOrEqual(1)
  })
})

describe('searchIndex', () => {
  it('英文关键词命中内容', () => {
    const index = buildSampleIndex()
    const hits = searchIndex(index, 'registerUser')
    expect(hits.length).toBeGreaterThan(0)
    const paths = hits.map(h => h.filePath)
    expect(paths).toContain('src/auth/register.ts')
  })

  it('中文查询命中', () => {
    const index = buildSampleIndex()
    const hits = searchIndex(index, '用户注册')
    expect(hits.length).toBeGreaterThan(0)
  })

  it('符号名命中 UserService', () => {
    const index = buildSampleIndex()
    const hits = searchIndex(index, 'UserService')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].filePath).toBe('src/models/user.ts')
  })

  it('fileTypes 过滤', () => {
    const index = buildSampleIndex()
    const hits = searchIndex(index, 'register', { fileTypes: ['ts'] })
    expect(hits.length).toBeGreaterThan(0)
    const hits2 = searchIndex(index, 'register', { fileTypes: ['py'] })
    expect(hits2.length).toBe(0)
  })

  it('结果按分数降序', () => {
    const index = buildSampleIndex()
    const hits = searchIndex(index, 'user')
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score)
    }
  })
})

describe('searchSymbolsInIndex', () => {
  it('完全匹配优先', () => {
    const index = buildSampleIndex()
    const results = searchSymbolsInIndex(index, 'UserService')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('UserService')
    expect(results[0].kind).toBe('class')
  })

  it('前缀与包含匹配', () => {
    const index = buildSampleIndex()
    const results = searchSymbolsInIndex(index, 'register')
    expect(results.some(r => r.name === 'registerUser')).toBe(true)
  })
})
