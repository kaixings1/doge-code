import type { LocalJSXCommandCall } from '../../types/command.js'
import { ENTER_PLAN_MODE_TOOL_NAME } from '../../tools/EnterPlanModeTool/constants.js'
import { EXIT_PLAN_MODE_TOOL_NAME } from '../../tools/ExitPlanModeTool/constants.js'

export const call: LocalJSXCommandCall = async (onDone) => {
  onDone(`## Plan Mode - 计划模式

计划模式帮助你在编写代码前先制定详细的实现方案。
## 工作流程
1. **进入计划模式** - 使用 \`/enter-plan-mode\` 或 \`${ENTER_PLAN_MODE_TOOL_NAME}\` 工具
   - 切换到计划权限模式
   - 专注于探索和设计
   - 禁止文件编辑操作
2. **探索与设计**
   - 使用 \`${EXIT_PLAN_MODE_TOOL_NAME}\` 工具来制定和提交计划
   - 探索代码库，理解现有模式
   - 识别类似功能和架构方案
   - 设计具体的实现策略
3. **提交计划** - 使用 \`/exit-plan-mode\` 或 \`${EXIT_PLAN_MODE_TOOL_NAME}\` 工具
   - 提交你的计划以获得批准
   - 计划将被审查并转换为可执行任务
## 可用工具
- **${ENTER_PLAN_MODE_TOOL_NAME}** - 进入计划模式
- **${EXIT_PLAN_MODE_TOOL_NAME}** - 退出计划模式并提交计划
## 计划模式原则
- ✅ 深入探索代码库以了解现有模式
- ✅ 识别类似的功能和架构方案
- ✅ 考虑多种方案及其权衡
- ✅ 使用 AskUserQuestion 获取澄清
- ✅ 设计具体的实现策略
- ❌ 不要编写或编辑任何文件（只读阶段）
- ❌ 不要创建临时文件
- ❌ 不要运行会改变系统状态的命令
## 快速开始
\`\`\`
/enter-plan-mode
\`\`\`
然后使用代理工具探索代码并制定计划，完成后：
\`\`\`
/exit-plan-mode
\`\`\`
## 更多信息
查看 [PLAN_AGENT](src/tools/AgentTool/built-in/planAgent.ts) 了解内置规划代理的详细信息。
`)
}
