/**
 * 与工具结果大小限制相关的常量
 */

/**
 * 工具结果在被持久化到磁盘之前的默认最大字符数。
 * 超过此限制时，结果将保存到文件中，模型接收到的
 * 是包含文件路径的预览而非完整内容。
 *
 * 单个工具可以声明更低的 maxResultSizeChars，但此常量
 * 作为系统范围的上限，无论工具声明什么。
 */
export const DEFAULT_MAX_RESULT_SIZE_CHARS = 50_000

/**
 * 工具结果的最大令牌数。
 * 基于对工具结果大小的分析，我们将其设置为合理上限，
 * 以防止过大的工具结果消耗过多上下文。
 *
 * 这大约相当于 400KB 文本（假设每令牌约 4 字节）。
 */
export const MAX_TOOL_RESULT_TOKENS = 100_000

/**
 * 用于从字节大小计算令牌数的每令牌字节数估算。
 * 这是保守估计——实际令牌数可能有所不同。
 */
export const BYTES_PER_TOKEN = 4

/**
 * 工具结果的最大字节数（从令牌限制推导得出）。
 */
export const MAX_TOOL_RESULT_BYTES = MAX_TOOL_RESULT_TOKENS * BYTES_PER_TOKEN

/**
 * 单条用户消息内 tool_result 块的默认最大聚合字符数
 * （一次轮次的一批并行工具结果）。当一条消息的
 * 块总和超过此值时，该消息中最大的块将被
 * 持久化到磁盘并替换为预览，直到低于预算。
 * 消息是独立评估的——一次轮次中的 150K 结果和下
 * 一次轮次中的 150K 结果都不会受到影响。
 *
 * 这防止了 N 个并行工具各自达到每个工具最大限制，
 * 从而在一次轮次的用户消息中总共产生例如 10 × 40K = 400K 的内容。
 *
 * 可通过 GrowthBook 标志 tengu_hawthorn_window 在运行时覆盖——参见
 * toolResultStorage.ts 中的 getPerMessageBudgetLimit()。
 */
export const MAX_TOOL_RESULTS_PER_MESSAGE_CHARS = 200_000

/**
 * 紧凑视图中工具摘要字符串的最大字符长度。
 * 由 getToolUseSummary() 实现用于截断长输入，
 * 以便在分组代理渲染中显示。
 */
export const TOOL_SUMMARY_MAX_LENGTH = 50
