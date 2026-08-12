import type { LocalCommandCall } from '../../types/command.js'
import { execSync, execFileSync } from 'child_process'
import { resolve } from 'path'

const SCRIPT_PATH = resolve(import.meta.dirname, '../../../fix_skills_i18n.py')

const HELP_TEXT = [
  '用法: /skills-i18n [check|fix|force|restore|scan-empty]',
  '',
  '  check      - 仅检查汉化问题，生成报告（约2分钟）',
  '  fix        - 智能修复（仅处理有问题的文件，约5-10分钟）',
  '  force      - 强制全部重新修复（约10-15分钟）',
  '  restore    - 从备份恢复',
  '  scan-empty - 扫描缺失/空 SKILL.md 文件（约1分钟）',
  '',
  '提示: fix/force 涉及大量文件读写，请耐心等待进度条走完。',
  '',
  '示例:',
  ' 用法:   /skills-i18n           # 显示此帮助',
  '  /skills-i18n check     # 检查汉化情况',
  '  /skills-i18n fix       # 自动修复有问题的文件',
  '  /skills-i18n force     # 全部文件强制修复',
  '  /skills-i18n restore   # 从备份恢复修改过的文件',
  '  /skills-i18n scan-empty# 扫描缺少 SKILL.md 的目录',
].join('\n')

export const call: LocalCommandCall = async (args, _context) => {
  const action = args.trim() || 'help'

  if (action === 'help') {
    return { type: 'text', value: HELP_TEXT }
  }

  const validActions = ['check', 'fix', 'force', 'restore', 'scan-empty']
  if (!validActions.includes(action)) {
    return {
      type: 'text',
      value: [HELP_TEXT, '', `未知操作: "${action}"`].join('\n'),
    }
  }

  try {
    // 使用 execFileSync 而非 execSync，避免 cmd.exe 中转
    const output = execFileSync('python3', [SCRIPT_PATH, action], {
      encoding: 'utf-8',
      timeout: 900000,       // 15 分钟（fix/force 较慢）
      maxBuffer: 50 * 1024 * 1024,  // 50MB 输出缓冲
      windowsHide: true,
    })
    return { type: 'text', value: output || '执行完成，无输出' }
  } catch (err: any) {
    const msg = err.stdout || err.stderr || err.message || String(err)
    return { type: 'text', value: `执行出错:\n${msg.slice(0, 2000)}` }
  }
}
