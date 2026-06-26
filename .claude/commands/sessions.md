# 会话（Sessions）命令

管理 Claude Code 会话历史 - 列出、加载、设置别名（Alias）以及编辑存储在 `~/.claude/sessions/` 中的会话。

## 用法

`/sessions [list|load|alias|info|help] [options]`

## 操作

### 列出会话（List Sessions）

显示所有会话及其元数据、过滤和分页。

```bash
/sessions                              # 列出所有会话（默认）
/sessions list                         # 同上
/sessions list --limit 10              # 显示 10 条会话
/sessions list --date 2026-02-01       # 按日期过滤
/sessions list --search abc            # 按会话 ID 搜索
```

**脚本：**
```bash
node -e "
const sm = require((process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude'))+'/scripts/lib/session-manager');
const aa = require((process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude'))+'/scripts/lib/session-aliases');

const result = sm.getAllSessions({ limit: 20 });
const aliases = aa.listAliases();
const aliasMap = {};
for (const a of aliases) aliasMap[a.sessionPath] = a.name;

console.log('会话 (正在显示 ' + result.sessions.length + ' / ' + result.total + '):');
console.log('');
console.log('ID        日期        时间     大小     行数   别名');
console.log('────────────────────────────────────────────────────');

for (const s of result.sessions) {
  const alias = aliasMap[s.filename] || '';
  const size = sm.getSessionSize(s.sessionPath);
  const stats = sm.getSessionStats(s.sessionPath);
  const id = s.shortId === 'no-id' ? '(none)' : s.shortId.slice(0, 8);
  const time = s.modifiedTime.toTimeString().slice(0, 5);

  console.log(id.padEnd(8) + ' ' + s.date + '  ' + time + '   ' + size.padEnd(7) + '  ' + String(stats.lineCount).padEnd(5) + '  ' + alias);
}
"
```

### 加载会话（Load Session）

加载并显示会话内容（通过 ID 或别名）。

```bash
/sessions load <id|alias>             # 加载会话
/sessions load 2026-02-01             # 按日期（针对无 ID 会话）
/sessions load a1b2c3d4               # 按短 ID
/sessions load my-alias               # 按别名
```

**脚本：**
```bash
node -e "
const sm = require((process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude'))+'/scripts/lib/session-manager');
const aa = require((process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude'))+'/scripts/lib/session-aliases');
const id = process.argv[1];

// 首先尝试解析为别名
const resolved = aa.resolveAlias(id);
const sessionId = resolved ? resolved.sessionPath : id;

const session = sm.getSessionById(sessionId, true);
if (!session) {
  console.log('未找到会话: ' + id);
  process.exit(1);
}

const stats = sm.getSessionStats(session.sessionPath);
const size = sm.getSessionSize(session.sessionPath);
const aliases = aa.getAliasesForSession(session.filename);

console.log('会话: ' + session.filename);
console.log('路径: ~/.claude/sessions/' + session.filename);
console.log('');
console.log('统计信息:');
console.log('  行数: ' + stats.lineCount);
console.log('  总项数: ' + stats.totalItems);
console.log('  已完成: ' + stats.completedItems);
console.log('  进行中: ' + stats.inProgressItems);
console.log('  大小: ' + size);
console.log('');

if (aliases.length > 0) {
  console.log('别名: ' + aliases.map(a => a.name).join(', '));
  console.log('');
}

if (session.metadata.title) {
  console.log('标题: ' + session.metadata.title);
  console.log('');
}

if (session.metadata.started) {
  console.log('开始时间: ' + session.metadata.started);
}

if (session.metadata.lastUpdated) {
  console.log('最后更新: ' + session.metadata.lastUpdated);
}
" "$ARGUMENTS"
```

### 创建别名（Create Alias）

为会话创建一个易记的别名。

```bash
/sessions alias <id> <name>           # 创建别名
/sessions alias 2026-02-01 today-work # 创建名为 "today-work" 的别名
```

**脚本：**
```bash
node -e "
const sm = require((process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude'))+'/scripts/lib/session-manager');
const aa = require((process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude'))+'/scripts/lib/session-aliases');

const sessionId = process.argv[1];
const aliasName = process.argv[2];

if (!sessionId || !aliasName) {
  console.log('用法: /sessions alias <id> <name>');
  process.exit(1);
}

// 获取会话文件名
const session = sm.getSessionById(sessionId);
if (!session) {
  console.log('未找到会话: ' + sessionId);
  process.exit(1);
}

const result = aa.setAlias(aliasName, session.filename);
if (result.success) {
  console.log('✓ 别名已创建: ' + aliasName + ' → ' + session.filename);
} else {
  console.log('✗ 错误: ' + result.error);
  process.exit(1);
}
" "$ARGUMENTS"
```

### 移除别名（Remove Alias）

删除现有的别名。

```bash
/sessions alias --remove <name>        # 移除别名
/sessions unalias <name>               # 同上
```

**脚本：**
```bash
node -e "
const aa = require((process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude'))+'/scripts/lib/session-aliases');

const aliasName = process.argv[1];
if (!aliasName) {
  console.log('用法: /sessions alias --remove <name>');
  process.exit(1);
}

const result = aa.deleteAlias(aliasName);
if (result.success) {
  console.log('✓ 别名已移除: ' + aliasName);
} else {
  console.log('✗ 错误: ' + result.error);
  process.exit(1);
}
" "$ARGUMENTS"
```

### 会话详情（Session Info）

显示会话的详细信息。

```bash
/sessions info <id|alias>              # 显示会话详情
```

**脚本：**
```bash
node -e "
const sm = require((process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude'))+'/scripts/lib/session-manager');
const aa = require((process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude'))+'/scripts/lib/session-aliases');

const id = process.argv[1];
const resolved = aa.resolveAlias(id);
const sessionId = resolved ? resolved.sessionPath : id;

const session = sm.getSessionById(sessionId, true);
if (!session) {
  console.log('未找到会话: ' + id);
  process.exit(1);
}

const stats = sm.getSessionStats(session.sessionPath);
const size = sm.getSessionSize(session.sessionPath);
const aliases = aa.getAliasesForSession(session.filename);

console.log('会话信息');
console.log('════════════════════');
console.log('ID:          ' + (session.shortId === 'no-id' ? '(none)' : session.shortId));
console.log('文件名:      ' + session.filename);
console.log('日期:        ' + session.date);
console.log('修改时间:    ' + session.modifiedTime.toISOString().slice(0, 19).replace('T', ' '));
console.log('');
console.log('内容:');
console.log('  行数:          ' + stats.lineCount);
console.log('  总项数:        ' + stats.totalItems);
console.log('  已完成:        ' + stats.completedItems);
console.log('  进行中:        ' + stats.inProgressItems);
console.log('  大小:          ' + size);
if (aliases.length > 0) {
  console.log('别名:        ' + aliases.map(a => a.name).join(', '));
}
" "$ARGUMENTS"
```

### 列出别名（List Aliases）

显示所有会话别名。

```bash
/sessions aliases                      # 列出所有别名
```

**脚本：**
```bash
node -e "
const aa = require((process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude'))+'/scripts/lib/session-aliases');

const aliases = aa.listAliases();
console.log('会话别名 (' + aliases.length + '):');
console.log('');

if (aliases.length === 0) {
  console.log('未找到别名。');
} else {
  console.log('别名          会话文件                        标题');
  console.log('─────────────────────────────────────────────────────────────');
  for (const a of aliases) {
    const name = a.name.padEnd(12);
    const file = (a.sessionPath.length > 30 ? a.sessionPath.slice(0, 27) + '...' : a.sessionPath).padEnd(30);
    const title = a.title || '';
    console.log(name + ' ' + file + ' ' + title);
  }
}
"
```

## 参数（Arguments）

$ARGUMENTS:
- `list [options]` - 列出会话
  - `--limit <n>` - 显示会话的最大数量（默认值：50）
  - `--date <YYYY-MM-DD>` - 按日期过滤
  - `--search <pattern>` - 在会话 ID 中搜索
- `load <id|alias>` - 加载会话内容
- `alias <id> <name>` - 为会话创建别名
- `alias --remove <name>` - 移除别名
- `unalias <name>` - 同 `--remove`
- `info <id|alias>` - 显示会话统计信息
- `aliases` - 列出所有别名
- `help` - 显示此帮助信息

## 示例

```bash
# 列出所有会话
/sessions list

# 为今天的会话创建别名
/sessions alias 2026-02-01 today

# 通过别名加载会话
/sessions load today

# 显示会话信息
/sessions info today

# 移除别名
/sessions alias --remove today

# 列出所有别名
/sessions aliases
```

## 注意事项

- 会话以 Markdown 文件形式存储在 `~/.claude/sessions/` 中
- 别名存储在 `~/.claude/session-aliases.json` 中
- 会话 ID 可以简写（前 4-8 个字符通常足以保证唯一性）
- 为经常引用的会话使用别名
