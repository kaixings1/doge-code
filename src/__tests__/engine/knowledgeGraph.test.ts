import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildKnowledgeGraph,
  extractSymbolFromLine,
  extractImports,
  extractClassRelations,
  resolveImportSpecifier,
  getDependencies,
  getDependents,
  findSymbols,
  getFileSymbols,
  findPath,
  getRelatedNodes,
  getGraphStats,
} from '../../engine/knowledgeGraph.js'
import type { KnowledgeGraph } from '../../engine/knowledgeGraph.js'

const files = [
  {
    path: 'src/utils/math.ts',
    content: `
export function add(a: number, b: number): number {
  return a + b
}

export class Calculator {
  total = 0
  addValue(v: number) {
    return add(this.total, v)
  }
}
`,
  },
  {
    path: 'src/app.ts',
    content: `
import { add, Calculator } from './utils/math'
import type { Config } from './config'

export function main() {
  const calc = new Calculator()
  return calc.addValue(add(1, 2))
}
`,
  },
  {
    path: 'src/config.ts',
    content: `
export interface Config {
  name: string
}
`,
  },
  {
    path: 'src/extends.ts',
    content: `
import { Calculator } from './utils/math'

export class AdvancedCalculator extends Calculator {
  multiply(a: number, b: number): number {
    return a * b
  }
}
`,
  },
]

let graph: KnowledgeGraph

describe('提取函数', () => {
  it('extractSymbolFromLine 识别函数/类/接口', () => {
    expect(extractSymbolFromLine('export function add(a: number) {')).toEqual({ kind: 'function', name: 'add' })
    expect(extractSymbolFromLine('export class Calculator {')).toEqual({ kind: 'class', name: 'Calculator' })
    expect(extractSymbolFromLine('export interface Config {')).toEqual({ kind: 'interface', name: 'Config' })
    expect(extractSymbolFromLine('export type Foo = string')).toEqual({ kind: 'type', name: 'Foo' })
    expect(extractSymbolFromLine('const x = 1')).toEqual({ kind: 'const', name: 'x' })
    expect(extractSymbolFromLine('const y = foo()')).toEqual({ kind: 'const', name: 'y' })
    expect(extractSymbolFromLine('  someMethod() {')).toBeNull()
  })

  it('extractImports 解析 import/require', () => {
    const imports = extractImports(`
import { add, Calculator } from './utils/math'
import defaultExport from './def'
import './side-effect'
const lodash = require('./lodash')
`)
    expect(imports.length).toBe(4)
    expect(imports[0].specifier).toBe('./utils/math')
    expect(imports[0].names).toContain('add')
    expect(imports[0].names).toContain('Calculator')
    expect(imports[1].names).toContain('defaultExport')
    expect(imports[3].specifier).toBe('./lodash')
    expect(imports[3].names).toContain('lodash')
  })

  it('extractClassRelations 解析继承/实现', () => {
    const rel = extractClassRelations('export class AdvancedCalculator extends Calculator implements Serializable, Cloneable {')
    expect(rel !== null).toBe(true)
    expect(rel!.className).toBe('AdvancedCalculator')
    expect(rel!.extendsName).toBe('Calculator')
    expect(rel!.implementsNames).toEqual(['Serializable', 'Cloneable'])
  })

  it('resolveImportSpecifier 规范化相对路径', () => {
    expect(resolveImportSpecifier('src/app.ts', './utils/math')).toBe('src/utils/math')
    expect(resolveImportSpecifier('src/app.ts', '../lib/util')).toBe('src/lib/util')
    expect(resolveImportSpecifier('src/app.ts', 'react') === null).toBe(true)
    expect(resolveImportSpecifier('src/app.ts', './dir/../other')).toBe('src/other')
  })
})

describe('buildKnowledgeGraph', () => {
  beforeEach(() => {
    graph = buildKnowledgeGraph(files)
  })

  it('构建文件与符号节点', () => {
    const fileNodes = graph.nodes.filter(n => n.type === 'file')
    expect(fileNodes.length).toBe(4)
    const symbols = graph.nodes.filter(n => n.type !== 'file')
    expect(symbols.some(s => s.name === 'add' && s.type === 'function')).toBe(true)
    expect(symbols.some(s => s.name === 'Calculator' && s.type === 'class')).toBe(true)
    expect(symbols.some(s => s.name === 'Config' && s.type === 'interface')).toBe(true)
  })

  it('defines 边：文件定义符号', () => {
    const mathFile = graph.nodeById.get('file:src/utils/math.ts')!
    const defines = (graph.adjacency.get(mathFile.id) ?? []).filter(e => e.relation === 'defines')
    expect(defines.length).toBeGreaterThanOrEqual(2)
  })

  it('imports 边：跨文件依赖', () => {
    const appDeps = getDependencies(graph, 'src/app.ts')
    expect(appDeps).toContain('src/utils/math.ts')
    expect(appDeps).toContain('src/config.ts')
  })

  it('getDependents 反向依赖', () => {
    const dependents = getDependents(graph, 'src/utils/math.ts')
    expect(dependents).toContain('src/app.ts')
    expect(dependents).toContain('src/extends.ts')
  })

  it('extends 边：类继承', () => {
    const adv = graph.nodeById.get('class:src/extends.ts:AdvancedCalculator')!
    const extendsEdges = (graph.adjacency.get(adv.id) ?? []).filter(e => e.relation === 'extends')
    expect(extendsEdges.length).toBeGreaterThanOrEqual(1)
    // 目标应为 utils/math.ts 中的 Calculator
    const target = graph.nodeById.get(extendsEdges[0].to)
    expect(target?.name).toBe('Calculator')
  })

  it('calls 边：函数调用', () => {
    // main 调用 add（跨文件符号）或 addValue（本文件类方法）
    const main = graph.nodeById.get('function:src/app.ts:main')
    const calls = (graph.adjacency.get(main!.id) ?? []).filter(e => e.relation === 'calls')
    expect(calls.length).toBeGreaterThanOrEqual(1)
  })

  it('findPath 找到可达路径', () => {
    const path = findPath(graph, 'src/app.ts', 'class:src/utils/math.ts:Calculator')
    expect(path !== null).toBe(true)
    expect(path!.length).toBeGreaterThan(0)
    // 终点是 Calculator
    expect(path![path!.length - 1].to).toBe('class:src/utils/math.ts:Calculator')
  })

  it('findSymbols 按名查找', () => {
    const syms = findSymbols(graph, 'Calculator')
    expect(syms.length).toBeGreaterThanOrEqual(1)
  })

  it('getRelatedNodes 出边+入边', () => {
    const add = graph.nodeById.get('function:src/utils/math.ts:add')!
    const related = getRelatedNodes(graph, add.id)
    // add 被 main 调用（calls 入边）
    expect(related.some(r => r.relation === 'calls')).toBe(true)
  })

  it('getGraphStats 统计', () => {
    const stats = getGraphStats(graph)
    expect(stats.files).toBe(4)
    expect(stats.imports).toBeGreaterThanOrEqual(2)
    expect(stats.edges).toBeGreaterThanOrEqual(stats.imports + stats.calls + stats.relations)
  })

  it('不存在路径的 findPath 返回 null', () => {
    expect(findPath(graph, 'src/nonexist.ts', 'class:nope') === null).toBe(true)
  })
})

describe('getFileSymbols', () => {
  beforeEach(() => {
    graph = buildKnowledgeGraph(files)
  })

  it('列出文件内全部符号', () => {
    const syms = getFileSymbols(graph, 'src/utils/math.ts')
    expect(syms.length).toBeGreaterThanOrEqual(2)
    expect(syms.map(s => s.name)).toContain('add')
    expect(syms.map(s => s.name)).toContain('Calculator')
  })
})
