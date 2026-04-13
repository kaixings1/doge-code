# Doge Code - LMStudio 快速启动指南

## 📁 模型目录
```
D:\LLM\    ← 所有 GGUF 模型文件（与 LMStudio 共享）
```

---

## 🚀 三种启动方式

### 方式 1️⃣：LMStudio 直连（最快）

**前提：** LMStudio 已运行并加载了模型

```batch
start-doge-lmstudio-direct.bat
```

**步骤：**
1. 打开 LMStudio
2. 选择一个模型并加载
3. 点击右侧"启动服务器"（→→→）
4. 运行上面的批处理

---

### 方式 2️⃣：LMStudio 独立启动（推荐）

**前提：** 只需要模型文件，LMStudio 可以关闭

```batch
start-doge-lmstudio.bat
```

**特点：**
- ✅ 自动扫描 `D:\LLM` 目录
- ✅ 显示模型列表供选择
- ✅ 自动启动 llama-server
- ✅ 不影响 LMStudio（可同时使用）

---

### 方式 3️⃣：指定模型启动

```batch
:: 直接指定模型文件名
start-doge-lmstudio.bat llama-3.2-3b.gguf

:: 指定端口（避免冲突）
start-doge-lmstudio.bat qwen2.5-7b.gguf 8081
```

---

## 📋 常用模型文件命名

```
llama-3.2-1b-instruct-q4_k_m.gguf
llama-3.2-3b-instruct-q4_k_m.gguf
qwen2.5-7b-instruct-q4_k_m.gguf
qwen2.5-14b-instruct-q4_k_m.gguf
deepseek-r1-distill-qwen-7b-q4_k_m.gguf
mistral-7b-instruct-v0.3-q4_k_m.gguf
```

---

## ⚙️ 配置保存

配置自动保存到：
```
C:\Users\<你的用户名>\.doge\.claude.json
```

示例配置：
```json
{
  "customApiEndpoint": {
    "provider": "openai",
    "baseURL": "http://localhost:1234/v1",
    "apiKey": "lmstudio",
    "model": "llama-3.2-3b-instruct-q4_k_m",
    "savedModels": ["llama-3.2-3b-instruct-q4_k_m"]
  }
}
```

---

## 🔧 故障排除

### 问题 1：端口被占用
**错误：** 端口 1234 已被占用（LMStudio 正在使用）

**解决：**
```batch
:: 使用其他端口
start-doge-lmstudio.bat 模型名.gguf 8081
```

### 问题 2：找不到模型
**解决：** 确认模型在 `D:\LLM` 目录

### 问题 3：找不到 llama-server.exe
**解决：**
1. 下载：https://github.com/ggerganov/llama.cpp/releases
2. 放在 `D:\doge-code\llama-server.exe`

### 问题 4：LMStudio 直连失败
**解决：**
1. 确保 LMStudio 已加载模型
2. 点击"启动服务器"按钮
3. 确认端口是 1234

---

## 💡 技巧

### 同时使用 LMStudio 和 Doge Code
- LMStudio 使用端口 1234
- llama-server 使用端口 8080（或其他）
- 两者互不干扰，共享模型文件

### 快速切换模型
```batch
:: 方式 1：重新运行脚本选择
start-doge-lmstudio.bat

:: 方式 2：在 Doge Code 内部
/model
/add-model 新模型名
```

### 查看当前配置
```batch
doge /config
doge /model
```

---

## 📞 快捷命令

| 命令 | 说明 |
|------|------|
| `start-doge-lmstudio.bat` | 选择模型启动 |
| `start-doge-lmstudio-direct.bat` | 直连 LMStudio |
| `doge /model` | 查看/切换模型 |
| `doge /add-model 模型名` | 添加新模型 |
| `doge /config` | 查看配置 |

---

**最后更新：** 2026 年 4 月 2 日
