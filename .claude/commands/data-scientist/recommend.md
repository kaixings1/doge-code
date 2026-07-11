---
description: 设计与构建推荐系统 — 召回、排序、重排
argument-hint: "<describe your recommendation scenario, data, and business goals>"
---

# /recommend — 推荐系统构建器

使用工业级模型设计多阶段推荐系统。

## 调用

```
/recommend 为 1000 万视频和 5000 万用户构建视频推荐系统
/recommend 为我们的电商产品推荐添加深度排序
/recommend 为我们的新闻订阅设计召回+排序管道
/recommend 我们的推荐存在过滤气泡问题——提高多样性
```

## 工作流

### 步骤 1：定义问题
- 场景：电商、内容、广告、社交、新闻
- 信号：点击、购买、观看时间、点赞、分享
- 规模：物品目录大小、用户基数、QPS 要求

### 步骤 2：召回设计
应用 **recommendation-systems** 技能——DSSM、SASRec、MIND 用于候选生成。
设计 ANN 索引（FAISS/Milvus）和多通道召回策略。

### 步骤 3：排序设计
基于场景选择排序模型：
- **基线**：DeepFM 或 DCN V2
- **带行为序列**：DIN → DIEN → BST（渐进复杂度）
- **多任务**：MMOE 或 PLE 用于 CTR + CVR + 参与度

### 步骤 4：重排
带有多样性（DPP）和业务规则的多目标优化。

### 步骤 5：评估与服务
- 离线：AUC、GAUC、NDCG、HitRate@K
- 在线：CTR、CVR、GMV、用户参与度的 A/B 测试
- 带有延迟预算的服务架构

提供后续选项：
- "想要通过特征存储**添加实时特征**吗？"
- "需要我在 PyTorch 中**实现召回模型**吗？"
- "需要使用 TensorRT **部署**排序模型吗？"
- "想要使用 /analyze-test **为新模型设计 A/B 测试**吗？"
