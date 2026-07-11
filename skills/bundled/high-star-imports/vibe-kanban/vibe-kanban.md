---
name: vibe-kanban
description: | Vibe Kanban —— 基于 Claude Code 的看板管理工具项目（Rust + React）。 原始仓库为看板 Web 应用，非单一技能文件；此处记录其来源与项目形态， 供研究者了解其架构与用法。
license: 见原仓库
source: https://github.com/bloopai/vibe-kanban
--- # Vibe Kanban Vibe Kanban 是一个通过看板视图管理 Claude Code 任务与项目进度的工具项目，
技术栈为 Rust（后端 / workspace crates）与 React + TypeScript（前端，Vite + Tailwind）。 ## 项目形态说明 本来源的真实仓库是一个**应用项目**，而非 Claude Code 技能文件。其结构包含：
- `crates/`：Rust workspace（server / db / executors / services / git / review / deployment 等）
- `packages/`：本地与远程前端（local-web / remote-web / web-core）
- `npx-cli/`：发布到 npm 的 CLI 包
- `AGENTS.md` / `CLAUDE.md`：面向贡献者的仓库指南（构建、测试、代码风格） ## 使用方式 - 作为独立应用运行：`pnpm i` 后 `pnpm run dev`（自动分配端口启动前后端）
- 类型检查：`pnpm run check`；Rust 测试：`cargo test --workspace`
- 格式化：`pnpm run format`；Lint：`pnpm run lint` ## 备注 因原始仓库为应用项目而非技能模板，此处不提供可加载的 SKILL 指令体。
如需将其改造为 Doge Code 技能，应基于其看板交互逻辑另行编写技能文件。 > 来源：https://github.com/bloopai/vibe-kanban
