import chalk from 'chalk'
import { color } from '../components/design-system/color.js'
import type { ThemeName } from './theme.js'

// ── 警示 label（重要提示/注意/警告等 + 冒号）→ 红色加粗 ──
// 高风险提示性 label，与普通 label（摘要/步骤）区分：整体红色加粗。
// 由 CJK_LABEL_RE 匹配（2-6 字中文 + 冒号），回调中按词判断着色。
// 注意："错误：" 不在此列——错误更常作为负面词（正文标红），保持绿色 label。
const WARN_LABELS = new Set(['重要提示', '注意', '警告', '危险', '紧急'])

// ── 中文 label（2-6 字 + 冒号）→ 绿色 ──
// 前缀必须是行首或非中文字符，避免 "这是一个：" 这类长句被整段误标成 label。
// 不用 lookbehind（Bun/JSC 的 YARR JIT 对 lookbehind 有性能问题），
// 改用捕获组保留前缀，替换时原样带出。
const CJK_LABEL_RE = /(^|[^\u4e00-\u9fa5])([\u4e00-\u9fa5]{2,6})[：:]/

// ── 英文 label（如 "Summary:"、"Step 1:"）→ 绿色（与中文 label 同语义）──
// 保守规则避免误标：
//   - 前缀必须是行首或非字母数字（排除 URL 路径片段）
//   - label 至少 2 个字符（排除 "A:" 这类对话前缀）
//   - 冒号后必须是空白或行尾（排除端口 "com:8080"、URL 协议 "https://"）
const EN_LABEL_PATTERN = '(^|[^A-Za-z0-9])([A-Za-z][A-Za-z0-9 _-]{1,14}):(?=[ \\t]|$)'
const EN_LABEL_RE = new RegExp(`(?:${EN_LABEL_PATTERN})`)

// ── 操作确认/询问词 → 琥珀色 ──
// 长词必须排在前面，避免 "是否继续" 被拆成 "是否"+"继续" 嵌套着色。
const CONFIRM_WORDS =
  '是否继续|是否需要|是否同意|需要我|继续吗|确认一下|要不要|需不需要|可不可以|行不行|能不能|是否可以|是否要|是否需|可以吗|开始吗|同意吗|确认吗|有问题吗|没问题吧|没问题|请问|是不是|对不对|可否|是否可行|是否|继续|需要|确认|同意|能否|好吗|行吗'
const CONFIRM_WORDS_RE = new RegExp(`(?:${CONFIRM_WORDS})`)

// ── 强调词（注意/警告等）→ 红色 ──
const EMPHASIS_WORDS = '请注意|警告|危险|禁止|务必|必须|重要|注意|小心|切记'
const EMPHASIS_WORDS_RE = new RegExp(`(?:${EMPHASIS_WORDS})`)

// ── 百分比 / 时间单位 → 蓝色 ──
// 只匹配 "80%"、"1.5小时"、"3天"、"2周"、"10分钟" 这类带单位的数值，
// 不匹配裸数字（避免 "版本 1.2.3" 被误标），"年" 这类过普适单位也排除。
const NUMBER_PATTERN =
  '\\d+(?:\\.\\d+)?%|\\d+(?:\\.\\d+)?(?:天|周|小时|分钟|秒|个月)'
const NUMBER_RE = new RegExp(`(?:${NUMBER_PATTERN})`)

// ── URL（http/https）→ 蓝色 ──
// 上一轮 EN_LABEL 保守规则只是"不误标 https://"；这里主动把完整 URL 标蓝。
// 必须放在文件路径分支之前，避免 URL 里的路径段被当成文件路径标紫。
// 尾部标点（.,;:!?）在回调里裁掉，避免 URL 后面紧跟的句号/逗号被误吞。
const URL_RE = /(https?:\/\/[^\s<>()"'）】，。]+)/

// ── 日期（2026-08-05、2026/08/05、2026年8月5日）→ 蓝色 ──
// 两个分支：ISO 风格（- 或 / 分隔）与中文年月日。
// 必须 4 位年份开头，避免 "版本 1.2" 或 "第 3 天" 这类误标。
const DATE_PATTERN =
  '\\d{4}年\\d{1,2}月(?:\\d{1,2}日)?|\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}'
const DATE_RE = new RegExp(`(?:${DATE_PATTERN})`)

// ── 箭头符号（→ ⇒ -> =>）→ 蓝色 ──
// 流程/方向描述常用（"步骤A → 步骤B"）。URL 分支在前，不会与链接冲突。
const ARROW_PATTERN = '→|⇒|->|=>'
const ARROW_RE = new RegExp(`(?:${ARROW_PATTERN})`)

// ── 负面结果词（失败/错误/问题 等）→ 红色 ──
// 长词排前面避免拆词。歧义控制：
//   - "问题" 单独不标（"解决问题""问问题" 是中性），只标 "有问题/出现问题/存在问题"；
//   - 中文词无词边界问题；英文词用 \b 防子串（"error" 不会命中 "terror"）。
// 注意："错误：" 这类 label 会被更靠前的 CJK label 分支整体标绿，不冲突。
const NEGATIVE_WORDS =
  '出现问题|存在问题|有问题|无法完成|请求失败|执行失败|报错|出错|失败|错误|异常|崩溃|致命'
const NEGATIVE_RE = new RegExp(`(?:${NEGATIVE_WORDS})`)
const NEGATIVE_EN = '\\b(?:[Ff]ailed|[Ff]ailure|[Ee]rror|[Ee]rrors|[Ee]xception|[Cc]rash|[Bb]ug|[Ff]atal|[Pp]anic)\\b'
const NEGATIVE_EN_RE = new RegExp(NEGATIVE_EN)

// ── 数量疑问词（多少）→ 蓝色 ──
// "多少个/多少钱/多少时间" 中的 "多少" 指代具体数字/数量，
// 与百分比、日期同属数字语义，标蓝色。
// 少量歧义（"多少有点" 的 "多少"=稍微）按轻量美化惯例接受。
const QUANTITY_PATTERN = '多少'
const QUANTITY_RE = new RegExp(`(?:${QUANTITY_PATTERN})`)

// ── 文件路径 → 紫色 ──
// 规则：
//   - 路径分支必须含至少一个 "/"（排除普通英文单词误标）；
//   - 简单文件名分支只匹配全小写或全大写，避免 "Node.js"、"React.js"
//     这类品牌名被误标（"README.md" 全大写、"package.json" 全小写都 OK）；
//   - 扩展名白名单限定，避免 "example.com"、"1.2.3"、"run npm" 误标；
//   - 字符类中 "-" 放中间时转义为 \-，防止与相邻字符构成范围。
//   - URL 分支在合并正则中排前面，`https://a.com/x.ts` 整体先被 URL 吃掉。
//   - 扩展名按长度降序排列（长扩展名在前），避免 `json` 被 `js` 抢先匹配，
//     导致 "package.json" 被拆成 "package.js"+"on"。
//   - 开头 \b 词边界：防止 "Node.js" 里的小写段 "ode.js" 从词中间开始匹配。
//   - 恰好一个捕获组（完整路径含扩展名），供回调直接着色。
const FILE_EXT =
  'svelte|json|yaml|html|java|lock|scss|toml|tsx|jsx|css|sql|txt|yml|env|vue|ts|js|md|py|go|rs|sh'
const FILE_PATH_PATTERN = `\\b((?:[\\w@.\\-+]+/[\\w@./\\-+]*(?:\\.[\\w-]+)?|[a-z0-9_\\-]+|[A-Z0-9_\\-]+)\\.(?:${FILE_EXT}))`
const FILE_PATH_RE = new RegExp(`(?:${FILE_PATH_PATTERN})`)

// 合并后的单遍替换正则：
//   组1   = 中文 label 前缀（行首空串或单个非中文字符）
//   组2   = 中文 label 文字（2-6 个中文字符）
//   组3   = 确认/询问词（琥珀色）
//   组4   = 强调词（红色）
//   组5   = 百分比/时间（蓝色）
//   组6   = URL（蓝色）
//   组7   = 文件路径（紫色，完整路径含扩展名）
//   组8   = 英文 label 前缀
//   组9   = 英文 label 文字
//   组10  = 日期（蓝色）
//   组11  = 箭头符号（蓝色）
//   组12  = 负面结果词（红色）
//   组13  = 英文负面结果词（红色）
//   组14  = 数量疑问词（多少，蓝色）
// 中文 label 分支在前，同一位置优先按 "词语+冒号" 整体标绿。
// URL 分支在文件路径之前，避免 URL 的路径段被当文件路径标紫。
// 文件路径分支自带一个捕获组（完整路径），因此不再额外包括号。
// 注意：外层不能包捕获组，否则无论匹配哪个分支组1 都有值，
// 会让所有匹配都误走 label 的绿色分支。
const INLINE_BEAUTIFY_RE = new RegExp(
  `${CJK_LABEL_RE.source}|(${CONFIRM_WORDS})|(${EMPHASIS_WORDS})|(${NUMBER_PATTERN})|${URL_RE.source}|${FILE_PATH_PATTERN}|${EN_LABEL_PATTERN}|(${DATE_PATTERN})|(${ARROW_PATTERN})|(${NEGATIVE_WORDS})|(${NEGATIVE_EN})|(${QUANTITY_PATTERN})`,
  'g',
)

/**
 * 对普通正文文本做轻量美化（仅影响段落/列表项文本，不处理链接内文本）：
 * 1. "中文词语："（2-6 个中文字符 + 冒号，且前面是行首/非中文字符）整体标绿；
 * 2. "Summary:"、"Step 1:" 等英文 label 标绿（保守规则排除 URL/端口/单字母）；
 * 3. "继续/需要/是否/请问/可不可以" 等操作确认、询问类词语标琥珀色；
 * 4. "注意/警告/务必/重要" 等强调词标红色；
 * 5. "80%"、"10分钟"、"3天" 等百分比/时间数值标蓝色；
 * 6. "https://..." 等 URL 标蓝色；
 * 7. "src/utils/markdown.ts"、"package.json" 等文件路径标紫色；
 * 8. "2026-08-05"、"2026年8月5日" 等日期标蓝色；
 * 9. "→"、"=>" 等箭头符号标蓝色；
 * 10. "失败/错误/异常/有问题" 等负面结果词（含英文 failed/error/crash 等）标红色；
 * 11. "多少个/多少钱/多少时间" 中的数量疑问词 "多少" 标蓝色（指代具体数字）。
 * 单遍正则替换，避免各类别在同一位置嵌套着色。
 */
export function beautifyInlineText(text: string, theme: ThemeName): string {
  if (!text) return text
  if (
    !CJK_LABEL_RE.test(text) &&
    !EN_LABEL_RE.test(text) &&
    !CONFIRM_WORDS_RE.test(text) &&
    !EMPHASIS_WORDS_RE.test(text) &&
    !NUMBER_RE.test(text) &&
    !URL_RE.test(text) &&
    !FILE_PATH_RE.test(text) &&
    !DATE_RE.test(text) &&
    !ARROW_RE.test(text) &&
    !NEGATIVE_RE.test(text) &&
    !NEGATIVE_EN_RE.test(text) &&
    !QUANTITY_RE.test(text)
  ) {
    return text
  }
  const green = color('success', theme)
  const amber = color('warning', theme)
  const red = color('error', theme)
  const blue = color('suggestion', theme)
  const purple = color('merged', theme)
  return text.replace(
    INLINE_BEAUTIFY_RE,
    (m, prefix, label, confirm, emphasis, number, url, filePath, enPrefix, enLabel, date, arrow, negative, negativeEn, quantity) => {
      if (label) {
        const p = prefix || ''
        const labelText = m.slice(p.length)
        // 警示 label（重要提示/注意/警告/危险/紧急）→ 红色加粗
        if (WARN_LABELS.has(label)) return p + chalk.bold(red(labelText))
        return p + green(labelText)
      }
      if (confirm) return amber(confirm)
      if (emphasis) return red(emphasis)
      if (number) return blue(number)
      if (url) {
        // 裁掉 URL 尾部标点（多为句子结尾的句号/逗号），避免被吞进蓝色
        const trailing = url.match(/[.,;:!?]+$/)
        const clean = trailing ? url.slice(0, -trailing[0].length) : url
        return blue(clean) + (trailing ? trailing[0] : '')
      }
      if (filePath) return purple(filePath)
      if (enLabel) {
        const p = enPrefix || ''
        return p + green(m.slice(p.length))
      }
      if (date) return blue(date)
      if (arrow) return blue(arrow)
      if (negative) return red(negative)
      if (negativeEn) return red(negativeEn)
      if (quantity) return blue(quantity)
      return m
    },
  )
}
