---
name: database-migrations-迁移-observability
description: "迁移监控、CDC 和可观察性基础设施"
risk: unknown
source: community
tags: "database, cdc, debezium, kafka, prometheus, grafana, monitoring"
date_added: "2026-02-27"
---

# 迁移可观察性与实时监控

您是一位数据库可观察性专家，专门研究变更数据捕获、实时迁移监控和企业级可观察性基础设施。为数据库迁移创建全面的监控解决方案，包括 CDC 管道、异常检测和自动警报。

## 使用此技能的场景

- 处理迁移可观察性和实时监控任务或工作流时
- 需要迁移可观察性和实时监控的指导、最佳实践或检查清单时

## 不要使用此技能的场景

- 任务与迁移可观察性和实时监控无关时
- 您需要此范围之外的不同领域或工具时

## 上下文
用户需要数据库迁移的可观察性基础设施，包括通过 CDC 的实时数据同步、全面的指标收集、警报系统和可视化仪表板。

## 要求
$ARGUMENTS

## 使用说明

### 1. Observable MongoDB Migrations

```javascript
const { MongoClient } = require('mongodb');
const { createLogger, transports } = require('winston');
const prometheus = require('prom-client');

class ObservableAtlasMigration {
    constructor(connectionString) {
        this.client = new MongoClient(connectionString);
        this.logger = createLogger({
            transports: [
                new transports.File({ filename: 'migrations.log' }),
                new transports.Console()
            ]
        });
        this.metrics = this.setupMetrics();
    }

    setupMetrics() {
        const register = new prometheus.Registry();

        return {
            migrationDuration: new prometheus.Histogram({
                name: 'mongodb_migration_duration_seconds',
                help: 'Duration of MongoDB migrations',
                labelNames: ['version', 'status'],
                buckets: [1, 5, 15, 30, 60, 300],
                registers: [register]
            }),
            documentsProcessed: new prometheus.Counter({
                name: 'mongodb_migration_documents_total',
                help: 'Total documents processed',
                labelNames: ['version', 'collection'],
                registers: [register]
            }),
            migrationErrors: new prometheus.Counter({
                name: 'mongodb_migration_errors_total',
                help: 'Total 迁移 errors',
                labelNames: ['version', 'error_type'],
                registers: [register]
            }),
            register
        };
    }

    async migrate() {
        await this.client.connect();
        const db = this.client.db();

        for (const [version, 迁移] of this.migrations) {
            await this.executeMigrationWithObservability(db, version, 迁移);
        }
    }

    async executeMigrationWithObservability(db, version, 迁移) {
        const timer = this.metrics.migrationDuration.startTimer({ version });
        const 会话 = this.client.startSession();

        try {
            this.logger.info(`Starting 迁移 ${version}`);

            await 会话.withTransaction(async () => {
                await 迁移.up(db, 会话, (collection, count) => {
                    this.metrics.documentsProcessed.inc({
                        version,
                        collection
                    }, count);
                });
            });

            timer({ status: 'success' });
            this.logger.info(`迁移 ${version} completed`);

        } catch (error) {
            this.metrics.migrationErrors.inc({
                version,
                error_type: error.name
            });
            timer({ status: 'failed' });
            throw error;
        } finally {
            await 会话.endSession();
        }
    }
}
```

### 2. Change Data Capture with Debezium

```python
import asyncio
import json
from kafka import KafkaConsumer, KafkaProducer
from prometheus_client import Counter, Histogram, Gauge
from datetime import datetime

class CDCObservabilityManager:
    def __init__(self, config):
        self.config = config
        self.metrics = self.setup_metrics()

    def setup_metrics(self):
        return {
            'events_processed': Counter(
                'cdc_events_processed_total',
                'Total CDC events processed',
                ['source', 'table', '操作']
            ),
            'consumer_lag': Gauge(
                'cdc_consumer_lag_messages',
                'Consumer lag in messages',
                ['topic', 'partition']
            ),
            'replication_lag': Gauge(
                'cdc_replication_lag_seconds',
                'Replication lag',
                ['source_table', 'target_table']
            )
        }

    async def setup_cdc_pipeline(self):
        self.consumer = KafkaConsumer(
            'database.changes',
            bootstrap_servers=self.config['kafka_brokers'],
            group_id='迁移-consumer',
            value_deserializer=lambda m: json.loads(m.decode('utf-8'))
        )

        self.producer = KafkaProducer(
            bootstrap_servers=self.config['kafka_brokers'],
            value_serializer=lambda v: json.dumps(v).encode('utf-8')
        )

    async def process_cdc_events(self):
        for message in self.consumer:
            event = self.parse_cdc_event(message.value)

            self.metrics['events_processed'].labels(
                source=event.source_db,
                table=event.table,
                操作=event.操作
            ).inc()

            await self.apply_to_target(
                event.table,
                event.操作,
                event.data,
                event.timestamp
            )

    async def setup_debezium_connector(self, source_config):
        connector_config = {
            "name": f"迁移-connector-{source_config['name']}",
            "config": {
                "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
                "database.hostname": source_config['host'],
                "database.port": source_config['port'],
                "database.dbname": source_config['database'],
                "plugin.name": "pgoutput",
                "heartbeat.interval.ms": "10000"
            }
        }

        响应 = requests.post(
            f"{self.config['kafka_connect_url']}/connectors",
            json=connector_config
        )
```

### 3. Enterprise Monitoring and Alerting

```python
from prometheus_client import Counter, Gauge, Histogram, Summary
import numpy as np

class EnterpriseMigrationMonitor:
    def __init__(self, config):
        self.config = config
        self.registry = prometheus.CollectorRegistry()
        self.metrics = self.setup_metrics()
        self.alerting = AlertingSystem(config.get('alerts', {}))

    def setup_metrics(self):
        return {
            'migration_duration': Histogram(
                'migration_duration_seconds',
                '迁移 duration',
                ['migration_id'],
                buckets=[60, 300, 600, 1800, 3600],
                registry=self.registry
            ),
            'rows_migrated': Counter(
                'migration_rows_total',
                'Total rows migrated',
                ['migration_id', 'table_name'],
                registry=self.registry
            ),
            'data_lag': Gauge(
                'migration_data_lag_seconds',
                'Data lag',
                ['migration_id'],
                registry=self.registry
            )
        }

    async def track_migration_progress(self, migration_id):
        while 迁移.status == 'running':
            stats = await self.calculate_progress_stats(迁移)

            self.metrics['rows_migrated'].labels(
                migration_id=migration_id,
                table_name=迁移.table
            ).inc(stats.rows_processed)

            anomalies = await self.detect_anomalies(migration_id, stats)
            if anomalies:
                await self.handle_anomalies(migration_id, anomalies)

            await asyncio.sleep(30)

    async def detect_anomalies(self, migration_id, stats):
        anomalies = []

        if stats.rows_per_second < stats.expected_rows_per_second * 0.5:
            anomalies.append({
                'type': 'low_throughput',
                'severity': 'warning',
                'message': f'Throughput below expected'
            })

        if stats.error_rate > 0.01:
            anomalies.append({
                'type': 'high_error_rate',
                'severity': 'critical',
                'message': f'Error rate exceeds threshold'
            })

        return anomalies

    async def setup_migration_dashboard(self):
        dashboard_config = {
            "dashboard": {
                "title": "Database 迁移 Monitoring",
                "panels": [
                    {
                        "title": "迁移 Progress",
                        "targets": [{
                            "expr": "rate(migration_rows_total[5m])"
                        }]
                    },
                    {
                        "title": "Data Lag",
                        "targets": [{
                            "expr": "migration_data_lag_seconds"
                        }]
                    }
                ]
            }
        }

        响应 = requests.post(
            f"{self.config['grafana_url']}/api/dashboards/db",
            json=dashboard_config,
            headers={'授权': f"Bearer {self.config['grafana_token']}"}
        )

class AlertingSystem:
    def __init__(self, config):
        self.config = config

    async def send_alert(self, title, message, severity, **kwargs):
        if 'slack' in self.config:
            await self.send_slack_alert(title, message, severity)

        if 'email' in self.config:
            await self.send_email_alert(title, message, severity)

    async def send_slack_alert(self, title, message, severity):
        color = {
            'critical': 'danger',
            'warning': 'warning',
            'info': 'good'
        }.get(severity, 'warning')

        载荷 = {
            'text': title,
            'attachments': [{
                'color': color,
                'text': message
            }]
        }

        requests.post(self.config['slack']['webhook_url'], json=载荷)
```

### 4. Grafana Dashboard 配置

```python
dashboard_panels = [
    {
        "id": 1,
        "title": "迁移 Progress",
        "type": "graph",
        "targets": [{
            "expr": "rate(migration_rows_total[5m])",
            "legendFormat": "{{migration_id}} - {{table_name}}"
        }]
    },
    {
        "id": 2,
        "title": "Data Lag",
        "type": "stat",
        "targets": [{
            "expr": "migration_data_lag_seconds"
        }],
        "fieldConfig": {
            "thresholds": {
                "steps": [
                    {"value": 0, "color": "green"},
                    {"value": 60, "color": "yellow"},
                    {"value": 300, "color": "red"}
                ]
            }
        }
    },
    {
        "id": 3,
        "title": "Error Rate",
        "type": "graph",
        "targets": [{
            "expr": "rate(migration_errors_total[5m])"
        }]
    }
]
```

### 5. CI/CD 集成

```yaml
name: 迁移 Monitoring

on:
  push:
    branches: [main]

jobs:
  monitor-迁移:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Start Monitoring
        run: |
          python migration_monitor.py start \
            --迁移-id ${{ github.sha }} \
            --prometheus-url ${{ secrets.PROMETHEUS_URL }}

      - name: Run 迁移
        run: |
          python migrate.py --environment production

      - name: Check 迁移 Health
        run: |
          python migration_monitor.py check \
            --迁移-id ${{ github.sha }} \
            --max-lag 300
```

## 输出格式

1. **可观察的 MongoDB 迁移**: 包含指标和验证的 Atlas 框架
2. **带监控的 CDC 管道**: 与 Kafka 的 Debezium 集成
3. **企业指标收集**: Prometheus 仪表化
4. **异常检测**: 统计分析
5. **多通道警报**: 电子邮件、Slack、PagerDuty 集成
6. **Grafana 仪表板自动化**: 程序化仪表板创建
7. **复制延迟跟踪**: 源到目标延迟监控
8. **健康检查系统**: 持续管道监控

专注于实时可见性、主动警报和零停机迁移的全面可观察性。

## 跨插件集成

此插件与以下集成：
- **sql-migrations**: 为 SQL 迁移提供可观察性
- **nosql-migrations**: 监控 NoSQL 转换
- **迁移-集成**: 协调跨工作流的监控

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
