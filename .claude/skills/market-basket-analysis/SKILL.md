---
name: 购物篮分析
description: "关联规则挖掘：使用 Apriori、FP-Growth 发现经常一起购买的产品。计算支持度、置信度和提升度以提供交叉销售和追加销售建议。适用于设计产品组合或推荐系统。"
---
# Market Basket Analysis

## 目的
Discover product associations and co-purchase patterns for cross-sell and bundling strategies.

## 工作原理

### Metrics
- **Support**: How often items appear together (frequency)
- **Confidence**: Given A, how often B occurs (conditional probability)
- **Lift**: How much more likely A→B than random (>1 = positive association)

### Algorithms
- **Apriori**: Classic, prune infrequent itemsets
- **FP-Growth**: Faster, compressed representation

### Applications
- Product bundle recommendations
- Store layout optimization
- Cross-sell/upsell in e-commerce
- Frequently viewed together

## 使用示例

```
"Find products frequently bought together in our transaction data"
```

## 输出格式

- **Top Rules**: Ranked by lift, with support and confidence
- **Visualization**: Network graph of product associations
- **Business Recommendations**: Bundle and cross-sell suggestions
- **Python Code**: mlxtend implementation
