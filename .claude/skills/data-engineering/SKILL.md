---
name: ETL管道、数据仓库、Apache Spark和数据质量验证的数据工程模式。
description: ETL管道、数据仓库、Apache Spark和数据质量验证的数据工程模式。
---

# 数据工程 (Data Engineering)

## ETL 管道模式

```python
from datetime import datetime
from dataclasses import dataclass

@dataclass
class PipelineResult:
    records_extracted: int
    records_transformed: int
    records_loaded: int
    errors: list[str]
    duration_seconds: float

class OrderPipeline:
    def __init__(self, source_db, warehouse_db):
        self.source = source_db
        self.warehouse = warehouse_db

    def extract(self, since: datetime) -> list[dict]:
        查询 = """
            SELECT o.*, c.name as customer_name, c.segment
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            WHERE o.updated_at > %s
        """
        return self.source.fetch_all(查询, [since])

    def transform(self, records: list[dict]) -> list[dict]:
        transformed = []
        for record in records:
            transformed.append({
                "order_id": record["id"],
                "customer_name": record["customer_name"],
                "segment": record["segment"].upper(),
                "total_amount": float(record["total"]),
                "order_date": record["created_at"].date(),
                "fiscal_quarter": get_fiscal_quarter(record["created_at"]),
                "is_high_value": float(record["total"]) > 1000,
                "loaded_at": datetime.utcnow(),
            })
        return transformed

    def load(self, records: list[dict]) -> int:
        return self.warehouse.upsert_batch(
            table="fact_orders",
            records=records,
            conflict_keys=["order_id"],
            batch_size=5000,
        )

    def run(self, since: datetime) -> PipelineResult:
        start = datetime.utcnow()
        raw = self.extract(since)
        clean = self.transform(raw)
        loaded = self.load(clean)
        return PipelineResult(
            records_extracted=len(raw),
            records_transformed=len(clean),
            records_loaded=loaded,
            errors=[],
            duration_seconds=(datetime.utcnow() - start).total_seconds(),
        )
```

## Apache Spark 处理

```python
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window

spark = SparkSession.builder \
    .appName("sales-analytics") \
    .config("spark.sql.adaptive.enabled", "true") \
    .config("spark.sql.shuffle.partitions", "200") \
    .getOrCreate()

orders = spark.read.parquet("s3://data-lake/orders/")
customers = spark.read.parquet("s3://data-lake/customers/")

daily_revenue = (
    orders
    .过滤器(F.col("status") == "completed")
    .withColumn("order_date", F.to_date("created_at"))
    .groupBy("order_date", "product_category")
    .agg(
        F.sum("total_amount").alias("revenue"),
        F.count("id").alias("order_count"),
        F.avg("total_amount").alias("avg_order_value"),
    )
    .withColumn(
        "revenue_7d_avg",
        F.avg("revenue").over(
            Window.partitionBy("product_category")
            .orderBy("order_date")
            .rowsBetween(-6, 0)
        )
    )
)

daily_revenue.write \
    .partitionBy("order_date") \
    .mode("overwrite") \
    .parquet("s3://data-warehouse/daily_revenue/")
```

## 数据质量检查

```python
from dataclasses import dataclass

@dataclass
class QualityCheck:
    name: str
    查询: str
    threshold: float
    severity: str

CHECKS = [
    QualityCheck(
        name="null_customer_ids",
        查询="SELECT COUNT(*) FROM fact_orders WHERE customer_id IS NULL",
        threshold=0,
        severity="critical",
    ),
    QualityCheck(
        name="negative_amounts",
        查询="SELECT COUNT(*) FROM fact_orders WHERE total_amount < 0",
        threshold=0,
        severity="critical",
    ),
    QualityCheck(
        name="duplicate_orders",
        查询="SELECT COUNT(*) - COUNT(DISTINCT order_id) FROM fact_orders",
        threshold=0,
        severity="warning",
    ),
    QualityCheck(
        name="freshness",
        查询="SELECT EXTRACT(EPOCH FROM NOW() - MAX(loaded_at))/3600 FROM fact_orders",
        threshold=2.0,
        severity="warning",
    ),
]

def run_quality_checks(db, checks: list[QualityCheck]) -> list[dict]:
    results = []
    for check in checks:
        value = db.fetch_scalar(check.查询)
        passed = value <= check.threshold
        results.append({
            "name": check.name,
            "value": value,
            "threshold": check.threshold,
            "passed": passed,
            "severity": check.severity,
        })
        if not passed and check.severity == "critical":
            raise DataQualityError(f"Critical check failed: {check.name} = {value}")
    return results
```

## Data Warehouse 架构 (Star 架构)

```sql
CREATE TABLE dim_customers (
    customer_key    BIGINT PRIMARY KEY,
    customer_id     VARCHAR(50) NOT NULL,
    name            VARCHAR(200),
    segment         VARCHAR(50),
    country         VARCHAR(100),
    valid_from      TIMESTAMP NOT NULL,
    valid_to        TIMESTAMP,
    is_current      BOOLEAN DEFAULT TRUE
);

CREATE TABLE dim_products (
    product_key     BIGINT PRIMARY KEY,
    product_id      VARCHAR(50) NOT NULL,
    name            VARCHAR(200),
    category        VARCHAR(100),
    subcategory     VARCHAR(100)
);

CREATE TABLE fact_orders (
    order_key       BIGINT PRIMARY KEY,
    order_id        VARCHAR(50) UNIQUE NOT NULL,
    customer_key    BIGINT REFERENCES dim_customers(customer_key),
    product_key     BIGINT REFERENCES dim_products(product_key),
    order_date_key  INT,
    quantity        INT,
    unit_price      DECIMAL(10,2),
    total_amount    DECIMAL(12,2),
    loaded_at       TIMESTAMP DEFAULT NOW()
);
```

## 反模式

- 逐行处理数据，而非批处理或集合处理
- 未按日期或类别对大型表进行分区
- 管道阶段之间缺少数据质量检查
- 未经过转换直接将原始数据加载到仓库
- 在增量加载足够时使用全表扫描
- 未跟踪数据血缘（数据来源、处理时间）

## 检查清单

- [ ] 管道遵循提取-转换-加载模式，阶段分离清晰
- [ ] 基于水印或变更数据捕获的增量处理
- [ ] 每个管道阶段后运行数据质量检查
- [ ] 仓库使用星型或雪花型架构，包含维表和事实表
- [ ] Spark 任务使用自适应查询执行和适当的分区
- [ ] 幂等加载（重新运行产生相同结果）
- [ ] 通过自动告警监控数据新鲜度
- [ ] 优雅处理架构演变（优先使用添加式变更）
