---
name: clustering
description: "Unsupervised clustering: K-Means, DBSCAN, hierarchical agglomerative, Gaussian Mixture Models, and spectral clustering. Includes optimal cluster count determination, validation metrics, and cluster profiling. Use when discovering natural groups in data."
---

# Clustering

## Purpose
Discover natural groupings in data without predefined labels. Includes cluster validation and business-ready profiling.

## How It Works

### Step 1: Preprocessing
- Standardize/normalize features (critical for distance-based methods)
- Reduce dimensions if needed (PCA, UMAP for visualization)
- Handle mixed data types (Gower distance, k-prototypes)

### Step 2: Choose Algorithm

| Algorithm | Best For | Requires K? |
|-----------|----------|-------------|
| K-Means | Spherical clusters, large datasets | Yes |
| DBSCAN | Arbitrary shapes, noise handling | No (ε, minPts) |
| Hierarchical | Small datasets, dendrogram visualization | Optional |
| Gaussian Mixture | Elliptical clusters, soft assignments | Yes |
| Spectral | Complex shapes, graph-based | Yes |
| HDBSCAN | Variable density, robust | No |

### Step 3: Determine Optimal Clusters
- **Elbow method**: Within-cluster sum of squares
- **Silhouette score**: Cluster separation quality (-1 to 1)
- **Gap statistic**: Compare with reference distribution
- **Dendrogram**: Visual hierarchy (hierarchical clustering)
- **BIC/AIC**: Model-based selection (GMM)

### Step 4: Validate & Profile
- Silhouette analysis per cluster
- Cluster stability (bootstrap resampling)
- Profile each cluster: mean features, distinguishing characteristics
- Business naming: assign descriptive labels

## Usage Examples

```
"Segment our customers into groups based on purchase behavior,
engagement metrics, and demographics"
```

```
"Find natural groupings in this sensor data — I don't know
how many clusters there should be"
```

## Output Format

- **Cluster Summary**: Size, key characteristics per cluster
- **Validation Metrics**: Silhouette, stability scores
- **Visualization**: 2D/3D scatter with cluster colors, dendrogram
- **Profiles**: Feature means/distributions per cluster with business labels
- **Python Code**: sklearn implementation
