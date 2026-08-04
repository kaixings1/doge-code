# TODO: 骨架/桩实现计划

## ✅ 已完成（第一轮：功能实现）

### P0-1 至 P0-6: API 层基础实现
- [x] ToolRegistry / CommandRegistry / SessionManager / ConfigManager / utils / hooks
### P1: 6 个桩工具
- [x] CtxInspectTool / TerminalCaptureTool / SubscribePRTool / ListPeersTool / PushNotificationTool / SendUserFileTool
### P2: 命令完善
- [x] api-doc gen / api-test 全子命令
### P3: ReviewArtifactTool
- [x] 实现代码审查工具

---

## ✅ 已完成（第二轮：生产级强化）

### ToolRegistry ✅
- [x] 参数 schema 验证（类型/枚举/范围/字符串约束/正则）
- [x] 权限检查（allow:/deny: + 缓存）
- [x] 超时控制（默认 60s）+ 错误分类（5 类）
- [x] 调用计时统计（平均耗时）
- [x] 工具重复注册检测 + 描述必填校验

### CommandRegistry ✅
- [x] 智能分词（引号/转义）
- [x] 长短选项解析 + 类型自动转换
- [x] 命令历史（100 条）+ 别名冲突检测
- [x] 模糊搜索（相关性评分排序）

### SessionManager ✅
- [x] 磁盘持久化 + 启动加载
- [x] 会话搜索（标题/标签）+ 统计 + 归档

### ConfigManager ✅
- [x] 环境变量回退 + 默认值 + Schema 验证
- [x] 深合并 + 自动保存 + 父路径 watcher

### ReviewArtifactTool ✅
- [x] 评分系统（100 分制 + A-F 等级）
- [x] 20+ 检查规则 + 分级报告 + 报告导出

### SubscribePRTool ✅
- [x] 订阅持久化 + subscribe/list 子命令

---

## ✅ 已完成（第三轮：高级强化）

### hooks.ts ✅
- [x] React 响应式支持（useState/useEffect 联动）
- [x] 非 React 环境回退（普通函数）
- [x] useLocalStorage 跨标签页同步
- [x] useKeybinding React 自动清理

### api-test ✅
- [x] 原生 fetch 替代 curl 子进程
- [x] 超时控制（AbortController）
- [x] 响应格式化（状态/耗时/截断）
- [x] 并发对比（Promise.all）
- [x] 基准测试加入每秒请求数
- [x] 历史记录持久化（最近 100 条）

### utils.ts ✅
- [x] withRetry（指数退避重试）
- [x] mapWithConcurrency（并发控制）
- [x] debounce / throttle（防抖节流）
- [x] withTimeout（超时包装）

### TerminalCaptureTool ✅
- [x] 多 shell 支持（cmd/powershell/bash/auto）
- [x] 流式输出捕获（spawn）
- [x] stdout/stderr 分离
- [x] 超时强杀进程 + 输出截断保护

### SendUserFileTool ✅
- [x] 分片读取（offset/length 参数）
- [x] 大文件自动提示分片建议
- [x] 二进制 Base64 编码
- [x] 文件大小检查 + 分片数计算

### PushNotificationTool ✅
- [x] 优先级队列（high/normal/low）
- [x] 高优先级优先处理
- [x] 通知去重 + 发送统计
- [x] wait 模式（同步发送）

### SessionManager ✅
- [x] 导出会话（exportSession/exportAll）
- [x] 导入会话（importSession/importFromFile）
- [x] 会话计数

### ConfigManager ✅
- [x] 配置迁移（migrate + 版本号）
- [x] 快照/恢复（snapshot/restore）
- [x] 变更历史（changeLog）

---

## ✅ 已完成（第四轮：高级强化）

### CtxInspectTool ✅
- [x] 健康检查（内存使用率告警）
- [x] 完整环境报告（cwd/node/platform/pid/uptime/CPU/内存）
- [x] 内存详情（RSS/Heap/External/ArrayBuffers）
- [x] 使用统计（Token/费用/命令数/文件数）
- [x] Token 预算参考（阈值/触发点）
- [x] includeEnv/includeMemory 可配置

### SessionManager ✅
- [x] TTL 自动清理（cleanupStale）
- [x] 健康状态报告（active/archived/inactive 统计）

### ConfigManager ✅
- [x] 配置文件热重载（watchFile + 防抖）
- [x] stopWatchFile 停止监听

### CommandRegistry ✅
- [x] 命令参数 schema 验证（arguments 定义）
- [x] 位置参数类型检查（number/enum）
- [x] 选项参数验证
- [x] 必填参数检查 + 错误码 2

### api-test ✅
- [x] 环境变量替换（${VAR} 在 URL/body/headers 中）
- [x] 断言表达式（status ==/!=/>=/<=/>/< + body contains + body ~ regex）
- [x] 自定义断言数组支持
- [x] httpRequestResolved 包装函数

---

## ✅ 已完成（第五轮：深度强化）

### ToolRegistry ✅
- [x] 依赖注入（dependencies 字段 + 注册时自动解析）
- [x] 组合工具（compose 方法 + compose 字段）
- [x] getDependencies / checkDependencies
- [x] 未解析依赖检测

### api-test ✅
- [x] 轻量 JSON Schema 验证（validateJsonSchema）
- [x] responseSchema 字段支持（run 命令集成）
- [x] 类型/必填/属性/数组项递归验证

### PushNotificationTool ✅
- [x] 通知历史持久化（~/.doge/notifications.json，最多 100 条）
- [x] action=history / clear-history / stats 子命令
- [x] 队列发送时自动记录历史

### ListPeersTool ✅
- [x] UDP 广播节点发现（端口 45678）
- [x] action=discover / add / remove / ping / list
- [x] 发现结果自动合并到注册表
- [x] 本地 IP 检测 + 网络接口枚举
- [x] 对等节点 ping（UDP 往返时间）

### CtxInspectTool ✅
- [x] 从会话文件估算 Token 使用（TokenCalculator 逻辑）
- [x] 预算使用率告警（>80% 建议 compact，>95% 建议 clear）
- [x] 消息数统计 + 使用率百分比

---

## ✅ 已完成（第六轮：深度强化）

### SubscribePRTool ✅
- [x] 状态跟踪（lastState/lastTitle 持久化）
- [x] poll 轮询检查状态变化 + ⚠️ CHANGED 标记
- [x] unsubscribe 退订 + check PR 详情（作者/合并状态/变更量/文件数）
- [x] 订阅持久化（~/.doge/pr-subscriptions.json）

### api-doc ✅
- [x] 高级路由提取（extractRoutesAdvanced）
- [x] Next.js App Router（export const GET/POST/...）
- [x] 装饰器路由（@Get/@Post/@Put/...）
- [x] 链式路由（app.route('/x').get(...)）+ 路径参数提取
- [x] scan/all 命令集成高级提取

### api-test ✅
- [x] 断言失败时显示响应体摘要（前 500 字符）

### SessionManager ✅
- [x] 会话树形组织（getTree：按目录/分组）
- [x] 标签云（getTagCloud：标签统计排序）
- [x] 标签管理（addTag/removeTag）

### CommandRegistry ✅
- [x] 命令分组（groupByCategory：用于 /help 分类显示）
- [x] 使用频率统计（usageCount + getUsageStats 排序）
- [x] 最近使用时间跟踪（lastUsed）

### ToolRegistry ✅
- [x] 工具依赖拓扑排序（topoSort：Kahn 算法）
- [x] 循环依赖检测（抛错 + 列出循环节点）
- [x] 依赖深度计算（getDependencyDepth）+ 叶子工具列表（listLeafTools）

### CtxInspectTool ✅
- [x] 每会话独立 token 统计（perSession 数组）
- [x] Token 最高的 Top 5 会话展示
- [x] 会话级预算建议（>80% compact / >95% clear）

### ReviewArtifactTool ✅
- [x] 重写为 src/Tool.js 的 Tool 接口（buildTool + zod schema）
- [x] 消除 PermissionRequest.tsx 类型错误（TS2740/TS2367）
- [x] 修复文件扩展名正则 bug（ts|tsx 重复）

### 类型修复记录 ✅
- [x] api-test: `Command['call']` 无效索引访问 → `load: () => Promise.resolve({ call })`
- [x] api-debug: 同上 + `LocalCommandResult` 返回类型标注（showHistory/clearHistory）
- [x] PushNotificationTool: soundFlag 作用域错误（win32 分支内声明、else 分支使用）
- [x] 本轮修改的全部文件类型检查零错误（既有错误排除：useSSHSession/RemoteSessionManager/types.hooks/utils.hooks）