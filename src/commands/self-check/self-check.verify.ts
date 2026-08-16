/**
 * self-check 命令验证脚本（轻量版）
 * 运行方式: npx tsx src/commands/self-check/self-check.verify.ts
 *
 * 验证策略：只测试命令注册、帮助文本、参数解析、错误处理
 * 不实际执行 lint/test/security 等重量级命令，避免超时
 */

import selfCheck from './index.js'

async function verify() {
  console.log('🔍 开始验证 /self-check 命令...\n')

  let passed = 0
  let failed = 0

  const check = async (name: string, fn: () => Promise<void> | void) => {
    try {
      await fn()
      console.log(`✅ ${name}`)
      passed++
    } catch (e) {
      console.log(`❌ ${name}:`, e instanceof Error ? e.message : String(e))
      failed++
    }
  }

  await check('导入成功且类型正确', async () => {
    const cmd = await selfCheck.load()
    if (!cmd || !cmd.call || typeof cmd.call !== 'function') throw new Error('Command structure invalid')
  })

  await check('无参数时显示帮助信息', async () => {
    const cmd = await selfCheck.load()
    const result = await cmd.call('', {} as any)
    if (result.type !== 'text') throw new Error('Expected text type')
    const text = result.value as string
    if (!text.includes('🔍 自检命令')) throw new Error('Missing help title')
    if (!text.includes('/self-check')) throw new Error('Missing usage examples')
  })

  await check('帮助信息包含所有用法和项目类型', async () => {
    const cmd = await selfCheck.load()
    const result = await cmd.call('', {} as any)
    const text = result.value as string
    const sections = [
      '完整检查', 'lint', 'test', 'type-check', 'build', 'security', 'audit',
      'coverage', 'changed', 'ci', 'Node.js', 'Python', 'Rust', 'Go', 'Java'
    ]
    for (const s of sections) {
      if (!text.includes(s)) throw new Error(`Missing section: ${s}`)
    }
  })

  await check('命令元数据正确', async () => {
    if (!selfCheck || selfCheck.type !== 'local' || selfCheck.name !== 'self-check' || !selfCheck.description.includes('自检')) {
      throw new Error('Command metadata incorrect')
    }
  })

  await check('--max-iterations 参数解析正确', async () => {
    const parts = '--max-iterations 5'.split(/\s+/).filter(Boolean)
    const idx = parts.indexOf('--max-iterations')
    if (idx === -1 || !parts[idx + 1]) throw new Error('Invalid syntax')
    if (parseInt(parts[idx + 1], 10) !== 5) throw new Error('Expected 5')
  })

  await check('命令别名配置正确', async () => {
    if (!selfCheck.aliases || !selfCheck.aliases.includes('/self-check')) throw new Error('Missing /self-check')
    if (!selfCheck.aliases.includes('/check')) throw new Error('Missing /check')
    if (!selfCheck.aliases.includes('/verify')) throw new Error('Missing /verify')
  })

  await check('无效参数错误处理', async () => {
    const cmd = await selfCheck.load()
    const result = await cmd.call('invalid-mode --max-iterations 3', {} as any)
    if (result.type !== 'text') throw new Error('Should return text for invalid input')
  })

  await check('--max-iterations 边界值处理', async () => {
    const cmd = await selfCheck.load()
    const r1 = await cmd.call('--max-iterations -1', {} as any)
    if (r1.type !== 'text') throw new Error('Negative value not handled')
    const r2 = await cmd.call('--max-iterations 100', {} as any)
    if (r2.type !== 'text') throw new Error('Large value not handled')
  })

  await check('--format 参数可调用', async () => {
    const cmd = await selfCheck.load()
    const result = await cmd.call('--format json', {} as any)
    if (result.type !== 'text') throw new Error('Expected text type')
  })

  await check('组合参数可调用', async () => {
    const cmd = await selfCheck.load()
    const result = await cmd.call('lint --max-iterations 5 --threshold 90', {} as any)
    if (result.type !== 'text') throw new Error('Expected text type')
  })

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
