/**
 * self-check 命令验证脚本
 * 运行方式: npx tsx src/commands/self-check/self-check.verify.ts
 */

import selfCheck from './index.js'

async function verify() {
  console.log('🔍 开始验证 /self-check 命令...\n')

  let passed = 0
  let failed = 0

  // 测试 1: 导入成功且类型正确
  try {
    const cmd = await selfCheck.load()
    if (!cmd || !cmd.call || typeof cmd.call !== 'function') {
      throw new Error('Command 结构不正确')
    }
    console.log('✅ 测试 1: 导入成功且类型正确')
    passed++
  } catch (e) {
    console.log('❌ 测试 1 失败:', e instanceof Error ? e.message : String(e))
    failed++
  }

  // 测试 2: 无参数时显示帮助信息
  try {
    const cmd = await selfCheck.load()
    const result = await cmd.call('', {} as any)

    if (result.type !== 'text') {
      throw new Error('Expected text type')
    }
    const text = result.value as string
    if (!text.includes('🔍 自检命令')) {
      throw new Error('Missing help title')
    }
    if (!text.includes('/self-check')) {
      throw new Error('Missing usage examples')
    }
    console.log('✅ 测试 2: 无参数时显示帮助信息')
    passed++
  } catch (e) {
    console.log('❌ 测试 2 失败:', e instanceof Error ? e.message : String(e))
    failed++
  }

  // 测试 3: 帮助信息包含所有用法和项目类型
  try {
    const cmd = await selfCheck.load()
    const result = await cmd.call('', {} as any)
    const text = result.value as string

    const requiredSections = [
      '完整检查',
      'lint',
      'test',
      'type-check',
      'build',
      'security',
      'audit',
      'coverage',
      'changed',
      'ci',
      'Node.js',
      'Python',
      'Rust',
      'Go',
      'Java',
    ]

    for (const section of requiredSections) {
      if (!text.includes(section)) {
        throw new Error(`Missing section: ${section}`)
      }
    }
    console.log('✅ 测试 3: 帮助信息包含所有用法和项目类型')
    passed++
  } catch (e) {
    console.log('❌ 测试 3 失败:', e instanceof Error ? e.message : String(e))
    failed++
  }

  // 测试 4: 命令元数据
  try {
    if (!selfCheck || selfCheck.type !== 'local' || selfCheck.name !== 'self-check' || !selfCheck.description.includes('自检')) {
      throw new Error('Command metadata incorrect')
    }
    console.log('✅ 测试 4: 命令元数据正确')
    passed++
  } catch (e) {
    console.log('❌ 测试 4 失败:', e instanceof Error ? e.message : String(e))
    failed++
  }

  // 测试 5: lint 模式
  try {
    const cmd = await selfCheck.load()
    const result = await cmd.call('lint', {} as any)

    if (result.type !== 'text') {
      throw new Error('Expected text type')
    }
    console.log('✅ 测试 5: lint 模式可调用')
    passed++
  } catch (e) {
    console.log('❌ 测试 5 失败:', e instanceof Error ? e.message : String(e))
    failed++
  }

  // 测试 6: test 模式
  try {
    const cmd = await selfCheck.load()
    const result = await cmd.call('test', {} as any)

    if (result.type !== 'text') {
      throw new Error('Expected text type')
    }
    console.log('✅ 测试 6: test 模式可调用')
    passed++
  } catch (e) {
    console.log('❌ 测试 6 失败:', e instanceof Error ? e.message : String(e))
    failed++
  }

  // 测试 7: max-iterations 参数
  try {
    const cmd = await selfCheck.load()
    const result = await cmd.call('--max-iterations 5', {} as any)

    if (result.type !== 'text') {
      throw new Error('Expected text type')
    }
    console.log('✅ 测试 7: --max-iterations 参数可调用')
    passed++
  } catch (e) {
    console.log('❌ 测试 7 失败:', e instanceof Error ? e.message : String(e))
    failed++
  }

  // 测试 8: changed 模式
  try {
    const cmd = await selfCheck.load()
    const result = await cmd.call('changed', {} as any)

    if (result.type !== 'text') {
      throw new Error('Expected text type')
    }
    console.log('✅ 测试 8: changed 模式可调用')
    passed++
  } catch (e) {
    console.log('❌ 测试 8 失败:', e instanceof Error ? e.message : String(e))
    failed++
  }

  // 测试 9: security 模式
  try {
    const cmd = await selfCheck.load()
    const result = await cmd.call('security', {} as any)

    if (result.type !== 'text') {
      throw new Error('Expected text type')
    }
    console.log('✅ 测试 9: security 模式可调用')
    passed++
  } catch (e) {
    console.log('❌ 测试 9 失败:', e instanceof Error ? e.message : String(e))
    failed++
  }

  // 测试 10: ci 模式
  try {
    const cmd = await selfCheck.load()
    const result = await cmd.call('ci', {} as any)

    if (result.type !== 'text') {
      throw new Error('Expected text type')
    }
    console.log('✅ 测试 10: ci 模式可调用')
    passed++
  } catch (e) {
    console.log('❌ 测试 10 失败:', e instanceof Error ? e.message : String(e))
    failed++
  }

  // 输出结果
  console.log(`\n${'='.repeat(50)}`)
  console.log(`📊 验证结果: ${passed} 通过, ${failed} 失败`)
  console.log('='.repeat(50))

  if (failed > 0) {
    console.log('\n❌ 部分测试失败')
    process.exit(1)
  } else {
    console.log('\n✅ 所有验证测试通过')
    process.exit(0)
  }
}

verify().catch(e => {
  console.error('❌ 验证脚本执行失败:', e)
  process.exit(1)
})
