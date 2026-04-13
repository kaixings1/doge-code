# 🚀 Doge Code - Ollama 快速启动指南

## ✅ 已创建的文件

### 启动脚本
| 文件 | 说明 |
|------|------|
| `ollama-menu.bat` | **主菜单** - 图形化选择模型（推荐） |
| `start-lfm2.5-thinking.bat` | lfm2.5-thinking:latest (1.2B) |
| `start-qwen2.5-coder.bat` | qwen2.5-coder:7b (编程专用) |
| `start-glm-4.7-flash.bat` | glm-4.7-flash:latest (29.9B) |
| `start-qwen3.5-9b.bat` | qwen3.5:9b (9.7B) |
| `start-qwen3.5-latest.bat` | qwen3.5:latest (9.7B) |
| `create-shortcuts.bat` | 创建桌面快捷方式 |

### 文档
| 文件 | 说明 |
|------|------|
| `OLLAMA_MODELS_INDEX.md` | 模型索引和详细信息 |
| `README_OLLAMA.md` | 本文件，快速入门 |

---

## 🎯 三种启动方式

### 方式 1：使用菜单（推荐）
```batch
ollama-menu.bat
```
显示图形化菜单，可选择模型

---

### 方式 2：直接启动
```batch
:: 编程任务
start-qwen2.5-coder.bat

:: 大模型推理
start-glm-4.7-flash.bat

:: 日常对话
start-qwen3.5-latest.bat
```

---

### 方式 3：桌面快捷方式
运行一次创建工具：
```batch
create-shortcuts.bat
```
然后在桌面点击对应模型的快捷方式

---

## 📋 你的模型列表

```
┌───────┬────────────────────────────┬────────────┬──────────────┐
│ 编号  │ 模型名称                   │ 大小       │ 用途         │
├───────┼────────────────────────────┼────────────┼──────────────┤
│  1    │ lfm2.5-thinking:latest     │ 1.2B       │ 轻量思考     │
│  2    │ qwen2.5-coder:7b           │ 7.6B       │ 编程专用     │
│  3    │ glm-4.7-flash:latest       │ 29.9B      │ 大模型       │
│  4    │ qwen3.5:9b                 │ 9.7B       │ 通用         │
│  5    │ qwen3.5:latest             │ 9.7B       │ 通用默认     │
└───────┴────────────────────────────┴────────────┴──────────────┘
```

---

## 💡 使用建议

| 场景 | 推荐模型 | 脚本 |
|------|----------|------|
| 快速问答 | lfm2.5-thinking | `start-lfm2.5-thinking.bat` |
| 写代码 | qwen2.5-coder | `start-qwen2.5-coder.bat` |
| 复杂任务 | glm-4.7-flash | `start-glm-4.7-flash.bat` |
| 日常使用 | qwen3.5 | `start-qwen3.5-latest.bat` |

---

## 🔧 前提条件

1. **Ollama 已安装并运行**
   - 服务地址：http://localhost:11434
   - 如果未运行，脚本会自动启动

2. **Bun 已安装**
   - 检查：`bun --version`
   - 安装：`powershell -c "irm bun.sh/install.ps1 | iex"`

3. **依赖已安装**
   ```bash
   cd D:\doge-code
   bun install
   ```

---

## 📞 常用命令

```batch
:: 查看模型列表
ollama list

:: 下载新模型
ollama pull 模型名

:: 启动菜单
ollama-menu.bat

:: 创建桌面快捷方式
create-shortcuts.bat
```

---

## ⚙️ 配置说明

- **配置目录**: `C:\Users\<用户名>\.doge\.claude.json`
- **API 地址**: `http://localhost:11434/v1`
- **API 密钥**: `ollama`
- **Provider**: `openai` (Ollama 兼容接口)

---

## 🛠️ 故障排除

### Ollama 服务未运行
脚本会自动启动，或手动运行：
```batch
ollama serve
```

### Bun 未找到
```batch
powershell -c "irm bun.sh/install.ps1 | iex"
```

### 模型不存在
```batch
:: 查看已安装模型
ollama list

:: 下载缺失模型
ollama pull 模型名
```

---

**创建日期：** 2026 年 4 月 2 日  
**模型数量：** 5 个  
**启动方式：** 菜单/直接/快捷方式
