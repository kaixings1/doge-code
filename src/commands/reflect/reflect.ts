import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { getBranch, getIsClean, getChangedFiles, getHead } from '../../utils/git.js'
import { getIsGit } from '../../utils/git.js'
import { execSync } from 'child_process'

export const call: LocalCommandCall = async (_args, context): Promise<LocalCommandResult> => {
  const cwd = getOriginalCwd()
  const sections: string[] = []

  // 1. 会话状态反思
  const state = context.getAppState()
  const mainModel = state.mainLoopModel || '未设置'
  const advisorModel = state.advisorModel || '未启用'
  const isPlanMode = state.planMode ?? false

  sections.push('# 反思报告')
  sections.push('')

  sections.push('## 会话状态')
  sections.push(`- 主模型: ${mainModel}`)
  sections.push(`- 审查模型: ${advisorModel}`)
  sections.push(`- 规划模式: ${isPlanMode ? '已启用' : '未启用'}`)

  // 2. Git 状态反思
  sections.push('')
  sections.push('## 仓库状态')

  let isGit = false
  try {
    isGit = await getIsGit()
    if (!isGit) {
      sections.push('- 当前目录不是 Git 仓库')
    } else {
      const branch = await getBranch()
      const head = await getHead()
      const isClean = await getIsClean()
      const changedFiles = await getChangedFiles()

      sections.push(`- 分支: ${branch}`)
      sections.push(`- HEAD: ${head?.slice(0, 8) || '未知'}`)
      sections.push(`- 工作区: ${isClean ? '干净' : `有 ${changedFiles.length} 个未提交文件`}`)

      if (changedFiles.length > 0) {
        const untracked = changedFiles.filter(f => f.startsWith('??'))
        const modified = changedFiles.filter(f => f.startsWith(' M'))
        if (untracked.length > 0) {
          sections.push(`  - 未跟踪: ${untracked.slice(0, 5).map(f => f.slice(3)).join(', ')}${untracked.length > 5 ? ` ... (+${untracked.length - 5})` : ''}`)
        }
        if (modified.length > 0) {
          sections.push(`  - 已修改: ${modified.slice(0, 5).map(f => f.slice(3)).join(', ')}${modified.length > 5 ? ` ... (+${modified.length - 5})` : ''}`)
        }
      }

      // 最近提交活动
      try {
        const recentLog = execSync('git log --oneline -5', {
          cwd,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'ignore'],
        }).trim()
        sections.push('')
        sections.push('最近提交:')
        sections.push(...recentLog.split('\n').map(l => `  ${l}`))
      } catch {
        // 静默处理
      }
    }
  } catch {
    sections.push('- 无法读取 Git 状态')
  }

  // 3. 项目结构反思
  sections.push('')
  sections.push('## 项目特征')

  let hasSrc = false
  let hasPackageJson = false
  let hasTsConfig = false
  let hasDockerfile = false
  let hasCIConfig = false
  let srcFileCount = 0

  try {
    const entries = require('fs').readdirSync(cwd)
    hasSrc = entries.includes('src')
    hasPackageJson = entries.includes('package.json')
    hasTsConfig = entries.includes('tsconfig.json')
    hasDockerfile = entries.includes('Dockerfile') || entries.includes('docker-compose.yml')
    hasCIConfig = entries.some(e => e.startsWith('.github') || e.startsWith('.circleci') || e === '.gitlab-ci.yml')
  } catch {
    // 静默处理
  }

  if (hasSrc) {
    try {
      const fs = require('fs')
      const path = require('path')
      let count = 0
      const srcPath = path.join(cwd, 'src')
      const stack: string[] = [srcPath]
      while (stack.length > 0) {
        const dir = stack.pop()!
        try {
          const entries = fs.readdirSync(dir)
          for (const e of entries) {
            const full = path.join(dir, e)
            try {
              const stat = fs.statSync(full)
              if (stat.isDirectory() && !e.startsWith('.') && e !== 'node_modules') {
                stack.push(full)
              } else if (stat.isFile() && e.endsWith('.ts')) {
                count++
              }
            } catch {
              // 跳过
            }
          }
        } catch {
          // 跳过
        }
      }
      srcFileCount = count
    } catch {
      // 静默处理
    }
  }

  sections.push(`- TypeScript: ${hasTsConfig ? '是' : '否'}`)
  sections.push(`- Node.js 项目: ${hasPackageJson ? '是' : '否'}`)
  sections.push(`- 源码目录: ${hasSrc ? `是 (${srcFileCount} TS 文件)` : '否'}`)
  sections.push(`- Docker: ${hasDockerfile ? '已配置' : '未配置'}`)
  sections.push(`- CI/CD: ${hasCIConfig ? '已配置' : '未配置'}`)

  // 4. 改进建议
  sections.push('')
  sections.push('## 改进建议')

  const suggestions: string[] = []

  if (!isGit) {
    suggestions.push('当前目录不是 Git 仓库，建议运行 `git init` 初始化版本控制')
  }

  if (isGit) {
    const isCleanResult = await getIsClean()
    if (!isCleanResult) {
      const changedFiles = await getChangedFiles()
      if (changedFiles.length > 10) {
        suggestions.push(`工作区有 ${changedFiles.length} 个未提交文件，建议整理提交或使用 /auto-commit`)
      }
    }
  }

  if (hasPackageJson && !hasDockerfile) {
    suggestions.push('Node.js 项目缺少 Dockerfile，考虑添加容器化部署支持')
  }

  if (hasPackageJson && !hasCIConfig) {
    suggestions.push('缺少 CI/CD 配置，建议添加 GitHub Actions 或类似流程')
  }

  if (srcFileCount > 50 && !hasCIConfig) {
    suggestions.push('项目规模较大（>50 TS 文件），建议添加 CI/CD 自动化测试')
  }

  if (suggestions.length === 0) {
    sections.push('暂无特别建议，项目状态良好。')
  } else {
    sections.push(...suggestions.map(s => `- ${s}`))
  }

  // 5. 可用资源
  sections.push('')
  sections.push('## 可用命令')
  sections.push('- `/cost` — 查看当前会话成本')
  sections.push('- `/health-score` — 代码质量评分')
  sections.push('- `/bughunter` — 自动化 bug 检测')
  sections.push('- `/refactor` — 重构建议')
  sections.push('- `/advisor <model>` — 启用双模型审查')
  sections.push('- `/collab create` — 开启实时协作')
  sections.push('- `/memory search <query>` — 搜索历史记忆')

  return {
    type: 'text',
    value: sections.join('\n'),
  }
}
