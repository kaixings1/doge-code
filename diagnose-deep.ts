// 深入诊断 cliMain() 内部
console.log('=== 深入诊断 cliMain() ===\n')

const timer = setTimeout(() => {
  console.log('\n❌ 超时! 最后一步:', lastStep)
  process.exit(1)
}, 15000)

let lastStep = '开始'

try {
  const { ensureBootstrapMacro } = await import('./src1/bootstrapMacro.ts')
  ensureBootstrapMacro()
  
  const { profileCheckpoint } = await import('./src1/utils/startupProfiler.js')
  const { startCapturingEarlyInput } = await import('./src1/utils/earlyInput.js')
  startCapturingEarlyInput()
  
  lastStep = '导入 main.js'
  console.log('1. 导入 main.js...')
  const { main: cliMain } = await import('./src1/main.js')
  console.log('   ✓ 完成\n')
  
  lastStep = '设置 argv 为 --help'
  console.log('2. 使用 --help 测试...')
  const originalArgv = process.argv
  process.argv = [process.argv[0]!, process.argv[1]!, '--help']
  await cliMain()
  console.log('   ✓ --help 成功\n')
  
  clearTimeout(timer)
  console.log('✅ 诊断通过')
  
} catch (error) {
  clearTimeout(timer)
  console.error('\n❌ 错误:', error.message)
  console.error('最后步骤:', lastStep)
  process.exit(1)
}
