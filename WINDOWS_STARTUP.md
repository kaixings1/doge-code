# Doge Code Windows 启动指南

## 📦 前置要求

### 1. 安装 Bun
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

### 2. 安装依赖
```bash
cd D:\doge-code
bun install
```

### 3. (可选) 安装 Ollama
- 下载地址：https://ollama.com/download
- 或使用命令行安装：
```powershell
winget install Ollama.Ollama
```

### 4. (可选) 安装 llama-server
- 从 https://github.com/ggerganov/llama.cpp/releases 下载 `llama-server.exe`
- 放在 `D:\doge-code\` 目录或添加到系统 PATH

### 5. (可选) LMStudio 用户
- 如果你已安装 LMStudio，模型在 `D:\LLM` 目录
- LMStudio 与 llama-server 共享 GGUF 模型文件（共生关系）
- 可直接使用 LMStudio 的本地服务器，无需额外启动 llama-server

---

## 🚀 启动方式

### 🎯 方式一：LMStudio 用户（推荐）

如果你已安装 LMStudio 且模型在 `D:\LLM` 目录：

#### A. 直连模式（LMStudio 已运行）
```batch
:: 直接连接 LMStudio 本地服务器
start-doge-lmstudio-direct.bat

:: 指定模型
start-doge-lmstudio-direct.bat llama-3.2-3b
```

**前提：**
1. LMStudio 已启动
2. 已加载一个模型
3. 点击右侧"启动服务器"按钮（→→→）
4. 默认端口 1234

#### B. 独立启动模式（使用 llama-server）
```batch
:: 从 D:\LLM 目录选择模型
start-doge-lmstudio.bat

:: 指定模型文件
start-doge-lmstudio.bat llama-3.2-3b.gguf

:: 指定端口
start-doge-lmstudio.bat qwen2.5-7b.gguf 8081
```

**说明：**
- 自动扫描 `D:\LLM` 目录中的所有 GGUF 模型
- 显示列表供你选择
- 自动启动 llama-server（不影响 LMStudio）
- 与 LMStudio 共享模型文件，互不干扰

---

### 方式二：使用 Ollama（推荐）

```batch
:: 使用默认模型 (llama3.2:latest)
start-doge.bat ollama

:: 指定模型
start-doge.bat ollama llama3.2:latest
start-doge.bat ollama qwen2.5:7b
start-doge.bat ollama deepseek-r1:7b
```

**说明：**
- 脚本会自动检查并启动 Ollama 服务
- 如果模型不存在，会提示下载
- 配置会自动保存到 `~/.doge/.claude.json`

---

### 方式三：使用 llama-server（通用）

```batch
:: 使用默认配置
start-doge.bat llama models/llama-3.2-3b.gguf

:: 指定端口
start-doge.bat llama models/qwen2.5-7b.gguf 8081
```

**参数说明：**
- 第一个参数：GGUF 模型文件路径
- 第二个参数：端口号（可选，默认 8080）

**启动后可用参数：**
- `-c 4096` - 上下文长度
- `--n-gpu-layers 35` - GPU 卸载层数

---

### 方式四：自定义 API 地址

```batch
:: 任意 OpenAI 兼容接口
start-doge.bat local http://localhost:11434/v1 deepseek-r1:7b

:: 使用其他服务
start-doge.bat local http://127.0.0.1:3000/v1 my-model
```

---

## 📁 配置文件

配置保存在：`%USERPROFILE%\.doge\.claude.json`

示例配置：
```json
{
  "customApiEndpoint": {
    "provider": "openai",
    "baseURL": "http://localhost:11434/v1",
    "apiKey": "ollama",
    "model": "llama3.2:latest",
    "savedModels": [
      "llama3.2:latest",
      "qwen2.5:7b"
    ]
  }
}
```

---

## 🔧 环境变量

也可以通过环境变量配置：

```batch
set ANTHROPIC_BASE_URL=http://localhost:11434/v1
set DOGE_API_KEY=ollama
set ANTHROPIC_MODEL=llama3.2:latest
bun run dev
```

---

## 📝 常用模型

### Ollama 模型下载
```bash
ollama pull llama3.2:latest      # Llama 3.2 (轻量级)
ollama pull qwen2.5:7b           # 通义千问 2.5
ollama pull deepseek-r1:7b       # 深度求索 R1
ollama pull mistral:7b           # Mistral
ollama pull codellama:7b         # Code Llama (编程专用)
ollama pull phi3:mini            # Phi-3 (超轻量)
```

### llama-server 模型
从 HuggingFace 下载 GGUF 格式：
- https://huggingface.co/models?search=gguf
- 推荐：TheBloke、MaziyarPanahi 等量化版本

---

## ⚠️ 注意事项

1. **API 格式**: 当前项目内部使用 Anthropic Messages 协议，Ollama 和 llama-server 提供 OpenAI 兼容接口。如果遇到问题，可能需要项目的 OpenAI 转接层功能。

2. **模型名称**: 确保模型名称与本地服务中的一致

3. **GPU 加速**: llama-server 启动时已添加 `--n-gpu-layers 35`，可根据显存调整

4. **上下文长度**: 默认 4096，可根据需要调整

---

## 🛠️ 故障排除

### Ollama 服务未启动
```batch
:: 手动启动
ollama serve

:: 检查状态
curl http://localhost:11434/api/tags
```

### llama-server 找不到
```batch
:: 确认路径
where llama-server.exe

:: 或放在项目根目录
copy X:\Downloads\llama-server.exe D:\doge-code\
```

### 模型不兼容
- Ollama: 使用 `ollama pull <模型名>` 下载
- llama-server: 确保是 GGUF 格式

### Bun 错误
```batch
:: 重新安装依赖
bun install

:: 清除缓存
bun cache clear
```

---

## 📞 快捷命令

```batch
:: 查看版本
bun run version

:: 查看当前模型
doge /model

:: 切换模型
doge /add-model qwen2.5:7b

:: 查看配置
doge /config
```

---

## 📚 文件说明

| 文件 | 说明 |
|------|------|
| `start-doge-lmstudio.bat` | **LMStudio 独立模式** - 从 D:\LLM 选择模型并启动 llama-server |
| `start-doge-lmstudio-direct.bat` | **LMStudio 直连模式** - 直接连接已运行的 LMStudio 服务器 |
| `start-doge.bat` | 通用启动脚本（支持 Ollama/llama-server/自定义） |
| `start-ollama.bat` | Ollama 专用启动脚本 |
| `start-llama-server.bat` | llama-server 专用启动脚本 |

---

## 💡 技巧

1. **创建桌面快捷方式**: 右键批处理文件 → 发送到 → 桌面快捷方式

2. **修改默认模型**: 编辑批处理文件中的 `DEFAULT_OLLAMA_MODEL` 变量

3. **批量下载模型**:
```batch
for %%m in (llama3.2:latest qwen2.5:7b deepseek-r1:7b) do ollama pull %%m
```

4. **查看已下载模型**:
```batch
ollama list
```
