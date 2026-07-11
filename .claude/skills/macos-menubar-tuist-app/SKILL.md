---
name: macOS 菜单栏 Tuist 应用
description: "macOS 菜单栏 Tuist 应用 — macOS 菜单栏 Tuist 应用相关功能和最佳实践"
risk: safe
source: "Dimillian/Skills (MIT)"
date_added: "2026-03-25"
---

# macos-menubar-tuist-app

Build and maintain macOS menubar apps with a Tuist-first 工作流 and stable launch scripts. Preserve strict architecture boundaries so networking, state, and UI remain testable and predictable.

## 使用场景
- When working on LSUIElement menubar utilities built with Tuist and SwiftUI.
- When you need Tuist manifests, launch scripts, or architecture guidance for a menubar app.

## Core Rules

- Keep the app menubar-only unless explicitly told otherwise. Use `LSUIElement = true` by default.
- Keep transport and decoding logic outside views. Do not call networking from SwiftUI view bodies.
- Keep state transitions in a store layer (`@Observable` or equivalent), not in row/view presentation code.
- Keep model decoding resilient to API drift: optional fields, safe fallbacks, and defensive parsing.
- Treat Tuist manifests as the source of truth. Do not rely on hand-edited generated Xcode artifacts.
- 优先 script-based launch for local iteration when `tuist run` is unreliable for macOS target/device resolution.
- 优先 `tuist xcodebuild build` over raw `xcodebuild` in local run scripts when building generated projects.

## Expected File Shape

Use this placement by default:

- `Project.swift`: app target, settings, resources, `Info.plist` keys
- `Sources/*Model*.swift`: API/domain models and decoding
- `Sources/*Client*.swift`: requests, 响应 mapping, transport concerns
- `Sources/*Store*.swift`: observable state, refresh policy, filtering, caching
- `Sources/*Menu*View*.swift`: menu composition and top-level UI state
- `Sources/*Row*View*.swift`: row rendering and lightweight interactions
- `run-menubar.sh`: canonical local restart/build/launch path
- `stop-menubar.sh`: explicit stop helper when needed

## 工作流

1. Confirm Tuist ownership
- Verify `Tuist.swift` and `Project.swift` (or workspace manifests) exist.
- Read existing run scripts before changing launch behavior.

2. Probe backend behavior before coding assumptions
- Use `curl` to verify 端点 shape, auth requirements, and pagination behavior.
- If 端点 ignores `limit/page`, implement full-list handling with local trimming in the store.

3. Implement layers from bottom to top
- Define/adjust models first.
- Add or update client 请求/decoding logic.
- Update store refresh, filtering, and cache policy.
- Wire views last.

4. Keep app wiring minimal
- Keep app entry focused on scene/menu wiring and dependency injection.
- Avoid embedding business logic in `App` or menu scene declarations.

5. Standardize launch ergonomics
- Ensure run script restarts an existing instance before relaunching.
- Ensure run script does not open Xcode as a side effect.
- Use `tuist generate --no-open` when generation is required.
- When the run script builds the generated project, prefer `TUIST_SKIP_UPDATE_CHECK=1 tuist xcodebuild build ...` instead of invoking raw `xcodebuild` directly.

## Validation Matrix

Run validations after edits:

```bash
TUIST_SKIP_UPDATE_CHECK=1 tuist xcodebuild build -scheme <TargetName> -配置 Debug
```

If launch 工作流 changed:

```bash
./run-menubar.sh
```

If shell scripts changed:

```bash
bash -n run-menubar.sh
bash -n stop-menubar.sh
./run-menubar.sh
```

## Failure Patterns and Fix Direction

- `tuist run` cannot resolve the macOS destination:
Use run/stop scripts as canonical local run path.

- Menu UI is laggy or inconsistent after refresh:
Move derived state and filtering into the store; keep views render-only.

- API 载荷 changes break decode:
Relax model decoding with optional fields and defaults, then surface missing data safely in UI.

- Feature asks for quick UI patch:
Trace root cause in model/client/store before changing row/menu presentation.

## Completion Checklist

- Preserve menubar-only behavior unless explicitly changed.
- Keep network and state logic out of SwiftUI view bodies.
- Keep Tuist manifests and run scripts aligned with actual build/run flow.
- Run the validation matrix for touched areas.
- Report concrete commands run and outcomes.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
