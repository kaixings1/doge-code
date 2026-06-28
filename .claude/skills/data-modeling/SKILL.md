---
name: 数据建模
description: "数据建模方法——概念、逻辑和物理模型。涵盖 ER 图、UML 和维度建模。适用于设计数据库。"
---
# Data Modeling

## Purpose
Design data models at conceptual, logical, and physical levels for databases and data warehouses.

## How It Works

### Modeling Levels
1. **Conceptual**: Business entities and relationships (non-technical)
2. **Logical**: Detailed attributes, data types, keys, constraints
3. **Physical**: Implementation-specific (indexes, partitions, storage)

### Methodologies
- **Kimball**: Star schema, business-process dimensional modeling
- **Inmon**: Enterprise data warehouse, normalized
- **Data Vault 2.0**: Hubs, links, satellites — flexible and auditable
- **Activity Schema**: Single wide event table pattern

## Usage Examples

```
"Create a dimensional model for our e-commerce analytics"
```

## Output Format

- **Model Diagrams**: ERD at each level
- **Data Dictionary**: Column descriptions and business rules
- **Implementation SQL**: DDL scripts
