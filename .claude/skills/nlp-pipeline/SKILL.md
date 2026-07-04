---
name: NLP 管道
description: "构建 NLP 流水线：文本预处理、分词、嵌入（Word2Vec、BERT、sentence-transformers）、情感分析、命名实体识别、主题建模和文本分类。适用于处理文本数据进行分析或模型构建。"
---

# NLP 管道

## 目的
构建端到端的自然语言处理管道，从原始文本到模型预测。

## 步骤
### 步骤 1：文本预处理
- 小写化、Unicode 规范化
- 分词（词级、子词级、句子级）
- 停用词移除（取决于任务——BERT 保留）
- 词形还原/词干提取
- 特殊字符和 HTML 标签移除

### 步骤 2：文本表示
| 方法 | 使用时机 | 库 |
|------|----------|-----|
| Bag of Words | 快速基线 | sklearn |
| Word2Vec/GloVe | 语义相似度 | gensim |
| BERT/RoBERTa | 高级 NLU | transformers |
| sentence-transformers | 句子嵌入 | sentence-transformers |

### 步骤 3-5：特征工程、建模、评估
详细内容请参考具体 NLP 任务的最佳实践文档。