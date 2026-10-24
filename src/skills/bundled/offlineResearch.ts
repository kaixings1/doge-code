import { registerBundledSkill } from '../bundledSkills.js'

/**
 * 离线检索技能 —— 吸收 claw-code 的 connectivity + RAG 思路，但去掉重型依赖。
 *
 * 上游实现依赖 ChromaDB + sentence-transformers（Python 侧）。
 * 这里用纯本地、零依赖的方式实现等价能力：
 *   - 在线探测：TCP 连接失败即视为离线
 *   - 离线检索：对本地语料做分词 + TF-IDF 打分（无需向量库、无需下载模型）
 *
 * 具体检索由 /rag 命令执行；本技能给出「先探测连通性、再选检索路径」的流程。
 */
const PROMPT = `# 离线检索（Offline Research）

当网络不可用、或用户明确要求「不联网 / 本地资料」时，按下面的流程调研。

## 1. 先探测连通性
不要假设自己在线。用一条短命令确认：

- Windows: \`curl -s -m 3 -o NUL https://1.1.1.1 && echo ONLINE || echo OFFLINE\`
- POSIX: \`curl -s -m 3 -o /dev/null https://1.1.1.1 && echo ONLINE || echo OFFLINE\`

如果离线，**不要**再尝试 WebFetch / WebSearch —— 它们会超时并浪费轮次。

## 2. 在线路径
按正常流程检索（WebSearch → WebFetch），并在结论中标注来源 URL。

## 3. 离线路径
改用本地语料检索：

1. 确定语料目录：项目 \`docs/\`、\`knowledge/\`、\`README.md\`、\`CLAUDE.md\`，或用户指定的目录
2. 用 \`/rag <关键词>\` 做 TF-IDF 检索（零依赖，纯本地）
3. 用 Grep 补充精确匹配
4. 明确告诉用户：「本次结论基于本地资料，未联网」

## 4. 输出要求
- 每条结论都要给出证据位置（\`file:line\` 或 URL）
- 离线模式下，如果没有找到相关本地资料，直接说没找到，不要臆测
`

export function registerOfflineResearchSkill(): void {
  registerBundledSkill({
    name: 'offline-research',
    description: '离线检索 — 先探测网络，离线时改用本地语料 + TF-IDF 检索替代联网搜索。',
    whenToUse: '当网络不可用、用户要求不联网、或需要基于本地文档做调研时。',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}
