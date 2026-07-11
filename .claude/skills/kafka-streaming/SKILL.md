---
name: Apache Kafka 流处理
description: Apache Kafka 流处理 — 生产者/消费者模式、分区策略、流式 ETL、Kafka Connect、Kafka Streams
---
# Kafka 流处理

Apache Kafka 分布式流处理平台的使用指南与实践模式。

## 使用场景

- 使用 Kafka 流处理相关技术时
- 架构决策和技术选型需要参考最佳实践时
- 构建实时数据管道、事件驱动架构或流式 ETL
- 需要高吞吐量、低延迟的消息传递时

## 核心原则

1. 遵循最佳实践
2. 注重可维护性
3. 安全性优先
4. 性能意识

## 生产者/消费者模式

### 生产者最佳实践

```java
// 推荐配置
Properties props = new Properties();
props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka:9092");
props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
props.put(ProducerConfig.ACKS_CONFIG, "all");  // 确保消息不丢失
props.put(ProducerConfig.RETRIES_CONFIG, 3);   // 重试次数
props.put(ProducerConfig.BATCH_SIZE_CONFIG, 16384);  // 批处理大小
props.put(ProducerConfig.LINGER_MS_CONFIG, 5);       // 等待更多消息
props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "snappy");  // 压缩

KafkaProducer<String, String> producer = new KafkaProducer<>(props);
```

### 消费者最佳实践

```java
Properties props = new Properties();
props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka:9092");
props.put(ConsumerConfig.GROUP_ID_CONFIG, "my-consumer-group");
props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");  // 手动提交
props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 500);       // 控制批次大小

KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
```

## 分区策略

### 分区键选择

```
user_id → 同一用户的记录进入同一分区 → 保证顺序性
session_id → 同一会话进入同一分区 → 会话内有序
timestamp → 按时间均匀分布 → 负载均衡
```

### 分区数规划

- 吞吐量原则：每个分区约 1-10 MB/s
- 消费者数 ≤ 分区数
- 目标：单分区 100MB/s 是上限
- 初期建议 3-6 个分区，后续可增加

```java
// 自定义分区器
public class CustomPartitioner implements Partitioner {
    @Override
    public int partition(String topic, Object key, byte[] keyBytes,
                         Object value, byte[] valueBytes, Cluster cluster) {
        if (key == null) {
            return ThreadLocalRandom.current().nextInt(cluster.partitionCountForTopic(topic));
        }
        return Math.abs(key.hashCode()) % cluster.partitionCountForTopic(topic);
    }
}
```

## 流式 ETL

### Kafka Streams 示例

```java
StreamsBuilder builder = new StreamsBuilder();

// 读取源主题
KStream<String, String> source = builder.stream("input-topic");

// 转换：过滤、映射、聚合
KStream<String, String> filtered = source.filter((key, value) ->
    value.contains("important")
);

KTable<String, Long> counts = filtered
    .groupBy((key, value) -> extractCategory(value))
    .count(Materialized.as("counts-store"));

// 写入目标主题
counts.toStream().to("output-topic");

KafkaStreams streams = new KafkaStreams(builder.build(), props);
streams.start();
```

### Kafka Connect（源/汇）

```json
{
  "name": "jdbc-source-connector",
  "config": {
    "connector.class": "io.confluent.connect.jdbc.JdbcSourceConnector",
    "tasks.max": "1",
    "connection.url": "jdbc:postgresql://db:5432/mydb",
    "table.whitelist": "users,orders",
    "mode": "timestamp+incrementing",
    "timestamp.column.name": "updated_at",
    "incrementing.column.name": "id",
    "topic.prefix": "db-"
  }
}
```

## 安全性配置

### ACL 权限

```bash
# 创建用户和 ACL
kafka-acls.sh --authorizer-properties zookeeper.connect=zoo:2181 \
  --add --allow-principal User:app-user --operation Read --topic orders

kafka-acls.sh --authorizer-properties zookeeper.connect=zoo:2181 \
  --add --allow-principal User:app-user --operation Write --topic orders
```

### SSL/TLS 加密

```properties
# 服务器配置
security.inter.broker.protocol=SSL
ssl.keystore.location=/var/private/ssl/kafka.server.keystore.jks
ssl.keystore.password=password
ssl.key.password=password
ssl.truststore.location=/var/private/ssl/kafka.server.truststore.jks
ssl.truststore.password=password
```

## 监控与运维

### 关键监控指标

| 指标 | 说明 | 阈值 |
|------|------|------|
| `UnderReplicatedPartitions` | 副本不足的分区数 | 应为 0 |
| `ISRShrinksPerSec` | ISR 缩小速率 | 应为 0 |
| `RequestHandlerAvgIdlePercent` | 处理线程空闲率 | > 0.3 |
| `NetworkProcessorAvgIdlePercent` | 网络线程空闲率 | > 0.3 |
| `FetchConsumerRequestQueueSize` | 消费请求队列 | < 500 |

### 常用运维命令

```bash
# 查看消费者组状态
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group my-group

# 查看主题详情
kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic my-topic

# 手动偏移重置（调试用）
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group my-group --topic my-topic --reset-offsets --to-earliest
```

## 限制

- 单分区吞吐量有限，需要合理规划
- 消息顺序仅保证在分区级别
- 消息保留需要磁盘容量和成本规划
- 跨数据中心同步（MirrorMaker 2.0）增加复杂度
- 小消息（< 1KB）批处理效率低，考虑聚合
