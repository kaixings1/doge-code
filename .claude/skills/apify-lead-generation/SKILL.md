---
name: apify-lead-generation
description: "使用 Apify 的潜在客户生成参与者从网络提取商业线索。从社交媒体、目录和商业简介收集数据。"
risk: unknown
source: community
---

# 潜在客户生成

使用 Apify Actors 从多个平台抓取潜在客户。

## 使用场景
- 您需要来自地图、搜索、社交或视频平台的业务、创作者或联系潜在客户。
- 任务涉及选择 Apify Actor 以发现潜在客户并提取外展数据。
- 您需要导出的潜在客户数据以及对潜在客户质量或细分的简要摘要。

## 前提条件
（无需预先检查）

- 包含 `APIFY_TOKEN` 的 `.env` 文件
- Node.js 20.6+（支持原生 `--env-file`）
- `mcpc` CLI 工具：`npm install -g @apify/mcpc`

## 工作流程

复制此检查列表以跟踪进度：

```
任务进度：
- [ ] 步骤 1：确定潜在客户来源（选择 Actor）
- [ ] 步骤 2：通过 mcpc 获取 Actor 模式
- [ ] 步骤 3：询问用户偏好（格式、文件名）
- [ ] 步骤 4：运行潜在客户查找脚本
- [ ] 步骤 5：总结结果
```

### 步骤 1：确定潜在客户来源

根据用户需求选择合适的 Actor：

| 用户需求 | Actor ID | 最适用场景 |
|---------|----------|----------|
| 本地企业 | `compass/crawler-google-places` | 餐厅、健身房、商店 |
| 联系丰富 | `vdrmota/contact-info-scraper` | 从 URL 提取邮箱、电话 |
| Instagram 个人主页 | `apify/instagram-profile-scraper` | 影响者发现 |
| Instagram 帖子/评论 | `apify/instagram-scraper` | 帖子、评论、话题标签、地点 |
| Instagram 搜索 | `apify/instagram-search-scraper` | 地点、用户、话题标签发现 |
| TikTok 视频/话题标签 | `clockworks/tiktok-scraper` | 综合 TikTok 数据提取 |
| TikTok 话题标签/个人主页 | `clockworks/free-tiktok-scraper` | 免费 TikTok 数据提取器 |
| TikTok 用户搜索 | `clockworks/tiktok-user-search-scraper` | 按关键词查找用户 |
| TikTok 个人主页 | `clockworks/tiktok-profile-scraper` | 创作者外展 |
| TikTok 关注者/关注 | `clockworks/tiktok-followers-scraper` | 受众分析、细分 |
| Facebook 页面 | `apify/facebook-pages-scraper` | 业务联系人 |
| Facebook 页面联系 | `apify/facebook-page-contact-information` | 提取邮箱、电话、地址 |
| Facebook 群组 | `apify/facebook-groups-scraper` | 购买意向信号 |
| Facebook 事件 | `apify/facebook-events-scraper` | 事件网络、合作 |
| Google 搜索 | `apify/google-search-scraper` | 广泛潜在客户发现 |
| YouTube 频道 | `streamers/youtube-scraper` | 创作者合作 |
| Google Maps 邮箱 | `poidata/google-maps-email-extractor` | 直接邮箱提取 |

### 步骤 2：获取 Actor 模式

使用 mcpc 动态获取 Actor 的输入模式和详细信息：

```bash
export $(grep APIFY_TOKEN .env | xargs) && mcpc --json mcp.apify.com --header "Authorization: Bearer $APIFY_TOKEN" tools-call fetch-actor-details actor:="ACTOR_ID" | jq -r ".content"
```

将 `ACTOR_ID` 替换为选定的 Actor（例如 `compass/crawler-google-places`）。

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
- 发现的潜在客户数量
- 文件位置和名称
- 可用的关键字段
- 建议的后续步骤（筛选、丰富）

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
