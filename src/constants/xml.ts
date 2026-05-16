// 用于在消息中标记技能/命令元数据的 XML 标签名
export const COMMAND_NAME_TAG = 'command-name'
export const COMMAND_MESSAGE_TAG = 'command-message'
export const COMMAND_ARGS_TAG = 'command-args'

// 用户消息中终端/bash 命令输入和输出的 XML 标签名
// 这些包裹表示终端活动的内容，而非实际用户提示
export const BASH_INPUT_TAG = 'bash-input'
export const BASH_STDOUT_TAG = 'bash-stdout'
export const BASH_STDERR_TAG = 'bash-stderr'
export const LOCAL_COMMAND_STDOUT_TAG = 'local-command-stdout'
export const LOCAL_COMMAND_STDERR_TAG = 'local-command-stderr'
export const LOCAL_COMMAND_CAVEAT_TAG = 'local-command-caveat'

// 所有与终端相关的标签，指示消息是终端输出而非用户提示
export const TERMINAL_OUTPUT_TAGS = [
  BASH_INPUT_TAG,
  BASH_STDOUT_TAG,
  BASH_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_CAVEAT_TAG,
] as const

export const TICK_TAG = 'tick'

// 任务通知的 XML 标签名（后台任务完成）
export const TASK_NOTIFICATION_TAG = 'task-notification'
export const TASK_ID_TAG = 'task-id'
export const TOOL_USE_ID_TAG = 'tool-use-id'
export const TASK_TYPE_TAG = 'task-type'
export const OUTPUT_FILE_TAG = 'output-file'
export const STATUS_TAG = 'status'
export const SUMMARY_TAG = 'summary'
export const REASON_TAG = 'reason'
export const WORKTREE_TAG = 'worktree'
export const WORKTREE_PATH_TAG = 'worktreePath'
export const WORKTREE_BRANCH_TAG = 'worktreeBranch'

// 超级计划模式的 XML 标签名（远程并行计划会话）
export const ULTRAPLAN_TAG = 'ultraplan'

// 远程 /review 结果的 XML 标签名（远程传输的审查会话输出）。
// 远程会话将其最终审查包裹在此标签中；本地轮询器提取它。
export const REMOTE_REVIEW_TAG = 'remote-review'

// run_hunt.sh 的心跳每约 10 秒在此标签内回显编排器的 progress.json。
// 本地轮询器解析最新的任务状态行。
export const REMOTE_REVIEW_PROGRESS_TAG = 'remote-review-progress'

// 队友消息的 XML 标签名（群体代理间通信）
export const TEAMMATE_MESSAGE_TAG = 'teammate-message'

// 外部频道消息的 XML 标签名
export const CHANNEL_MESSAGE_TAG = 'channel-message'
export const CHANNEL_TAG = 'channel'

// 跨会话 UDS 消息的 XML 标签名（另一个 Claude 会话的收件箱）
export const CROSS_SESSION_MESSAGE_TAG = 'cross-session-message'

// 包裹分叉子节点第一条消息中规则/格式样板文件的 XML 标签。
// 让转录渲染器折叠样板文件并仅显示指令。
export const FORK_BOILERPLATE_TAG = 'fork-boilerplate'
// 指令文本前面的前缀，由渲染器去除。在 buildChildMessage（生成）
// 和 UserForkBoilerplateMessage（解析）之间保持同步。
export const FORK_DIRECTIVE_PREFIX = 'Your directive: '

// 请求帮助的斜杠命令的常见参数模式
export const COMMON_HELP_ARGS = ['help', '-h', '--help']

// 请求当前状态/信息的斜杠命令的常见参数模式
export const COMMON_INFO_ARGS = [
  'list',
  'show',
  'display',
  'current',
  'view',
  'get',
  'check',
  'describe',
  'print',
  'version',
  'about',
  'status',
  '?',
]
