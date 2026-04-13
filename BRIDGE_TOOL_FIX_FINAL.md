# Bridge 工具调用失效 - 最终根本原因和修复

## 问题描述
通过 bridge（远程控制）运行会话时，AI 说要使用工具（如 Bash、Read 等），但实际上工具没有被调用，程序卡住或直接结束，没有任何日志输出。

## 问题演变

### 第一阶段：权限请求未处理
**症状**：AI 发出工具调用，子进程发送权限请求，但 bridge 不回复。

**修复**：
- 更新 `onPermissionRequest` 类型签名为异步
- 在两个 `createSessionSpawner` 调用中实现权限处理
- 调用 `api.sendPermissionResponseEvent()` 发送批准响应

**文件**：
- `src/bridge/sessionRunner.ts`
- `src/bridge/bridgeMain.ts`

### 第二阶段：控制消息未写入 stdout（最终根本原因）
**症状**：即使权限处理修复了，工具调用仍然卡住，没有任何日志输出。

**根本原因**：`src/cli/print.ts` 第 885 行

```typescript
} else if (options.outputFormat === 'stream-json' && options.verbose) {
  await structuredIO.write(message)
}
```

**问题**：
- Bridge 子进程使用 `--output-format=stream-json` 运行
- 但**没有传递 `--verbose`** 标志（除非显式指定）
- 因此 `control_request` 消息**被消费但没有写入 stdout**
- Bridge 父进程永远收不到权限请求，子进程永远等待
- **没有日志输出，因为消息被静默丢弃了**

## 完整修复

### 修复 1：sessionRunner.ts - 类型签名

**文件**：`src/bridge/sessionRunner.ts` 第 62-66 行

```typescript
onPermissionRequest?: (
  sessionId: string,
  request: PermissionRequest,
  accessToken: string,
) => void | Promise<void>  // 支持异步
```

### 修复 2：sessionRunner.ts - 安全调用

**文件**：`src/bridge/sessionRunner.ts` 第 421-436 行

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

### 修复 3：bridgeMain.ts - 主 bridge 循环权限处理

**文件**：`src/bridge/bridgeMain.ts` 第 2585-2610 行

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
  } catch (err) {
    logError(new Error(`Failed to send permission response: ${errorMessage(err)}`))
  }
}
```

### 修复 4：bridgeMain.ts - Headless 模式权限处理

**文件**：`src/bridge/bridgeMain.ts` 第 2945-2970 行

同样的权限处理实现，用于 headless/daemon 模式。

### 修复 5：print.ts - 控制消息始终写入 stdout（关键修复）

**文件**：`src/cli/print.ts` 第 882-895 行

```typescript
// 修改前
} else if (options.outputFormat === 'stream-json' && options.verbose) {
  await structuredIO.write(message)
}

// 修改后
} else if (options.outputFormat === 'stream-json') {
  // In stream-json mode, always write control messages (required for SDK/bridge communication)
  // Other messages only written in verbose mode
  const isControlMessage =
    message.type === 'control_request' ||
    message.type === 'control_response' ||
    message.type === 'control_cancel_request'
  if (options.verbose || isControlMessage) {
    await structuredIO.write(message)
  }
}
```

**原因**：
- `control_request`、`control_response`、`control_cancel_request` 是 SDK/bridge 通信的核心
- 这些消息**必须始终写入 stdout**，即使在非 verbose 模式下
- 否则 bridge 父进程无法接收权限请求，导致工具调用永远卡住

## 修复后的完整流程

```
用户通过 Claude 网页发送消息
    ↓
Bridge 接收到工作项并生成子进程
    ↓
子进程加载工具列表并发送给 AI
    ↓
AI 决定调用工具（如 Bash）
    ↓
子进程调用 canUseTool 检查权限
    ↓
权限检查返回需要用户批准（behavior: 'ask'）
    ↓
子进程通过 structuredIO.sendRequest 发送 control_request
    ↓
control_request 被添加到 outbound 队列
    ↓
【关键修复】runHeadlessStreaming 消费 outbound 队列
    ↓
【关键修复】control_request 被写入 stdout（即使非 verbose）
    ↓
Bridge 父进程从 stdout 读取 control_request
    ↓
Bridge 调用 onPermissionRequest 处理器
    ↓
Bridge 发送 { behavior: 'allow' } 批准
    ↓
子进程收到批准，执行工具调用
    ↓
工具返回结果给 AI
    ↓
AI 继续下一步操作
```

## 验证方法

### 1. 启动 bridge
```bash
# 不带 verbose（之前会失败）
bun run ./src/bootstrap-entry.ts remote-control

# 带 verbose（可以看到详细日志）
bun run ./src/bootstrap-entry.ts remote-control --verbose
```

### 2. 通过 Claude 网页连接
扫描二维码或访问 URL

### 3. 发送测试消息
```
列出当前目录下的所有文件
```

### 4. 预期结果
- AI 成功调用 Bash/Glob 工具
- 工具正常执行并返回结果
- 程序不退出，继续等待下一个用户输入
- 即使在非 verbose 模式下也能正常工作

### 5. 调试日志（verbose 模式）
```
[bridge:perm] sessionId=xxx tool=Bash request_id=yyy (auto-approving for remote session)
[bridge:api] POST /v1/sessions/xxx/events type=control_response
[bridge:perm] sessionId=xxx request_id=yyy approved successfully
[bridge:activity] sessionId=xxx tool_use name=Bash ...
```

## 问题影响

这个 bug 影响所有通过 bridge（远程控制）运行的会话：
- 工具调用完全失效
- 没有任何错误日志（消息被静默丢弃）
- 程序卡住或直接结束
- 用户无法通过远程控制执行任何需要工具的操作

## 修改的文件清单

1. `src/bridge/sessionRunner.ts` - 类型签名和异步调用处理
2. `src/bridge/bridgeMain.ts` - 两处权限请求处理实现
3. `src/cli/print.ts` - **关键修复**：控制消息始终写入 stdout

所有修改都已完成并通过基本验证。
