---
name: adk-setup
description: 为 ADK Python 项目设置本地开发环境。在用户想要开始开发、设置环境、安装依赖或准备贡献时使用。
disable-model-invocation: true
---

为 ADK Python 设置本地开发环境。

## 前置条件

开始前请检查以下内容：

1. **Python 3.10+**

   ```bash
   python3 --version
   ```

2. **uv 包管理器**（必需 —— 不要直接使用 pip/venv）
   ```bash
   uv --version
   ```
   如果尚未安装：
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

## 设置步骤

在项目根目录下运行这些命令：

3. **创建并激活虚拟环境：**

   ```bash
   uv venv --python "python3.11" ".venv"
   source .venv/bin/activate
   ```

4. **安装开发所需的全部依赖：**

   ```bash
   uv sync --all-extras
   ```

5. **安装开发工具：**

   ```bash
   uv tool install pre-commit
   uv tool install tox --with tox-uv
   ```

6. **安装 addlicense（需要 Go）：**

   ```bash
   go version && go install github.com/google/addlicense@latest
   ```

   > [!NOTE]
   > 如果未安装 Go，请告诉用户：
   > "addlicense 工具需要 Go。请从 https://go.dev/dl/ 安装 Go，然后重新运行 `adk-setup` 技能以完成设置。"

7. **配置 pre-commit 钩子：**

   ```bash
   pre-commit install
   ```

8. **在本地运行测试，验证一切正常：**
   ```bash
   pytest tests/unittests -n auto
   ```

## 关键命令参考

| 任务                                 | 命令                                              |
| :----------------------------------- | :------------------------------------------------ |
| 运行单元测试（快速）                 | `pytest tests/unittests`                          |
| 在所有 Python 版本上运行测试         | `tox`                                             |
| 格式化代码库                         | `pre-commit run --all-files`                      |
| 并行运行测试                         | `pytest tests/unittests -n auto`                  |
| 运行指定的测试文件                   | `pytest tests/unittests/agents/test_llm_agent.py` |
| 启动 Web 界面                        | `adk web path/to/agents_dir`                      |
| 通过 CLI 运行 agent                  | `adk run path/to/my_agent`                        |
| 构建 wheel 包                        | `uv build`                                        |
