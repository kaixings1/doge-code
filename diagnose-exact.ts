// 精确诊断 - 找出卡在哪一步
console.log('=== 精确诊断 ===\n')

const steps = []
function mark(step) {
  steps.push({ step, time: Date.now() })
  console.log(`[${steps.length}] ${step}`)
}

// 8秒超时
const timer = setTimeout(() => {
  console.log('\n❌ 卡住了! 最后执行的步骤:')
  console.log(`   ${steps[steps.length - 1]?.step}`)
  process.exit(1)
}, 8000)

try {
  const { ensureBootstrapMacro } = await import('./src1/bootstrapMacro.ts')
  mark('导入 bootstrapMacro')
  ensureBootstrapMacro()
  mark('ensureBootstrapMacro()')
  
  mark('导入 startupProfiler')
  const { profileCheckpoint } = await import('./src1/utils/startupProfiler.js')
  mark('startupProfiler 完成')
  
  mark('导入 earlyInput')
  const { startCapturingEarlyInput } = await import('./src1/utils/earlyInput.js')
  startCapturingEarlyInput()
  mark('startCapturingEarlyInput()')
  
  profileCheckpoint('diag_before_main')
  mark('profileCheckpoint')
  
  mark('导入 main.js (可能较慢)')
  const { main: cliMain } = await import('./src1/main.js')
  mark('main.js 导入完成')
  
  profileCheckpoint('diag_after_main_import')
  
  mark('调用 cliMain()')
  await cliMain()
  mark('cliMain() 返回')
  
  clearTimeout(timer)
  console.log('\n✅ 正常运行完成')
  
} catch (error) {
  clearTimeout(timer)
  console.error('\n❌ 异常:', error.message)
  console.error('堆栈:', error.stack?.split('\n').slice(0, 5).join('\n'))
  process.exit(1)
}
