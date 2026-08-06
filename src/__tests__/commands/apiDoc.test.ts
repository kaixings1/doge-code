import { describe, it, expect } from 'vitest'
import {
  extractFunctionSignatures,
  extractRoutesAdvanced,
  extractRoutes,
  parseParams,
  extractTypesAST,
  generateSignaturesMarkdown,
  generateMarkdown,
} from '../../commands/api-doc/index.ts'

describe('api-doc parseParams', () => {
  it('应该解析普通参数', () => {
    const params = parseParams('a: string, b: number')
    expect(params).toHaveLength(2)
    expect(params[0]).toEqual({ name: 'a', type: 'string', rest: false })
    expect(params[1]).toEqual({ name: 'b', type: 'number', rest: false })
  })

  it('应该解析可选参数 b?: number', () => {
    const params = parseParams('a: string, b?: number')
    expect(params[1].optional).toBe(true)
    expect(params[1].type).toBe('number')
  })

  it('应该解析 rest 参数 ...rest: any[]', () => {
    const params = parseParams('...rest: any[]')
    expect(params[0].rest).toBe(true)
    expect(params[0].name).toBe('rest')
    expect(params[0].type).toBe('any[]')
  })

  it('应该解析带默认值的参数 name: string = "x"', () => {
    const params = parseParams('name: string = "x"')
    expect(params[0].name).toBe('name')
    expect(params[0].type).toBe('string')
  })

  it('应该忽略泛型嵌套逗号', () => {
    const params = parseParams('cb: (a: number, b: string) => void, other: boolean')
    expect(params).toHaveLength(2)
    expect(params[0].type).toBe('(a: number, b: string) => void')
  })

  it('空字符串返回空数组', () => {
    expect(parseParams('')).toEqual([])
  })
})

describe('api-doc extractFunctionSignatures', () => {
  const sample = `export function add(a: number, b: number): number {
  return a + b
}

export const multiply = async (a: number, b: number): Promise<number> => {
  return a * b
}

class Calc {
  public divide(x: number, y: number): number {
    return x / y
  }
}
`

  it('应该提取函数声明', () => {
    const sigs = extractFunctionSignatures(sample)
    const add = sigs.find(s => s.name === 'add')
    expect(add).toBeDefined()
    expect(add!.isExport).toBe(true)
    expect(add!.isAsync).toBe(false)
    expect(add!.returnType).toBe('number')
    expect(add!.params).toHaveLength(2)
  })

  it('应该提取箭头函数（含 async/export）', () => {
    const sigs = extractFunctionSignatures(sample)
    const multiply = sigs.find(s => s.name === 'multiply')
    expect(multiply).toBeDefined()
    expect(multiply!.isAsync).toBe(true)
    expect(multiply!.isExport).toBe(true)
    expect(multiply!.returnType).toContain('Promise<number>')
  })

  it('应该提取类方法', () => {
    const sigs = extractFunctionSignatures(sample)
    const divide = sigs.find(s => s.name === 'divide')
    expect(divide).toBeDefined()
    expect(divide!.isExport).toBe(false)
    expect(divide!.params[0].name).toBe('x')
  })

  it('空内容返回空数组', () => {
    expect(extractFunctionSignatures('')).toEqual([])
  })
})

describe('api-doc extractRoutesAdvanced', () => {
  it('应该提取 Next.js App Router 处理器', () => {
    const code = `export async function GET(request: Request) {
  return Response.json({ ok: true })
}
export const POST = async (req: Request) => { return Response.json({}) }`
    const routes = extractRoutesAdvanced(code)
    expect(routes.some(r => r.method === 'GET')).toBe(true)
    expect(routes.some(r => r.method === 'POST')).toBe(true)
  })

  it('应该提取装饰器路由 @Get("/users")', () => {
    const code = `@Get('/users')
@Post('/users')
class UserController {}`
    const routes = extractRoutesAdvanced(code)
    expect(routes.some(r => r.path === '/users' && r.method === 'GET')).toBe(true)
    expect(routes.some(r => r.path === '/users' && r.method === 'POST')).toBe(true)
  })

  it('应该提取链式路由 app.route("/orders").get(...)', () => {
    const code = `app.route('/orders').get(handler)
app.route('/items').post(handler2)`
    const routes = extractRoutesAdvanced(code)
    expect(routes.some(r => r.path === '/orders' && r.method === 'GET')).toBe(true)
    expect(routes.some(r => r.path === '/items' && r.method === 'POST')).toBe(true)
  })
})

describe('api-doc extractRoutes', () => {
  it('应该提取 express 风格路由', () => {
    const code = `router.get('/api/users', handler)
router.post('/api/users', handler2)
router.delete('/api/users/:id', handler3)`
    const routes = extractRoutes(code, 'express')
    expect(routes).toHaveLength(3)
    expect(routes[0].method).toBe('GET')
    expect(routes[0].path).toBe('/api/users')
    expect(routes[2].method).toBe('DELETE')
  })
})

describe('api-doc extractTypesAST', () => {
  const code = `export interface User {
  id: number
  name: string
  email?: string
  greet(prefix: string): string
}

export type Callback<T> = {
  run: (v: T) => void
  label?: string
}

export enum Status {
  Active = 1,
  Inactive,
  Pending,
}

export class Service extends Base {
  private client: HttpClient
  fetch(id: string): Promise<{ ok: boolean }> { return Promise.resolve({ ok: true }) }
}
`

  it('应该提取 interface 成员与可选标记', () => {
    const types = extractTypesAST(code)
    const user = types.find(t => t.name === 'User')
    expect(user).toBeDefined()
    expect(user!.kind).toBe('interface')
    const email = user!.members.find(m => m.name === 'email')
    expect(email!.optional).toBe(true)
    expect(email!.type).toBe('string')
    const greet = user!.members.find(m => m.name === 'greet')
    expect(greet!.kind).toBe('method')
    expect(greet!.type).toContain('(prefix: string) => string')
  })

  it('应该提取 type 别名泛型参数与对象成员', () => {
    const types = extractTypesAST(code)
    const callback = types.find(t => t.name === 'Callback')
    expect(callback).toBeDefined()
    expect(callback!.kind).toBe('type')
    expect(callback!.typeParams).toEqual(['T'])
    const run = callback!.members.find(m => m.name === 'run')
    expect(run!.type).toContain('(v: T) => void')
  })

  it('应该提取 enum 成员', () => {
    const types = extractTypesAST(code)
    const status = types.find(t => t.name === 'Status')
    expect(status!.kind).toBe('enum')
    const active = status!.members.find(m => m.name === 'Active')
    expect(active!.type).toBe('1')
    expect(status!.members).toHaveLength(3)
  })

  it('应该提取 class 继承与成员', () => {
    const types = extractTypesAST(code)
    const service = types.find(t => t.name === 'Service')
    expect(service!.kind).toBe('class')
    expect(service!.extends).toContain('Base')
    const client = service!.members.find(m => m.name === 'client')
    expect(client!.type).toBe('HttpClient')
    const fetch = service!.members.find(m => m.name === 'fetch')
    expect(fetch!.type).toContain('(id: string) => Promise<{ ok: boolean }>')
  })
})

describe('api-doc 文档生成', () => {
  it('generateSignaturesMarkdown 应该生成带行号和返回类型的文档', () => {
    const md = generateSignaturesMarkdown('x.ts', [
      { name: 'foo', params: [{ name: 'a', type: 'string' }], returnType: 'number', isAsync: false, isExport: true, line: 5 },
    ])
    expect(md).toContain('foo(`a: string`)')
    expect(md).toContain('**返回类型:** `number`')
    expect(md).toContain('**行号:** 5')
  })

  it('generateMarkdown 应该按路径分组', () => {
    const md = generateMarkdown('API', [
      { name: 'users', method: 'GET', path: '/api/users', description: 'list', params: [], returnType: '', file: '', line: 1 },
      { name: 'orders', method: 'POST', path: '/api/orders', description: 'create', params: [], returnType: '', file: '', line: 2 },
    ])
    expect(md).toContain('# API')
    expect(md).toContain('GET /api/users')
    expect(md).toContain('POST /api/orders')
  })
})
