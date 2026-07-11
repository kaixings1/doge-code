---
name: 代码转PRD
description: "将前端代码库逆向工程为 PRD。用法: /code-to-prd [路径]"
argument-hint: "[path]"
---

# /code-to-prd

将前端代码库逆向工程为完整的产品需求文档。

## 用法

```bash
/code-to-prd                    # 分析当前项目
/code-to-prd ./src              # 分析指定目录
/code-to-prd /path/to/project   # 分析外部项目
```

## 功能说明

1. **扫描** — 运行 `codebase_analyzer.py` 检测框架、路由、API、枚举和项目结构
2. **搭建骨架** — 运行 `prd_scaffolder.py` 创建 `prd/` 目录，包含 README.md、每个页面的存根和附录文件
3. **分析** — 按照阶段 2 工作流逐个页面分析：字段、交互、API 依赖、页面关系
4. **生成** — 生成最终 PRD，包含所有页面、枚举字典、API 清单和页面关系图

## 步骤

### 步骤 1：分析

确定项目路径（默认为当前目录）。运行前端分析器：

```bash
python3 {skill_path}/scripts/codebase_analyzer.py {project_path} -o .code-to-prd-analysis.json
```

显示分析结果摘要：框架、页面数、API 数、枚举数。

### 步骤 2：搭建骨架

生成 PRD 目录骨架：

```bash
python3 {skill_path}/scripts/prd_scaffolder.py .code-to-prd-analysis.json -o prd/
```

### 步骤 3：填充

对于清单中的每个页面，按照 SKILL.md 阶段 2 工作流操作：
- 读取页面的组件文件
- 记录字段、交互、API 依赖、页面关系
- 填充对应的 `prd/pages/` 存根

对于大型项目（超过 15 页），以 3-5 页为一批次处理。每批次后请用户确认。

### 步骤 4：收尾

完成附录文件：
- `prd/appendix/enum-dictionary.md` — 找到的所有枚举和状态码
- `prd/appendix/api-inventory.md` — 合并的 API 参考
- `prd/appendix/page-relationships.md` — 导航和数据耦合映射

清理临时分析文件：
```bash
rm .code-to-prd-analysis.json
```

## 输出

包含以下内容的 `prd/` 目录：
- `README.md` — 系统概述、模块映射、页面清单
- `pages/*.md` — 每个页面一个文件，包含字段、交互、API
- `appendix/*.md` — 枚举字典、API 清单、页面关系

## 技能参考

- `product-team/code-to-prd/skills/code-to-prd/SKILL.md`
- `product-team/code-to-prd/skills/code-to-prd/scripts/codebase_analyzer.py`
- `product-team/code-to-prd/skills/code-to-prd/scripts/prd_scaffolder.py`
- `product-team/code-to-prd/skills/code-to-prd/references/prd-quality-checklist.md`
