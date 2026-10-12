/**
 * mobileDiffPreview.ts — 为手机端权限确认生成 diff 预览
 *
 * 为什么必须做：手机端的权限对话框此前只显示一个简短的 input 摘要
 * （如「路径: src/a.ts」）。用户看不到 AI 具体要改什么就要点批准 ——
 * 这是**安全上的实质缺口**：盲签比不签更糟，因为它让人以为自己在把关。
 *
 * 对照 Claude 官方移动端：diff 预览是标配（还支持行内评论回发）。
 *
 * 设计取舍：
 * - 只对**文件修改类**工具生成 diff。Bash 等命令类不生成 ——
 *   命令本身就是完整信息，「diff」无意义。
 * - 行数截断到 MAX_DIFF_LINES：手机屏幕有限，且 WS 帧不宜过大。
 * - 不做语法高亮/diff 算法（如 Myers）：这里是「用户扫一眼判断要不要批准」，
 *   不需要精确的差异计算。Edit 工具本身给了 old/new，直接标记增删即可。
 */

/** 手机端 diff 预览的行数上限。 */
export const MAX_DIFF_LINES = 60

/** 单行最大长度（超长的压缩文件行会撑爆渲染）。 */
const MAX_LINE_LEN = 300

export interface MobileDiffPreview {
  /** 变更类型，供客户端选标题（新增文件 / 修改文件）。 */
  kind: 'create' | 'edit'
  /** 文件路径（可能为未知）。 */
  filePath: string
  /** diff 行，已带 +/-/空格前缀。 */
  lines: string[]
  /** 因超限被省略的行数；0 表示完整。 */
  truncatedLines: number
}

/**
 * 从工具调用生成 diff 预览；不适用时返回 null。
 *
 * @param toolName 工具名（Edit / Write / MultiEdit / 其它）
 * @param input    工具入参
 */
export function buildDiffPreviewForMobile(
  toolName: string,
  input: unknown,
): MobileDiffPreview | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  const filePath = typeof o.file_path === 'string' ? o.file_path : ''

  switch (toolName) {
    case 'Edit':
    case 'MultiEdit': {
      // 用 typeof 判存在而非 falsy：'' 是合法值（插入到空处、删除到空），
      // 但两者都为空时没有任何信息量 —— 应返回 null，而不是渲染出
      // 一行孤零零的 "+" 让用户困惑「这到底改了什么」。
      const oldStr = typeof o.old_string === 'string' ? o.old_string : null
      const newStr = typeof o.new_string === 'string' ? o.new_string : null
      if (oldStr === null && newStr === null) return null
      if (!oldStr && !newStr) return null
      const lines = [
        ...toLines(oldStr).map(l => '-' + l),
        ...toLines(newStr).map(l => '+' + l),
      ]
      return trim({ kind: 'edit', filePath, lines })
    }

    case 'Write': {
      const content = typeof o.content === 'string' ? o.content : null
      // 空内容不生成：一个纯 "+" 的预览无助于判断
      if (!content) return null
      // 全部是新增行：Write 是覆盖写，旧内容不在入参里
      //（若文件已存在，工具会在执行前读它做校验，但那时还没到权限确认）
      const lines = toLines(content).map(l => '+' + l)
      return trim({ kind: 'create', filePath, lines })
    }

    default:
      // Bash / Read / Grep 等：命令或参数本身就是完整信息，不伪造 diff
      return null
  }
}

function toLines(s: string | null): string[] {
  if (!s) return []
  return s.split('\n').map(l => (l.length > MAX_LINE_LEN ? l.slice(0, MAX_LINE_LEN) + '…' : l))
}

/**
 * 截断到行数上限，保留首尾 —— 中部往往是重复内容，用户更需要看改动全貌。
 *
 * 入参用 Omit<..., 'truncatedLines'>：调用方构造时还不知道截断了多少，
 * 那个值由本函数算出来。让调用方传一个假值再覆盖是错的接口设计。
 */
function trim(p: Omit<MobileDiffPreview, 'truncatedLines'>): MobileDiffPreview {
  if (p.lines.length <= MAX_DIFF_LINES) {
    return { ...p, truncatedLines: 0 }
  }
  const head = Math.floor(MAX_DIFF_LINES * 0.7)
  const tail = MAX_DIFF_LINES - head
  return {
    ...p,
    lines: [...p.lines.slice(0, head), `… （省略 ${p.lines.length - MAX_DIFF_LINES} 行）`, ...p.lines.slice(-tail)],
    truncatedLines: p.lines.length - MAX_DIFF_LINES,
  }
}
