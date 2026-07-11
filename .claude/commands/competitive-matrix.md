---
name: 竞品对比矩阵
description: "构建竞品对比矩阵，含加权评分与差距分析。用法: /competitive-matrix <analyze> [options]"
argument-hint: "<analyze> [options]"
---

# /competitive-matrix

构建带有加权评分、差距分析和市场定位洞察的竞品对比矩阵。

## 用法

```
/competitive-matrix analyze <competitors.json>                    完整分析
/competitive-matrix analyze <competitors.json> --weights pricing=2,ux=1.5    自定义权重
```

## 输入格式

```json
{
  "your_product": { "name": "MyApp", "scores": {"ux": 8, "pricing": 7, "features": 9} },
  "competitors": [
    { "name": "Competitor A", "scores": {"ux": 7, "pricing": 9, "features": 6} }
  ],
  "dimensions": ["ux", "pricing", "features"]
}
```

## 示例

```
/competitive-matrix analyze competitors.json
/competitive-matrix analyze competitors.json --format json --output matrix.json
```

## 脚本
- `product-team/skills/competitive-teardown/scripts/competitive_matrix_builder.py` — 矩阵构建器

## 技能参考
→ `product-team/skills/competitive-teardown/SKILL.md`
