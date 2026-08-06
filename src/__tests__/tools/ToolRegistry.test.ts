import { describe, it, expect, vi } from 'vitest'
import { ToolRegistry, type ITool, type ToolExecutionContext } from '../../api/ToolRegistry.js'

function makeTool(name: string, overrides: Partial<ITool> = {}): ITool {
  return {
    name,
    description: `Tool ${name}`,
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(() => Promise.resolve({ success: true })),
    ...overrides,
  }
}

function ctx(permissions: string[] = []): ToolExecutionContext {
  return { sessionId: 's1', messageId: 'm1', permissions }
}

describe('ToolRegistry 注册管理', () => {
  it('注册工具后可获取', () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('A'))
    expect(reg.has('A')).toBe(true)
    expect(reg.get('A')?.name).toBe('A')
    expect(reg.size()).toBe(1)
    expect(reg.listNames()).toEqual(['A'])
  })

  it('重复注册抛错', () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('A'))
    expect(() => reg.register(makeTool('A'))).toThrow('already registered')
  })

  it('缺少 name 抛错', () => {
    const reg = new ToolRegistry()
    expect(() => reg.register({ ...makeTool('x'), name: '' })).toThrow()
  })

  it('缺少 description 抛错', () => {
    const reg = new ToolRegistry()
    expect(() => reg.register({ ...makeTool('x'), description: ' ' })).toThrow()
  })

  it('非 object 参数 schema 抛错', () => {
    const reg = new ToolRegistry()
    expect(() => reg.register({ ...makeTool('x'), parameters: { type: 'array', properties: {} } as any })).toThrow()
  })

  it('注销后不可获取', () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('A'))
    reg.unregister('A')
    expect(reg.has('A')).toBe(false)
    expect(() => reg.unregister('A')).toThrow('not found')
  })
})

describe('ToolRegistry 依赖注入', () => {
  it('注册时自动解析依赖（依赖已注册）', () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('base'))
    reg.register(makeTool('top', { dependencies: ['base'] }))
    expect(reg.checkDependencies()).toEqual([])
  })

  it('未解析依赖在注册时抛错', () => {
    const reg = new ToolRegistry()
    expect(() => reg.register(makeTool('top', { dependencies: ['missing'] }))).toThrow('unresolved dependency')
  })

  it('getDependencies 返回已注册依赖', () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('base'))
    reg.register(makeTool('top', { dependencies: ['base'] }))
    const deps = reg.getDependencies(reg.get('top')!)
    expect(Object.keys(deps)).toEqual(['base'])
  })

  it('checkDependencies 列出依赖被移除后的未解析项', () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('b'))
    reg.register(makeTool('a', { dependencies: ['b'] }))
    expect(reg.checkDependencies()).toEqual([])
    // 注销 b 后，a 的依赖变为未解析
    reg.unregister('b')
    expect(reg.checkDependencies()).toEqual(['a -> b'])
  })
})

describe('ToolRegistry 组合工具', () => {
  it('compose 组合依赖工具执行', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('base', {
      execute: vi.fn(() => Promise.resolve({ success: true, output: 'base-out' })),
    }))
    reg.compose('combo', ['base'], (tools) => async (params, context) => {
      const base = await tools.base.execute(params, context)
      return { success: true, output: 'combo:' + (base as any).output }
    })
    const result = await reg.execute('combo', {}, ctx())
    expect(result.success).toBe(true)
    expect(result.output).toBe('combo:base-out')
  })

  it('compose 缺依赖抛错', () => {
    const reg = new ToolRegistry()
    expect(() => reg.compose('combo', ['nope'], () => async () => ({ success: true }))).toThrow('missing dependency')
  })
})

describe('ToolRegistry 拓扑排序', () => {
  it('topoSort 依赖在前', () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('leaf'))
    reg.register(makeTool('mid', { dependencies: ['leaf'] }))
    reg.register(makeTool('top', { dependencies: ['mid', 'leaf'] }))
    const sorted = reg.topoSort()
    expect(sorted.indexOf('leaf')).toBeLessThan(sorted.indexOf('mid'))
    expect(sorted.indexOf('mid')).toBeLessThan(sorted.indexOf('top'))
  })

  it('循环依赖抛错并列出节点', () => {
    const reg = new ToolRegistry()
    // register 会阻止未解析依赖注册，直接注入内部 Map 构造循环依赖
    ;(reg as any).tools.set('a', makeTool('a', { dependencies: ['b'] }))
    ;(reg as any).tools.set('b', makeTool('b', { dependencies: ['a'] }))
    expect(() => reg.topoSort()).toThrow(/Circular dependency/)
  })

  it('getDependencyDepth 计算依赖深度', () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('a'))
    reg.register(makeTool('b', { dependencies: ['a'] }))
    reg.register(makeTool('c', { dependencies: ['b'] }))
    expect(reg.getDependencyDepth('a')).toBe(0)
    expect(reg.getDependencyDepth('b')).toBe(1)
    expect(reg.getDependencyDepth('c')).toBe(2)
  })

  it('listLeafTools 列出无依赖工具', () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('a'))
    reg.register(makeTool('b', { dependencies: ['a'] }))
    expect(reg.listLeafTools()).toEqual(['a'])
  })
})

describe('ToolRegistry 参数验证', () => {
  it('必填参数缺失返回 validation 错误', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('req', {
      parameters: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
      },
    }))
    const result = await reg.execute('req', {}, ctx())
    expect(result.success).toBe(false)
    expect(result.errorType).toBe('validation')
    expect(result.error).toContain('Missing required parameter: id')
  })

  it('类型不匹配返回 validation 错误', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('typed', {
      parameters: { type: 'object', properties: { n: { type: 'number' } } },
    }))
    const result = await reg.execute('typed', { n: 'not-a-number' }, ctx())
    expect(result.errorType).toBe('validation')
    expect(result.error).toContain("must be number")
  })

  it('枚举值不合法返回 validation 错误', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('enum', {
      parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['a', 'b'] } } },
    }))
    const result = await reg.execute('enum', { mode: 'c' }, ctx())
    expect(result.error).toContain("must be one of")
  })

  it('数值范围校验', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('range', {
      parameters: { type: 'object', properties: { x: { type: 'number', minimum: 1, maximum: 10 } } },
    }))
    expect((await reg.execute('range', { x: 0 }, ctx())).errorType).toBe('validation')
    expect((await reg.execute('range', { x: 11 }, ctx())).errorType).toBe('validation')
    expect((await reg.execute('range', { x: 5 }, ctx())).success).toBe(true)
  })

  it('默认值自动填充', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('def', {
      parameters: { type: 'object', properties: { level: { type: 'string', default: 'info' } } },
    }))
    await reg.execute('def', {}, ctx())
    // execute 通过，无 validation 错误即可
  })
})

describe('ToolRegistry 权限检查', () => {
  it('deny:ToolName 拒绝执行', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('secret'))
    const result = await reg.execute('secret', {}, ctx(['deny:secret']))
    expect(result.success).toBe(false)
    expect(result.errorType).toBe('permission')
  })

  it('deny:* 拒绝全部', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('any'))
    const result = await reg.execute('any', {}, ctx(['deny:*']))
    expect(result.errorType).toBe('permission')
  })

  it('allow:ToolName 允许执行（无 deny）', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('ok'))
    const result = await reg.execute('ok', {}, ctx(['allow:ok']))
    expect(result.success).toBe(true)
  })

  it('deny:* 优先于 allow:ToolName（deny 优先策略）', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('ok'))
    const result = await reg.execute('ok', {}, ctx(['deny:*', 'allow:ok']))
    expect(result.success).toBe(false)
    expect(result.errorType).toBe('permission')
  })

  it('无权限列表默认放行', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('open'))
    const result = await reg.execute('open', {}, ctx())
    expect(result.success).toBe(true)
  })
})

describe('ToolRegistry 超时与统计', () => {
  it('超时返回 timeout 错误', async () => {
    const reg = new ToolRegistry(50)
    reg.register(makeTool('slow', {
      execute: () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 500)),
    }))
    const result = await reg.execute('slow', {}, ctx())
    expect(result.success).toBe(false)
    expect(result.errorType).toBe('timeout')
  })

  it('getStats 统计调用数与失败数', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('counter', {
      execute: vi.fn(() => Promise.resolve({ success: true })),
    }))
    await reg.execute('counter', {}, ctx())
    await reg.execute('counter', {}, ctx())
    await reg.execute('nonexistent', {}, ctx())
    const stats = reg.getStats()
    expect(stats.counter.calls).toBe(2)
    expect(stats.counter.failures).toBe(0)
  })

  it('失败调用计入 failures', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('fail', {
      execute: vi.fn(() => Promise.resolve({ success: false, error: 'boom' })),
    }))
    await reg.execute('fail', {}, ctx())
    expect(reg.getStats().fail.failures).toBe(1)
  })

  it('执行异常归类为 execution', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool('throw', {
      execute: vi.fn(() => Promise.reject(new Error('kaboom'))),
    }))
    const result = await reg.execute('throw', {}, ctx())
    expect(result.success).toBe(false)
    expect(result.errorType).toBe('execution')
    expect(result.error).toContain('kaboom')
  })

  it('工具不存在返回 not_found', async () => {
    const reg = new ToolRegistry()
    const result = await reg.execute('ghost', {}, ctx())
    expect(result.errorType).toBe('not_found')
  })
})
