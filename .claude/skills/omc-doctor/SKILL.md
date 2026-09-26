---
name: omc-doctor
description: 诊断并修复 oh-my-claudecode 的安装问题
level: 3
---

# Doctor 技能

注意：当设置了 `CLAUDE_CONFIG_DIR` 环境变量时，本指南中所有 `~/.claude/...` 路径都遵循该变量。

## 任务：运行安装诊断

你是 OMC Doctor —— 负责诊断并修复安装问题。

### 步骤 1：检查插件版本

```bash
# 获取已安装版本和最新版本（跨平台）
node -e "const p=require('path'),f=require('fs'),h=require('os').homedir(),d=process.env.CLAUDE_CONFIG_DIR||p.join(h,'.claude'),b=p.join(d,'plugins','cache','omc','oh-my-claudecode');try{const v=f.readdirSync(b).filter(x=>/^\d/.test(x)).sort((a,c)=>a.localeCompare(c,void 0,{numeric:true}));console.log('Installed:',v.length?v[v.length-1]:'(none)')}catch{console.log('Installed: (none)')}"
npm view oh-my-claude-sisyphus version 2>/dev/null || echo "Latest: (unavailable)"
```

**诊断结论**：
- 如果没有安装任何版本：CRITICAL —— 插件未安装
- 如果已安装版本 != 最新版本：WARN —— 插件过期
- 如果存在多个版本：WARN —— 缓存陈旧

### 步骤 2：检查 settings.json 中的遗留 hooks

同时读取 `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json`（用户级）和 `./.claude/settings.json`（项目级），检查是否存在 `"hooks"` 键且包含如下条目：
- `bash ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/keyword-detector.sh`
- `bash ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/persistent-mode.sh`
- `bash ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/session-start.sh`

**诊断结论**：
- 如果找到：CRITICAL —— 遗留 hooks 导致重复

### 步骤 3：检查遗留的 bash hook 脚本

```bash
ls -la "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/hooks/*.sh 2>/dev/null
```

**诊断结论**：
- 如果存在 `keyword-detector.sh`、`persistent-mode.sh`、`session-start.sh` 或 `stop-continuation.sh`：WARN —— 遗留脚本（可能造成混淆）

### 步骤 4：检查 CLAUDE.md

```bash
# 检查 CLAUDE.md 是否存在
ls -la "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/CLAUDE.md 2>/dev/null

# 检查 OMC 标记（<!-- OMC:START --> 是规范标记）
grep -q "<!-- OMC:START -->" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/CLAUDE.md" 2>/dev/null && echo "Has OMC config" || echo "Missing OMC config in CLAUDE.md"

# 检查 CLAUDE.md（或确定性的伴随文件）的版本标记，并与最新已安装的插件缓存版本比较
node -e "const p=require('path'),f=require('fs'),h=require('os').homedir(),d=process.env.CLAUDE_CONFIG_DIR||p.join(h,'.claude');const base=p.join(d,'CLAUDE.md');let baseContent='';try{baseContent=f.readFileSync(base,'utf8')}catch{};let candidates=[base];let referenced='';const importMatch=baseContent.match(/CLAUDE-[^ )]*\\.md/);if(importMatch){referenced=p.join(d,importMatch[0]);candidates.push(referenced)}else{const defaultCompanion=p.join(d,'CLAUDE-omc.md');if(f.existsSync(defaultCompanion))candidates.push(defaultCompanion);try{const others=f.readdirSync(d).filter(n=>/^CLAUDE-.*\\.md$/i.test(n)).sort().map(n=>p.join(d,n));for(const o of others){if(candidates.includes(o)===false)candidates.push(o)}}catch{}};let claudeV='(missing)';let claudeSource='(none)';for(const file of candidates){try{const c=f.readFileSync(file,'utf8');const m=c.match(/<!--\\s*OMC:VERSION:([^\\s]+)\\s*-->/i);if(m){claudeV=m[1];claudeSource=file;break}}catch{}};if(claudeV==='(missing)'&&candidates.length>0){claudeV='(missing marker)';claudeSource='scanned deterministic CLAUDE sources';};let pluginV='(none)';try{const b=p.join(d,'plugins','cache','omc','oh-my-claudecode');const v=f.readdirSync(b).filter(x=>/^\\d/.test(x)).sort((a,c)=>a.localeCompare(c,void 0,{numeric:true}));pluginV=v.length?v[v.length-1]:'(none)';}catch{};console.log('CLAUDE.md OMC version:',claudeV);console.log('OMC version source:',claudeSource);console.log('Latest cached plugin version:',pluginV);if(claudeV==='(missing)'||claudeV==='(missing marker)'||pluginV==='(none)'){console.log('VERSION CHECK SKIPPED: missing CLAUDE marker or plugin cache')}else if(claudeV===pluginV){console.log('VERSION MATCH: CLAUDE and plugin cache are aligned')}else{console.log('VERSION DRIFT: CLAUDE.md and plugin versions differ')}"

# 检查伴随文件是否为文件拆分模式（例如 CLAUDE-omc.md）
find "${CLAUDE_CONFIG_DIR:-$HOME/.claude}" -maxdepth 1 -type f -name 'CLAUDE-*.md' -print 2>/dev/null
while IFS= read -r f; do
  grep -q "<!-- OMC:START -->" "$f" 2>/dev/null && echo "Has OMC config in companion: $f"
done < <(find "${CLAUDE_CONFIG_DIR:-$HOME/.claude}" -maxdepth 1 -type f -name 'CLAUDE-*.md' -print 2>/dev/null)

# 检查 CLAUDE.md 是否引用了伴随文件
grep -o "CLAUDE-[^ )]*\.md" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/CLAUDE.md" 2>/dev/null
```

**诊断结论**：
- 如果 CLAUDE.md 缺失：CRITICAL —— CLAUDE.md 未配置
- 如果在 CLAUDE.md 中找到 `<!-- OMC:START -->`：OK
- 如果在伴随文件（例如 `CLAUDE-omc.md`）中找到 `<!-- OMC:START -->`：OK —— 检测到文件拆分模式
- 如果 CLAUDE.md 或任何伴随文件中都没有 OMC 标记：WARN —— CLAUDE.md 过期
- 如果在确定性的 CLAUDE 源扫描（基础文件 + 被引用的伴随文件）中缺少 `OMC:VERSION` 标记：WARN —— 无法验证 CLAUDE.md 的新鲜度
- 如果 `CLAUDE.md OMC version` != `Latest cached plugin version`：WARN —— 检测到版本漂移（运行 `omc update` 或 `omc setup`）

### 步骤 5：检查 Ralph 的 Ruby 依赖

Ralph 工作流需要 Ruby。显式检查 Ruby，让全新安装获得可操作的指引，而不是之后才遇到不透明的 Ralph 失败。

```bash
if command -v ruby >/dev/null 2>&1; then
  echo "Ruby for Ralph: $(ruby --version 2>/dev/null | head -1)"
else
  echo "Ruby for Ralph: MISSING"
  echo "Install Ruby before using Ralph. Ubuntu/Debian: sudo apt update && sudo apt install ruby-full"
  echo "macOS: brew install ruby"
fi
```

**诊断结论**：
- 如果找到 Ruby：OK —— Ralph 依赖已具备
- 如果缺少 Ruby：WARN —— 在安装 Ruby 之前，Ralph 工作流可能失败

### 步骤 6：检查过期的插件缓存

```bash
# 统计缓存中的版本数量（跨平台）
node -e "const p=require('path'),f=require('fs'),h=require('os').homedir(),d=process.env.CLAUDE_CONFIG_DIR||p.join(h,'.claude'),b=p.join(d,'plugins','cache','omc','oh-my-claudecode');try{const v=f.readdirSync(b).filter(x=>/^\d/.test(x));console.log(v.length+' version(s):',v.join(', '))}catch{console.log('0 versions')}"
```

**诊断结论**：
- 如果版本数 > 1：WARN —— 存在多个缓存版本（建议清理）

### 步骤 7：检查通过 curl 安装的遗留内容

检查在插件系统之前通过 curl 安装的遗留 agent、command 和 skill。
**重要**：**只**标记名称与插件实际提供的名称相匹配的文件。**不要**标记与 OMC 无关的用户自定义 agent/command/skill。

```bash
# 检查遗留的 agents 目录
ls -la "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/agents/ 2>/dev/null

# 检查遗留的 commands 目录
ls -la "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/commands/ 2>/dev/null

# 检查遗留的 skills 目录
ls -la "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/skills/ 2>/dev/null
```

**诊断结论**：
- 如果 `~/.claude/agents/` 中存在与插件 agent 名匹配的文件：WARN —— 遗留 agent（现由插件提供）
- 如果 `~/.claude/commands/` 中存在与插件 command 名匹配的文件：WARN —— 遗留 command（现由插件提供）
- 如果 `~/.claude/skills/` 中存在与插件 skill 名匹配的文件：WARN —— 遗留 skill（现由插件提供）
- 如果存在与插件名**不**匹配的自定义文件：OK —— 这些是用户自定义内容，不要标记它们

**已知插件 agent 名**（在 agents/ 中检查这些）：
`architect.md`, `document-specialist.md`, `explore.md`, `executor.md`, `debugger.md`, `planner.md`, `analyst.md`, `critic.md`, `verifier.md`, `test-engineer.md`, `designer.md`, `writer.md`, `qa-tester.md`, `scientist.md`, `security-reviewer.md`, `code-reviewer.md`, `git-master.md`, `code-simplifier.md`

**已知插件 skill 名**（在 skills/ 中检查这些）：
`ai-slop-cleaner`, `ask`, `autopilot`, `cancel`, `ccg`, `configure-notifications`, `deep-interview`, `deepinit`, `external-context`, `hud`, `skillify`, `learner`, `mcp-setup`, `omc-doctor`, `omc-setup`, `omc-teams`, `plan`, `project-session-manager`, `ralph`, `ralplan`, `release`, `sciomc`, `setup`, `skill`, `team`, `ultraqa`, `ultrawork`, `visual-verdict`, `writer-memory`

**已知插件 command 名**（在 commands/ 中检查这些）：
`ultrawork.md`, `deepsearch.md`

---

## 报告格式

运行完所有检查后，输出一份报告：

```
## OMC Doctor 报告

### 摘要
[HEALTHY / ISSUES FOUND]

### 检查项

| 检查项 | 状态 | 详情 |
|-------|--------|---------|
| 插件版本 | OK/WARN/CRITICAL | ... |
| 遗留 hooks (settings.json) | OK/CRITICAL | ... |
| 遗留脚本 (~/.claude/hooks/) | OK/WARN | ... |
| CLAUDE.md | OK/WARN/CRITICAL | ... |
| Ralph 的 Ruby 依赖 | OK/WARN | ... |
| 插件缓存 | OK/WARN | ... |
| 遗留 agent (~/.claude/agents/) | OK/WARN | ... |
| 遗留 command (~/.claude/commands/) | OK/WARN | ... |
| 遗留 skill (~/.claude/skills/) | OK/WARN | ... |

### 发现的问题
1. [Issue description]
2. [Issue description]

### 建议的修复
[List fixes based on issues]
```

---

## 自动修复（如果用户确认）

如果发现问题，询问用户："需要我自动修复这些问题吗？"

如果是，应用修复：

### 修复：settings.json 中的遗留 hooks
从 `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json` 中移除 `"hooks"` 章节（保留其他设置不变）

### 修复：遗留 bash 脚本
```bash
rm -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/hooks/keyword-detector.sh
rm -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/hooks/persistent-mode.sh
rm -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/hooks/session-start.sh
rm -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/hooks/stop-continuation.sh
```

### 修复：插件过期
```bash
# 清除插件缓存（跨平台）
node -e "const p=require('path'),f=require('fs'),d=process.env.CLAUDE_CONFIG_DIR||p.join(require('os').homedir(),'.claude'),b=p.join(d,'plugins','cache','omc','oh-my-claudecode');try{f.rmSync(b,{recursive:true,force:true});console.log('Plugin cache cleared. Restart Claude Code to fetch latest version.')}catch{console.log('No plugin cache found')}"
```

### 修复：陈旧缓存（多版本）
```bash
# 只保留最新版本（跨平台）
node -e "const p=require('path'),f=require('fs'),h=require('os').homedir(),d=process.env.CLAUDE_CONFIG_DIR||p.join(h,'.claude'),b=p.join(d,'plugins','cache','omc','oh-my-claudecode');try{const v=f.readdirSync(b).filter(x=>/^\d/.test(x)).sort((a,c)=>a.localeCompare(c,void 0,{numeric:true}));v.slice(0,-1).forEach(x=>f.rmSync(p.join(b,x),{recursive:true,force:true}));console.log('Removed',v.length-1,'old version(s)')}catch(e){console.log('No cache to clean')}"
```

### 修复：CLAUDE.md 缺失/过期
从 GitHub 获取最新版本并写入 `${CLAUDE_CONFIG_DIR:-~/.claude}/CLAUDE.md`：
```
WebFetch(url: "https://raw.githubusercontent.com/Yeachan-Heo/oh-my-claudecode/main/docs/CLAUDE.md", prompt: "请原样返回完整的原始 markdown 内容")
```

### 修复：通过 curl 安装的遗留内容

移除遗留的 agent、command 和 skill 目录（现由插件提供）：

```bash
# 先备份（可选 - 询问用户）
# mv "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/agents "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/agents.bak
# mv "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/commands "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/commands.bak
# mv "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/skills "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/skills.bak

# 或直接删除
rm -rf "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/agents
rm -rf "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/commands
rm -rf "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/skills
```

**注意**：仅当这些目录包含与 oh-my-claudecode 相关的文件时才移除。如果用户有自定义的 agent/command/skill，先警告他们并在移除前征询意见。

---

## 修复后

应用修复之后，告知用户：
> 修复已应用。**重启 Claude Code** 以使更改生效。
