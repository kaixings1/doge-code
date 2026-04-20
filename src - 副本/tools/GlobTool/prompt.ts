export const GLOB_TOOL_NAME = 'Glob'

export const DESCRIPTION = `- 基于文件名模式快速匹配文件的工具，适用于任意规模的代码库
- 支持 glob 模式，如 "**/*.js" 或 "src/**/*.ts"
- 返回匹配的文件路径，按修改时间排序
- 需按文件名模式查找文件时使用本工具
- 若需多轮搜索与过滤的开放式任务，请改用 Agent 工具`