---
name: workflow-runner
description: "在 Claude Code / OpenClaw / Cursor 中直接运行 agency-orchestrator YAML 工作流——无需 API key，使用当前会话的 LLM 作为执行引擎。当用户提供 .yaml 工作流文件或要求多角色协作完成任务时触发。"
version: "1.0.0"
license: MIT
metadata:
  hermes:
    tags: [execution, workflow]
---

# 工作流执行器：在 AI 工具内运行多角色编排

直接在当前会话中执行 agency-orchestrator 的 YAML 工作流，无需配置 API key。当前 LLM 就是执行引擎——依次扮演每个角色完成任务。

## 适用场景

- 用户提供了一个 `.yaml` 工作流文件（如 `运行 workflows/story-creation.yaml`）
- 用户要求多个角色协作完成任务（如"用产品经理和架构师一起评审这个 PRD"）
- 用户安装了 `agency-agents-zh` 并希望直接在 AI 工具内编排多角色

## 执行流程（5 步）

按以下顺序执行，不要跳步：

### 第 1 步：解析工作流

用 Read 工具读取用户指定的 YAML 文件，提取以下字段：

```yaml
name: "工作流名称"
agents_dir: "agency-agents-zh"    # 角色定义目录
inputs:                            # 输入变量
  - name: xxx
    required: true/false
    default: "默认值"
steps:                             # 执行步骤
  - id: step_id
    role: "category/agent-name"    # 角色路径
    task: "任务描述 {{变量}}"       # 支持模板变量
    output: variable_name          # 输出变量名
    depends_on: [other_step_id]    # 依赖关系
```

**忽略 `llm`、`concurrency`、`timeout`、`retry` 配置**——Skill 模式使用当前会话的 LLM，这些字段仅用于 CLI 模式。

**定位角色目录**：用 Bash `test -d` 按以下顺序检查，用第一个存在的：
1. 当前工作目录下的 `{agents_dir}/`（如 `./agency-agents-zh/`）
2. `../{agents_dir}/`（上级目录）
3. 相对于 YAML 文件所在目录的 `{agents_dir}/`
4. `node_modules/agency-agents-zh/`

如果全部找不到，**停止执行**并提示用户：
```
找不到角色目录。请先安装：
  git clone --depth 1 https://github.com/jnMetaCode/agency-agents-zh.git
  或：npm install agency-agents-zh
```

### 第 2 步：收集输入

- 对每个 `required: true` 的输入，检查用户消息中是否已提供值
- 未提供的必填输入：**立即向用户询问**，不要猜测或用空值
- 有 `default` 的可选输入：使用默认值
- 无默认值的可选输入：设为空字符串

### 第 3 步：构建执行顺序

根据 `depends_on` 进行拓扑排序，将步骤分成多个层级：

- **无 depends_on 的步骤** → 第 1 层
- **depends_on 全部在第 N 层或之前的步骤** → 第 N+1 层
- **同一层内的步骤**互不依赖，可并行

在回复中展示执行计划：
```
执行计划（共 N 步）：
  第 1 层: [step_id] — 角色名
  第 2 层: [step_a, step_b] — 并行
  第 3 层: [step_id] — 角色名
```

### 第 4 步：逐层执行

对每一层：

#### 4a. 预读角色文件

用 Read 工具读取该层所有步骤的角色 `.md` 文件：`{角色目录}/{role}.md`

从文件中提取：
- **角色名**：frontmatter 中的 `name` 字段