---
name: data-modeling
description: "Create data models: conceptual, logical, and physical models. Entity-relationship diagrams, dimensional modeling (Kimball), Data Vault 2.0, and activity schema patterns. Use when designing databases or data warehouses."
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
