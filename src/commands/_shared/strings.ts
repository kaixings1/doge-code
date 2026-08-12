/**
 * 共享用户可见字符串常量
 * 统一全项目 CLI 输出的文本风格和 emoji 符号
 * 所有字符串使用 ❌ 错误: / ✅ 成功 / 📖 用法: / 💡 示例: 格式
 */

// ============================================
// ERRORS
// ============================================
export const ERRORS = {
  /** ❌ 错误: 未找到 */
  ERROR_NOT_FOUND: '❌ 错误: 未找到',
  /** ❌ 错误: 未找到 ID 为 " */
  ERROR_NOT_FOUND_ID: '❌ 错误: 未找到 ID 为 "',
  /** ❌ 错误: 请提供 */
  ERROR_REQUIRED: '❌ 错误: 请提供',
  /** ❌ 错误: 请提供笔记 ID */
  ERROR_REQUIRED_NOTE_ID: '❌ 错误: 请提供笔记 ID',
  /** ❌ 错误: 安装失败 */
  ERROR_INSTALL_FAILED: '❌ 错误: 安装失败',
  /** ❌ 错误: 失败 */
  ERROR_FAILED: '❌ 错误: 失败',
  /** ❌ 错误: 连接失败 */
  ERROR_CONNECTION_FAILED: '❌ 错误: 连接失败',
  /** ❌ 错误: 操作超时 */
  ERROR_TIMEOUT: '❌ 错误: 操作超时',
  /** ❌ 错误: 请先使用 /login 登录 */
  ERROR_AUTH_REQUIRED: '❌ 错误: 请先使用 /login 登录',
  /** ❌ 错误: 权限被拒绝 */
  ERROR_PERMISSION_DENIED: '❌ 错误: 权限被拒绝',
  /** ❌ 错误: File not found: */
  ERROR_FILE_NOT_FOUND: '❌ 错误: File not found:',
  /** ❌ 错误: 无效请求 */
  ERROR_INVALID_REQUEST: '❌ 错误: 无效请求',
  /** ❌ 错误: 未知错误 */
  ERROR_UNKNOWN: '❌ 错误: 未知错误',
  /** ❌ 错误: 注册失败 */
  ERROR_REGISTRATION_FAILED: '❌ 错误: 注册失败',
  /** ❌ 错误: 回传失败 */
  ERROR_CALLBACK_FAILED: '❌ 错误: 回传失败',
  /** ❌ 错误: 获取剩余工具结果失败 */
  ERROR_RESULT_FAILED: '❌ 错误: 获取剩余工具结果失败',
  /** ❌ 错误: 解析消息失败 */
  ERROR_PARSE_FAILED: '❌ 错误: 解析消息失败',
  /** ❌ 错误: 创建会话失败 */
  ERROR_SESSION_FAILED: '❌ 错误: 创建会话失败',
  /** ❌ 错误: 获取会话日志失败 */
  ERROR_LOG_FAILED: '❌ 错误: 获取会话日志失败',
  /** ❌ 错误: 技能预取失败 */
  ERROR_SKILL_PREFETCH_FAILED: '❌ 错误: 技能预取失败',
  /** ❌ 错误: 刷新工具列表失败 */
  ERROR_REFRESH_TOOLS_FAILED: '❌ 错误: 刷新工具列表失败',
  /** ❌ 错误: 生成任务摘要失败 */
  ERROR_GENERATE_SUMMARY_FAILED: '❌ 错误: 生成任务摘要失败',
  /** ❌ 错误: SSH 隧道创建失败 */
  ERROR_SSH_TUNNEL_FAILED: '❌ 错误: SSH 隧道创建失败',
  /** ❌ 错误: 持久化会话日志失败 */
  ERROR_PERSIST_LOG_FAILED: '❌ 错误: 持久化会话日志失败',
  /** ❌ 错误: 获取 Teleport 事件失败 */
  ERROR_TELEPORT_FAILED: '❌ 错误: 获取 Teleport 事件失败',
} as const

// ============================================
// SUCCESS
// ============================================
export const SUCCESS = {
  /** ✅ 成功 */
  SUCCESS_OK: '✅ 成功',
  /** ✅ 已创建 */
  SUCCESS_CREATED: '✅ 已创建',
  /** ✅ 已删除 */
  SUCCESS_DELETED: '✅ 已删除',
  /** ✅ 已添加 */
  SUCCESS_ADDED: '✅ 已添加',
  /** ✅ 已停止 */
  SUCCESS_STOPPED: '✅ 已停止',
  /** ✅ 已取消 */
  SUCCESS_CANCELLED: '✅ 已取消',
  /** ✅ 登录成功 */
  SUCCESS_LOGIN: '✅ 登录成功',
  /** ✅ 认证成功 */
  SUCCESS_AUTHENTICATED: '✅ 认证成功',
  /** ✅ Agent "{}" 已创建: {} */
  SUCCESS_AGENT_CREATED: (a?: string, b?: string) => `✅ Agent "${a}" 已创建: ${a}`,
  /** ✅ 笔记已创建: {} */
  SUCCESS_NOTE_CREATED: (a?: string, b?: string) => `✅ 笔记已创建: ${a}`,
} as const

// ============================================
// USAGE
// ============================================
export const USAGE = {
  /** 📖 用法: */
  USAGE_HEADER: '📖 用法:',
  /** 💡 示例: */
  EXAMPLE_HEADER: '💡 示例:',
  /** 📖 详细用法 */
  USAGE_DETAIL: '📖 详细用法',
  /** 💡 使用示例 */
  EXAMPLE_DETAIL: '💡 使用示例',
} as const

// ============================================
// PROMPTS
// ============================================
export const PROMPTS = {
  /** 请输入名称:  */
  PROMPT_INPUT_NAME: '请输入名称: ',
  /** 请输入描述:  */
  PROMPT_INPUT_DESC: '请输入描述: ',
  /** 请输入系统提示词 (输入 END 结束):  */
  PROMPT_INPUT_PROMPT: '请输入系统提示词 (输入 END 结束): ',
  /** 请输入编号 (0-{}):  */
  PROMPT_NUMBER_RANGE: (a?: string) => `请输入编号 (0-${a}): `,
  /** 请确认 (y/N):  */
  PROMPT_CONFIRM: '请确认 (y/N): ',
  /** ⚠️ 注意: 可能会递归强制删除文件 */
  WARNING_RECURSIVE_DELETE: '⚠️ 注意: 可能会递归强制删除文件',
  /** ⚠️ 警告: 系统提示词非常长（超过 10,000 个字符） */
  WARNING_LONG_PROMPT: '⚠️ 警告: 系统提示词非常长（超过 10,000 个字符）',
} as const

// ============================================
// STATUS
// ============================================
export const STATUS = {
  /** SSH 隧道已建立: {}@{}:{} -> 本地端口 {} */
  STATUS_SSH_ESTABLISHED: (...args: string[]) => `SSH 隧道已建立: ${a}@${a}:${a} -> 本地端口 ${a}`,
  /** SSH 隧道失败: {} */
  STATUS_SSH_FAILED: (...args: string[]) => `SSH 隧道失败: ${a}`,
  /** 仅限 macOS 使用? 其他平台返回 null。 */
  STATUS_MCP_URL_ONLY_MACOS: '仅限 macOS 使用? 其他平台返回 null。',
  /** 语音模式需要 Claude.ai 账户。请运行 /login 登录。 */
  STATUS_VOICE_REQUIRES_LOGIN: '语音模式需要 Claude.ai 账户。请运行 /login 登录。',
  /** ⏹️ 已停止所有文件监听。 */
  STATUS_STOPPED_ALL_WATCHERS: '⏹️ 已停止所有文件监听。',
  /** ⏹️ 已停止文件监视器: {} */
  STATUS_STOPPED_WATCHER: (...args: string[]) => `⏹️ 已停止文件监视器: ${a}`,
  /** 🚫 钩子已取消 */
  STATUS_HOOK_CANCELLED: '🚫 钩子已取消',
  /** 用户已取消 */
  STATUS_USER_CANCELLED: '用户已取消',
} as const

export default { ERRORS, SUCCESS, USAGE, PROMPTS, STATUS }
