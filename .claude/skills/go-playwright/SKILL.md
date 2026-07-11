---
name: 使用 Playwright Go 进行健壮、隐蔽和高效的浏览器自动化的专家能力
description: "使用 Playwright Go 进行健壮、隐蔽和高效的浏览器自动化的专家能力。"
risk: safe
source: "https://github.com/playwright-community/playwright-go"
date_added: "2026-02-27"
---

# Playwright Go 自动化专家

## 概述
本技能提供了一套完整的框架，用于使用 `github.com/playwright-community/playwright-go` 编写高性能、生产级的浏览器自动化脚本。它强制执行架构最佳实践（上下文优于实例）、健壮的错误处理、结构化日志（Zap）以及高级的人机模拟技术以绕过反机器人系统。

## 何时使用本技能
- 当用户要求使用 Go 进行"爬取"、"自动化"或"测试"网站时使用。
- 当目标网站具有复杂的动态内容（SPA、React、Vue）且需要真实浏览器时使用。
- 当用户提到"隐身"、"避免检测"、"Cloudflare"或"类人行为"时使用。
- 当调试现有的 Playwright 脚本时使用。

## 安全与风险
**风险等级：🔵 安全**

- **沙箱执行：** 浏览器上下文是隔离的；除非显式保存，否则数据不会持久化到主机。
- **资源管理：** 设计为通过 `defer` 关闭浏览器和上下文以防止内存泄漏。
- **无外部状态变更：** 默认行为是只读的（爬取/测试），除非脚本专门设计用于提交表单或修改数据。

## 局限性
- **环境依赖：** 需要安装 Playwright 驱动和浏览器（`go run github.com/playwright-community/playwright-go/cmd/playwright@latest install --with-deps`）。
- **资源密集：** 启动完整的浏览器实例（即使是无头模式）会消耗大量 RAM/CPU。建议使用单浏览器/多上下文架构。
- **机器人检测：** 虽然本技能包含了隐身技术，但极其严格的反机器人系统（例如严格的 Cloudflare 设置）仍可能检测到自动化。
- **验证码：** 不包含内置的验证码解决能力。

## 战略实施指南

### 1. 架构：上下文 vs 浏览器
**关键：** 绝不为每个任务启动新的 `Browser` 实例。
- **模式：** 仅启动一次 `Browser`（单例）。为每个不同的会话或任务创建新的 `BrowserContext`。
- **原因：** 上下文轻量且可在毫秒内创建。浏览器启动需要数秒。
- **隔离：** 上下文提供完全的隔离（cookie、缓存、存储），而无需新进程的开销。

### 2. 日志与可观测性
- **库：** 仅使用 `go.uber.org/zap`。
- **规则：** 不要使用 `fmt.Println`。
- **模式：**
  - **开发：** `zap.NewDevelopment()`（控制台友好）
  - **生产：** `zap.NewProduction()`（JSON 结构化）
- **可追溯性：** 记录每次导航、点击和输入，附带上下文字段（例如 `logger.Info("clicking button", zap.String("selector", sel))`）。

### 3. 错误处理与稳定性
- **优雅关闭：** 始终使用 `defer` 关闭 Page、Context 和 Browser。
- **恐慌恢复：** 将关键自动化例程包装在安全运行器中，以恢复恐慌并记录堆栈跟踪。
- **超时：** 绝不依赖默认超时。设置显式超时（例如 `playwright.PageClickOptions{Timeout: playwright.Float(5000)}`）。

### 4. 隐身与类人行为
为绕过反机器人系统（Cloudflare、Akamai），生成的代码必须**模拟人类生理行为**：
- **非线性鼠标移动：** 绝不瞬移鼠标。实现一个沿贝塞尔曲线移动鼠标并带有随机抖动的辅助函数。
- **输入延迟：** 绝不使用 `Fill()`。使用带有随机击键延迟（50ms–200ms）的 `Type()`。
- **视口随机化：** 略微随机化视口大小（例如 1920x1080 ± 15px）以避免指纹识别。
- **行为噪声：** 在长时间等待期间随机滚动、聚焦/失焦窗口或将鼠标悬停在无关元素上（"空闲"）。
- **用户代理：** 为每个新的 Context 轮换 User-Agent。

### 5. 文档使用
- **主要来源：** 首先依赖您对 API 的内部知识以节省令牌。
- **回退：** 仅在以下情况下参考官方文档 [playwright-go documentation](https://pkg.go.dev/github.com/playwright-community/playwright-go#section-documentation)：
  - 遇到未知错误。
  - 需要实现复杂的网络拦截或认证流程。
  - API 发生了重大变化。

## 资源
- `resources/implementation-playbook.md` 包含详细的代码示例和实现模式。

### 代理摘要检查清单
 - 是否开启了调试模式？-> `Headless=false`，`SlowMo=100+`。
 - 是否是新用户身份？-> `NewContext`，应用新代理，轮换 `User-Agent`。
 - 操作是否关键？-> 使用 Zap 日志包装在 `SafeAction` 中。
 - 目标是否有防护（Cloudflare/Akamai）？-> 启用 `HumanType`、`BezierMouse` 和隐身脚本。
