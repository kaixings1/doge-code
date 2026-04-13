# llama-server 快速启动指南

## 📋 前提条件

- ✅ llama-server 已通过命令启动
- ✅ 模型已加载
- ✅ Bun 已安装

---

## 🚀 启动方式

### 方式 1：快速启动（默认配置）

```batch
start-llama.bat
```

**默认配置：**
- 模型：`llama-3.2-3b`
- 端口：`8080`
- 地址：`http://localhost:8080/v1`

---

### 方式 2：指定模型和端口

```batch
:: 指定模型
start-llama-direct.bat qwen2.5-7b

:: 指定模型和端口
start-llama-direct.bat glm-4-9b 8081
```

---

## ⚙️ 配置说明

### 环境变量
启动脚本会自动设置以下环境变量：
```batch
ANTHROPIC_BASE_URL=http://localhost:8080/v1
DOGE_API_KEY=llama
ANTHROPIC_MODEL=llama-3.2-3b
```

### 配置文件
配置自动保存到：
```
C:\Users\<用户名>\.doge\.claude.json
```

配置内容：
```json
{
  "customApiEndpoint": {
    "provider": "openai",
    "baseURL": "http://localhost:8080/v1",
    "apiKey": "llama",
    "model": "llama-3.2-3b",
    "savedModels": ["llama-3.2-3b"]
  }
}
```

---

## 📁 文件说明

| 文件 | 说明 |
|------|------|
| `start-llama.bat` | 快速启动（默认配置） |
| `start-llama-direct.bat` | 可指定模型和端口 |

---

## 🔧 自定义配置

### 修改默认模型
编辑 `start-llama.bat`，修改：
```batch
set "MODEL=你的模型名"
```

### 修改默认端口
编辑 `start-llama.bat`，修改：
```batch
set "PORT=你的端口号"
```

---

## 💡 llama-server 启动命令参考

```bash
# 基本启动
./llama-server -m models/llama-3.2-3b.gguf --port 8080

# 带 GPU 加速
./llama-server -m models/llama-3.2-3b.gguf --port 8080 --n-gpu-layers 35

# 带上下文扩展
./llama-server -m models/llama-3.2-3b.gguf --port 8080 -c 8192

# OpenAI 兼容 API
./llama-server -m models/llama-3.2-3b.gguf --port 8080 --api-type openai
```

---

## 🛠️ 故障排除

### 无法连接到 llama-server
```batch
:: 检查服务是否运行
curl http://localhost:8080/models

:: 查看端口占用
netstat -ano | findstr :8080
```

### Bun 未找到
```batch
powershell -c "irm bun.sh/install.ps1 | iex"
```

### 配置未保存
检查配置文件路径：
```batch
echo %USERPROFILE%\.doge\.claude.json
```

---

## 📞 快捷命令

```batch
:: 快速启动（默认配置）
start-llama.bat

:: 指定模型
start-llama-direct.bat qwen2.5-7b

:: 指定模型和端口
start-llama-direct.bat glm-4-9b 8081

:: 查看配置
doge /config

:: 切换模型
doge /model
```

---

**最后更新：** 2026 年 4 月 2 日
