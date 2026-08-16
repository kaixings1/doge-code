/**
 * 格式化工具函数
 * 吸收自 ollama (github.com/ollama/ollama/format/)
 *
 * - humanBytes: 将字节数格式化为人类可读字符串（十进制 KB/MB/GB/TB）
 * - humanBytesIEC: 将字节数格式化为人类可读字符串（二进制 KiB/MiB/GiB）
 * - humanDuration: 将时间差格式化为人类可读字符串
 * - humanTime: 将时间点格式化为相对时间字符串
 * - humanNumber: 将数字格式化为人类可读短字符串（K/M/B）
 */

// ==================== 字节格式化 ====================

const KB = 1000
const MB = KB * 1000
const GB = MB * 1000
const TB = GB * 1000

const KIB = 1024
const MIB = KIB * 1024
const GIB = MIB * 1024

/**
 * 将字节数格式化为人类可读字符串（十进制）。
 * 例如: 1536 -> "2 KB", 1073741824 -> "1 GB"
 */
export function humanBytes(b: number): string {
  let value: number
  let unit: string

  if (b >= TB) {
    value = b / TB
    unit = 'TB'
  } else if (b >= GB) {
    value = b / GB
    unit = 'GB'
  } else if (b >= MB) {
    value = b / MB
    unit = 'MB'
  } else if (b >= KB) {
    value = b / KB
    unit = 'KB'
  } else {
    return `${b} B`
  }

  if (value >= 10) {
    return `${Math.floor(value)} ${unit}`
  }
  if (value % 1 !== 0) {
    return `${value.toFixed(1)} ${unit}`
  }
  return `${Math.floor(value)} ${unit}`
}

/**
 * 将字节数格式化为人类可读字符串（二进制，IEC 标准）。
 * 例如: 1536 -> "1.5 KiB", 1073741824 -> "1.0 GiB"
 */
export function humanBytesIEC(b: number): string {
  if (b >= GIB) {
    return `${(b / GIB).toFixed(1)} GiB`
  }
  if (b >= MIB) {
    return `${(b / MIB).toFixed(1)} MiB`
  }
  if (b >= KIB) {
    return `${(b / KIB).toFixed(1)} KiB`
  }
  return `${b} B`
}

// ==================== 数字短格式 ====================

/**
 * 将数字格式化为人类可读的短格式字符串。
 * 吸收自 ollama (github.com/ollama/ollama/format/)
 *
 * - < 1000: 原始数字字符串
 * - >= 1000 < 1M: K 后缀（无小数）
 * - >= 1M < 1B: M 后缀（整数无小数，非整数保留 2 位小数）
 * - >= 1B: B 后缀（整数无小数，非整数保留 1 位小数）
 */
const THOUSAND = 1000
const MILLION = THOUSAND * 1000
const BILLION = MILLION * 1000

export function humanNumber(n: number): string {
  if (n >= BILLION) {
    const v = n / BILLION
    return v % 1 === 0 ? `${Math.floor(v)}B` : `${v.toFixed(1)}B`
  }
  if (n >= MILLION) {
    const v = n / MILLION
    return v % 1 === 0 ? `${Math.floor(v)}M` : `${v.toFixed(2)}M`
  }
  if (n >= THOUSAND) {
    return `${Math.floor(n / THOUSAND)}K`
  }
  return String(n)
}

// ==================== 时间格式化 ====================

/**
 * 将时间差格式化为人类可读字符串。
 * 例如: 5 -> "5 seconds", 65 -> "About a minute", 3600 -> "About an hour"
 */
export function humanDuration(seconds: number): string {
  if (seconds < 1) {
    return 'Less than a second'
  }
  if (seconds === 1) {
    return '1 second'
  }
  if (seconds < 60) {
    return `${seconds} seconds`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes === 1) {
    return 'About a minute'
  }
  if (minutes < 60) {
    return `${minutes} minutes`
  }

  const hours = Math.round(seconds / 3600)
  if (hours === 1) {
    return 'About an hour'
  }
  if (hours < 48) {
    return `${hours} hours`
  }
  if (hours < 24 * 7 * 2) {
    return `${Math.floor(hours / 24)} days`
  }
  if (hours < 24 * 30 * 2) {
    return `${Math.floor(hours / 24 / 7)} weeks`
  }
  if (hours < 24 * 365 * 2) {
    return `${Math.floor(hours / 24 / 30)} months`
  }

  return `${Math.floor(hours / 24 / 365)} years`
}

/**
 * 将时间点格式化为相对时间字符串。
 * 例如: 5 分钟前 -> "5 minutes ago", 未来 -> "2 hours from now"
 */
export function humanTime(t: Date, zeroValue = ''): string {
  if (t.getTime() === 0) {
    return zeroValue
  }

  const now = Date.now()
  const deltaMs = now - t.getTime()

  if (deltaMs < 0) {
    const futureSec = Math.abs(deltaMs / 1000)
    if (futureSec / 3600 / 24 / 365 > 20) {
      return 'Forever'
    }
    return `${humanDuration(futureSec)} from now`
  }

  return `${humanDuration(deltaMs / 1000)} ago`
}

/**
 * 将时间点格式化为小写相对时间字符串。
 */
export function humanTimeLower(t: Date, zeroValue = ''): string {
  return humanTime(t, zeroValue).toLowerCase()
}
