import { color } from '../components/design-system/color.js'
import type { ThemeName } from './theme.js'

// ── 中文 label（2-6 字 + 冒号）→ 绿色 ──
// 前缀必须是行首或非中文字符，避免 "这是一个：" 这类长句被整段误标成 label。
// 不用 lookbehind（Bun/JSC 的 YARR JIT 对 lookbehind 有性能问题），
// 改用捕获组保留前缀，替换时原样带出。
const CJK_LABEL_RE = /(^|[^\u4e00-\u9fa5])([\u4e00-\u9fa5]{2,6})[：:]/

// ── 操作确认/询问词 → 琥珀色 ──
// 长词必须排在前面，避免 "是否继续" 被拆成 "是否"+"继续" 嵌套着色。
const CONFIRM_WORDS =
  '是否继续|是否需要|是否同意|需要我|继续吗|确认一下|要不要|需不需要|可不可以|行不行|能不能|是否可以|是否要|是否需|可以吗|开始吗|同意吗|确认吗|有问题吗|没问题吧|没问题|请问|是不是|对不对|可否|是否可行|是否|继续|需要|确认|同意|能否|好吗|行吗'
const CONFIRM_WORDS_RE = new RegExp(`(?:${CONFIRM_WORDS})`)

// ── 强调词（注意/警告等）→ 红色 ──
const EMPHASIS_WORDS = '请注意|警告|危险|禁止|务必|必须|重要|注意|小心|切记'
const EMPHASIS_WORDS_RE = new RegExp(`(?:${EMPHASIS_WORDS})`)

// ── 百分比 / 时间单位 → 蓝色 ──
// 只匹配 "80%"、"1.5小时"、"3天"、"10分钟" 这类带单位的数值，
// 不匹配裸数字（避免 "版本 1.2.3" 被误标），"年" 这类过普适单位也排除。
const NUMBER_PATTERN = '\\d+(?:\\.\\d+)?%|\\d+(?:\\.\\d+)?(?:天|小时|分钟|秒|个月)'
const NUMBER_RE = new RegExp(`(?:${NUMBER_PATTERN})`)

// 合并后的单遍替换正则：
//   组1 = label 前缀（行首空串或单个非中文字符）
//   组2 = label 文字（2-6 个中文字符）
//   组3 = 确认/询问词（琥珀色）
//   组4 = 强调词（红色）
//   组5 = 百分比/时间（蓝色）
// label 分支在前，同一位置优先按 "词语+冒号" 整体标绿。
// 注意：外层不能包捕获组，否则无论匹配哪个分支组1 都有值，
// 会让所有匹配都误走 label 的绿色分支。
const INLINE_BEAUTIFY_RE = new RegExp(
  `${CJK_LABEL_RE.source}|(${CONFIRM_WORDS})|(${EMPHASIS_WORDS})|(${NUMBER_PATTERN})`,
  'g',
)

/**
 * 对普通正文文本做轻量美化（仅影响段落/列表项文本，不处理链接内文本）：
 * 1. "中文词语："（2-6 个中文字符 + 冒号，且前面是行首/非中文字符）整体标绿；
 * 2. "继续/需要/是否/请问/可不可以" 等操作确认、询问类词语标琥珀色；
 * 3. "注意/警告/务必/重要" 等强调词标红色；
 * 4. "80%"、"10分钟"、"3天" 等百分比/时间数值标蓝色。
 * 单遍正则替换，避免各类别在同一位置嵌套着色。
 */
export function beautifyInlineText(text: string, theme: ThemeName): string {
  if (!text) return text
  if (
    !CJK_LABEL_RE.test(text) &&
    !CONFIRM_WORDS_RE.test(text) &&
    !EMPHASIS_WORDS_RE.test(text) &&
    !NUMBER_RE.test(text)
  ) {
    return text
  }
  const green = color('success', theme)
  const amber = color('warning', theme)
  const red = color('error', theme)
  const blue = color('suggestion', theme)
  return text.replace(
    INLINE_BEAUTIFY_RE,
    (m, prefix, label, confirm, emphasis, number) => {
      if (label) {
        const p = prefix || ''
        return p + green(m.slice(p.length))
      }
      if (confirm) return amber(confirm)
      if (emphasis) return red(emphasis)
      if (number) return blue(number)
      return m
    },
  )
}
