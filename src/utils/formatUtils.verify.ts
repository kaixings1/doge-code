/**
 * formatUtils.ts 闭环测试
 */

import {
  humanBytes,
  humanBytesIEC,
  humanDuration,
  humanTime,
  humanTimeLower,
  humanNumber,
} from './formatUtils.js'

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

// ==================== humanBytes ====================
console.log('\n========== humanBytes 分支 ==========')

console.log('\n[分支1] 小于 1KB 返回 B')
check('bytes', humanBytes(500), '500 B')

console.log('\n[分支2] KB 范围')
check('1 KB exact', humanBytes(1000), '1 KB')
check('1.5 KB', humanBytes(1500), '1.5 KB')
check('2 KB exact', humanBytes(2000), '2 KB')
check('10500 KB', humanBytes(10500000), '10 MB')

console.log('\n[分支3] MB 范围')
check('1 MB', humanBytes(1000000), '1 MB')
check('150 MB', humanBytes(150000000), '150 MB')

console.log('\n[分支4] GB 范围')
check('1 GB', humanBytes(1000000000), '1 GB')

console.log('\n[分支5] TB 范围')
check('1 TB', humanBytes(1000000000000), '1 TB')

console.log('\n[分支6] 小数保留')
check('1.0 KB', humanBytes(1001), '1.0 KB')
check('1.5 KB keep decimal', humanBytes(1500), '1.5 KB')
check('1.5 MB', humanBytes(1500000), '1.5 MB')
check('10.5 MB trunc', humanBytes(10500000), '10 MB')

// ==================== humanBytesIEC ====================
console.log('\n\n========== humanBytesIEC 分支 ==========')

console.log('\n[分支7] 二进制格式化')
check('1024 B', humanBytesIEC(1024), '1.0 KiB')
check('1536 B', humanBytesIEC(1536), '1.5 KiB')
check('1 MiB', humanBytesIEC(1048576), '1.0 MiB')
check('1 GiB', humanBytesIEC(1073741824), '1.0 GiB')
check('500 B', humanBytesIEC(500), '500 B')

// ==================== humanDuration ====================
console.log('\n\n========== humanDuration 分支 ==========')

console.log('\n[分支8] 秒级')
check('0 sec', humanDuration(0), 'Less than a second')
check('1 sec', humanDuration(1), '1 second')
check('30 sec', humanDuration(30), '30 seconds')

console.log('\n[分支9] 分钟级')
check('1 min', humanDuration(60), 'About a minute')
check('30 min', humanDuration(1800), '30 minutes')

console.log('\n[分支10] 小时级')
check('1 hour', humanDuration(3600), 'About an hour')
check('24 hours', humanDuration(86400), '24 hours')
check('48 hours', humanDuration(172800), '2 days')

console.log('\n[分支11] 天/周/月/年级')
check('7 days', humanDuration(604800), '7 days')
check('14 days', humanDuration(1209600), '2 weeks')
check('60 days', humanDuration(5184000), '2 months')
check('400 days', humanDuration(34560000), '13 months')

// ==================== humanTime ====================
console.log('\n\n========== humanTime 分支 ==========')

console.log('\n[分支12] 零值')
check('zero value', humanTime(new Date(0), 'never'), 'never')

console.log('\n[分支13] 过去的时间')
// 创建 30 秒前的时间
const thirtySecAgo = new Date(Date.now() - 30 * 1000)
check('30 sec ago', humanTime(thirtySecAgo, ''), '30 seconds ago')

// 创建 2 分钟前的时间
const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000)
check('2 min ago', humanTime(twoMinAgo, ''), '2 minutes ago')

console.log('\n[分支14] 未来的时间')
const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000)
check('2 hours from now', humanTime(futureDate, ''), '2 hours from now')

console.log('\n[分支15] 极短未来时间')
const soonFuture = new Date(Date.now() + 800)
check('800ms from now', humanTime(soonFuture, ''), 'Less than a second from now')

console.log('\n[分支16] 极远未来时间')
const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 200 * 1000)
check('far future', humanTime(farFuture, ''), 'Forever')

// ==================== humanTimeLower ====================
console.log('\n\n========== humanTimeLower 分支 ==========')

console.log('\n[分支17] 小写版本')
check('far future lower', humanTimeLower(farFuture, ''), 'forever')
const futureDate2 = new Date(Date.now() + 2 * 60 * 60 * 1000)
check('2 hours lower', humanTimeLower(futureDate2, ''), '2 hours from now')

// ==================== humanNumber ====================
console.log('\n\n========== humanNumber 分支 ==========')

console.log('\n[分支15] 小于 1000')
check('0', humanNumber(0), '0')
check('999', humanNumber(999), '999')

console.log('\n[分支16] K 范围')
check('1000', humanNumber(1000), '1K')
check('1500', humanNumber(1500), '1K')
check('5000', humanNumber(5000), '5K')

console.log('\n[分支17] M 范围')
check('1M', humanNumber(1000000), '1M')
check('125M', humanNumber(125000000), '125M')
check('500.50M', humanNumber(500500000), '500.50M')
check('500.55M', humanNumber(500550000), '500.55M')

console.log('\n[分支18] B 范围')
check('1B', humanNumber(1000000000), '1B')
check('2.8B', humanNumber(2800000000), '2.8B')
check('2.9B', humanNumber(2850000000), '2.9B')

// ==================== SUMMARY ====================
console.log(`\n\n━━━ formatUtils.ts 闭环结果: ${pass} pass, ${fail} fail ━━━`)
if (fail > 0) { console.log('❌ 有失败，需要修改程序\n'); process.exit(1) }
console.log('✅ 全部通过\n')
