import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { MemoryStore } from '../../engine/memoryStore.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createStore() {
  return new MemoryStore({
    projectDir: tmpDir,
    globalDir: path.join(tmpDir, 'global'),
  })
}

describe('MemoryStore 基本读写', () => {
  it('set/get 指定层', () => {
    const store = createStore()
    store.set('key1', 'value1', { level: 'session' })
    expect(store.get('key1')?.value).toBe('value1')
    expect(store.get('key1', 'session')?.value).toBe('value1')
  })

  it('get 优先级：global > project > session', () => {
    const store = createStore()
    store.set('dup', 'session-val', { level: 'session' })
    store.set('dup', 'project-val', { level: 'project' })
    store.set('dup', 'global-val', { level: 'global' })
    expect(store.get('dup')?.value).toBe('global-val')
  })

  it('自动分层：路径内容 → project', () => {
    const store = createStore()
    store.set('src/utils/parse.ts', '模块 utils 负责解析')
    expect(store.get('src/utils/parse.ts')?.level).toBe('project')
  })

  it('自动分层：偏好 → global', () => {
    const store = createStore()
    store.set('风格', '用户偏好使用 2 空格缩进')
    expect(store.get('风格')?.level).toBe('global')
  })

  it('has / delete', () => {
    const store = createStore()
    store.set('a', '1', { level: 'session' })
    expect(store.has('a')).toBe(true)
    expect(store.delete('a')).toBe(true)
    expect(store.has('a')).toBe(false)
  })
})

describe('MemoryStore 检索', () => {
  it('search 跨层关键词匹配', () => {
    const store = createStore()
    store.set('src/auth.ts', '认证逻辑包含 login 和 register', { level: 'project', tags: ['auth'] })
    store.set('备注', '用户偏好简洁输出', { level: 'global', tags: ['pref'] })
    const hits = store.search('auth')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].key).toContain('auth')
  })

  it('search 支持 tags 过滤', () => {
    const store = createStore()
    store.set('k1', 'hello world', { level: 'project', tags: ['alpha'] })
    store.set('k2', 'hello world', { level: 'project', tags: ['beta'] })
    const alphaHits = store.search('hello', { tags: ['alpha'] })
    expect(alphaHits.length).toBe(1)
    expect(alphaHits[0].key).toBe('k1')
  })

  it('search levels 过滤', () => {
    const store = createStore()
    store.set('s1', '共通数据', { level: 'session' })
    store.set('p1', '共通数据', { level: 'project' })
    const sessionOnly = store.search('共通数据', { levels: ['session'] })
    expect(sessionOnly.length).toBe(1)
    expect(sessionOnly[0].level).toBe('session')
  })

  it('byTag 按标签检索', () => {
    const store = createStore()
    store.set('src/a.ts', 'A', { level: 'project', tags: ['core'] })
    store.set('src/b.ts', 'B', { level: 'project', tags: ['core'] })
    store.set('src/c.ts', 'C', { level: 'project', tags: ['util'] })
    expect(store.byTag('core').length).toBe(2)
  })
})

describe('MemoryStore 持久化', () => {
  it('project/global 层落盘并可重载', () => {
    const store = createStore()
    store.set('架构', '模块分层：engine/commands/tools', { level: 'project', tags: ['arch'] })
    store.set('风格', '用户偏好中文回复', { level: 'global', tags: ['pref'] })

    // 新实例重载
    const store2 = createStore()
    expect(store2.get('架构')?.value).toContain('engine')
    expect(store2.get('风格')?.value).toContain('中文')
  })

  it('session 层不持久化', () => {
    const store = createStore()
    store.set('临时', '会话内容', { level: 'session' })
    const store2 = createStore()
    expect(store2.get('临时') === null).toBe(true)
  })
})

describe('MemoryStore 统计与清空', () => {
  it('stats 统计各层数量', () => {
    const store = createStore()
    store.set('s1', 'a', { level: 'session' })
    store.set('p1', 'a', { level: 'project' })
    store.set('g1', 'a', { level: 'global' })
    const stats = store.stats()
    expect(stats.session).toBe(1)
    expect(stats.project).toBe(1)
    expect(stats.global).toBe(1)
    expect(stats.total).toBe(3)
  })

  it('clear 单层与全清', () => {
    const store = createStore()
    store.set('p1', 'a', { level: 'project' })
    store.set('g1', 'a', { level: 'global' })
    store.clear('project')
    expect(store.get('p1') === null).toBe(true)
    expect(store.get('g1') !== null).toBe(true)
    store.clear()
    expect(store.stats().total).toBe(0)
  })
})
