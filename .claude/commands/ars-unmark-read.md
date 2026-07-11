---
description: ARS /ars-unmark-read — 撤销之前的人工阅读标记（一个或多个引用键）
model: sonnet
---

撤销指定引用键的先前已记录的人工阅读信号。根据 v3.6.8 规范 §3.6 严格规则 3，会话范围对等文件 `<passport-stem>_human_read_log.yaml` 是仅追加的：撤销操作在匹配条目上写入 `rescinded_at: <ISO 8601>` 字段而非删除它，以便审计回放可以重建用户的信号轨迹。下一次最终处理传递会将每个被撤销的 slug 从 `<!--ref:slug ok-->` 降级回 `<!--ref:slug LOW-WARN-->`。

调度智能体在执行前将会话上下文中的活动 Material Passport 路径替换下面的 `<path>`（保留引号，以便包含空格的路径保持为单个参数）。CLI 要求 citation_key 必须存在于 `literature_corpus[]` 中并且在读取日志中有未撤销的先前的标记；否则会硬失败并显示标准的 `[ARS-MARK-READ ERROR: ...]` 消息。

实现：
```bash
python3 scripts/ars_mark_read.py $ARGUMENTS --passport-path "<path>" --unmark
```

模式参考：`docs/design/2026-04-30-ars-v3.6.8-trust-provenance-and-drift-transparency-spec.md` §3.6 + Step 7。
