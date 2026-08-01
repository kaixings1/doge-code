export type 文件建议 = Record<string, unknown> // 文件建议的键值对结构

/** 文件建议命令输入 */
export type FileSuggestionCommandInput = {
  session_id: string
  transcript_path: string
  cwd: string
  permission_mode?: string
  agent_id?: string
  agent_type?: string
  query: string
}
