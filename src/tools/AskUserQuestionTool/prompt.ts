import { EXIT_PLAN_MODE_TOOL_NAME } from '../ExitPlanModeTool/constants.js'

export const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'

export const ASK_USER_QUESTION_TOOL_CHIP_WIDTH = 12

export const DESCRIPTION =
  '向用户提出多项选择题，以收集信息、澄清歧义、了解偏好、做出决策或提供选项。'

export const PREVIEW_FEATURE_PROMPT = {
  markdown: `
预览功能：
当呈现用户需要直观比较的具体产出物时，可在选项中添加可选的 \`preview\` 字段：
- UI 布局或组件的 ASCII 原型图
- 展示不同实现的代码片段
- 图表变体
- 配置示例

预览内容以等宽框的形式渲染为 Markdown。支持多行文本和换行符。当任意选项包含预览时，界面将切换为左右分栏布局，左侧为垂直选项列表，右侧为预览区域。对于仅靠标签和描述即可明了的简单偏好问题，无需使用预览。注意：预览仅支持单选问题（不支持多选）。
`,
  html: `
预览功能：
当呈现用户需要直观比较的具体产出物时，可在选项中添加可选的 \`preview\` 字段：
- UI 布局或组件的 HTML 原型图
- 展示不同实现的格式化代码片段
- 可视化对比或图表

预览内容必须是自包含的 HTML 片段（无需 <html>/<body> 包裹，禁止使用 <script> 或 <style> 标签，请改用内联 style 属性）。对于仅靠标签和描述即可明了的简单偏好问题，无需使用预览。注意：预览仅支持单选问题（不支持多选）。
`,
} as const

export const ASK_USER_QUESTION_TOOL_PROMPT = `当你需要在执行过程中向用户提问时使用此工具。这允许你：
1. 收集用户偏好或需求
2. 澄清模糊的指令
3. 在工作过程中就实现方案做出决策
4. 向用户提供下一步方向的选择

使用说明：
- 用户始终可以选择"其他"来提供自定义文本输入
- 使用 multiSelect: true 允许一个问题选择多个答案
- 如果你推荐某个特定选项，请将其作为列表中的第一个选项，并在标签末尾添加"（推荐）"

计划模式说明：在计划模式下，请在最终确定计划之前使用此工具来澄清需求或在方案之间做出选择。请勿使用此工具询问"我的计划可以吗？"或"我应该继续吗？"——应使用 ${EXIT_PLAN_MODE_TOOL_NAME} 获取计划批准。重要提示：请勿在问题中提及"计划"（例如"你对计划有何反馈？"、"计划看起来好吗？"），因为在调用 ${EXIT_PLAN_MODE_TOOL_NAME} 之前，用户无法在界面中看到计划。若需要计划批准，请改用 ${EXIT_PLAN_MODE_TOOL_NAME}。
`