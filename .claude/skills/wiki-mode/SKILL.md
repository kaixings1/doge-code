---
name: wiki-mode
description: "知识库方法模式。让知识库声明一种组织风格（LYT / PARA / 卡片盒笔记法 / 通用模式），wiki-ingest、save 和 autoresearch 在归档新内容前会参考此模式。读取 `.vault-meta/mode.json`；当文件不存在时默认为 `generic` 模式（保持 v1.6/v1.7 行为）。根据 2026 年 5 月指南文档，方法论支持曾是等级 5 的优先差距——没有其他 Claude+Obsidian 竞争对手将其作为一级技能提供。触发词：set vault mode, switch to PARA, use LYT, what's my vault mode, zettelkasten setup, wiki mode, methodology mode, change mode, configure mode。"
allowed-tools: Read, Write, Bash
---

# wiki-mode：知识库组织方法模式

v1.6 + v1.7 版本的知识库结构是无偏见的——`wiki/sources/`、`wiki/entities/`、`wiki/concepts/` 等等。这对有自己的组织直觉的高级用户有效。但它**无法服务**那些希望遵循一种命名方法论的大量 Obsidian 用户。

**v1.8 引入 `wiki-mode` 来填补这一空白。** 知识库通过在 `.vault-meta/mode.json` 中声明一种模式（LYT、PARA、卡片盒笔记法或通用模式）；当需要决定新页面存入何处时，其他技能会在做决定前查阅它。`generic` 模式是默认值，完全保持 v1.6/v1.7 的行为。

**根据 2026 年 5 月指南文档**：这是已识别的 5 个优先差距中等级 5 的。Ideaverse Pro 2.0（200美元付费知识库）部署 LYT 作为偏好化结构；没有竞争对手的 Claude+Obsidian 产品将 PARA / 卡片盒笔记法 / 模式感知路由作为一级技能。v1.8 使我们在审计 §9 方法论支持轴上从平局变为领先（7 个轴中的 5 个为第 1）。

---

## 四种模式

### LYT（联结思考法 — Nick Milo）

**理念：** 笔记之间相互联结，而不是依赖文件夹。基本组织单元是 **MOC**（内容地图）——一个中心笔记，链接到一组原子笔记。你从不浏览文件夹；你通过跟随链接来导航。

**归档约定：**
- `wiki/mocs/<主题>-moc.md` — 某个主题集群的 MOC
- `wiki/notes/<原子笔记>.md` — 原子笔记的扁平列表，按想法命名，全部从至少一个 MOC 链接

**使用时机：** 中大型知识库（>100 条笔记），以概念集群方式思考的用户，知识图谱。

### PARA（Tiago Forte）

**理念：** 按**可操作性**组织，而非按主题。活跃工作在项目（Projects）中，持续中的责任在领域（Areas）中，参考资料在资源（Resources）中，已完成/非活跃的在归档（Archives）中。

**归档约定：**
- `wiki/projects/<项目名>/<笔记>.md` — 有截止日期/成果的活跃项目
- `wiki/areas/<领域名>/<笔记>.md` — 持续中的责任（无截止日期）
- `wiki/resources/<主题>/<笔记>.md` — 参考资料，按主题组织
- `wiki/archives/<年份>/<笔记>.md` — 已完成项目，已终止领域

**使用时机：** 重度工作流用户，管理多个项目的知识工作者，GTD 实践者。

### Zettelkasten（Niklas Luhmann 的卡片盒笔记法）

**理念：** 原子化笔记、唯一 ID、密集的双向链接。无文件夹。每条笔记只回答一个想法。笔记通过 ID 引用彼此找到。

**归档约定：**
- `wiki/<YYYYMMDDHHMMSSffffff>-<slug>.md` — 扁平的时间戳 ID（20 位 = 日期 + 微秒，可防冲突）
- 每条笔记在 frontmatter 中包含 `id:`、`parent_id:`（可选）、`child_ids:`（可选）
- 无子目录；wiki/ 根目录就是整个知识库

**使用时机：** 学者、研究员、长期思考者构建永久知识资产。纪律性要求最高；归档面最小。

### Generic（通用模式，默认 — v1.7 行为）

**归档约定：** 保留 v1.6/v1.7 的默认行为——`wiki/sources/`、`wiki/entities/`、`wiki/concepts/`、`wiki/<领域>/`。不施加任何偏好。

**使用时机：** 当你不想承诺一种方法论时，或者你正从 v1.7 迁移且希望零行为改变时。

---

## 如何设置模式

```bash
bash bin/setup-mode.sh
```

交互式提示：从 4 种模式中选择一种。写入 `.vault-meta/mode.json`。可选择性地初始化模板文件夹（LYT 的 `mocs/`，PARA 的 `projects/areas/resources/archives/`）。

以编程方式检查当前模式：

```bash
cat .vault-meta/mode.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["mode"])'
```

稍后切换模式：重新运行 `setup-mode.sh`。现有文件不会自动迁移；新模式只影响从该点开始归档的新页面。迁移是手动操作（参见下方[迁移部分](#migration-between-modes)）。

---

## Mode config schema (`.vault-meta/mode.json`)

```json
{
  "schema_version": 1,
  "mode": "lyt|para|zettelkasten|generic",
  "configured_at": "ISO-8601 timestamp",
  "config": {
    "lyt": {
      "moc_folder": "wiki/mocs/",
      "notes_folder": "wiki/notes/"
    },
    "para": {
      "projects_folder": "wiki/projects/",
      "areas_folder": "wiki/areas/",
      "resources_folder": "wiki/resources/",
      "archives_folder": "wiki/archives/"
    },
    "zettelkasten": {
      "id_format": "YYYYMMDDHHMMSSffffff",
      "no_folders": true,
      "root_folder": "wiki/"
    },
    "generic": {
      "sources_folder": "wiki/sources/",
      "entities_folder": "wiki/entities/",
      "concepts_folder": "wiki/concepts/",
      "sessions_folder": "wiki/sessions/"
    }
  }
}
```

The `config` block always includes ALL four modes; the active one is named by `mode`. This lets you switch modes without losing custom folder overrides.

---

## How other skills consume the mode

The integration layer is in three skills:

- `skills/wiki-ingest/SKILL.md` — "## Mode awareness (v1.8+)" section
- `skills/save/SKILL.md` — "## Mode awareness (v1.8+)" section
- `skills/autoresearch/SKILL.md` — "## Mode awareness (v1.8+)" section

Each consults `.vault-meta/mode.json` (via `cat` or direct Read). If absent → mode = generic, behavior unchanged. If present and mode != generic, route per the mode's config.

The routing table:

| Content type | Generic | LYT | PARA | Zettelkasten |
|---|---|---|---|---|
| New source ingest | `wiki/sources/foo.md` | `wiki/notes/foo.md` + add to topic MOC | `wiki/resources/<topic>/foo.md` | `wiki/<ID>-foo.md` |
| New entity | `wiki/entities/<Name>.md` | `wiki/notes/<Name>.md` + entity MOC | `wiki/resources/people/<Name>.md` | `wiki/<ID>-<name>.md` |
| New concept | `wiki/concepts/<Name>.md` | `wiki/notes/<Name>.md` + concept MOC | `wiki/resources/concepts/<Name>.md` | `wiki/<ID>-<name>.md` |
| Session note (`/save`) | `wiki/sessions/<date>-<topic>.md` | `wiki/notes/<date>-<topic>.md` + session MOC | `wiki/projects/<project>/<date>-<topic>.md` | `wiki/<ID>-session-<topic>.md` |
| Research output (`/autoresearch`) | `wiki/concepts/<topic>.md` | `wiki/notes/<topic>.md` + topic MOC | `wiki/resources/<topic>/<topic>.md` | `wiki/<ID>-<topic>.md` |

---

## Templates

Per-mode templates live at `skills/wiki-mode/templates/`:

- [`lyt/moc-template.md`](templates/lyt/moc-template.md) — MOC scaffolding
- [`lyt/atomic-template.md`](templates/lyt/atomic-template.md) — atomic note linking into MOCs
- [`para/project-template.md`](templates/para/project-template.md) — project with status + deadline + next-action
- [`para/area-template.md`](templates/para/area-template.md) — ongoing responsibility
- [`para/resource-template.md`](templates/para/resource-template.md) — reference material
- [`zettel/atomic-template.md`](templates/zettel/atomic-template.md) — atomic claim + parent/child IDs

Skills that file new pages consult the template matching the (mode, content-type) pair as a structural starting point. Templates are SUGGESTIONS; the skill's own content logic always wins.

---

## Migration between modes

Switching modes does NOT auto-migrate existing files. Manual migration:

1. Set new mode: `bash bin/setup-mode.sh`
2. Existing files remain in their original locations and continue to work
3. New files file per the new mode
4. (Optional) Manually move existing files to the new structure using your file manager or `git mv`

Why no auto-migration: the wiki contains your thinking. Auto-rewriting paths could break wikilinks, lose data, or surprise you. Manual migration forces explicit decisions about what fits the new methodology vs what stays in its current home.

For LYT specifically: after switching to LYT, run `lint the wiki` (skill: wiki-lint) to identify orphan pages that would benefit from MOC inclusion.

---

## Feature gating

This skill is universally available in v1.8+. No `bin/setup-*.sh` required for the skill itself — only for explicitly setting a non-default mode. Skills that consume the mode check for `.vault-meta/mode.json`; absence = generic.

```bash
# Detection idiom for consumers:
if [ -f .vault-meta/mode.json ]; then
  MODE=$(python3 -c 'import json; print(json.load(open(".vault-meta/mode.json"))["mode"])')
else
  MODE="generic"
fi
```

---

## Why v1.8 ships this, not v2.0+

Per audit §9: methodology support is the cheapest axis to lead. Nobody else ships it. The implementation is mostly conventions + routing + templates; no new infrastructure, no new dependencies. It's the highest-ROI release in the roadmap before the bigger v2.0 (derive) + v2.5 (GUI) work.

After v1.8: claude-obsidian leads on 5 of 7 axes per compass artifact. The remaining 2 (GUI ergonomics, derivative outputs) are major releases by themselves.

---

## Cross-reference

- [`docs/methodology-modes-guide.md`](../../docs/methodology-modes-guide.md) — narrative guide, when-to-use-which decision tree
- [`wiki/references/methodology-modes.md`](../../wiki/references/methodology-modes.md) — short decision tree
- [`docs/compound-vault-guide.md`](../../docs/compound-vault-guide.md) — v1.7 omnibus (v1.8 builds on this)
- v1.7.0 audit §9 axis 6 (methodology TIE → LEAD): [`docs/audits/v1.7.0-audit-2026-05-17.md`](../../docs/audits/v1.7.0-audit-2026-05-17.md)

---

## How to think (10-principle mapping)

When working on this skill, apply the 10-principle loop. See [`skills/think/SKILL.md`](../think/SKILL.md) for the canonical framework.

| # | Principle | Application here |
|---|-----------|-------------------|
| 1 | OBSERVE (ext) | Read `.vault-meta/mode.json` to know which mode is active before routing anything. |
| 2 | OBSERVE (int) | Audit the assumption that mode=generic is the default — the user may be on LYT/PARA/Zettelkasten. |
| 3 | LISTEN | The mode is the user's organizational instinct, not yours. Respect what they configured. |
| 4 | THINK | Apply the mode-specific routing rule to the content type at hand (source / entity / concept / session / research). |
| 5 | CONNECT (lat) | This skill's `safe_name` is the canonical sanitizer — wiki-ingest, save, autoresearch all funnel through here. |
| 6 | CONNECT (sys) | Three consumer skills depend on `route` output; consistency across consumers is the v1.8 contract. |
| 7 | FEEL | Does the routed path feel right to the user? `wiki/notes/Foo.md` (LYT) means something different from `wiki/concepts/Foo.md` (generic). |
| 8 | ACCEPT | Mode choice is the user's call. Accept that PARA users will sometimes want to override the auto-route. |
| 9 | CREATE | Return the routed path string — a single safe filesystem location. |
| 10 | GROW | When modes change mid-vault, surface the migration cost honestly; existing pages do NOT auto-migrate. |
