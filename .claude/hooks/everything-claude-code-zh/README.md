# 钩子（Hooks）

钩子（Hooks）是事件驱动的自动化工具，在 Claude Code 工具执行之前或之后触发。它们用于强制执行代码质量、及早发现错误并自动执行重复性检查。

## 钩子如何工作

```
用户请求 → Claude 选择工具 → PreToolUse 钩子运行 → 工具执行 → PostToolUse 钩子运行
```

- **PreToolUse** 钩子在工具执行前运行。它们可以**拦截**（退出码 2）或**警告**（输出到 stderr 但不拦截）。
- **PostToolUse** 钩子在工具完成后运行。它们可以分析输出，但无法拦截执行。
- **Stop** 钩子在每次 Claude 响应后运行。
- **SessionStart/SessionEnd** 钩子在会话（Session）生命周期边界运行。
- **PreCompact** 钩子在上下文压缩（Context Compaction）之前运行，对于保存状态非常有用。

## 此插件中的钩子

### PreToolUse 钩子

| 钩子 | 匹配器（Matcher） | 行为 | 退出码 |
|------|---------|----------|-----------|
| **开发服务器拦截器** | `Bash` | 在 tmux 之外拦截 `npm run dev` 等命令 — 确保日志访问 | 2 (拦截) |
| **Tmux 提醒** | `Bash` | 为长时间运行的命令（npm test, cargo build, docker）建议使用 tmux | 0 (警告) |
| **Git push 提醒** | `Bash` | 在 `git push` 前提醒审阅更改 | 0 (警告) |
| **文档文件警告** | `Write` | 针对非标准 `.md`/`.txt` 文件发出警告（允许 README, CLAUDE, CONTRIBUTING, CHANGELOG, LICENSE, SKILL, docs/, skills/）；支持跨平台路径处理 | 0 (警告) |
| **策略性压缩** | `Edit\|Write` | 在逻辑间隔（约每 50 次工具调用）建议手动执行 `/compact` | 0 (警告) |

### PostToolUse 钩子

| 钩子 | 匹配器（Matcher） | 功能说明 |
|------|---------|-------------|
| **PR 日志记录器** | `Bash` | 在 `gh pr create` 后记录 PR URL 和审阅命令 |
| **构建分析** | `Bash` | 构建命令后的后台分析（异步，非阻塞） |
| **Prettier 格式化** | `Edit` | 编辑后使用 Prettier 自动格式化 JS/TS 文件 |
| **TypeScript 检查** | `Edit` | 编辑 `.ts`/`.tsx` 文件后运行 `tsc --noEmit` |
| **console.log 警告** | `Edit` | 警告已编辑文件中的 `console.log` 语句 |

### 生命周期钩子（Lifecycle Hooks）

| 钩子 | 事件 | 功能说明 |
|------|-------|-------------|
| **会话开始** | `SessionStart` | 加载之前的上下文并检测包管理器 |
| **预压缩** | `PreCompact` | 在上下文压缩前保存状态 |
| **Console.log 审计** | `Stop` | 每次响应后检查所有修改过的文件是否存在 `console.log` |
| **会话结束** | `SessionEnd` | 为下次会话持久化会话状态 |
| **模式提取** | `SessionEnd` | 评估会话以提取可复用的模式（持续学习） |

## 自定义钩子

### 禁用钩子

删除或注释掉 `hooks.json` 中的钩子条目。如果作为插件安装，请在你的 `~/.claude/settings.json` 中进行覆盖：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [],
        "description": "Override: allow all .md file creation"
      }
    ]
  }
}
```

### 编写你自己的钩子

钩子是 Shell 命令，通过标准输入（stdin）接收 JSON 格式的工具输入，并且必须通过标准输出（stdout）输出 JSON。

**基本结构：**

```javascript
// my-hook.js
let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(data);

  // 访问工具信息
  const toolName = input.tool_name;        // "Edit", "Bash", "Write" 等
  const toolInput = input.tool_input;      // 工具特定的参数
  const toolOutput = input.tool_output;    // 仅在 PostToolUse 中可用

  // 警告（非阻塞）：写入 stderr
  console.error('[Hook] Warning message shown to Claude');

  // 拦截（仅限 PreToolUse）：以退出码 2 退出
  // process.exit(2);

  // 始终将原始数据输出到 stdout
  console.log(data);
});
```

**退出码：**
- `0` — 成功（继续执行）
- `2` — 拦截工具调用（仅限 PreToolUse）
- 其他非零值 — 错误（会记录日志但不会拦截）

### 钩子输入 Schema

```typescript
interface HookInput {
  tool_name: string;          // "Bash", "Edit", "Write", "Read" 等
  tool_input: {
    command?: string;         // Bash: 正在运行的命令
    file_path?: string;       // Edit/Write/Read: 目标文件
    old_string?: string;      // Edit: 被替换的文本
    new_string?: string;      // Edit: 替换后的文本
    content?: string;         // Write: 文件内容
  };
  tool_output?: {             // 仅限 PostToolUse
    output?: string;          // 命令/工具的输出
  };
}
```

### 异步钩子（Async Hooks）

对于不应阻塞主流程的钩子（例如：后台分析）：

```json
{
  "type": "command",
  "command": "node my-slow-hook.js",
  "async": true,
  "timeout": 30
}
```

异步钩子在后台运行。它们无法拦截工具执行。

## 常见钩子配方（Recipes）

### 警告 TODO 注释

```json
{
  "matcher": "Edit",
  "hooks": [{
    "type": "command",
    "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const ns=i.tool_input?.new_string||'';if(/TODO|FIXME|HACK/.test(ns)){console.error('[Hook] New TODO/FIXME added - consider creating an issue')}console.log(d)})\""
  }],
  "description": "Warn when adding TODO/FIXME comments"
}
```

### 拦截大文件创建

```json
{
  "matcher": "Write",
  "hooks": [{
    "type": "command",
    "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const c=i.tool_input?.content||'';const lines=c.split('\\n').length;if(lines>800){console.error('[Hook] BLOCKED: File exceeds 800 lines ('+lines+' lines)');console.error('[Hook] Split into smaller, focused modules');process.exit(2)}console.log(d)})\""
  }],
  "description": "Block creation of files larger than 800 lines"
}
```

### 使用 ruff 自动格式化 Python 文件

```json
{
  "matcher": "Edit",
  "hooks": [{
    "type": "command",
    "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const p=i.tool_input?.file_path||'';if(/\\.py$/.test(p)){const{execFileSync}=require('child_process');try{execFileSync('ruff',['format',p],{stdio:'pipe'})}catch(e){}}console.log(d)})\""
  }],
  "description": "Auto-format Python files with ruff after edits"
}
```

### 要求在新建源文件时同时提供测试文件

```json
{
  "matcher": "Write",
  "hooks": [{
    "type": "command",
    "command": "node -e \"const fs=require('fs');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const p=i.tool_input?.file_path||'';if(/src\\/.*\\.(ts|js)$/.test(p)&&!/\\.test\\.|\\.spec\\./.test(p)){const testPath=p.replace(/\\.(ts|js)$/,'.test.$1');if(!fs.existsSync(testPath)){console.error('[Hook] No test file found for: '+p);console.error('[Hook] Expected: '+testPath);console.error('[Hook] Consider writing tests first (/tdd)')}}console.log(d)})\""
  }],
  "description": "Remind to create tests when adding new source files"
}
```

## 跨平台注意事项

此插件中的所有钩子都使用 Node.js（`node -e` 或 `node script.js`）以实现在 Windows、macOS 和 Linux 上的最大兼容性。请避免在钩子中使用特定于 bash 的语法。

## 相关内容

- [rules/common/hooks.md](../rules/common/hooks.md) — 钩子架构指南
- [skills/strategic-compact/](../skills/strategic-compact/) — 策略性压缩技能
- [scripts/hooks/](../scripts/hooks/) — 钩子脚本实现
