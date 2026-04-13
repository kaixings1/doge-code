# Ollama 模型启动索引

## 📋 你的模型列表

| 编号 | 模型名称 | 大小 | 量化 | 用途 | 启动脚本 |
|------|----------|------|------|------|----------|
| 1 | `lfm2.5-thinking:latest` | 1.2B | Q4_K_M | 轻量思考 | `start-lfm2.5-thinking.bat` |
| 2 | `qwen2.5-coder:7b` | 7.6B | Q4_K_M | 编程专用 | `start-qwen2.5-coder.bat` |
| 3 | `glm-4.7-flash:latest` | 29.9B | Q4_K_M | 大模型 | `start-glm-4.7-flash.bat` |
| 4 | `qwen3.5:9b` | 9.7B | Q4_K_M | 通用 | `start-qwen3.5-9b.bat` |
| 5 | `qwen3.5:latest` | 9.7B | Q4_K_M | 通用默认 | `start-qwen3.5-latest.bat` |

---

## 🚀 快速启动

### 方式一：使用菜单（推荐）
```batch
ollama-menu.bat
```
**特点：** 图形化菜单，可选择模型

---

### 方式二：直接启动单个模型

```batch
:: 轻量思考模型 (1.2B)
start-lfm2.5-thinking.bat

:: 编程专用模型 (7.6B)
start-qwen2.5-coder.bat

:: GLM-4 大模型 (29.9B)
start-glm-4.7-flash.bat

:: 通义千问 3.5 (9.7B)
start-qwen3.5-9b.bat

:: 通义千问 3.5 默认 (9.7B)
start-qwen3.5-latest.bat
```

---

## 📁 文件说明

| 文件 | 说明 |
|------|------|
| `ollama-menu.bat` | 统一启动菜单（推荐） |
| `start-lfm2.5-thinking.bat` | lfm2.5-thinking 专用启动 |
| `start-qwen2.5-coder.bat` | qwen2.5-coder 专用启动 |
| `start-glm-4.7-flash.bat` | glm-4.7-flash 专用启动 |
| `start-qwen3.5-9b.bat` | qwen3.5:9b 专用启动 |
| `start-qwen3.5-latest.bat` | qwen3.5:latest 专用启动 |

---

## 💡 使用建议

### 按场景选择模型

| 场景 | 推荐模型 | 理由 |
|------|----------|------|
| 快速问答 | `lfm2.5-thinking:latest` | 1.2B 轻量，响应快 |
| 编程任务 | `qwen2.5-coder:7b` | 代码专用训练 |
| 复杂推理 | `glm-4.7-flash:latest` | 29.9B 大模型，能力强 |
| 日常对话 | `qwen3.5:9b` / `qwen3.5:latest` | 平衡性能和速度 |

### 按显存选择

| 显存 | 推荐模型 |
|------|----------|
| 4GB | `lfm2.5-thinking:latest` |
| 8GB | `qwen2.5-coder:7b`, `qwen3.5:9b` |
| 12GB+ | `glm-4.7-flash:latest` |

---

## 🔧 自定义

### 修改默认端口
编辑批处理文件，修改：
```batch
set "BASE_URL=http://localhost:11434/v1"
```

### 添加新模型
1. 下载模型：`ollama pull 模型名`
2. 复制一个批处理文件
3. 修改 `MODEL` 变量

---

## 📊 模型信息

### lfm2.5-thinking:latest
- **大小:** 1.2B
- **量化:** Q4_K_M
- **用途:** 轻量级思考模型
- **特点:** 快速响应，适合简单任务

### qwen2.5-coder:7b
- **大小:** 7.6B
- **量化:** Q4_K_M
- **用途:** 编程专用
- **特点:** 代码生成、调试、解释

### glm-4.7-flash:latest
- **大小:** 29.9B
- **量化:** Q4_K_M
- **用途:** 大型通用模型
- **特点:** 最强能力，需要更多显存

### qwen3.5:9b / qwen3.5:latest
- **大小:** 9.7B
- **量化:** Q4_K_M
- **用途:** 通用对话
- **特点:** 平衡性能和速度

---

## 📞 快捷命令

```batch
:: 查看 Ollama 模型列表
ollama list

:: 下载新模型
ollama pull 模型名

:: 删除模型
ollama rm 模型名

:: 查看模型信息
ollama show 模型名
```

---

**最后更新：** 2026 年 4 月 2 日  
**模型数量：** 5 个
