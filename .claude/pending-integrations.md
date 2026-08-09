# 待集成仓库清单

## ✅ 已完成
- `sickn33/antigravity-awesome-skills` (41k★, 997 技能) ✅
- `wshobson/agents` (37k★, 804 代理) ✅  
- `VoltAgent/awesome-claude-code-subagents` (22k★) ✅
- `jnMetaCode/agency-agents-zh` (15k★, 266 中文代理) ✅
- `Anthropic-Cybersecurity-Skills` — 159 个安全技能（157 空目录无内容，忽略）✅ 2026-08-09
- `TrailOfBits/garak` plugins — 39 个插件整目录 → `.claude/plugins/` ✅ 2026-08-09
- `alirezarezvani/claude-skills` 部分 — .NET 35 技能 + 6 agents → `skills_backup/` + `agents/` ✅ 2026-08-09
- `Jeffallan/awesome-claude-skills` — 66 技能整目录（含 references）→ `skills_backup/` ✅ 2026-08-09
- `scientific-skill-library` — 139 技能整目录 → `skills_backup/` ✅ 2026-08-09

## 🔴 高优先级（待下载）
1. `VoltAgent/awesome-agent-skills` (26k★) — 1000+ 代理技能
2. `alirezarezvani/claude-skills` (19k★) — 337 技能 + 30 代理 + 70 命令
3. `ComposioHQ/awesome-claude-skills` (66k★) — 精选技能合集

## 🟡 中优先级
4. `jnMetaCode/superpowers-zh` (6k★) — superpowers 中文增强版
5. `Orchestra-Research/AI-Research-SKILLs` (10k★) — AI 研究技能

## ✅ 已完成：zai-org/Open-AutoGLM
- **Stars**: 25,618 ★
- **描述**: 智谱清言开源的 Phone Agent 模型与框架
- **仓库**: https://github.com/zai-org/Open-AutoGLM
- **优先级**: 高
- **可提取资源分析**:

### 可提取到 Doge Code 的资源

#### 1. Prompt 技能文件（可直接转为 SKILL.md）
| 文件 | 大小 | 内容 | 建议名称 |
|------|------|------|---------|
| `phone_agent/config/prompts.py` | 8KB | 手机自动化英文提示词 | `open-autoglm-prompts` |
| `phone_agent/config/prompts_zh.py` | 8.3KB | 手机自动化中文提示词 | `open-autoglm-prompts-zh` |
| `phone_agent/config/prompts_en.py` | 2.6KB | 英文补充提示词 | `open-autoglm-prompts-en` |

#### 2. 代理技能
| 文件 | 内容 | 建议 |
|------|------|------|
| `phone_agent/agent.py` | Phone Agent 主入口 | 转为 agents/phone-automation-agent.md |
| `phone_agent/agent_ios.py` | iOS Phone Agent | 转为 agents/phone-automation-ios-agent.md |
| `phone_agent/actions/handler.py` | Android 操作处理器 | 转为 skills/phone-agent-actions-android |
| `phone_agent/actions/handler_ios.py` | iOS 操作处理器 | 转为 skills/phone-agent-actions-ios |

#### 3. 配置技能
| 文件 | 内容 | 建议 |
|------|------|------|
| `phone_agent/config/apps.py` | Android 应用配置 | 转为 skills/phone-agent-apps |
| `phone_agent/config/apps_ios.py` | iOS 应用配置 | 转为 skills/phone-agent-apps-ios |
| `phone_agent/config/apps_harmonyos.py` | 鸿蒙应用配置 | 转为 skills/phone-agent-apps-harmonyos |

#### 4. 命令
| 文件 | 内容 | 建议 |
|------|------|------|
| `examples/basic_usage.py` | 基本使用示例 | 转为 commands/phone-agent.md |
| `examples/demo_thinking.py` | Thinking 模式演示 | 转为 commands/phone-agent-thinking.md |
| `scripts/` | 辅助脚本（待查看） | |

#### 5. 模型/能力
| 路径 | 内容 | 建议 |
|------|------|------|
| `phone_agent/model/client.py` | 模型客户端 | ——（代码层，暂不提取）|

### 价值评估
- ⭐ 手机自动化在 Claude Code 生态中目前**完全空白**
- 智谱清言的 Open-AutoGLM 是开源 Phone Agent 领域标杆
- 提取为技能后可在 Doge Code 中实现：`/phone-agent` 命令
- **优先提取 Prompt 和 Agent 定义**，模型客户端代码不需要

### 提取计划
1. 下载 prompts.py / prompts_zh.py → 转为 SKILL.md
2. 下载 agent.py → 转为 agents/ 文件
3. 下载 apps.py → 转为技能参考
4. 创建 `/phone-agent` 命令
