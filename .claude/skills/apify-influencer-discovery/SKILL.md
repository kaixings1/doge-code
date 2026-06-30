---
name: apify-influencer-discovery
description: 发现并评估适合品牌合作的影响者，验证真实性，并跨越 Instagram、Facebook、YouTube 和 TikTok 跟踪合作表现。
risk: unknown
source: community
---

# 影响者发现

使用 Apify Actors 在多个平台上发现和分析影响者。

## 使用场景
- 您需要发现创作者或影响者以进行外展、合作或活动策划。
- 任务是评估真实性、参与度、利基匹配度或社交平台的受众信号。
- 您需要基于 Apify 的提取以及合适影响者候选的简短列表或摘要。

## 前提条件
（无需预先检查）

- 包含 `APIFY_TOKEN` 的 `.env` 文件
- Node.js 20.6+（支持原生 `--env-file`）
- `mcpc` CLI 工具：`npm install -g @apify/mcpc`

## 工作流程

复制此检查列表以跟踪进度：

```
任务进度：
- [ ] 步骤 1：确定发现来源（选择 Actor）
- [ ] 步骤 2：通过 mcpc 获取 Actor 模式
- [ ] 步骤 3：询问用户偏好（格式、文件名）
- [ ] 步骤 4：运行发现脚本
- [ ] 步骤 5：总结结果
```

### 步骤 1：确定发现来源

根据用户需求选择合适的 Actor：

| 用户需求 | Actor ID | 最适用场景 |
|---------|----------|----------|
| 影响者个人主页 | `apify/instagram-profile-scraper` | 个人主页指标、简介、关注者数量 |
| 通过话题标签发现 | `apify/instagram-hashtag-scraper` | 发现使用特定话题标签的影响者 |
| Reel 参与 | `apify/instagram-reel-scraper` | 分析 reel 表现和参与度 |
| 通过利基发现 | `apify/instagram-search-scraper` | 按关键词/利基搜索影响者 |
| 品牌提及 | `apify/instagram-tagged-scraper` | 跟踪标记品牌/产品的用户 |
| 综合数据 | `apify/instagram-scraper` | 完整个人主页、帖子、评论分析 |
| API 方式发现 | `apify/instagram-api-scraper` | 快速基于 API 的数据提取 |
| 参与分析 | `apify/export-instagram-comments-posts` | 导出评论进行情感分析 |
| Facebook 内容 | `apify/facebook-posts-scraper` | 分析 Facebook 帖子表现 |
| 微型影响者 | `apify/facebook-groups-scraper` | 在利基群组中发现影响者 |
| 重要页面 | `apify/facebook-search-scraper` | 搜索有影响力的页面 |
| YouTube 创作者 | `streamers/youtube-channel-scraper` | 频道指标和订阅者数据 |
| TikTok 影响者 | `clockworks/tiktok-scraper` | 综合 TikTok 数据提取 |
| TikTok（免费） | `clockworks/free-tiktok-scraper` | 免费 TikTok 数据提取器 |
| 直播主播 | `clockworks/tiktok-live-scraper` | 发现直播主播影响者 |

### 步骤 2：获取 Actor 模式

使用 mcpc 动态获取 Actor 的输入模式和详细信息：

```bash
export $(grep APIFY_TOKEN .env | xargs) && mcpc --json mcp.apify.com --header "Authorization: Bearer $APIFY_TOKEN" tools-call fetch-actor-details actor:="ACTOR_ID" | jq -r ".content"
```

将 `ACTOR_ID` 替换为选定的 Actor（例如 `apify/instagram-profile-scraper`）。

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

**CSV：**
```bash
node --env-file=.env ${CLAUDE_PLUGIN_ROOT}/reference/scripts/run_actor.js \
  --actor "ACTOR_ID" \
  --input 'JSON_INPUT' \
  --output YYYY-MM-DD_OUTPUT_FILE.csv \
  --format csv
```

**JSON：**
```bash
node --env-file=.env ${CLAUDE_PLUGIN_ROOT}/reference/scripts/run_actor.js \
  --actor "ACTOR_ID" \
  --input 'JSON_INPUT' \
  --output YYYY-MM-DD_OUTPUT_FILE.json \
  --format json
```

### 步骤 5：总结结果

完成后，报告：
- 发现的影响者数量
- 文件位置和名称
- 可用的关键指标（关注者、参与率等）
- 建议的后续步骤（筛选、外展、深入分析）

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
