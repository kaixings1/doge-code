# /build-and-run-cpp-app

创建或更新项目本地 macOS `build_and_run.sh` 脚本，连接 Codex 应用 Run 按钮，然后使用该脚本作为默认构建/运行入口点。

## 参数

- `scheme`: Xcode scheme 名称（可选）
- `workspace`: `.xcworkspace` 路径（可选）
- `project`: `.xcodeproj` 路径（可选）
- `product`: SwiftPM 可执行产品名称（可选）
- `mode`: `run`、`debug`、`logs`、`telemetry` 或 `verify`（可选，默认：`run`）
- `app_name`: 要停止的进程/应用名称（可选）

## 工作流程

1. 检测仓库是否使用 Xcode workspace、Xcode project 或 SwiftPM package。
2. 如果工作区尚未进入 git 中，运行 `git init` 以解锁 Codex 应用 git 功能。
3. 创建或更新 `script/build_and_run.sh`，使其始终停止当前应用、构建 macOS 目标并启动 fresh 结果。
4. 对于 SwiftPM，仅保留 true CLI 工具的原始可执行启动；对于 AppKit/SwiftUI GUI 应用，创建项目本地 `.app` 捆绑包并使用 `/usr/bin/open -n` 启动。
5. 支持可选脚本标志 `--debug`、`--logs`、`--telemetry` 和 `--verify`。
6. 按 `../skills/build-run-debug/references/run-button-bootstrap.md` 中的规范 bootstrap 合同进行操作。
7. 运行请求模式的脚本并总结任何构建、脚本或启动失败。

## 限制

- 不要在现有父目录中初始化嵌套 git 仓库。
- 不要留下指向旧脚本路径的 `Run` 操作。
- 保持无标志脚本路径简单：kill、build、run。
- 仅在用户请求时使用 `--debug`、`--logs`、`--telemetry` 或 `--verify`。
