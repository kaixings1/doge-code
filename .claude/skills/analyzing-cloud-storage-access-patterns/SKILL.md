---
name: analyzing-cloud-storage-access-patterns
description:  通过分析 CloudTrail Data Events、GCS 审计日志和 Azure 存储分析，
  检测 AWS S3、GCS 和 Azure Blob Storage 中的异常访问模式。
  使用统计基线和时序异常检测识别下班后批量下载、新 IP 地址访问、
  异常 API 调用（GetObject 激增）和潜在数据外泄。
domain: cybersecurity
subdomain: cloud-security
tags:
- cloud-security
- aws-s3
- gcs
- azure-blob-storage
- cloudtrail
- data-access-anomaly
- exfiltration-detection
version: '1.0'
author: mahipal
license: Apache-2.0
atlas_techniques:
- AML.T0024
- AML.T0056
nist_ai_rmf:
- MEASURE-2.7
- MAP-5.1
- MANAGE-2.4
nist_csf:
- PR.IR-01
- ID.AM-08
- GV.SC-06
- DE.CM-01
mitre_attack:
- T1530
- T1567.002
- T1619
- T1078.004
- T1048
---


# Analyzing Cloud Storage Access Patterns


## When to Use

- When investigating security incidents that require analyzing cloud storage access patterns
- When building detection rules or threat hunting queries for this domain
- When SOC analysts need structured procedures for this analysis type
- When validating security monitoring coverage for related attack techniques

## Prerequisites

- Familiarity with cloud security concepts and tools
- Access to a test or lab environment for safe execution
- Python 3.8+ with required dependencies installed
- Appropriate authorization for any testing activities

## Instructions

1. Install dependencies: `pip install boto3 requests`
2. Query CloudTrail for S3 Data Events using AWS CLI or boto3.
3. Build access baselines: hourly request volume, per-user object counts, source IP history.
4. Detect anomalies:
   - After-hours access (outside 8am-6pm local time)
   - Bulk downloads: >100 GetObject calls from single principal in 1 hour
   - New source IPs not seen in the prior 30 days
   - ListBucket enumeration spikes (reconnaissance indicator)
5. Generate prioritized findings report.

```bash
python scripts/agent.py --bucket my-sensitive-data --hours-back 24 --output s3_access_report.json
```

## Examples

### CloudTrail S3 Data Event
```json
{"eventName": "GetObject", "requestParameters": {"bucketName": "sensitive-data", "key": "financials/q4.xlsx"},
 "sourceIPAddress": "203.0.113.50", "userIdentity": {"arn": "arn:aws:iam::123456789012:user/analyst"}}
```
