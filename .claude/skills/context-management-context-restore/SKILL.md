---
name: 适用于working with context management context restore的情况。
description: "适用于working with context management context restore的情况。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# 上下文恢复：高级语义记忆再水合

## 使用此技能的场景

- 处理上下文恢复：高级语义记忆再水合任务或工作流时
- 需要上下文恢复的指导、最佳实践或检查清单时

## 不要使用此技能的场景

- 任务与上下文恢复无关时
- 需要此范围之外的领域或工具时

## 说明

- 明确目标、约束和所需输入。
- 应用相关最佳实践并验证结果。
- 提供可操作的步骤和验证方法。
- 如需详细示例，请打开 `resources/implementation-playbook.md`。

## 角色说明

专注于跨复杂多代理 AI 工作流的智能语义感知上下文检索和重构的专家级上下文恢复专家。擅长以高保真度和最小信息损失保留和重构项目知识。

## 上下文概述

上下文恢复工具是一个复杂的记忆管理系统，旨在：
- 跨分布式 AI 工作流恢复和重构项目上下文
- 在复杂的长期运行项目中实现无缝连续性
- 提供智能、语义感知的上下文再水合
- 维护历史知识完整性和决策可追溯性

## 核心要求与参数

### 输入参数
- `context_source`：主要上下文存储位置（向量数据库、文件系统）
- `project_identifier`：唯一项目命名空间
- `restoration_mode`：
  - `full`：完整上下文恢复
  - `incremental`：部分上下文更新
  - `diff`：比较和合并上下文版本
- `token_budget`：要恢复的最大上下文 token（默认：8192）
- `relevance_threshold`：上下文组件的语义相似度截止值（默认：0.75）

## 高级上下文检索策略

### 1. 语义向量搜索
- 利用多维嵌入模型进行上下文检索
- 采用余弦相似度和向量聚类技术
- 支持多模态嵌入（文本、代码、架构图）

```python
def semantic_context_retrieve(project_id, query_vector, top_k=5):
    """Semantically retrieve most relevant context vectors"""
    vector_db = VectorDatabase(project_id)
    matching_contexts = vector_db.search(
        query_vector,
        similarity_threshold=0.75,
        max_results=top_k
    )
    return rank_and_filter_contexts(matching_contexts)
```

### 2. 相关性过滤与排序
- 实现多阶段相关性评分
- 考虑时间衰减、语义相似度和历史影响
- 上下文组件的动态加权

```python
def rank_context_components(contexts, current_state):
    """Rank context components based on multiple relevance signals"""
    ranked_contexts = []
    for context in contexts:
        relevance_score = calculate_composite_score(
            semantic_similarity=context.semantic_score,
            temporal_relevance=context.age_factor,
            historical_impact=context.decision_weight
        )
        ranked_contexts.append((context, relevance_score))

    return sorted(ranked_contexts, key=lambda x: x[1], reverse=True)
```

### 3. 上下文再水合模式
- 实现增量上下文加载
- 支持部分和完整上下文重构
- 动态管理令牌预算

```python
def rehydrate_context(project_context, token_budget=8192):
    """Intelligent context rehydration with 令牌 budget management"""
    context_components = [
        'project_overview',
        'architectural_decisions',
        'technology_stack',
        'recent_agent_work',
        'known_issues'
    ]

    prioritized_components = prioritize_components(context_components)
    restored_context = {}

    current_tokens = 0
    for component in prioritized_components:
        component_tokens = estimate_tokens(component)
        if current_tokens + component_tokens <= token_budget:
            restored_context[component] = load_component(component)
            current_tokens += component_tokens

    return restored_context
```

### 4. 会话状态重构
- 重构代理工作流状态
- 保留决策轨迹和推理上下文
- 支持多代理协作历史

### 5. 上下文合并与冲突解决
- 实现三方合并策略
- 检测和解决语义冲突
- 维护来源和决策可追溯性

### 6. 增量上下文加载
- 支持上下文的惰性加载
- 为大型项目实现上下文流式传输
- 启用动态上下文扩展

### 7. 上下文验证与完整性检查
- 加密上下文签名
- 语义一致性验证
- 版本兼容性检查

### 8. 性能优化
- 实现高效缓存机制
- 使用概率数据结构进行上下文索引
- 优化向量搜索算法

## 参考工作流

### 工作流 1：项目恢复
1. 检索最近的项目上下文
2. 验证上下文与当前代码库的一致性
3. 选择性恢复相关组件
4. 生成恢复摘要

### 工作流 2：跨项目知识迁移
1. 从源项目提取语义向量
2. 映射和迁移相关知识
3. 将上下文适应到目标项目领域
4. 验证知识可迁移性

## 使用示例

```bash
# Full context restoration
context-restore project:ai-assistant --mode full

# Incremental context update
context-restore project:web-platform --mode incremental

# Semantic context 查询
context-restore project:ml-pipeline --查询 "model training strategy"
```

## 集成模式
- RAG（检索增强生成）管道
- 多代理工作流协调
- 持续学习系统
- 企业知识管理

## 未来路线图
- 增强的多模态嵌入支持
- 量子启发的向量搜索算法
- 自修复上下文重构
- 自适应学习上下文策略

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
