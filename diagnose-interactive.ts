// 测试交互式模式卡在哪
console.log('=== 测试交互式模式 ===\n')

const steps = []
let lastStep = '开始'

const timer = setTimeout(() => {
  console.log('\n❌ 超时! 卡在最后一步:', lastStep)
  console.log('\n已完成的步骤:')
  steps.forEach((s, i) => console.log(`  ${i+1}. ${s}`))
  process.exit(1)
}, 12000)

function mark(step) {
  steps.push(step)
  lastStep = step
  console.log(`[${steps.length}] ${step}`)
}

try {
  const { ensureBootstrapMacro } = await import('./src1/bootstrapMacro.ts')
  ensureBootstrapMacro()
  mark('bootstrapMacro')
  
  const { profileCheckpoint } = await import('./src1/utils/startupProfiler.js')
  const { startCapturingEarlyInput } = await import('./src1/utils/earlyInput.js')
  startCapturingEarlyInput()
  
  mark('导入 main.js')
  const { main: cliMain } = await import('./src1/main.js')
  mark('main.js 导入完成')
  
  // 不带参数运行 - 应该启动交互式模式
  mark('调用 cliMain() (无参数)')
  await cliMain()
  mark('cliMain() 返回')
  
  clearTimeout(timer)
  console.log('\n✅ 正常完成')
  
} catch (error) {
  clearTimeout(timer)
  console.error('\n❌ 异常:', error.message)
  console.error('堆栈:', error.stack?.split('\n').slice(0, 8).join('\n'))
  process.exit(1)
}
