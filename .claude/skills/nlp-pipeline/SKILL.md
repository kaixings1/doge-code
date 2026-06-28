---
name: NLP管道
description: "构建 NLP 流水线：文本预处理、分词、嵌入（Word2Vec、BERT、sentence-transformers）、情感分析、命名实体识别、主题建模和文本分类。适用于处理文本数据进行分析或模型构建。"
---

# NLP Pipeline

## Purpose
Build end-to-end natural language processing pipelines, from raw text to model predictions.

## How It Works

### Step 1: Text Preprocessing
- Lowercasing, Unicode normalization
- Tokenization (word, subword, sentence)
- Stop word removal (task-dependent — keep for BERT)
- Lemmatization / stemming
- Special character and HTML tag removal

### Step 2: Text Representation

| Method | When to Use | Library |
|--------|-------------|---------|
| Bag of Words | Simple baselines, small data | sklearn |
| TF-IDF | Document classification, search | sklearn |
| Word2Vec / GloVe | Word-level tasks, small models | gensim |
| FastText | Morphologically rich languages | gensim |
| BERT embeddings | State-of-the-art, contextual | transformers |
| Sentence-transformers | Semantic similarity, search | sentence-transformers |

### Step 3: NLP Tasks

| Task | Approach |
|------|----------|
| **Sentiment Analysis** | Fine-tuned BERT, or TF-IDF + logistic regression |
| **Text Classification** | Fine-tuned transformer, or TF-IDF + SVM |
| **NER** | spaCy, fine-tuned BERT for token classification |
| **Topic Modeling** | LDA, BERTopic, NMF |
| **Summarization** | T5, BART, or extractive methods |
| **Question Answering** | RAG, fine-tuned QA models |

### Step 4: Evaluate
- Classification: accuracy, F1, confusion matrix
- NER: entity-level precision, recall, F1
- Topic models: coherence score, human evaluation
- Embeddings: downstream task performance, nearest neighbor quality

## Usage Examples

```
"Build a sentiment analysis pipeline for product reviews —
should I fine-tune BERT or use TF-IDF + logistic regression?"
```

```
"Extract company names and locations from these news articles"
```

## Output Format

- **Pipeline Design**: Step-by-step architecture
- **Model Selection**: Chosen approach with rationale
- **Python Code**: Complete pipeline (spaCy, transformers, sklearn)
- **Evaluation**: Metrics on validation set
