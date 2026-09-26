---
name: cmux-billing
description: "cmux 计费工作的 Stripe 结账、定价、订阅、Pro 方案、webhook 与权益操作手册。在编辑或调试计费、定价、Stripe Checkout、订阅记录、Pro 方案状态、webhook、权益元数据或定价开发/生产工具时使用。"
---

# cmux 计费

在改动计费、定价、Stripe、Pro 权益、结账、webhook 或订阅相关代码之前，先读这里。

## 架构地图

- 当设置了 `STRIPE_SECRET_KEY` 时，`/api/billing/checkout` 会为 Pro 创建 Stripe Checkout Session。它把 `client_reference_id` 设为 Stack 用户 id，为未登录的购买者自动创建一个匿名 Stack 用户，并在未配置 Stripe 或 `plan=team` 时回退到旧的 Stack 购买路径。"已处于活跃状态"的短路逻辑就在此处。
- `/api/billing/portal` 解析当前 Stack 用户，查找其 `stripe_customers` 行，并创建一个返回 `/pricing` 的 Stripe 客户门户会话。
- `/api/billing/subscription` 取消或恢复活跃的 Stripe Pro 订阅；`/dashboard/billing` 渲染已本地化的仪表盘内方案状态和自助操作。
- `web/services/billing/purchase.ts` 是 `/api/billing/complete` 和 `/api/stripe/webhook` 共用的幂等记录器。它把电子邮箱挂到购买者身上，冲突时记录 `billing_email_claims`，并且绝不基于未验证的邮箱进行交叉授权。
- Stack `clientReadOnlyMetadata` 中的 `cmuxPlan` 是 VM 代码唯一读取的权益字段；`cmuxVmPlan` 手动覆盖的优先级更高。`resolveProPlanStatus` 会把旧的 Stack 产品与活跃的 `stripe_subscriptions` 行做逻辑或。
- `/api/stripe/webhook` 会校验签名，通过 `stripe_webhook_events` 实现先插入的幂等性，对共享 Stripe 账户中的外来事件是安全的，并以 `metadata.app === "cmux"` 作为 cmux 处理的门禁。只有在持久化写入完成后才返回 2xx；返回 500 以让 Stripe 重试。

## 开发工作流

- 使用 `web/scripts/stripe/dev-stack.sh`。
- 带 tag 的 app 会把 `CMUX_PORT` 写进 `Info.plist`；要在该 tag 打印出的端口上运行开发服务器，绝不使用硬编码端口。
- 各分支的 Docker Postgres 端口会与其他 agent 的容器冲突。请使用 `--db-port`，并且绝不要停止不是你创建的容器。
- `/app-pricing` 需要 `cmux_app=1`。`cmux_scheme` 传递原生 deeplink 的返回 scheme；`cmux-dev-*` scheme 仅对 localhost 请求生效。
- 反复内部试用：用隐私窗口模拟全新的匿名购买者，并在重新测试结账前用 `web/scripts/stripe/dev-reset.sh <email>` 把已登录的开发账号取消 Pro。

## 测试模式资源

产品 `prod_UpIQRE6cj0nFjs`。新的结账使用 `cmux-pro-monthly`（$30/mo）和 `cmux-pro-yearly-288`（$288/yr，相当于 $24/mo）。为保留老用户订阅，保持 `cmux-pro-yearly`（$240/yr）处于启用状态。预发 webhook 端点 `we_1Tq1SZGhInAdn3JbWJReKNEN` 转发到 `cmux-staging.vercel.app`；其密钥已在 `cmux-staging` Vercel 项目中。

## 功能开关

`pro-upgrade-ui-enabled-release`（PostHog id `741838`）是所有 Pro UI 的门禁，在发布版中直到上线前都保持 OFF；DEBUG 构建默认开启它。面向公众的 Pro 和 Team 定价 CTA 始终走 `/api/billing/checkout`，绝不走下载确认页。合并后的 `cmux __internal_flags` 可在本地查看并覆盖开关。

## 生产操作手册

用运维 key 运行 `web/scripts/stripe/provision-live.sh`，添加两个 Vercel 环境变量，部署，用 100% 折扣优惠码购买来验证线上环境，然后取消。

数据库迁移：`bun run cloud-vm:preflight`、`bun run cloud-vm:migrate -- staging`、部署到预发，然后 `bun run cloud-vm:migrate -- production`。绝不要从构建过程运行迁移。参见云端 VM 运维流程。

## 坑点

- `bun mock.module` 是进程全局的，所以每个模块 mock 都必须带上其他测试文件所导入的每一个真实导出。缺失的导出可能只在 CI 的测试执行顺序中表现为 `Export named X not found`。
- 测试不得依赖 `DATABASE_URL` 已被设置。
- drizzle-1.0-beta 会把 pg 错误包装成 `DrizzleQueryError`；要从 `error.cause` 读取 pg 的 `code` 和 `constraint`。
- `app/[locale]` 之外的页面需要 `proxy.ts` 绕过（例如 `/app-pricing` 和 `/billing`），否则 `next-intl` 会把它们重写进 locale 树，它们会因缺失根布局标签而 404。这些子树还需要各自带 `html` 和 `body` 的布局。
