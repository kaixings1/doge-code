import { registerBundledSkill } from '../bundledSkills.js'

/**
 * /dataviz（对齐官方 v2.1.198）
 *
 * 图表与仪表盘设计指导技能，附带一个**可运行**的配色验证器。
 * 验证器是脚本文件而非提示词——配色对比度是能用数字判定的东西，
 * 让模型跑脚本比让它"目测"可靠得多。
 */

const PROMPT = `# 图表与仪表盘设计

写任何图表代码前，先确定四件事：**数据要回答什么问题**、**受众是谁**、**精度要求**、**输出形态**（静态图 / 交互 / 仪表盘）。

## 1. 先选图形，再谈样式

按数据关系选，不要按"好看"选：

| 关系 | 用 | 不要用 |
|---|---|---|
| 时间趋势 | 折线 / 面积 | 饼图、3D 柱 |
| 类别比较 | 横向条形（类别名长时尤其） | 饼图（超过 5 类必然难读） |
| 占比构成 | 堆叠条 / 华夫格 | 双饼图对比 |
| 分布 | 直方图 / 箱线 / 蜂群 | 均值柱状（会掩盖双峰） |
| 相关性 | 散点 | 双 Y 轴折线（易造假象） |
| 排名 | 排序条形 + 参考线 | 雷达图 |

**硬规则**：
- 饼图切片 ≤ 5，且必须有数值标注；否则换条形。
- 双 Y 轴只在单位确实不同、且两轴量级可比时使用，并在轴标题写明单位。
- 截断 Y 轴必须显式标注（柱状图绝不截断）。
- 3D、阴影、渐变填充一律不用——它们不编码任何数据。

## 2. 颜色

- **定性色板**（区分类别）：最多 8 色；超过就分组或改小倍数图。
- **连续色板**（数值）：单色渐变即可；不要用彩虹色（感知不均匀）。
- **发散色板**（正负）：中点必须是中性色（浅灰/白），两端对称。
- **不要只靠颜色**编码信息——同时用形状、虚线、直接标注。
- 默认顺序色板取第 1 色，重点色取第 2 色，其余保持中性灰。

## 3. 可读性底线

- 轴标题带单位；数字用千分位；百分比注明基数。
- 字号：图表内 ≥ 11px，轴标题 ≥ 12px。
- 标签不要斜 45° —— 类别多就换成横向条形。
- 图例与图形距离近；能直接标注的数据系列就不放图例。

## 4. 仪表盘

- 一屏只讲一个故事：顶部 KPI（3–5 个）→ 中部趋势 → 底部明细。
- KPI 卡必须带对比基准（环比/同比/目标），孤立数字无意义。
- 筛选项集中在顶部一条，且显示"当前筛选状态"文字。
- 加载态、空态、错误态三态都要设计——不要只做有数据的路径。

## 5. 配色验证器（务必实际运行）

本技能目录下有 \`validate_palette.mjs\`。写完色板后**运行它**，不要靠目测：

\`\`\`bash
node <技能目录>/validate_palette.mjs "#1f77b4" "#ff7f0e" "#2ca02c"
\`\`\`

它会计算：
- 每个色与白/黑背景的 WCAG 对比度（正文需 ≥ 4.5:1，大字/图形 ≥ 3:1）
- 相邻色的色差（ΔE，低于阈值说明两色在图中难以区分）

有失败项就换色，直到全部通过。`

// 配色验证器：纯 Node，无依赖，可直接 node 运行。
const VALIDATE_PALETTE = `#!/usr/bin/env node
// 配色验证器 —— WCAG 对比度 + 色差（CIE76 ΔE）
// 用法: node validate_palette.mjs "#1f77b4" "#ff7f0e" ...

const CONTRAST_TEXT = 4.5   // 正文最小对比度
const CONTRAST_GRAPHIC = 3  // 图形/大字最小对比度
const DELTA_E_MIN = 20      // 相邻色最小可分辨色差

function hexToRgb(hex) {
  const h = hex.replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error('非法颜色: ' + hex)
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
}

function relLuminance([r, g, b]) {
  const f = c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a, b) {
  const la = relLuminance(a), lb = relLuminance(b)
  const hi = Math.max(la, lb), lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

function toLab(rgb) {
  const f = c => {
    const s = c / 255
    return s > 0.04045 ? ((s + 0.055) / 1.055) ** 2.4 : s / 12.92
  }
  const [r, g, b] = rgb.map(f)
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const k = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  ;[x, y, z] = [k(x), k(y), k(z)]
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

function deltaE(a, b) {
  const [l1, a1, b1] = toLab(a)
  const [l2, a2, b2] = toLab(b)
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2)
}

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('用法: node validate_palette.mjs "#hex" ["#hex" ...]')
  process.exit(2)
}

let failed = 0
const white = [255, 255, 255]
const black = [0, 0, 0]

// 分别判定白底/黑底：图表元素总是画在**指定的**背景上，
// 取两者最大值会把「白底上几乎看不见的浅黄」误判为合格。
function grade(ratio) {
  if (ratio >= CONTRAST_TEXT) return '正文级'
  if (ratio >= CONTRAST_GRAPHIC) return '图形级'
  return '不合格'
}

console.log('对比度检查（正文需 >= ' + CONTRAST_TEXT + '，图形需 >= ' + CONTRAST_GRAPHIC + '）:')
for (const hex of args) {
  let rgb
  try { rgb = hexToRgb(hex) } catch (e) { console.error('  ' + e.message); failed++; continue }
  const cw = contrast(rgb, white), cb = contrast(rgb, black)
  const gw = grade(cw), gb = grade(cb)
  // 只要在任一常用背景上不合格就标出来，由使用者按实际背景决定。
  const worstFail = gw === '不合格' && gb === '不合格'
  const anyFail = gw === '不合格' || gb === '不合格'
  // 任一台常用背景不合格即计入失败——退出码必须能反映问题，
  // 否则脚本接进 CI 时会把坏色板当通过。
  if (anyFail) failed++
  console.log('  ' + hex.padEnd(9) + ' 白底 ' + cw.toFixed(2) + ':1(' + gw + ')  黑底 ' +
    cb.toFixed(2) + ':1(' + gb + ')' +
    (worstFail ? '  <-- 两种背景都不合格' : anyFail ? '  <-- 至少一种背景不合格' : ''))
}

console.log('\\n相邻色差检查（ΔE >= ' + DELTA_E_MIN + ' 才易区分）:')
for (let i = 1; i < args.length; i++) {
  let a, b
  try { a = hexToRgb(args[i - 1]); b = hexToRgb(args[i]) } catch { continue }
  const d = deltaE(a, b)
  const ok = d >= DELTA_E_MIN
  if (!ok) failed++
  console.log('  ' + args[i - 1] + ' vs ' + args[i] + '  ΔE=' + d.toFixed(1) + (ok ? '' : '  <-- 过近'))
}

console.log(failed === 0 ? '\\n全部通过。' : '\\n' + failed + ' 项不合格。')
process.exit(failed === 0 ? 0 : 1)
`

export function registerDatavizSkill(): void {
  registerBundledSkill({
    name: 'dataviz',
    description: '图表与仪表盘设计指导 — 选图规则、配色规范、可读性底线，附可运行的配色验证器。',
    whenToUse: '需要设计图表、仪表盘、数据可视化，或需要校验配色对比度与可区分性时。',
    userInvocable: true,
    files: {
      'validate_palette.mjs': VALIDATE_PALETTE,
    },
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}
