---
name: market-basket-analysis
description: "Association rule mining: find products frequently bought together using Apriori, FP-Growth. Calculate support, confidence, and lift for cross-sell and upsell recommendations. Use when designing product bundles or recommendation systems."
---
# Market Basket Analysis

## Purpose
Discover product associations and co-purchase patterns for cross-sell and bundling strategies.

## How It Works

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

## Usage Examples

```
"Find products frequently bought together in our transaction data"
```

## Output Format

- **Top Rules**: Ranked by lift, with support and confidence
- **Visualization**: Network graph of product associations
- **Business Recommendations**: Bundle and cross-sell suggestions
- **Python Code**: mlxtend implementation
