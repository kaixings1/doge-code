---
name: apify-audience-analysis
description: 了解受众人口统计学、偏好、行为模式和参与质量，跨越 Facebook、Instagram、YouTube 和 TikTok 平台。
risk: unknown
source: community
---

# 受众分析

使用 Apify Actors 从多个平台提取关注者人口统计、参与模式和行为数据来分析和了解您的受众。

## 使用场景
- 您需要社交平台的受众人口统计、参与模式或关注者行为。
- 任务是选择并运行 Apify Actors 以跨 Facebook、Instagram、YouTube 或 TikTok 进行受众分析。
- 您需要结构化提取和受众发现的摘要解读。

## 前提条件
（无需预先检查）

- 包含 `APIFY_TOKEN` 的 `.env` 文件
- Node.js 20.6+（支持原生 `--env-file`）
- `mcpc` CLI 工具：`npm install -g @apify/mcpc`

## 工作流程

复制此检查列表以跟踪进度：

```
任务进度：
- [ ] 步骤 1：确定受众分析类型（选择 Actor）
- [ ] 步骤 2：通过 mcpc 获取 Actor 模式
- [ ] 步骤 3：询问用户偏好（格式、文件名）
- [ ] 步骤 4：运行分析脚本
- [ ] 步骤 5：总结发现
```

### 步骤 1：确定受众分析类型

根据分析需求选择合适的 Actor：

| 用户需求 | Actor ID | 最适用场景 |
|---------|----------|----------|
| Facebook 关注者人口统计 | `apify/facebook-followers-following-scraper` | FB 关注者/关注列表 |
| Facebook 参与行为 | `apify/facebook-likes-scraper` | FB 帖子点赞分析 |
| Facebook 视频受众 | `apify/facebook-reels-scraper` | FB Reels 观看者 |
| Facebook 评论分析 | `apify/facebook-comments-scraper` | FB 帖子/视频评论 |
| Facebook 内容参与 | `apify/facebook-posts-scraper` | FB 帖子参与指标 |
| Instagram 受众规模 | `apify/instagram-profile-scraper` | IG 个人主页人口统计 |
| Instagram 位置相关 | `apify/instagram-search-scraper` | IG 地理标签受众 |
| Instagram 标签网络 | `apify/instagram-tagged-scraper` | IG 标签网络分析 |
| Instagram 综合 | `apify/instagram-scraper` | 完整 IG 受众数据 |
| Instagram API 方式 | `apify/instagram-api-scraper` | IG API 访问 |
| Instagram 关注者数量 | `apify/instagram-followers-count-scraper` | IG 关注者跟踪 |
| Instagram 评论导出 | `apify/export-instagram-comments-posts` | IG 评论批量导出 |
| Instagram 评论分析 | `apify/instagram-comment-scraper` | IG 评论情感 |
| YouTube 观众反馈 | `streamers/youtube-comments-scraper` | YT 评论分析 |
| YouTube 频道受众 | `streamers/youtube-channel-scraper` | YT 频道订阅者 |
| TikTok 关注者人口统计 | `clockworks/tiktok-followers-scraper` | TT 关注者列表 |
| TikTok 个人主页分析 | `clockworks/tiktok-profile-scraper` | TT 个人主页人口统计 |
| TikTok 评论分析 | `clockworks/tiktok-comments-scraper` | TT 评论参与 |

### 步骤 2：获取 Actor 模式

使用 mcpc 动态获取 Actor 的输入模式和详细信息：

```bash
export $(grep APIFY_TOKEN .env | xargs) && mcpc --json mcp.apify.com --header "Authorization: Bearer $APIFY_TOKEN" tools-call fetch-actor-details actor:="ACTOR_ID" | jq -r ".content"
```

将 `ACTOR_ID` 替换为选定的 Actor（例如 `apify/facebook-followers-following-scraper`）。

返回内容包括：
- Actor 描述和 README
- 必需和可选的输入参数
- 输出字段（如果可用）

### 步骤 3：询问用户偏好

运行前，请询问：
1. **输出格式**：
   - **快速回复** - 在聊天中显示前几个结果（不保存文件）
   - **CSV** - 完整导出所有字段
   - **JSON** - 完整导出 JSON 格式
2. **结果数量**：根据使用场景确定

### 步骤 4：运行脚本

**快速回复（在聊天中显示，不保存文件）：**
```bash
node --env-file=.env ${CLAUDE_PLUGIN_ROOT}/reference/scripts/run_actor.js \
  --actor "ACTOR_ID" \
  --input 'JSON_INPUT'
```

**CSV:**
```bash
node --env-file=.env ${CLAUDE_PLUGIN_ROOT}/reference/scripts/run_actor.js \
  --actor "ACTOR_ID" \
  --input 'JSON_INPUT' \
  --output YYYY-MM-DD_OUTPUT_FILE.csv \
  --format csv
```

**JSON:**
```bash
node --env-file=.env ${CLAUDE_PLUGIN_ROOT}/reference/scripts/run_actor.js \
  --actor "ACTOR_ID" \
  --input 'JSON_INPUT' \
  --output YYYY-MM-DD_OUTPUT_FILE.json \
  --format json
```

### 步骤 5：总结发现

完成后，报告：
- 分析的受众数量/个人主页数量
- 文件位置和名称
- 关键人口统计洞察
- 建议的后续步骤（深入分析、细分）

## 错误处理

`APIFY_TOKEN not found` - 请用户创建 `.env` 文件并添加 `APIFY_TOKEN=your_token`
`mcpc not found` - 请用户安装 `npm install -g @apify/mcpc`
`Actor not found` - 检查 Actor ID 拼写
`Run FAILED` - 请用户检查错误输出中的 Apify 控制台链接
`Timeout` - 减小输入大小或增加 `--timeout`

## 限制
- 仅在任务明显匹配上述范围时使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必需的输入、权限、安全边界或成功标准，请停止并寻求澄清。
