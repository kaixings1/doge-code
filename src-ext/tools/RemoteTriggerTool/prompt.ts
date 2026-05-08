export const REMOTE_TRIGGER_TOOL_NAME = 'RemoteTrigger'

export const DESCRIPTION =
  '通过 claude.ai CCR API 管理定时远程 Claude Code 代理（触发器）。身份验证在进程内处理 —— 令牌绝不会泄漏到 shell。'

export const PROMPT = `调用 claude.ai 远程触发器 API。使用此工具而非 curl —— OAuth 令牌会在进程内自动添加，绝不暴露。

操作：
- list：GET /v1/code/triggers
- get：GET /v1/code/triggers/{trigger_id}
- create：POST /v1/code/triggers（需要 body）
- update：POST /v1/code/triggers/{trigger_id}（需要 body，部分更新）
- run：POST /v1/code/triggers/{trigger_id}/run

响应为来自 API 的原始 JSON。`