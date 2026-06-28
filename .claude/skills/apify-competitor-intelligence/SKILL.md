---
name: apify-competitor-intelligence
description: 分析竞争对手的策略、内容、定价、广告和市场定位，跨越 Google Maps、Booking.com、Facebook、Instagram、YouTube 和 TikTok 平台。
risk: unknown
source: community
---

# 竞争对手情报分析

使用 Apify Actors 从多个平台提取数据进行竞争对手分析。

## 使用场景
- 您需要竞争对手在内容、评论、定价、广告、受众或渠道表现方面的基准数据。
- 任务涉及选择 Apify Actors 以跨地图、预订、社交或视频平台比较竞争对手。
- 您需要结构化的竞争对手数据以及策略或定位的综合摘要。

## 前提条件
（无需预先检查）

- 包含 `APIFY_TOKEN` 的 `.env` 文件
- Node.js 20.6+（支持原生 `--env-file`）
- `mcpc` CLI 工具：`npm install -g @apify/mcpc`

## 工作流程

复制此检查列表以跟踪进度：

```
任务进度：
- [ ] 步骤 1：确定竞争对手分析类型（选择 Actor）
- [ ] 步骤 2：通过 mcpc 获取 Actor 模式
- [ ] 步骤 3：询问用户偏好（格式、文件名）
- [ ] 步骤 4：运行分析脚本
- [ ] 步骤 5：总结发现
```

### 步骤 1：确定竞争对手分析类型

根据分析需求选择合适的 Actor：

| 用户需求 | Actor ID | 最适用场景 |
|---------|----------|----------|
| 竞争对手业务数据 | `compass/crawler-google-places` | 位置分析 |
| 竞争对手联系发现 | `poidata/google-maps-email-extractor` | 邮箱提取 |
| 功能对标 | `compass/google-maps-extractor` | 详细业务数据 |
| 竞争对手评论分析 | `compass/Google-Maps-Reviews-Scraper` | 评论对比 |
| 酒店竞争对手数据 | `voyager/booking-scraper` | 酒店对标 |
| 酒店评论对比 | `voyager/booking-reviews-scraper` | 评论分析 |
| 竞争对手广告策略 | `apify/facebook-ads-scraper` | 广告创意分析 |
| 竞争对手页面指标 | `apify/facebook-pages-scraper` | 页面表现 |
| 竞争对手内容分析 | `apify/facebook-posts-scraper` | 帖子策略 |
| 竞争对手 reels 表现 | `apify/facebook-reels-scraper` | reels 分析 |
| 竞争对手受众分析 | `apify/facebook-comments-scraper` | 评论情感 |
| 竞争对手事件监控 | `apify/facebook-events-scraper` | 事件跟踪 |
| 竞争对手受众重叠 | `apify/facebook-followers-following-scraper` | 关注者分析 |
| 竞争对手评论对标 | `apify/facebook-reviews-scraper` | 评论对比 |
| 竞争对手广告监控 | `apify/facebook-search-scraper` | 广告发现 |
| 竞争对手个人主页指标 | `apify/instagram-profile-scraper` | 个人主页分析 |
| 竞争对手内容监控 | `apify/instagram-post-scraper` | 帖子跟踪 |
| 竞争对手互动分析 | `apify/instagram-comment-scraper` | 评论分析 |
| 竞争对手 reel 表现 | `apify/instagram-reel-scraper` | reel 指标 |
| 竞争对手增长跟踪 | `apify/instagram-followers-count-scraper` | 关注者跟踪 |
| 综合竞争对手数据 | `apify/instagram-scraper` | 全面分析 |
| API 竞争对手分析 | `apify/instagram-api-scraper` | API 访问 |
| 竞争对手视频分析 | `streamers/youtube-scraper` | 视频指标 |
| 竞争对手情感分析 | `streamers/youtube-comments-scraper` | 评论情感 |
| 竞争对手频道指标 | `streamers/youtube-channel-scraper` | 频道分析 |
| TikTok 竞争对手分析 | `clockworks/tiktok-scraper` | TikTok 数据 |
| 竞争对手视频策略 | `clockworks/tiktok-video-scraper` | 视频分析 |
| 竞争对手 TikTok 个人主页 | `clockworks/tiktok-profile-scraper` | 个人主页数据 |

### 步骤 2：获取 Actor 模式

使用 mcpc 动态获取 Actor 的输入模式和详细信息:

```bash
export $(grep APIFY_TOKEN .env | xargs) && mcpc --json mcp.apify.com --header "Authorization: Bearer $APIFY_TOKEN" tools-call fetch-actor-details actor:="ACTOR_ID" | jq -r ".content"
```

将 `ACTOR_ID` 替换为选定的 Actor (e.g., `compass/crawler-google-places`).

返回内容包括：
- Actor 描述和 README
- 必需和可选的输入参数
- 输出字段（如果可用）

### 步骤 3：询问用户偏好

运行前，请询问：
1. **Output format**:
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
- 分析的竞争对手数量
- 文件位置和名称
- 关键竞争洞察
- 建议的后续步骤（深入分析、对标）

## 错误处理

`APIFY_TOKEN not found` - 请用户创建 `.env` 文件并添加 `APIFY_TOKEN=your_token`
`mcpc not found` - 请用户安装 `npm install -g @apify/mcpc`
`Actor not found` - 检查 Actor ID 拼写
`Run FAILED` - 请用户检查错误输出中的 Apify 控制台链接
`Timeout` - 减小输入大小或增加 `--timeout`

## 限制
- 仅在任务明显匹配上述范围时使用此技能
- 不要将输出视为特定环境验证、测试或专家评审的替代品
- 如果缺少必需的输入、权限、安全边界或成功标准，请停止并寻求澄清。
