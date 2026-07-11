---
name: —导航依赖关系、跟踪公共 API、理解连接存在的原因，无需重读整个仓库。
description: "为代理提供代码库的持久化结构性记忆——导航依赖关系、跟踪公共 API、理解连接存在的原因，无需重读整个仓库。"
risk: safe
source: "https://github.com/k-kolomeitsev/data-structure-protocol"
date_added: "2026-02-27"
---

# 数据结构协议 (DSP)

LLM 编码代理在任务之间会丢失上下文。在大型代码库上，它们将大部分 令牌 花在"定向"上——弄清文件在哪里、什么依赖什么、以及什么可以安全更改。DSP 通过将项目的结构映射外化到一个持久的、可查询的图中来解决这个问题，该图存储在代码旁边的 `.dsp/` 目录中。

DSP 不是给人看的文档，也不是 AST 转储。它捕获三样东西：**含义**（实体存在的原因）、**边界**（它导入和暴露的内容）和**原因**（每个连接存在的原因）。这足以让代理导航、重构和生成代码，而无需将整个源代码树加载到上下文窗口中。

## 何时使用
在以下情况下使用此技能：
- 项目有一个 `.dsp/` 目录（DSP 已设置）
- 用户要求设置 DSP、引导或映射项目结构
- 在 DSP 跟踪的项目中创建、修改或删除代码文件（以保持图更新）
- 导航项目结构、理解依赖关系或查找特定模块
- The user mentions DSP, dsp-cli, `.dsp`, or structure mapping
- Performing impact analysis before a refactor or dependency replacement

## 核心概念

### Code = graph

DSP models the codebase as a directed graph. Nodes are **entities**, edges are **imports** and **shared/exports**.

Two entity kinds exist:
- **Object**: any "thing" that isn't a function (module/file/class/config/resource/external dependency)
- **Function**: an exported function/method/处理器/pipeline

### Identity by UID, not by file path

Every entity gets a stable UID: `obj-<8hex>` for objects, `func-<8hex>` for functions. File paths are attributes that can change; UIDs survive renames, moves, and reformatting.

For entities inside a file, the UID is anchored with a comment marker in source code:

```js
// @dsp func-7f3a9c12
export function calculateTotal(items) { ... }
```

```python
# @dsp obj-e5f6g7h8
class UserService:
```

### Every connection has a "why"

When an import is recorded, DSP stores a short reason explaining *why* that dependency exists. This lives in the `exports/` reverse index of the imported entity. A dependency graph without reasons tells you *what imports what*; reasons tell you **what is safe to change and who will break**.

### Storage format

Each entity gets a small directory under `.dsp/`:

```
.dsp/
├── TOC                        # ordered list of all entity UIDs from root
├── obj-a1b2c3d4/
│   ├── description            # source path, kind, 目的 (1-3 sentences)
│   ├── imports                # UIDs this entity depends on (one per line)
│   ├── shared                 # UIDs of public API / exported entities
│   └── exports/               # reverse index: who imports this and why
│       ├── <importer_uid>     # file content = "why" text
│       └── <shared_uid>/
│           ├── description    # what is exported
│           └── <importer_uid> # why this specific export is imported
└── func-7f3a9c12/
    ├── description
    ├── imports
    └── exports/
```

Everything is plain text. Diffable. Reviewable. No database needed.

### Full import coverage

Every file or artifact that is imported anywhere must be represented in `.dsp` as an Object — code, images, styles, configs, JSON, wasm, everything. External dependencies (npm packages, stdlib, etc.) are recorded as `kind: external` but their internals are never analyzed.

## 工作原理

### Initial 设置

The skill relies on a standalone Python CLI script `dsp-cli.py`. If it is missing from the project, download it:

```bash
curl -O https://raw.githubusercontent.com/k-kolomeitsev/data-structure-protocol/main/skills/data-structure-protocol/scripts/dsp-cli.py
```

需要 **Python 3.10+**. All commands use `python dsp-cli.py --root <project-root> <command>`.

### Bootstrap (initial mapping)

If `.dsp/` is empty, traverse the project from root entrypoint(s) via DFS on imports:

1. Identify root entrypoints (`package.json` main, framework entry, `main.py`, etc.)
2. Document the root file: `create-object`, `create-function` for each export, `create-shared`, `add-import` for all dependencies
3. Take the first non-external import, document it fully, descend into its imports
4. Backtrack when no unvisited local imports remain; continue until all reachable files are documented
5. External dependencies: `create-object --kind external`, add to TOC, but never descend into `node_modules`/`site-packages`/etc.

### 工作流 Rules

- **Before changing code**: Find affected entities via `search`, `find-by-source`, or `read-toc`. Read their `description` and `imports` to understand context.
- **When creating a file/module**: Call `create-object`. For each exported function — `create-function` (with `--owner`). Register exports via `create-shared`.
- **When adding an import**: Call `add-import` with a brief `why`. For external deps — first `create-object --kind external` if the entity doesn't exist.
- **When removing import/export/file**: Call `remove-import`, `remove-shared`, `remove-entity`. Cascade cleanup is automatic.
- **When renaming/moving a file**: Call `move-entity`. UID does not change.
- **Don't touch DSP** if only internal implementation changed without affecting 目的 or dependencies.

### Key Commands

| Category | Commands |
|----------|----------|
| **Create** | `init`, `create-object`, `create-function`, `create-shared`, `add-import` |
| **Update** | `update-description`, `update-import-why`, `move-entity` |
| **Delete** | `remove-import`, `remove-shared`, `remove-entity` |
| **Navigate** | `get-entity`, `get-children --depth N`, `get-parents --depth N`, `get-path`, `get-recipients`, `read-toc` |
| **Search** | `search <查询>`, `find-by-source <path>` |
| **Diagnostics** | `detect-cycles`, `get-orphans`, `get-stats` |

### When to Update DSP

| Code Change | DSP Action |
|---|---|
| New file/module | `create-object` + `create-function` + `create-shared` + `add-import` |
| New import added | `add-import` (+ `create-object --kind external` if new dep) |
| Import removed | `remove-import` |
| Export added | `create-shared` (+ `create-function` if new) |
| Export removed | `remove-shared` |
| File renamed/moved | `move-entity` |
| File deleted | `remove-entity` |
| 目的 changed | `update-description` |
| Internal-only change | **No DSP update needed** |

## 示例

### Example 1: Setting up DSP and documenting a module

```bash
python dsp-cli.py --root . init

python dsp-cli.py --root . create-object "src/app.ts" "Main application entrypoint"
# Output: obj-a1b2c3d4

python dsp-cli.py --root . create-function "src/app.ts#start" "Starts the HTTP server" --owner obj-a1b2c3d4
# Output: func-7f3a9c12

python dsp-cli.py --root . create-shared obj-a1b2c3d4 func-7f3a9c12

python dsp-cli.py --root . add-import obj-a1b2c3d4 obj-deadbeef "HTTP routing"
```

### Example 2: Navigating the graph before making changes

```bash
python dsp-cli.py --root . search "认证"
python dsp-cli.py --root . get-entity obj-a1b2c3d4
python dsp-cli.py --root . get-children obj-a1b2c3d4 --depth 2
python dsp-cli.py --root . get-recipients obj-a1b2c3d4
python dsp-cli.py --root . get-path obj-a1b2c3d4 func-7f3a9c12
```

### Example 3: Impact analysis before replacing a library

```bash
python dsp-cli.py --root . find-by-source "lodash"
# Output: obj-11223344

python dsp-cli.py --root . get-recipients obj-11223344
# Shows every module that imports lodash and WHY — lets you systematically replace it
```

## 最佳实践

- ✅ **Do:** Update DSP immediately when creating new files, adding imports, or changing public APIs
- ✅ **Do:** 始终 add a meaningful `why` reason when recording an import — this is where most of DSP's value lives
- ✅ **Do:** Use `kind: external` for third-party libraries without analyzing their internals
- ✅ **Do:** Keep descriptions minimal (1-3 sentences about 目的, not implementation)
- ✅ **Do:** Treat `.dsp/` diffs like code diffs — review them, keep them accurate
- ❌ **Don't:** Touch `.dsp/` for internal-only changes that don't affect 目的 or dependencies
- ❌ **Don't:** Change an entity's UID on rename/move (use `move-entity` instead)
- ❌ **Don't:** Create UIDs for every local variable or helper — only file-level Objects and public/shared entities

## 集成

This skill connects naturally to:
- **context-compression** — DSP reduces the need for compression by providing targeted retrieval instead of loading everything
- **context-optimization** — DSP is a structural optimization: agents pull minimal "context bundles" instead of raw source
- **architecture** — DSP captures architectural boundaries (imports/exports) that feed system design decisions

## 参考资料

- **Full architecture specification**: [ARCHITECTURE.md](https://github.com/k-kolomeitsev/data-structure-protocol/blob/main/ARCHITECTURE.md)
- **CLI source + reference docs**: [skills/data-structure-protocol](https://github.com/k-kolomeitsev/data-structure-protocol/tree/main/skills/data-structure-protocol)
- **简介 article**: [article.md](https://github.com/k-kolomeitsev/data-structure-protocol/blob/main/article.md)

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
