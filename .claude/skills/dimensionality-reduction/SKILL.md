---
name: 降维分析
description: "降维：PCA、t-SNE、UMAP、SVD 和自编码器。适用于高维数据可视化、降噪、特征压缩以及作为下游 ML 模型的预处理。"
---

# 降维分析

## 目的
在保留重要结构的同时减少特征数量。对于可视化、降噪和预处理至关重要。

## 工作原理

### 方法选择

| 方法 | 保留 | 最适合 | 线性？ |
|--------|-----------|----------|---------|
| PCA | 全局方差 | 特征压缩、降噪 | 是 |
| t-SNE | 局部结构 | 2D/3D 可视化 | 否 |
| UMAP | 局部+全局 | 可视化、聚类准备 | 否 |
| SVD | 方差 | 稀疏数据、NLP (LSA) | 是 |
| LDA | Class separation | Supervised dimensionality reduction | Yes |
| Autoencoder | Learned representation | Complex non-linear compression | No |

### PCA Workflow
1. Standardize features
2. Compute covariance matrix and eigenvalues
3. Choose components: explained variance ≥ 85-95%
4. Transform and validate (scree plot, biplot)

### t-SNE / UMAP Workflow
1. Apply PCA first if >50 features (speed)
2. Tune perplexity (t-SNE) or n_neighbors (UMAP)
3. Generate 2D/3D embedding
4. Color by labels or clusters for interpretation

## Usage Examples

```
"Visualize this 50-feature customer dataset in 2D to see if
natural clusters exist"
```

```
"Reduce 200 features to the most important 20 using PCA
before training a model"
```

## Output Format

- **Method Choice**: Rationale for selected approach
- **Explained Variance**: Scree plot, cumulative variance
- **Visualization**: 2D/3D scatter plot of reduced space
- **Python Code**: sklearn / umap-learn implementation
