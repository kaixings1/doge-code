import type { PermissionUpdate } from '../utils/permissions/PermissionUpdateSchema.js'

// 桥接权限响应类型定义
type BridgePermissionResponse = {
  // 行为设置：允许或拒绝
  behavior: 'allow' | 'deny'
  // 更新后的输入参数，可选
  updatedInput?: Record<string, unknown>
  // 更新的权限列表，可选
  updatedPermissions?: PermissionUpdate[]
  // 消息内容，可选
  message?: string
}

// 桥接权限回调接口类型定义
type BridgePermissionCallbacks = {
  // 发送权限请求
  sendRequest(
    requestId: string, // 请求ID
    toolName: string,   // 工具名称
    input: Record<string, unknown>, // 输入参数
    toolUseId: string, // 工具使用ID
    description: string, // 描述信息
    permissionSuggestions?: PermissionUpdate[], // 权限建议，可选
    blockedPath?: string, // 被阻止的路径，可选
  ): void

  // 发送权限响应
  sendResponse(requestId: string, response: BridgePermissionResponse): void

  // 取消一个待处理的控制请求，以便网页应用可以取消其提示
  cancelRequest(requestId: string): void

  // 注册响应处理器，并返回取消订阅的函数
  onResponse(
    requestId: string,
    handler: (response: BridgePermissionResponse) => void
  ): () => void // 返回取消订阅的函数
}

// 验证函数：用于验证解析后的 control_response 数据是否为 BridgePermissionResponse 类型
function isBridgePermissionResponse(
  value: unknown, // 输入值，类型未知
): value is BridgePermissionResponse {
  if (!value || typeof value !== 'object') return false // 如果值不存在或不是对象，则返回false

  // 检查是否存在behavior属性，并且其值为'allow'或'deny'
  return (
    'behavior' in value &&
    (value.behavior === 'allow' || value.behavior === 'deny')
  )
}

// 导出验证函数
export { isBridgePermissionResponse }

// 导出类型定义
export type { BridgePermissionCallbacks, BridgePermissionResponse }<｜end▁of▁sentence｜>