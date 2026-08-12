import type { Command } from '../../commands.js'

const depsViz = {
  type: 'prompt',
  name: 'deps-viz',
  description: '分析代码库依赖关系和文件拓扑结构，生成依赖图',
  allowedTools: [
    'Bash(grep:*)',
    'Bash(find:*)',
    'Bash(cat:*)',
    'Bash(ls:*)',
    'Bash(head:*)',
    'Bash(sort:*)',
    'Bash(uniq:*)',
    'Bash(awk:*)',
    'Bash(rg:*)',
  ],
  contentLength: 0,
  progressMessage: '正在分析代码库依赖关系',
  source: 'builtin',
  getPromptForCommand(args: string): string {
    const target = args?.trim() || ''
    return `## 任务：分析代码库依赖关系

你是一个代码库拓扑分析工具。你的任务是分析当前项目中文件的 import/require/reference 关系，生成依赖图。

### 目标
${target ? `分析以下模块/文件的依赖关系：\n\`${target}\`` : '分析整个项目的顶层模块依赖关系'}

### 分析步骤

1. **检测项目类型**：
   - 检查根目录下的配置文件（package.json, Cargo.toml, go.mod, CMakeLists.txt, pom.xml, build.gradle, pyproject.toml, Cargo.toml 等）
   - 确定使用的语言和构建系统

2. **收集文件结构**：
   - 使用 find/ls 列出源码目录结构
   - 重点关注 src/、lib/、app/、packages/ 等源代码目录

3. **提取依赖关系**：
   - 对每个源文件，提取 import/require/use/include 语句
   - TypeScript/JavaScript: \`import ... from '...'\`, \`require('...')\`
   - Python: \`import ...\`, \`from ... import ...\`
   - Rust: \`use ...\`, \`mod ...\`
   - Go: \`import (...)\`
   - Java: \`import ...\`
   - C/C++: \`#include ...\`
   - 使用 grep/rg 快速批量提取

4. **构建拓扑关系**：
   - 用 ASCII 树形图展示目录结构
   - 用箭头图展示模块间依赖关系
   - 标记出以下关键信息：
     * 核心模块（被最多文件引用）
     * 叶子模块（不依赖其他模块）
     * 循环依赖（如果有）
     * 孤立文件（不被任何文件引用）

5. **输出格式要求**：

   \`\`\`
   📁 项目结构
   src/
   +-- core/
   +-- utils/
   +-- components/
   +-- services/

   📊 依赖拓扑（简化版）
   core -> utils
   services -> core, utils
   components -> core, services

    关键发现
   - 核心模块: core（被 12 个文件引用）
   - 循环依赖: services <-> components（建议重构）
   - 孤立文件: legacy/migrate.ts（未被引用）
   \`\`\`

### 注意
- ${target ? `聚焦分析 "${target}" 相关的文件和依赖` : '对整个项目进行顶层依赖分析，不需要深入到每个文件'}
- 对于大型项目（100+ 文件），只展示顶层模块（目录级别）的依赖关系
- 对于小型项目（< 50 文件），可以深入到文件级别
- 不要重复输出每个文件的内容，只输出依赖关系分析结果`
  },
} satisfies Command

export default depsViz
