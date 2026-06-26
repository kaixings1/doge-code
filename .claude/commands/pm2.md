# PM2 初始化 (Init)

自动分析项目并生成 PM2 服务命令。

**命令 (Command)**: `$ARGUMENTS`

---

## 工作流 (Workflow)

1. 检查 PM2（如果缺失，通过 `npm install -g pm2` 安装）
2. 扫描项目以识别服务（前端/后端/数据库）
3. 生成配置文件和单个命令文件

---

## 服务检测 (Service Detection)

| 类型 (Type) | 检测方式 (Detection) | 默认端口 (Default Port) |
|------|-----------|--------------|
| Vite | vite.config.* | 5173 |
| Next.js | next.config.* | 3000 |
| Nuxt | nuxt.config.* | 3000 |
| CRA | package.json 中的 react-scripts | 3000 |
| Express/Node | server/backend/api 目录 + package.json | 3000 |
| FastAPI/Flask | requirements.txt / pyproject.toml | 8000 |
| Go | go.mod / main.go | 8080 |

**端口检测优先级 (Port Detection Priority)**: 用户指定 > .env > 配置文件 > 脚本参数 > 默认端口

---

## 生成的文件 (Generated Files)

```
project/
├── ecosystem.config.cjs              # PM2 配置
├── {backend}/start.cjs               # Python 包装器 (如果适用)
└── .claude/
    ├── commands/
    │   ├── pm2-all.md                # 启动全部 + 监控 (monit)
    │   ├── pm2-all-stop.md           # 停止全部
    │   ├── pm2-all-restart.md        # 重启全部
    │   ├── pm2-{port}.md             # 启动单个 + 日志 (logs)
    │   ├── pm2-{port}-stop.md        # 停止单个
    │   ├── pm2-{port}-restart.md     # 重启单个
    │   ├── pm2-logs.md               # 查看所有日志
    │   └── pm2-status.md             # 查看状态
    └── scripts/
        ├── pm2-logs-{port}.ps1       # 单个服务日志
        └── pm2-monit.ps1             # PM2 监控器 (monitor)
```

---

## Windows 配置 (Windows Configuration) (重要)

### ecosystem.config.cjs

**必须使用 `.cjs` 扩展名**

```javascript
module.exports = {
  apps: [
    // Node.js (Vite/Next/Nuxt)
    {
      name: 'project-3000',
      cwd: './packages/web',
      script: 'node_modules/vite/bin/vite.js',
      args: '--port 3000',
      interpreter: 'C:/Program Files/nodejs/node.exe',
      env: { NODE_ENV: 'development' }
    },
    // Python
    {
      name: 'project-8000',
      cwd: './backend',
      script: 'start.cjs',
      interpreter: 'C:/Program Files/nodejs/node.exe',
      env: { PYTHONUNBUFFERED: '1' }
    }
  ]
}
```

**框架脚本路径 (Framework script paths):**

| 框架 (Framework) | 脚本 (script) | 参数 (args) |
|-----------|--------|------|
| Vite | `node_modules/vite/bin/vite.js` | `--port {port}` |
| Next.js | `node_modules/next/dist/bin/next` | `dev -p {port}` |
| Nuxt | `node_modules/nuxt/bin/nuxt.mjs` | `dev --port {port}` |
| Express | `src/index.js` 或 `server.js` | - |

### Python 包装器脚本 (Python Wrapper Script) (start.cjs)

```javascript
const { spawn } = require('child_process');
const proc = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000', '--reload'], {
  cwd: __dirname, stdio: 'inherit', windowsHide: true
});
proc.on('close', (code) => process.exit(code));
```

---

## 命令文件模板 (Command File Templates) (最小化内容)

### pm2-all.md (启动全部 + 监控)
````markdown
启动所有服务并打开 PM2 监控面板。
```bash
cd "{PROJECT_ROOT}" && pm2 start ecosystem.config.cjs && start wt.exe -d "{PROJECT_ROOT}" pwsh -NoExit -c "pm2 monit"
```
````

### pm2-all-stop.md
````markdown
停止所有服务。
```bash
cd "{PROJECT_ROOT}" && pm2 stop all
```
````

### pm2-all-restart.md
````markdown
重启所有服务。
```bash
cd "{PROJECT_ROOT}" && pm2 restart all
```
````

### pm2-{port}.md (启动单个 + 日志)
````markdown
启动 {name} ({port}) 并打开日志。
```bash
cd "{PROJECT_ROOT}" && pm2 start ecosystem.config.cjs --only {name} && start wt.exe -d "{PROJECT_ROOT}" pwsh -NoExit -c "pm2 logs {name}"
```
````

### pm2-{port}-stop.md
````markdown
停止 {name} ({port})。
```bash
cd "{PROJECT_ROOT}" && pm2 stop {name}
```
````

### pm2-{port}-restart.md
````markdown
重启 {name} ({port})。
```bash
cd "{PROJECT_ROOT}" && pm2 restart {name}
```
````

### pm2-logs.md
````markdown
查看所有 PM2 日志。
```bash
cd "{PROJECT_ROOT}" && pm2 logs
```
````

### pm2-status.md
````markdown
查看 PM2 状态。
```bash
cd "{PROJECT_ROOT}" && pm2 status
```
````

### PowerShell 脚本 (Scripts) (pm2-logs-{port}.ps1)
```powershell
Set-Location "{PROJECT_ROOT}"
pm2 logs {name}
```

### PowerShell 脚本 (Scripts) (pm2-monit.ps1)
```powershell
Set-Location "{PROJECT_ROOT}"
pm2 monit
```

---

## 核心规则 (Key Rules)

1. **配置文件 (Config file)**: `ecosystem.config.cjs` (而非 .js)
2. **Node.js**: 直接指定 bin 路径 + 解释器 (interpreter)
3. **Python**: Node.js 包装器脚本 + `windowsHide: true`
4. **打开新窗口 (Open new window)**: `start wt.exe -d "{path}" pwsh -NoExit -c "command"`
5. **最小化内容 (Minimal content)**: 每个命令文件仅包含 1-2 行描述 + bash 代码块
6. **直接执行 (Direct execution)**: 无需 AI 解析，直接运行 bash 命令即可

---

## 执行 (Execute)

基于 `$ARGUMENTS` 执行初始化：

1. 扫描项目中的服务
2. 生成 `ecosystem.config.cjs`
3. 为 Python 服务生成 `{backend}/start.cjs` (如果适用)
4. 在 `.claude/commands/` 中生成命令文件
5. 在 `.claude/scripts/` 中生成脚本文件
6. **更新项目的 CLAUDE.md**，添加 PM2 信息（见下文）
7. **显示完成摘要 (Summary)** 以及终端命令

---

## 初始化后：更新 CLAUDE.md (Post-Init: Update CLAUDE.md)

生成文件后，将 PM2 章节追加到项目的 `CLAUDE.md`（如果不存在则创建）：

````markdown
## PM2 服务 (Services)

| 端口 (Port) | 名称 (Name) | 类型 (Type) |
|------|------|------|
| {port} | {name} | {type} |

**终端命令 (Terminal Commands):**
```bash
pm2 start ecosystem.config.cjs   # 首次启动
pm2 start all                    # 首次之后
pm2 stop all / pm2 restart all
pm2 start {name} / pm2 stop {name}
pm2 logs / pm2 status / pm2 monit
pm2 save                         # 保存进程列表
pm2 resurrect                    # 恢复保存的列表
```
````

**CLAUDE.md 更新规则:**
- 如果 PM2 章节已存在，则替换它
- 如果不存在，则追加到末尾
- 保持内容精简且关键

---

## 初始化后：显示摘要 (Post-Init: Display Summary)

所有文件生成后，输出：

```
## PM2 初始化完成 (Init Complete)

**服务 (Services):**

| 端口 (Port) | 名称 (Name) | 类型 (Type) |
|------|------|------|
| {port} | {name} | {type} |

**Claude 命令:** /pm2-all, /pm2-all-stop, /pm2-{port}, /pm2-{port}-stop, /pm2-logs, /pm2-status

**终端命令 (Terminal Commands):**
## 首次启动（带配置文件）
pm2 start ecosystem.config.cjs && pm2 save

## 首次之后（简化命令）
pm2 start all          # 启动全部
pm2 stop all           # 停止全部
pm2 restart all        # 重启全部
pm2 start {name}       # 启动单个
pm2 stop {name}        # 停止单个
pm2 logs               # 查看日志
pm2 monit              # 监控面板
pm2 resurrect          # 恢复保存的进程

**提示 (Tip):** 首次启动后运行 `pm2 save` 以启用简化命令。
```
