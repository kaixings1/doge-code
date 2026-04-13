// 测试 -p 模式(非交互式)
console.log('=== 测试 -p 模式 ===\n')

let lastStep = '开始'
const timer = setTimeout(() => {
  console.log('\n❌ 超时! 卡在:', lastStep)
  process.exit(1)
}, 15000)

try {
  const { ensureBootstrapMacro } = await import('./src1/bootstrapMacro.ts')
  ensureBootstrapMacro()
  
  const { profileCheckpoint } = await import('./src1/utils/startupProfiler.js')
  const { startCapturingEarlyInput } = await import('./src1/utils/earlyInput.js')
  startCapturingEarlyInput()
  
  lastStep = '导入 main.js'
  console.log('1. 导入 main.js...')
  const { main: cliMain } = await import('./src1/main.js')
  console.log('   ✓\n')
  
  // 模拟 -p 模式 - 应该有输出并退出
  lastStep = '设置 -p 模式 argv'
  console.log('2. 运行 -p "hello"...')
  process.argv = [process.argv[0]!, process.argv[1]!, '-p', 'hello']
  await cliMain()
  console.log('   ✓ 完成\n')
  
  clearTimeout(timer)
  console.log('✅ -p 模式成功')
  
} catch (error) {
  clearTimeout(timer)
  console.error('\n❌ 错误:', error.message)
  console.error('堆栈:', error.stack?.split('\n').slice(0, 10).join('\n'))
  process.exit(1)
}
