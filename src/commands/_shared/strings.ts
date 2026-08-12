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
  /** ❌ 错误: WebSocket 错误 */
  ERROR_WEBSOCKET: '❌ 错误: WebSocket 错误',
  /** ❌ 错误: WebSocket 连接错误 */
  ERROR_WEBSOCKET_CONNECTION: '❌ 错误: WebSocket 连接错误',
  /** ❌ 错误: 连接失败 */
  ERROR_CONNECT_FAILED: '❌ 错误: 连接失败',
  /** ❌ 错误: 连接超时 */
  ERROR_CONNECTION_TIMEOUT: '❌ 错误: 连接超时',
  /** ❌ 错误: 连接失败，请检查网络连接 */
  ERROR_CONNECTION_FAILED_NETWORK: '❌ 错误: 连接失败，请检查网络连接',
  /** ❌ 错误: 远程控制失败 */
  ERROR_REMOTE_CONTROL_FAILED: '❌ 错误: 远程控制失败',
  /** ❌ 错误: 无法创建 WebSocket 连接 */
  ERROR_WEBSOCKET_CREATE: '❌ 错误: 无法创建 WebSocket 连接',
  /** ❌ 错误: OAuth 认证失败 */
  ERROR_OAUTH_AUTH_FAILED: '❌ 错误: OAuth 认证失败',
  /** ❌ 错误: 认证失败，请运行 `gh auth login` 重新登录 */
  ERROR_GH_AUTH_FAILED: '❌ 错误: 认证失败，请运行 `gh auth login` 重新登录',
  /** ❌ 错误: JWT 刷新失败 */
  ERROR_JWT_REFRESH_FAILED: '❌ 错误: JWT 刷新失败',
  /** ❌ 错误: SSH 会话在连接前失败 */
  ERROR_SSH_PRECONNECT_FAILED: '❌ 错误: SSH 会话在连接前失败',
  /** ❌ 错误: 工具执行失败 */
  ERROR_TOOL_EXECUTION_FAILED: '❌ 错误: 工具执行失败',
  /** ❌ 错误: 导出失败 */
  ERROR_EXPORT_FAILED: '❌ 错误: 导出失败',
  /** ❌ 错误: 未知错误 */
  ERROR_UNKNOWN_ERROR: '❌ 错误: 未知错误',
  /** ❌ 错误: 执行错误 */
  ERROR_EXECUTION_ERROR: '❌ 错误: 执行错误',
  /** ❌ 错误: 会话 ${event.session_id} */
  ERROR_SESSION_EVENT: (a?: string) => `❌ 错误: 会话 ${a}`,
  /** ❌ 错误: 会话 ${sessionId} */
  ERROR_SESSION_NOT_FOUND: (a?: string) => `❌ 错误: 未找到会话: ${a}`,
  /** ❌ 错误: 未找到工作区 ${id} */
  ERROR_WORKSPACE_NOT_FOUND: (a?: string) => `❌ 错误: 未找到工作区 ${a}`,
  /** ❌ 错误: 请提供工作区 ID */
  ERROR_WORKSPACE_ID_REQUIRED: '❌ 错误: 请提供工作区 ID',
  /** ❌ 错误: 请提供搜索关键词 */
  ERROR_SEARCH_KEYWORD_REQUIRED: '❌ 错误: 请提供搜索关键词',
  /** ❌ 错误: 请提供模板 ID */
  ERROR_TEMPLATE_ID_REQUIRED: '❌ 错误: 请提供模板 ID',
  /** ❌ 错误: 未找到模板 */
  ERROR_TEMPLATE_NOT_FOUND: '❌ 错误: 未找到模板',
  /** ❌ 错误: 目标分支不存在或权限不足，请确认 --base 参数 */
  ERROR_BRANCH_NOT_FOUND: '❌ 错误: 目标分支不存在或权限不足，请确认 --base 参数',
  /** ❌ 错误: getSkills 中发生意外错误，返回空数组 */
  ERROR_GETSKILLS_UNEXPECTED: '❌ 错误: getSkills 中发生意外错误，返回空数组',
  /** ❌ 错误: getSkills 出错，回退到空数组 */
  ERROR_GETSKILLS_FALLBACK: '❌ 错误: getSkills 出错，回退到空数组',
  /** ❌ 错误: 缺少 clientKey */
  ERROR_CLIENT_KEY_MISSING: '❌ 错误: 缺少 clientKey',
  /** ❌ 错误: 停止失败钩子执行错误 */
  ERROR_STOP_FAILED_HOOK: '❌ 错误: 停止失败钩子执行错误',
  /** ❌ 错误: 刷新会话 ${sessionId} 令牌失败 */
  ERROR_REFRESH_SESSION_TOKEN: (a?: string) => `❌ 错误: 刷新会话 ${a} 令牌失败`,
  /** ❌ 错误: [并行验证失败] 以下验证步骤未通过，请修复 */
  ERROR_PARALLEL_VALIDATION_FAILED: '❌ 错误: [并行验证失败] 以下验证步骤未通过，请修复',
  /** ❌ 错误: [无失败测试输出] */
  ERROR_NO_TEST_FAILURE_OUTPUT: '❌ 错误: [无失败测试输出]',
  /** ❌ 错误: [upstreamproxy] 令牌文件取消链接失败 */
  ERROR_UPSTREAMPROXY_UNLINK_FAILED: '❌ 错误: [upstreamproxy] 令牌文件取消链接失败',
  /** ❌ 错误: 无法解析 devtools 载荷 */
  ERROR_DEVTOOLS_PAYLOAD_PARSE: '❌ 错误: 无法解析 devtools 载荷',
  /** ❌ 错误: 缺少参数 */
  ERROR_MISSING_PARAM: '❌ 错误: 缺少参数',
  /** ❌ 错误: 未知命令: */
  ERROR_UNKNOWN_COMMAND: (a?: string) => `❌ 错误: 未知命令: ${a}`,
  /** ❌ 错误: ${errorMessage(err)} */
  ERROR_WITH_MESSAGE: (a?: string) => `❌ 错误: ${a}`,
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
  /** ✅ 已导出到: ${path} */
  SUCCESS_EXPORTED: (a?: string) => `✅ 已导出到: ${a}`,
  /** ✅ 已复制! */
  SUCCESS_COPIED: '✅ 已复制!',
  /** ✅ 通过 */
  SUCCESS_PASSED: '✅ 通过',
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
  /** 📖 用法:  */
  USAGE_HEADER_SPACE: '📖 用法: ',
  /** 💡 示例:  */
  EXAMPLE_HEADER_SPACE: '💡 示例: ',
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
  /** ⚠️ 注意: 4. 可能的边界情况或需要注意的地方 */
  WARNING_BOUNDARY_CASES: '⚠️ 注意: 4. 可能的边界情况或需要注意的地方',
  /** 💡 使用提示: */
  HINT_USAGE_TIP: '💡 使用提示:',
} as const

// ============================================
// STATUS
// ============================================
export const STATUS = {
  /** SSH 隧道已建立: {}@{}:{} -> 本地端口 {} */
  STATUS_SSH_ESTABLISHED: (...args: string[]) => `SSH 隧道已建立: ${args[0]}@${args[1]}:${args[2]} -> 本地端口 ${args[3]}`,
  /** SSH 隧道失败: {} */
  STATUS_SSH_FAILED: (...args: string[]) => `SSH 隧道失败: ${args[0]}`,
  /** 仅限 macOS 使用? 其他平台返回 null。 */
  STATUS_MCP_URL_ONLY_MACOS: '仅限 macOS 使用? 其他平台返回 null。',
  /** 语音模式需要 Claude.ai 账户。请运行 /login 登录。 */
  STATUS_VOICE_REQUIRES_LOGIN: '语音模式需要 Claude.ai 账户。请运行 /login 登录。',
  /** ⏹️ 已停止所有文件监听。 */
  STATUS_STOPPED_ALL_WATCHERS: '⏹️ 已停止所有文件监听。',
  /** ⏹️ 已停止文件监视器: {} */
  STATUS_STOPPED_WATCHER: (...args: string[]) => `⏹️ 已停止文件监视器: ${args[0]}`,
  /** 🚫 钩子已取消 */
  STATUS_HOOK_CANCELLED: '🚫 钩子已取消',
  /** 用户已取消 */
  STATUS_USER_CANCELLED: '用户已取消',
  /** ⏳ [bridge:shutdown] 收到 SIGINT，正在关闭 */
  STATUS_BRIDGE_SHUTDOWN_SIGINT: '⏳ [bridge:shutdown] 收到 SIGINT，正在关闭',
  /** ⏳ [bridge:shutdown] 收到 SIGTERM，正在关闭 */
  STATUS_BRIDGE_SHUTDOWN_SIGTERM: '⏳ [bridge:shutdown] 收到 SIGTERM，正在关闭',
  /** ⏳ [remote-bridge] 恢复已在进行中，跳过主动刷新 */
  STATUS_REMOTE_BRIDGE_RECOVERY_IN_PROGRESS: '⏳ [remote-bridge] 恢复已在进行中，跳过主动刷新',
  /** ⏳ update: 正在检查 npm 注册表的最新版本 */
  STATUS_UPDATE_CHECKING_NPM: '⏳ update: 正在检查 npm 注册表的最新版本',
  /** ⏳ [第三方遥测] 远程管理设置已加载，正在初始化遥测 */
  STATUS_THIRD_PARTY_TELEMETRY_INIT: '⏳ [第三方遥测] 远程管理设置已加载，正在初始化遥测',
} as const

// ============================================
// REPORTS
// ============================================
export const REPORTS = {
  /** 📊 报告生成中... */
  REPORT_GENERATING: '📊 报告生成中...',
  /** 📊 分析完成 */
  REPORT_ANALYSIS_COMPLETE: '📊 分析完成',
  /** 📊 统计结果 */
  REPORT_STATS: '📊 统计结果',
  /** 📊 汇总 */
  REPORT_SUMMARY: '📊 汇总',
} as const

// ============================================
// MISC
// ============================================
export const MISC = {
  /** 用户已取消 */
  USER_CANCELLED: '用户已取消',
  /** 用户拒绝了权限 */
  USER_DENIED_PERMISSION: '用户拒绝了权限',
  /** 对话已压缩 */
  CONVERSATION_COMPRESSED: '对话已压缩',
  /** 已替换 */
  REPLACED: '已替换',
  /** 已写入 */
  WRITTEN: '已写入',
  /** 已读取 */
  READ: '已读取',
  /** 已列出 */
  LISTED: '已列出',
  /** 已搜索 */
  SEARCHED: '已搜索',
  /** 已执行 REPL */
  REPL_EXECUTED: '已执行 REPL',
  /** 回忆中 */
  RECALLING: '回忆中',
  /** 已回忆 */
  RECALLED: '已回忆',
  /** 搜索记忆中 */
  SEARCHING_MEMORY: '搜索记忆中',
  /** 已搜索记忆 */
  MEMORY_SEARCHED: '已搜索记忆',
  /** REPL 执行中 */
  REPL_EXECUTING: 'REPL 执行中',
  /** 远程控制重新连接中 */
  REMOTE_CONTROL_RECONNECTING: '远程控制重新连接中',
  /** 远程控制活跃 */
  REMOTE_CONTROL_ACTIVE: '远程控制活跃',
  /** 远程控制连接中… */
  REMOTE_CONTROL_CONNECTING: '远程控制连接中…',
  /** 正在重新连接 */
  RECONNECTING: '正在重新连接',
  /** 运行中 */
  RUNNING: '运行中',
  /** 搜索中 */
  SEARCHING: '搜索中',
  /** 检索中 */
  RETRIEVING: '检索中',
  /** 读取中 */
  READING: '读取中',
  /** 写入中 */
  WRITING: '写入中',
  /** 编辑中 */
  EDITING: '编辑中',
  /** 调试 */
  DEBUGGING: '调试',
  /** 就绪 */
  READY: '就绪',
  /** 完成 */
  COMPLETED: '完成',
  /** 已连接 */
  CONNECTED: '已连接',
  /** 找不到服务器: ${serverName} */
  SERVER_NOT_FOUND: (a?: string) => `找不到服务器: ${a}`,
  /** --session-id 需要一个值 */
  SESSION_ID_REQUIRED: '--session-id 需要一个值',
  /** 征求通过钩子解决: ${jsonStringify(hookResponse)} */
  ELICITATION_HOOK_RESOLVE: (a?: string) => `征求通过钩子解决: ${a}`,
  /** 征求完成通知: ${elicitationId} */
  ELICITATION_COMPLETE_NOTIFY: (a?: string) => `征求完成通知: ${a}`,
  /** 权限提示已中止。 */
  PERMISSION_PROMPT_ABORTED: '权限提示已中止。',
  /** 已启用 */
  ENABLED: '已启用',
  /** 未启用 */
  DISABLED: '未启用',
} as const

export default { ERRORS, SUCCESS, USAGE, PROMPTS, STATUS, REPORTS, MISC }
