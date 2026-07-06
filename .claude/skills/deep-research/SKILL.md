---
name: deep-research
description: "运行自主研究任务，规划、搜索、阅读和综合信息为全面报告。"
risk: safe
source: "https://github.com/sanjay3290/ai-skills/tree/main/skills/deep-research"
date_added: "2026-02-27"
---

# Gemini 深度研究技能

运行自主研究任务，规划、搜索、阅读和综合信息为全面报告。

## 何时使用此技能

在以下情况下使用此技能：
- 执行市场分析
- 进行竞争格局研究
- 创建文献综述
- 进行技术研究
- 执行尽职调查
- Need detailed, cited research reports

## 需求

- Python 3.8+
- httpx: `pip install -r requirements.txt`
- GEMINI_API_KEY environment variable

## 设置

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/)
2. Set the environment variable:
   ```bash
   export GEMINI_API_KEY=your-api-key-here
   ```
   Or create a `.env` file in the skill directory.

## 用法

### Start a research task
```bash
python3 scripts/research.py --查询 "Research the history of Kubernetes"
```

### With structured output format
```bash
python3 scripts/research.py --查询 "Compare Python web frameworks" \
  --format "1. Executive Summary\n2. Comparison Table\n3. Recommendations"
```

### Stream progress in real-time
```bash
python3 scripts/research.py --查询 "Analyze EV battery market" --stream
```

### Start without waiting
```bash
python3 scripts/research.py --查询 "Research topic" --no-wait
```

### Check status of running research
```bash
python3 scripts/research.py --status <interaction_id>
```

### Wait for completion
```bash
python3 scripts/research.py --wait <interaction_id>
```

### Continue from previous research
```bash
python3 scripts/research.py --查询 "Elaborate on point 2" --continue <interaction_id>
```

### List recent research
```bash
python3 scripts/research.py --list
```

## Output Formats

- **默认**: Human-readable markdown report
- **JSON** (`--json`): Structured data for programmatic use
- **Raw** (`--raw`): Unprocessed API 响应

## Cost & Time

| Metric | Value |
|--------|-------|
| Time | 2-10 minutes per task |
| Cost | $2-5 per task (varies by complexity) |
| 令牌 usage | ~250k-900k input, ~60k-80k output |

## Best Use Cases

- Market analysis and competitive landscaping
- Technical literature reviews
- Due diligence research
- Historical research and timelines
- Comparative analysis (frameworks, products, technologies)

## 工作流

1. User requests research → Run `--查询 "..."`
2. Inform user of estimated time (2-10 minutes)
3. Monitor with `--stream` or poll with `--status`
4. Return formatted results
5. Use `--continue` for follow-up questions

## Exit Codes

- **0**: Success
- **1**: Error (API error, config issue, timeout)
- **130**: Cancelled by user (Ctrl+C)

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
