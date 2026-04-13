# 工具调用失效修复验证

## 问题描述
在远程控制（bridge）模式下，工具调用失效。程序在输出工具调用信息后直接结束，不执行实际的工具操作。

## 根本原因
`bridgeMain.ts` 中的 `onPermissionRequest` 处理器只记录日志，没有向子进程发送权限响应，导致子进程永远等待。

## 修复内容

### 1. sessionRunner.ts - 类型签名更新
```typescript
onPermissionRequest?: (
  sessionId: string,
  request: PermissionRequest,
  accessToken: string,
) => void | Promise<void>  // 支持异步处理
```

### 2. sessionRunner.ts - 调用方式更新
```typescript
Promise.resolve(
  deps.onPermissionRequest(
    opts.sessionId,
    parsed as PermissionRequest,
    opts.accessToken,
  ),
).catch(err => {
  deps.onDebug(
    `[bridge:session] sessionId=${opts.sessionId} permission request handler failed: ${err instanceof Error ? err.message : String(err)}`,
  )
})
```

### 3. bridgeMain.ts - 权限请求处理实现
```typescript
onPermissionRequest: async (sessionId, request, accessToken) => {
  logForDebugging(
    `[bridge:perm] sessionId=${sessionId} tool=${request.request.tool_name} request_id=${request.request_id} (auto-approving for remote session)`,
  )
  try {
    await api.sendPermissionResponseEvent(
      sessionId,
      {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: request.request_id,
          response: { behavior: 'allow' },
        },
      },
      accessToken,
    )
    logForDebugging(
      `[bridge:perm] sessionId=${sessionId} request_id=${request.request_id} approved successfully`,
    )
  } catch (err) {
    logForDebugging(
      `[bridge:perm] sessionId=${sessionId} request_id=${request.request_id} failed to send approval: ${errorMessage(err)}`,
    )
    logError(new Error(`Failed to send permission response: ${errorMessage(err)}`))
  }
}
```

## 验证步骤

### 1. 启动桥接服务
```bash
bun run ./src/bootstrap-entry.ts remote-control
```

### 2. 通过 Claude 网页或 URL 连接
扫描二维码或访问显示的 URL

### 3. 发送包含工具调用的消息
例如：
```
读取随意一个1K左右的小文件，列出内容来。
```

### 4. 预期结果
- 程序应该输出：`[bridge:perm] sessionId=... tool=Read request_id=... (auto-approving for remote session)`
- 程序应该输出：`[bridge:perm] sessionId=... request_id=... approved successfully`
- 工具应该正常执行（读取文件内容）
- 程序不应该直接结束，而是继续等待下一个用户输入

### 5. 检查调试日志
如果启用了 verbose 模式或调试日志，应该看到：
```
[bridge:perm] sessionId=xxx tool=Read request_id=yyy (auto-approving for remote session)
[bridge:api] POST /v1/sessions/xxx/events type=control_response
[bridge:perm] sessionId=xxx request_id=yyy approved successfully
```

## 注意事项
- 此修复自动批准所有工具调用，因为用户已通过远程控制界面授权
- 如需更严格的权限控制，可以实现用户确认机制
- 错误不会中断流程，只会记录日志
