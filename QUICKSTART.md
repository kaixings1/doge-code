# 🚀 Doge Code 启动脚本快速参考

## 📋 推荐脚本

| 脚本 | 用途 | 说明 |
|------|------|------|
| `start-llama-auto.bat` | **一键启动** | 自动启动 llama-server + Doge Code |
| `start-llama-server.bat` | 启动 llama-server | 单独启动 llama-server（32K 上下文） |
| `start-llama.bat` | 启动 Doge Code | 连接已运行的 llama-server |

---

## 💡 使用方式

### 方式一：一键启动（推荐）
```batch
start-llama-auto.bat
```
- 自动启动 llama-server
- 自动获取模型 ID
- 自动启动 Doge Code

### 方式二：分步启动
```batch
:: 步骤 1：启动 llama-server（新窗口）
start-llama-server.bat

:: 步骤 2：启动 Doge Code（新窗口）
start-llama.bat
```

### 方式三：Ollama 用户
```batch
:: 使用默认模型 (qwen2.5:7b)
start-ollama.bat

:: 指定模型
start-ollama.bat qwen2.5:7b
start-ollama.bat llama3.2:latest
```

---

## ⚙️ 配置说明

### llama-server 配置
| 参数 | 值 | 说明 |
|------|-----|------|
| 模型 | Qwen3.5-27B-Uncensored-KL | 27B 参数，Q4_K_M 量化 |
| 上下文 | 32768 tokens | 可根据显存调整 |
| 端口 | 8080 | HTTP 服务端口 |
| GPU 卸载 | 99 层 | 全部卸载到 RTX 4060 |
| 并行 | 4 | 最大并发请求数 |

### Doge Code 配置
| 环境变量 | 值 |
|----------|-----|
| ANTHROPIC_BASE_URL | http://localhost:8080 |
| DOGE_API_KEY | llama |
| ANTHROPIC_MODEL | 自动获取 |
| CLAUDE_CODE_COMPATIBLE_API_PROVIDER | openai |

---

## 🔧 自定义配置

### 修改上下文大小
编辑 `start-llama-server.bat`：
```batch
set "CTX_SIZE=32768"    :: 32K tokens (~2GB KV 缓存)
set "CTX_SIZE=16384"    :: 16K tokens (~1GB KV 缓存)
set "CTX_SIZE=65536"    :: 64K tokens (~4GB KV 缓存)
```

### 修改模型路径
编辑 `start-llama-server.bat`：
```batch
set "MODEL_PATH=D:\LLM\你的模型.gguf"
```

### 修改端口
```batch
set "PORT=8081"
```

---

## 📊 显存需求参考

| 上下文 | KV 缓存 | 总显存 (27B Q4_K_M) |
|--------|--------|---------------------|
| 8192   | ~0.5GB | ~6.5GB |
| 16384  | ~1GB   | ~7GB |
| 32768  | ~2GB   | ~8GB |
| 65536  | ~4GB   | ~10GB |

**RTX 4060 Laptop (8GB)** 推荐设置：**32768 tokens**

---

## 🛠️ 故障排除

### llama-server 启动失败
```batch
:: 检查模型文件
dir D:\LLM\*.gguf

:: 手动启动测试
llama-server -m 模型路径 --port 8080
```

### Doge Code 连接失败
```batch
:: 检查 llama-server 是否运行
curl http://localhost:8080/health

:: 应返回：{"status":"ok"}
```

### 上下文不足错误
```
request (XXXX tokens) exceeds the available context size
```
解决：增加 `CTX_SIZE` 或减少对话历史

### 显存不足
```
cannot meet free memory target
```
解决：
1. 减少 `CTX_SIZE`
2. 减少 `GPU_LAYERS`
3. 关闭其他 GPU 程序

---

## 📁 完整脚本列表

| 文件 | 状态 | 说明 |
|------|------|------|
| `start-llama-auto.bat` | ✅ 推荐 | 一键启动全部 |
| `start-llama-server.bat` | ✅ 推荐 | 启动 llama-server |
| `start-llama.bat` | ✅ 推荐 | 启动 Doge Code |
| `start-llama-direct.bat` | ✅ 可用 | 指定模型启动 |
| `start-ollama.bat` | ✅ 可用 | Ollama 用户 |
| `save-config.ps1` | ✅ 必需 | 配置保存脚本 |

---

**最后更新：** 2026 年 4 月 2 日  
**测试通过：** ✅ Qwen3.5-27B + RTX 4060 Laptop
