---
name: Windows C++ 项目生成器
description: "[项目生成器] Windows C++ 项目骨架生成 — 全行业覆盖，600+决策项，定向生成可运行半成品"
argumentHint: "[目标目录]"
allowedTools: [Bash, Read, Write, Edit, Glob, Grep]
---

# Windows C++ 项目生成器

## 使用方式

```
/plan-cpp-win                    # 在当前目录生成
/plan-cpp-win D:/projects/my-app  # 在指定目录生成
/plan-cpp-win 目标目录:D:/projects/my-app  # 显式指定
```

**如果传了目录参数**：直接在目标目录生成所有文件（自动创建目录）
**如果没传目录参数**：在对话中会询问你"项目生成到哪个目录？"，也可直接回答"当前目录"

> 重要：生成文件时请使用 Bash 先 `mkdir -p <目标目录>` 再创建文件，确保所有文件写入正确位置。

## 核心理念

这不是「写一个计划」，而是「生成一个可直接编译运行的项目骨架」。你回答得越详细，输出的代码就越接近成品。

每个问题的答案都会直接影响生成的文件内容。最终产出：CMakeLists.txt、源码文件、配置文件、CI 脚本、安装包脚本——全部可直接使用。