import { registerBundledSkill } from '../bundledSkills.js'

const SUMMARY_PROMPT = `# Bundled Skills Summary

此技能提供所有内置（bundled）技能的快速参考。当你需要了解可用技能或用户询问该使用哪个技能时，使用此技能作为目录。

## 开发与实现

| 技能 | 描述 | 触发 |
|------|------|------|
| /implement | 根据 PRD 或 Issues 实现代码，使用 TDD | 用户说"实现"或"开始编码" |
| /tdd | 测试驱动开发流程 | 用户提到 TDD、测试先行 |
| /batch | 并行编排大型更改，跨多个 Agent 分发 | 大型功能、多文件更改 |
| /simplify | 审查代码复用性、质量和效率，然后修复问题 | 用户说"审查"、"清理"或"简化" |
| /verify | 通过运行应用验证代码更改 | 需要验证功能是否正常 |
| /debug | 调试当前会话，读取调试日志 | 用户说"调试"或遇到问题 |
| /stuck | 诊断冻结/缓慢的 Claude Code 会话 | 会话卡住或变慢 |
| /diagnosing-bugs | 硬 Bug 的系统化诊断循环 | 用户说"诊断 bug"、"调试这个" |
| /resolving-merge-conflicts | 解决 git merge/rebase 冲突 | 合并冲突 |
| /migrate-to-shoehorn | 将测试文件从 \`as\` 迁移到 shoehorn | 类型安全测试 |
| /setup-pre-commit | 设置 Husky + lint-staged + Prettier | 添加预提交钩子 |
| /git-guardrails | 设置 Git 危险命令拦截钩子 | 用户提到 git 护栏 |
| /keybindings | 管理快捷键绑定 | 用户提到快捷键配置 |

## 设计与架构

| 技能 | 描述 | 触发 |
|------|------|------|
| /grilling |  relentless 追问计划/设计的每一个细节 | 设计讨论、"我们确定了吗" |
| /grill-with-docs | 追问 + 同时创建 ADR 和术语表 | 有代码库的追问 |
| /grill-me | 无状态追问，不持久化到 CONTEXT.md | 快速设计验证 |
| /codebase-design | 深度模块设计词汇表 | 模块接口设计、接缝决定 |
| /improve-codebase-architecture | 扫描架构摩擦，生成 HTML 报告 | 用户有空闲时间改善架构 |
| /domain-modeling | 构建领域模型、术语表、ADR | 领域术语讨论 |
| /prototype | 构建可丢弃原型探索设计 | "让我们快速试试" |
| /to-prd | 将对话转换为 PRD 文档 | 功能讨论后写 PRD |
| /to-issues | 将 PRD 分解为垂直切片 Issues | PRD 写完后创建计划 |
| /triage | 问题分类 (bug/enhancement) | 用户报告 issue |

## 写作与内容

| 技能 | 描述 | 触发 |
|------|------|------|
| /writing-fragments | 采访挖掘写作碎片，追加到文档 | 用户提到"碎片"、"构思" |
| /writing-beats | 逐节拍塑造文章 | 有素材要组装成叙事 |
| /writing-shape | 对话式塑造文章 | 笔记/草稿要变成文章 |
| /edit-article | 重构章节、提高清晰度 | 用户要求编辑文章 |
| /teach | 多会话教学，创建 workspace | "教我..."、学习请求 |
| /scaffold-exercises | 创建练习目录结构 | 课程/练习设置 |

## 知识与笔记

| 技能 | 描述 | 触发 |
|------|------|------|
| /obsidian-vault | 搜索/创建/管理 Obsidian 笔记 | Obsidian、wikilinks |
| /ask-matt | 技能路由器，推荐该用哪个技能 | "我该用什么技能" |
| /memory-manager | 管理项目记忆文件 | 记忆管理 |
| /remember | 审查自动记忆，分类到 CLAUDE.md/local | 记忆审查 |

## 系统与配置

| 技能 | 描述 | 触发 |
|------|------|------|
| /update-config | 通过 settings.json 配置 Claude Code | 权限、hooks、环境变量 |
| /claude-api | Claude API 集成参考 | API 使用问题 |
| /claude-in-chrome | Chrome 浏览器自动化 | 网页交互 |
| /loop | 定时循环执行命令 | 定时任务 |
| /skillify | 将会话捕获为可复用技能 | "把这个做成技能" |
| /curator-review | 查看/运行技能策展人审查 | 技能管理 |
| /writing-great-skills | 编写技能的参考 | 编写技能时 |
| /handoff | 生成交接文档供另一个 Agent 接手 | 结束会话、切换上下文 |
| /lorem-ipsum | 生成占位符文本 | 测试/占位 |

## 使用建议

当用户说"我不知道该用什么技能"时，调用 /ask-matt。当用户需要技能列表时，展示此摘要。
`

export function registerBundledSkillsSummarySkill(): void {
  registerBundledSkill({
    name: 'bundled-skills-summary',
    description: '所有内置技能的快速参考目录 — 名称、用途、触发词。',
    whenToUse: '当用户询问可用技能、该使用哪个技能，或需要技能目录时。',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: SUMMARY_PROMPT }]
    },
  })
}
