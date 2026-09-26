---
name: cmux-browser
description: 使用 cmux 进行面向最终用户的浏览器自动化。当你需要打开站点、与页面交互、等待状态变化，并从 cmux 浏览器界面中提取数据时使用。
---

# 使用 cmux 进行浏览器自动化

## 核心工作流

打开或定位一个浏览器界面，用 get url 验证导航，做快照以获取新的元素引用，基于引用执行操作，等待状态变化，然后重新快照。

```bash
cmux --json browser open https://example.com     # 返回一个 surface 引用，例如 surface:7
cmux browser surface:7 get url
cmux browser surface:7 wait --load-state complete --timeout-ms 15000
cmux browser surface:7 snapshot --interactive
cmux browser surface:7 fill e1 "hello"
cmux --json browser surface:7 click e2 --snapshot-after
cmux browser surface:7 snapshot --interactive
```

如果 get url 为空或为 about:blank，先导航，而不是等待加载状态。在导航之后、模态框打开/关闭之后或发生重大 DOM 变化之后重新快照；引用会失效。

## 界面定位

browser open 会定位到运行该命令的终端所属的工作区（CMUX_WORKSPACE_ID），即使当前焦点在另一个工作区。可用 --workspace 与 --window 覆盖：

```bash
cmux identify --json
cmux browser open https://example.com --workspace workspace:2 --window window:1 --json
```

默认输出短引用（surface:N、pane:N、workspace:N、window:N）；输入接受 UUID，用 --id-format uuids|both 可在输出中请求 UUID。每个任务保持一个 surface:N。

## 等待

```bash
cmux browser <surface> wait --selector "#ready" --timeout-ms 10000
cmux browser <surface> wait --text "Success" --timeout-ms 10000
cmux browser <surface> wait --url-contains "/dashboard" --timeout-ms 10000
cmux browser <surface> wait --load-state complete --timeout-ms 15000
cmux browser <surface> wait --function "document.readyState === 'complete'" --timeout-ms 10000
```

## 视口尺寸（WKWebView）

cmux browser <surface> viewport <width> <height> 可设置 1 到 4096 CSS 像素的精确逻辑视口。页面会在其既有面板内按比例适配，因此面板布局与焦点保持不变，截图采用所请求的逻辑尺寸。viewport reset 可恢复为面板原生尺寸。

先关闭或脱离浏览器检查器：其由检查器管理的分屏布局无法与视口模拟共存，而打开或重新停靠一个已附着的检查器会把模拟重置为原生尺寸。大视口与页面缩放的组合存在上限；当组合超出 WKWebView 渲染限制时，命令会返回结构化的 maximum_page_zoom 详情，并保持视口不变。

## 限制（WKWebView）

离线模拟、trace/录屏、网络路由拦截/mock 以及底层原始输入注入会返回 not_supported；它们依赖仅限 Chrome/CDP 的 API。请改用 click、fill、press、scroll、wait、snapshot。

## 排查 js_error

某些复杂页面会拒绝 snapshot --interactive 与 eval 背后的 JavaScript。恢复方式是先检查页面是否真的完成了导航，然后回退到原始文本或 HTML：

```bash
cmux browser surface:7 get url
cmux browser surface:7 get text body
cmux browser surface:7 get html body
```

如果仍失败，先导航到一个更简单的中间页面，再从那里重试。

## 深入参考

| 参考 | 何时使用 |
|-----------|-------------|
| [references/commands.md](references/commands.md) | 完整命令映射、agent-browser 等价命令、视口错误码 |
| [references/snapshot-refs.md](references/snapshot-refs.md) | 引用生命周期与失效引用的排查 |
| [references/authentication.md](references/authentication.md) | 登录/OAuth/2FA 模式以及状态保存/加载 |
| [references/session-management.md](references/session-management.md) | 多界面隔离与状态持久化 |
| [references/video-recording.md](references/video-recording.md) | 录制状态与可行的替代方案 |
| [references/proxy-support.md](references/proxy-support.md) | WKWebView 中的代理行为与变通方法 |

## 即用模板

| 模板 | 描述 |
|----------|-------------|
| [templates/form-automation.sh](templates/form-automation.sh) | 快照/引用驱动的表单填写循环 |
| [templates/authenticated-session.sh](templates/authenticated-session.sh) | 登录一次，保存/加载状态 |
| [templates/capture-workflow.sh](templates/capture-workflow.sh) | 导航并捕获快照/截图 |
