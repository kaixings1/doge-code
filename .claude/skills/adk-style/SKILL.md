---
name: adk-style
description: ADK 开发样式指南 — Python 惯用模式、代码库约定、导入、类型标注、Pydantic 模式、格式化、日志、异步/并发和文件组织。在为 ADK 项目编写代码、测试或审查 PR 时使用。
---

# ADK 风格指南

## 风格指南（references/）
- [可见性](references/visibility.md) —— 模块私有、内部、包私有可见性的命名约定。
- [导入](references/imports.md) —— 相对导入与绝对导入、`TYPE_CHECKING` 模式。
- [类型提示](references/typing.md) —— 强类型、避免 Any、裸类型名、仅关键字参数、`Optional` 与 `| None`、抽象参数类型、避免可变默认参数、运行时类型区分。
- [Pydantic 模式](references/pydantic.md) —— Pydantic v2 用法、`Field()` 约束、`field_validator`、`model_validator`、私有属性、废弃迁移、初始化后设置。
- [格式化](references/formatting.md) —— 缩进、行长限制，以及运行 pre-commit 钩子。
- [文档](references/documentation.md) —— 注释与 docstring。
- [日志](references/logging.md) —— 惰性求值与日志级别。
- [异步与并发](references/async.md) —— 异步 I/O 要求、避免阻塞事件循环。
- [文件组织](references/file-organization.md) —— 文件头与类的组织。

## 测试
[references/testing.md](references/testing.md) —— 核心原则、编写 ADK 测试的 9 条规则、测试结构模板
