---
description: ARS /ars-mark-read — 记录人工阅读信号（一个或多个引用键）
model: sonnet
---

确认用户已亲自阅读支持指定引用键的来源，以便下一次最终处理传递可以将每个已确认的 slug 从 `<!--ref:slug LOW-WARN-->` 提升为 `<!--ref:slug ok-->`。根据 v3.6.8 规范 §3.6，该信号存储在活动 Material Passport 旁边的会话范围对等文件 `<passport-stem>_human_read_log.yaml` 中；`literature_corpus[]` 由适配器拥有，永远不会被变异以携带 `human_read_source`。

调度智能体在执行前将会话上下文中的活动 Material Passport 路径替换下面的 `<path>`（保留引号，以便包含空格的路径保持为单个参数）。CLI 处理验证（citation_key 必须存在于 `literature_corpus[]` 中；如果缺失，发出 `[ARS-MARK-READ ERROR: citation_key '<slug>' not in literature_corpus[]]` 并拒绝写入）、4 个快速失败环境检查（无活动 passport / passport 未找到 / 父目录不可读 / 读取日志不可写），以及根据 §3.6 严格规则 3 的仅追加写入。

实现：
```bash
python3 scripts/ars_mark_read.py $ARGUMENTS --passport-path "<path>"
```

模式参考：`docs/design/2026-04-30-ars-v3.6.8-trust-provenance-and-drift-transparency-spec.md` §3.6 + Step 7。
