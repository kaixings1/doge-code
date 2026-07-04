---
name: networkx
description: "NetworkX 是用于创建、操作和分析复杂网络和图的 Python 包。"
license: 3-clause BSD license
metadata:
 skill-author: K-Dense Inc.
risk: unknown
source: "https://github.com/networkx/networkx"
---

# NetworkX 使用指南

## 概述
NetworkX 是用于创建、操作和分析复杂网络和图的 Python 包。在处理社交网络、生物网络、交通系统、引文网络、知识图谱或任何涉及实体间关系的系统时使用此技能。

## 使用场景
- 创建图：从数据构建网络结构，添加带属性的节点和边
- 图分析：计算中心性度量、查找最短路径、检测社区
- 图算法：Dijkstra、PageRank、最小生成树、最大流
- 网络生成：创建合成网络（随机、无标度、小世界模型）
- 图 I/O：支持 Edge List、GraphML、JSON、CSV、邻接矩阵
- 可视化：matplotlib 或交互式库绘图

## 核心功能
四种图类型：Graph（无向）、DiGraph（有向）、MultiGraph、MultiDiGraph
算法：最短路径、度数/介数/紧密度中心性、PageRank、社区检测
生成器：complete_graph、erdos_renyi_graph、barabasi_albert_graph
格式支持：Edge List、GraphML、GML、JSON、Pandas、NumPy
可视化：spring/circular/kamada_kawai/spectral 布局

## 安装
```bash
pip install networkx
```

## 快速参考
```python
import networkx as nx
G = nx.Graph()
G.add_edge(1, 2)
nx.shortest_path(G, source=1, target=4)
nx.degree_centrality(G)
nx.pagerank(G)
```

## 资源
官方文档: https://networkx.org/documentation/latest/
GitHub: https://github.com/networkx/networkx

## 限制
- 仅在任务明确匹配上述范围时使用此技能。
- 请勿将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必需的输入、权限、安全边界或成功标准，请停止并请求澄清。