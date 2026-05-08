/**
 * 任务/命令状态标记增强模块
 * 为已完成的任务添加视觉标记（✓/✗）和颜色
 */

import figures from 'figures'

/**
 * 获取状态标记符号
 */
export function getStatusMark(status: 'completed' | 'failed' | 'killed' | 'running'): string {
  switch (status) {
    case 'completed':
      return figures.tick  // ✓
    case 'failed':
      return figures.cross  // ✗
    case 'killed':
      return figures.cross  // ✗
    case 'running':
      return ''  // 运行中不显示标记
    default:
      return ''
  }
}

/**
 * 获取状态标记的颜色
 */
export function getStatusMarkColor(status: 'completed' | 'failed' | 'killed' | 'running'): string | undefined {
  switch (status) {
    case 'completed':
      return 'green'  // 成功：绿色
    case 'failed':
      return 'red'    // 失败：红色
    case 'killed':
      return 'yellow' // 停止：黄色
    case 'running':
      return undefined
    default:
      return undefined
  }
}

/**
 * 为标题添加状态后缀
 * @param title 原始标题
 * @param status 状态
 * @returns 带状态标记的标题
 */
export function appendStatusMark(title: string, status: 'completed' | 'failed' | 'killed' | 'running'): string {
  const mark = getStatusMark(status)
  if (!mark) {
    return title
  }
  return `${title} ${mark}`
}

/**
 * 判断是否应该显示状态标记
 */
export function shouldShowStatusMark(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed'
}
