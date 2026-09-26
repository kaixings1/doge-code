---
name: cmux-backend
description: "cmux 的后端 TypeScript 与云端 VM 开发规则。在编辑 web/app/api、web/services、后端脚本、云端 VM 生命周期、服务商集成、Postgres、Stack Auth 定价门禁、迁移或服务商镜像构建脚本时使用。"
---

# cmux 后端

## 核心规则

- `web/app/api/**`、`web/services/**` 以及涉及服务商、数据库、认证、速率限制、重试、超时或遥测的后端脚本，默认用 Effect 编写后端 TypeScript。
- 保持 Next 路由处理器轻薄：解析请求，在边界处运行一个 Effect 程序，把类型化错误映射为 HTTP 响应，将意外缺陷单独处理。
- 普通 TypeScript 用于简单的数据结构、常量、配置文件、前端 React，以及那些用 Effect 只会增加仪式感而不会改善失败处理的小型胶水代码。
- 云端 VM 后端逻辑留在 Vercel 路由处理器和由 Postgres 支撑的 Effect service 中。除非后续架构文档明确改变控制面，否则不要重新引入 Rivet 或裸 actor 协议。
- Postgres 是 VM 生命周期、活跃 VM 上限、幂等性和用量事件的唯一事实来源。
- 生产与预发的云端 VM Postgres 走 Vercel Marketplace 的 AWS Aurora PostgreSQL OIDC/RDS IAM 路径，运行时环境变量为 `CMUX_DB_DRIVER=aws-rds-iam`、`AWS_ROLE_ARN`、`AWS_REGION`、`PGHOST`、`PGPORT`、`PGUSER`、`PGDATABASE`。
- 用 `bun db:migrate:aws-rds-iam` 运行生产/预发迁移；绝不在 Vercel 构建或路由启动时运行。本地开发保留 `bun dev` 中由 `CMUX_PORT` 派生的 Docker Postgres 路径。
- 启用后，云端 VM 创建的定价门禁使用 Stack Auth 团队付款项。

## 密钥

云端 VM 的构建、测试和本地开发脚本从 `~/.secrets/cmux.env` 读取服务商密钥：`E2B_API_KEY`、`FREESTYLE_API_KEY`，以及创建 Freestyle 快照时 `web/scripts/build-cloud-vm-images.ts` 所需的 R2 上传变量。

```bash
set -a
source ~/.secrets/cmux.env
set +a
```

`~/.secrets/cmuxterm-dev.env` 保存的是本地 Stack/web 环境，而不是服务商构建密钥。`bun dev` 在文件存在时先加载 `~/.secrets/cmux.env`，然后加载 `~/.secrets/cmuxterm-dev.env`，因此 cmuxterm 专属的 Stack 设置会覆盖更宽泛的 cmux 密钥。在各机器迁移期间，web 开发加载器仍然接受旧的 `~/.secret/cmuxterm.env` 和 `~/.secrets/cmuxterm.env` 路径。

## 详细参考

- [references/effect-boundaries.md](references/effect-boundaries.md)：路由处理器、服务、类型化错误、重试、依赖注入。
- [references/cloud-vm-control-plane.md](references/cloud-vm-control-plane.md)：VM 生命周期、迁移、Postgres、服务商幂等性、定价门禁。
