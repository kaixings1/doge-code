---
name: apify-content-analytics
description: 跟踪参与指标, measure campaign ROI, and analyze content performance across Instagram, Facebook, YouTube, and TikTok.
risk: unknown
source: community
---

# 内容分析

使用 Apify Actors 从多个平台提取参与指标来跟踪和分析内容表现。

## 使用场景
- 您需要帖子、reels、视频、广告或话题标签的参与、增长或 ROI 指标。
- 任务是使用 Apify Actors 收集跨平台内容表现数据。
- 您需要导出的分析结果和对表现最佳内容的简要解读。

## 前提条件
(No need to check it upfront)

- 包含 `APIFY_TOKEN` 的 `.env` 文件
- Node.js 20.6+（支持原生 `--env-file`）
- `mcpc` CLI 工具：`npm install -g @apify/mcpc`

## 工作流程

复制此检查列表以跟踪进度：

```
Task Progress:
- [ ] 步骤 1：确定内容分析类型（选择 Actor）
- [ ] 步骤 2：通过 mcpc 获取 Actor 模式
- [ ] 步骤 3：询问用户偏好（格式、文件名）
- [ ] 步骤 4：运行分析脚本
- [ ] 步骤 5：总结发现
```

### 步骤 1：确定内容分析类型

根据分析需求选择合适的 Actor：

\| 用户需求 | Actor ID | 最适用场景 \|
\|---------|----------|----------|
| 帖子参与指标 | `apify/instagram-post-scraper` | 帖子表现 |
| Reel 表现 | `apify/instagram-reel-scraper` | Reel 分析 |
| 关注者增长跟踪 | `apify/instagram-followers-count-scraper` | 增长指标 |
| 评论参与 | `apify/instagram-comment-scraper` | 评论分析 |
| 话题标签表现 | `apify/instagram-hashtag-scraper` | 品牌话题标签 |
| 提及跟踪 | `apify/instagram-tagged-scraper` | 标签跟踪 |
| 综合指标 | `apify/instagram-scraper` | 完整数据 |
| API 分析 | `apify/instagram-api-scraper` | API 访问 |
| Facebook 帖子表现 | `apify/facebook-posts-scraper` | 帖子指标 |
| 反应分析 | `apify/facebook-likes-scraper` | 参与类型 |
| Facebook Reels 指标 | `apify/facebook-reels-scraper` | Reels 表现 |
| 广告表现跟踪 | `apify/facebook-ads-scraper` | 广告分析 |
| Facebook 评论分析 | `apify/facebook-comments-scraper` | 评论参与 |
| 页面表现审计 | `apify/facebook-pages-scraper` | 页面指标 |
| YouTube 视频指标 | `streamers/youtube-scraper` | 视频表现 |
| YouTube Shorts 分析 | `streamers/youtube-shorts-scraper` | Shorts 表现 |
| TikTok 内容指标 | `clockworks/tiktok-scraper` | TikTok 分析 |

### 步骤 2：获取 Actor 模式

使用 mcpc 动态获取 Actor 的输入模式和详细信息：

```bash
export $(grep APIFY_TOKEN .env | xargs) && mcpc --json mcp.apify.com --header "Authorization: Bearer $APIFY_TOKEN" tools-call fetch-actor-details actor:="ACTOR_ID" | jq -r ".content"
```

将 `ACTOR_ID` 替换为选定的 Actor（例如 `apify/instagram-post-scraper`）。

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
- 分析的内容数量
- 文件位置和名称
- 关键表现洞察
- 建议的后续步骤（深入分析、内容优化）

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
