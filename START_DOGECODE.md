# 🚀 启动 Doge Code - 快速指南

## ✅ 前提条件

1. **llama-server 已启动**（你已通过命令启动）
2. **Bun 已安装**

---

## 🎯 最简单的方式

### 方式 1：双击运行
```batch
start-llama.bat
```
**默认配置：**
- 模型：`llama-3.2-3b`
- 端口：`8080`
- 地址：`http://localhost:8080/v1`

---

### 方式 2：指定模型
```batch
start-llama-direct.bat qwen3.5:9b
start-llama-direct.bat qwen2.5-coder:7b 8080
```

---

## ⚙️ 工作原理

脚本会：
1. **设置环境变量**（Doge Code 启动时自动读取）
   - `ANTHROPIC_BASE_URL`
   - `DOGE_API_KEY`
   - `ANTHROPIC_MODEL`

2. **保存配置到文件**（持久化）
   - `~/.doge/.claude.json`

3. **启动 Doge Code**
   - `bun run dev`

---

## 📋 配置说明

### 环境变量（自动设置）
```batch
ANTHROPIC_BASE_URL=http://localhost:8080/v1
DOGE_API_KEY=llama
ANTHROPIC_MODEL=llama-3.2-3b
```

### 配置文件（自动保存）
位置：`C:\Users\<你的用户名>\.doge\.claude.json`

内容：
```json
{
  "customApiEndpoint": {
    "provider": "openai",
    "baseURL": "http://localhost:8080/v1",
    "apiKey": "llama",
    "model": "llama-3.2-3b"
  }
}
```

---

## 🛠️ 如果你想修改默认模型

编辑 `start-llama.bat`，找到这一行：
```batch
set "MODEL=llama-3.2-3b"
```

改成你想要的模型，例如：
```batch
set "MODEL=qwen3.5:9b"
```

---

## 📞 常用命令

```batch
:: 使用默认配置
start-llama.bat

:: 指定模型
start-llama-direct.bat qwen3.5:9b

:: 指定模型和端口
start-llama-direct.bat glm-4-9b 8081

:: 在 Doge Code 内部切换模型
/model
/add-model qwen2.5-coder:7b
```

---

## ⚠️ 注意事项

1. **llama-server 必须先启动**
   - 脚本会检查连接，但不会自动启动 llama-server

2. **端口要匹配**
   - 如果 llama-server 运行在 8081，修改脚本中的端口

3. **配置持久化**
   - 第一次运行后，配置会保存到 `~/.doge/.claude.json`
   - 下次启动会自动使用上次的配置

---

## 🛠️ 故障排除

### 连接失败
```batch
:: 检查 llama-server 是否运行
curl http://localhost:8080/models

:: 查看端口占用
netstat -ano | findstr :8080
```

### Bun 未找到
```batch
powershell -c "irm bun.sh/install.ps1 | iex"
```

---

**最后更新：** 2026 年 4 月 2 日
