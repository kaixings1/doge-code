---
description: ARS /ars-cache-invalidate — 清除某引用键的缓存验证条目
model: sonnet
---

清除一个引用键的持久验证缓存，使下一次流水线运行重新向 Crossref / OpenAlex / Semantic Scholar / arXiv 实时验证，而非返回过时的缓存判定。当引用的元数据发生更改（例如预印本获得了已发布的 DOI）或先前的验证看起来错误时使用此命令。

缓存（规范 v3.11 #182 Delta 2）是位于 `~/.cache/ars/verification.db` 的本地 SQLite 存储（可通过 `ARS_VERIFICATION_CACHE_PATH` 覆盖），键为 `(citation_key, resolver_name, query_form)`，具有 90 天 TTL。此命令移除指定引用键的**每个**缓存条目（所有四个解析器、所有查询形式）；其他引用不受影响。它是幂等的——对没有缓存行的键执行失效操作会成功作为空操作。

要一次**全部**清除缓存（例如在系统性解析器错误缓存了许多假阴性之后），直接删除数据库文件：`rm ~/.cache/ars/verification.db`。下次运行时将重新创建空的数据库。

实现：
```bash
python3 scripts/ars_cache_invalidate.py $ARGUMENTS
```

模式参考：`docs/design/2026-05-21-v3.10-182-promote-citation-gate-spec.md` §2 Delta 2。
