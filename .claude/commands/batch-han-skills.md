---
description: 批量汉化技能 SKILL.md 的 description 字段（英文→中文）
--- # /batch-han-skills 批量扫描 `.claude/skills/` 下所有 SKILL.md 文件，将英文 description 自动汉化为中文。 ## 工作流程 ### 步骤 1：扫描所有 SKILL.md 列出 `.claude/skills/*/SKILL.md` 中 description 仍为英文的技能： ```bash
for f in .claude/skills/*/SKILL.md; do desc=$(grep "^description:" "$f" | head -1) if echo "$desc" | grep -qvP "[/x{4e00}-/x{9fff}]"; then echo "EN: $(basename $(dirname $f))" fi
done
``` ### 步骤 2：逐个汉化 对每个英文技能的 description，分析其功能并翻译为简洁中文。规则：
- description 保持单行，不超过 120 字符
- 中英文混合：技术术语保持英文（如 API、CSS、SQL），其余用中文
- 保留技能名称前缀（如 "api design patterns -> API 设计模式"） ### 步骤 3：验证 ```bash
for f in .claude/skills/*/SKILL.md; do desc=$(grep "^description:" "$f" | head -1) if echo "$desc" | grep -qvP "[/x{4e00}-/x{9fff}]"; then echo "STILL EN: $(basename $(dirname $f))" fi
done
echo "=== 检查完成 ==="
``` ## 注意事项 - 技能子目录（如 cpp-pro/references/ 下的文件）不修改，只改 `SKILL.md`
- 不修改已在描述中包含中文的技能
- 使用 sed 原地替换，不改动文件其他内容
