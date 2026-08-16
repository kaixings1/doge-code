/**
 * shellInvocation.ts 闭环测试 — 在源代码中嵌入测试，运行后比较输出
 */

import { getShellKind, getShellInvocation } from './shellInvocation.js'

let pass = 0, fail = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ✅ ${label} => ${a}`)
    pass++
  } else {
    console.log(`  ❌ ${label}`)
    console.log(`     实际  : ${a}`)
    console.log(`     预期  : ${e}`)
    fail++
  }
}

// ==================== getShellKind 分支 ====================
console.log('\n========== getShellKind 分支 ==========')

console.log('\n[分支1] powershell (lowercase)')
check('powershell', getShellKind('powershell'), 'powershell')

console.log('\n[分支2] powershell.exe')
check('powershell.exe', getShellKind('powershell.exe'), 'powershell')

console.log('\n[分支3] pwsh')
check('pwsh', getShellKind('pwsh'), 'powershell')

console.log('\n[分支4] pwsh.exe')
check('pwsh.exe', getShellKind('pwsh.exe'), 'powershell')

console.log('\n[分支5] 全路径 PowerShell')
check('full path pwsh', getShellKind('C:\\Program Files\\PowerShell\\pwsh.exe'), 'powershell')

console.log('\n[分支6] cmd')
check('cmd', getShellKind('cmd'), 'cmd')

console.log('\n[分支7] cmd.exe')
check('cmd.exe', getShellKind('cmd.exe'), 'cmd')

console.log('\n[分支8] wsl')
check('wsl', getShellKind('wsl'), 'wsl')

console.log('\n[分支9] wsl.exe')
check('wsl.exe', getShellKind('wsl.exe'), 'wsl')

console.log('\n[分支10] 默认 posix: bash')
check('bash → posix', getShellKind('bash'), 'posix')

console.log('\n[分支11] 默认 posix: /bin/bash')
check('/bin/bash → posix', getShellKind('/bin/bash'), 'posix')

console.log('\n[分支12] 默认 posix: zsh')
check('zsh → posix', getShellKind('zsh'), 'posix')

console.log('\n[分支13] 默认 posix: sh')
check('sh → posix', getShellKind('sh'), 'posix')

// ==================== getShellInvocation 分支 ====================
console.log('\n\n========== getShellInvocation 分支 ==========')

console.log('\n[分支1] PowerShell invocation')
const psInv = getShellInvocation('powershell', 'echo hello')
check('PS: args[0]', psInv.args[0], '-NoProfile')
check('PS: args[1]', psInv.args[1], '-NonInteractive')
check('PS: args[2]', psInv.args[2], '-Command')
check('PS: has input', psInv.input, 'echo hello')

console.log('\n[分支2] cmd invocation')
const cmdInv = getShellInvocation('cmd', 'echo hello')
check('cmd: args', cmdInv.args, ['/d', '/s', '/c', 'echo hello'])
check('cmd: no input', cmdInv.input, undefined)

console.log('\n[分支3] wsl invocation')
const wslInv = getShellInvocation('wsl', 'echo hello')
check('wsl: args', wslInv.args, ['bash', '-c', 'echo hello'])

console.log('\n[分支4] posix invocation')
const posixInv = getShellInvocation('bash', 'echo hello')
check('posix: args', posixInv.args, ['-c', 'echo hello'])

// ==================== SUMMARY ====================
console.log(`\n\n━━━ shellInvocation.ts 闭环结果: ${pass} pass, ${fail} fail ━━━`)
if (fail > 0) { console.log('❌ 有失败，需要修改程序\n'); process.exit(1) }
console.log('✅ 全部通过\n')
