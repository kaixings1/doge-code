import { describe, it, expect } from 'vitest'
import { ProjectScaffolderTool } from '../../tools/ProjectScaffolderTool/ProjectScaffolderTool.js'

describe('ProjectScaffolderTool', () => {
  it('create 需要 project_name', async () => {
    const result = await ProjectScaffolderTool.call({
      action: 'create',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('project_name')
  })

  it('create 生成项目骨架', async () => {
    const result = await ProjectScaffolderTool.call({
      action: 'create',
      project_name: 'my-app',
      project_type: 'react',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.project_path).toBe('./my-app')
    expect(result.data.files_created).toBeGreaterThan(0)
  })

  it('create 包含特性文件', async () => {
    const result = await ProjectScaffolderTool.call({
      action: 'create',
      project_name: 'my-app',
      project_type: 'node',
      features: ['auth', 'database'],
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.structure).toContain('src/features/auth/index.ts')
    expect(result.data.structure).toContain('src/features/database/index.ts')
  })

  it('init 初始化配置', async () => {
    const result = await ProjectScaffolderTool.call({
      action: 'init',
      project_name: 'test',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.project_path).toBe('./test')
  })

  it('generate 等同于 create', async () => {
    const result = await ProjectScaffolderTool.call({
      action: 'generate',
      project_name: 'test-gen',
      project_type: 'python',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.project_path).toBe('./test-gen')
  })

  it('未知 action 返回错误', async () => {
    const result = await ProjectScaffolderTool.call({
      action: 'deploy',
    } as any)
    expect(result.data.success).toBe(false)
  })
})
