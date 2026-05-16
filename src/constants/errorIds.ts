/**
 * 用于在生产环境中追踪错误来源的错误 ID。
 * 这些 ID 是经过混淆的标识符，帮助追踪
 * 哪个 logError() 调用生成了错误。
 *
 * 这些错误以单独的 const 导出表示，以实现最佳的
 * 死代码消除（外部构建将只看到数字）。
 *
 * 添加新错误类型：
 * 1. 基于下一个 ID 添加常量。
 * 2. 递增下一个 ID。
 * 下一个 ID：346
 */

export const E_TOOL_USE_SUMMARY_GENERATION_FAILED = 344
