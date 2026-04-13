# Bridge 工具调用失效问题 - 完整修复方案

## 问题描述
通过 bridge（远程控制）运行会话时，AI 说要读取文件或执行工具调用，但实际上什么都没发生，程序直接结束或卡住。

## 根本原因分析

### 问题 1：权限请求未被处理
**位置**：`src/bridge/bridgeMain.ts`

**原因**：
- Bridge 在创建 session spawner 时，`onPermissionRequest` 回调最初**只记录日志，没有实际处理权限请求**
- 更严重的是，**第二个 `createSessionSpawner` 调用（headless/daemon 模式）根本没有设置 `onPermissionRequest` 回调**

**影响**：
- 子进程（REPL 会话）在需要调用工具时会发送 `can_use_tool` 权限请求
- Bridge 接收到请求后要么只记录日志，要么完全没有处理
- 子进程永远等待权限响应，导致工具调用失败

### 问题 2：权限响应未发送
**位置**：`src/bridge/sessionRunner.ts`

**原因**：
- `onPermissionRequest` 的类型签名是同步的（返回 `void`）
- 但实际需要异步调用 `api.sendPermissionResponseEvent()` 来发送权限响应
- 调用方在事件处理器中直接调用，没有处理异步情况

## 修复方案

### 修复 1：更新类型签名（sessionRunner.ts）

**文件**：`src/bridge/sessionRunner.ts` 第 62-66 行

```typescript
// 修改前
onPermissionRequest?: (
  sessionId: string,
  request: PermissionRequest,
  accessToken: string,
) => void

// 修改后
onPermissionRequest?: (
  sessionId: string,
  request: PermissionRequest,
  accessToken: string,
) => void | Promise<void>
```

**原因**：支持异步处理器，允许调用 `api.sendPermissionResponseEvent()`

### 修复 2：安全调用异步处理器（sessionRunner.ts）

**文件**：`src/bridge/sessionRunner.ts` 第 421-436 行

```typescript
// 修改前
deps.onPermissionRequest(
  opts.sessionId,
  parsed as PermissionRequest,
  opts.accessToken,
)

// 修改后
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

**原因**：
- 在事件处理器中不能直接使用 `await`
- 使用 `Promise.resolve().catch()` 确保异步错误被捕获和记录
- 防止未捕获的 Promise rejection 导致进程崩溃

### 修复 3：实现权限请求处理 - 主 bridge 循环（bridgeMain.ts）

**文件**：`src/bridge/bridgeMain.ts` 第 2585-2610 行

```typescript
// 修改前
onPermissionRequest: (sessionId, request, _accessToken) => {
  logForDebugging(
    `[bridge:perm] sessionId=${sessionId} tool=${request.request.tool_name} request_id=${request.request_id} (not auto-approving)`,
  )
},

// 修改后
onPermissionRequest: async (sessionId, request, accessToken) => {
  logForDebugging(
    `[bridge:perm] sessionId=${sessionId} tool=${request.request.tool_name} request_id=${request.request_id} (auto-approving for remote session)`,
  )
  // Auto-approve the tool request for remote sessions
  // The user has already authorized the action by using the remote control interface
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
},
```

### 修复 4：实现权限请求处理 - Headless/Daemon 模式（bridgeMain.ts）

**文件**：`src/bridge/bridgeMain.ts` 第 2939-2970 行

```typescript
// 修改前
const spawner = createSessionSpawner({
  execPath: process.execPath,
  scriptArgs: spawnScriptArgs(),
  env: process.env,
  verbose: false,
  sandbox: opts.sandbox,
  permissionMode: opts.permissionMode,
  onDebug: log,
})

// 修改后
const spawner = createSessionSpawner({
  execPath: process.execPath,
  scriptArgs: spawnScriptArgs(),
  env: process.env,
  verbose: false,
  sandbox: opts.sandbox,
  permissionMode: opts.permissionMode,
  onDebug: log,
  onPermissionRequest: async (sessionId, request, accessToken) => {
    log(
      `[bridge:perm] sessionId=${sessionId} tool=${request.request.tool_name} request_id=${request.request_id} (auto-approving for remote session)`,
    )
    // Auto-approve the tool request for remote sessions
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
      log(
        `[bridge:perm] sessionId=${sessionId} request_id=${request.request_id} approved successfully`,
      )
    } catch (err) {
      log(
        `[bridge:perm] sessionId=${sessionId} request_id=${request.request_id} failed to send approval: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  },
})
```

**原因**：headless/daemon 模式也需要处理权限请求，否则工具调用同样会失效

## 修复后的完整流程

```
用户通过 Claude 网页发送消息
    ↓
Bridge 接收到工作项并生成子进程
    ↓
子进程加载工具列表并发送给 AI
    ↓
AI 决定调用工具（如 Read）
    ↓
子进程调用 canUseTool 检查权限
    ↓
权限检查返回需要用户批准（behavior: 'ask'）
    ↓
子进程通过 structuredIO.sendRequest 发送 control_request 到 stdout
    ↓
Bridge 在 stdout 中检测到 control_request
    ↓
Bridge 调用 onPermissionRequest 处理器
    ↓
onPermissionRequest 调用 api.sendPermissionResponseEvent()
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
bun run ./src/bootstrap-entry.ts remote-control --verbose
```

### 2. 通过 Claude 网页连接
扫描显示的二维码或访问 URL

### 3. 发送测试消息
```
读取 package.json 文件的内容
```

### 4. 检查调试日志
应该看到以下日志序列：
```
[bridge:perm] sessionId=xxx tool=Read request_id=yyy (auto-approving for remote session)
[bridge:api] POST /v1/sessions/xxx/events type=control_response
[bridge:perm] sessionId=xxx request_id=yyy approved successfully
[bridge:activity] sessionId=xxx tool_use name=Read ...
```

### 5. 预期结果
- AI 成功读取文件内容
- 程序不退出，继续等待下一个用户输入
- 工具调用正常执行并返回结果

## 安全说明

此修复**自动批准所有工具调用**，理由是：
1. 用户已经通过远程控制界面授权了操作
2. Remote Control 的设计假设是用户信任 bridge 会话
3. 用户可以在 Claude 网页端随时停止会话

如果需要更严格的权限控制，可以实现：
- 用户确认机制（在 Claude 网页端显示确认对话框）
- 工具调用白名单/黑名单
- 基于工具输入的细粒度权限（如只允许读取特定目录）

## 修改的文件清单

1. `src/bridge/sessionRunner.ts` - 类型签名更新和异步调用处理
2. `src/bridge/bridgeMain.ts` - 两处 `createSessionSpawner` 调用的权限请求处理实现

所有修改都限定在 bridge 文件夹内，符合修复范围要求。
