---
name: 聚类分析
description: "无监督聚类：K-Means、DBSCAN、层次凝聚聚类、高斯混合模型、HDBSCAN 和 OPTICS。包含评估指标和可视化。"
---

# 聚类分析

## 目的
Discover natural groupings in data without predefined labels. Includes cluster validation and business-ready profiling.

## 工作原理

### 步骤 1: Preprocessing
- Standardize/normalize features (critical for distance-based methods)
- Reduce dimensions if needed (PCA, UMAP for visualization)
- Handle mixed data types (Gower distance, k-prototypes)

### 步骤 2: Choose Algorithm

| Algorithm | Best For | 需要 K? |
|-----------|----------|-------------|
| K-Means | Spherical clusters, large datasets | Yes |
| DBSCAN | Arbitrary shapes, noise handling | No (ε, minPts) |
| Hierarchical | Small datasets, dendrogram visualization | 可选 |
| Gaussian Mixture | Elliptical clusters, soft assignments | Yes |
| Spectral | Complex shapes, graph-based | Yes |
| HDBSCAN | Variable density, robust | No |

### 步骤 3: Determine Optimal Clusters
- **Elbow method**: Within-cluster sum of squares
- **Silhouette score**: Cluster separation quality (-1 to 1)
- **Gap statistic**: Compare with reference distribution
- **Dendrogram**: Visual hierarchy (hierarchical clustering)
- **BIC/AIC**: Model-based selection (GMM)

### 步骤 4: Validate & Profile
- Silhouette analysis per cluster
- Cluster stability (bootstrap resampling)
- Profile each cluster: mean features, distinguishing characteristics
- Business naming: assign descriptive labels

## 用法 Examples

```
"Segment our customers into groups based on purchase behavior,
engagement metrics, and demographics"
```

```
"Find natural groupings in this sensor data — I don't know
how many clusters there should be"
```

## 输出格式

- **Cluster 总结**: Size, key characteristics per cluster
- **Validation Metrics**: Silhouette, stability scores
- **Visualization**: 2D/3D scatter with cluster colors, dendrogram
- **Profiles**: Feature means/distributions per cluster with business labels
- **Python Code**: sklearn implementation
