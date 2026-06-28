---
name: analyzing-kubernetes-audit-logs
description:  解析 Kubernetes API 服务器审计日志（JSON 行格式），检测 exec-into-pod、RBAC 绕过、ConfigMap/Secret 泄露和特权 Pod 创建。从审计事件模式构建威胁检测规则。适用于调查 Kubernetes 集群入侵或构建 k8s 特定的 SIEM 检测规则。

  '
domain: cybersecurity
subdomain: container-security
tags:
- kubernetes-security
- container-security
- audit-log-analysis
- rbac
- privilege-escalation
- k8s-api-server
- threat-detection
version: '1.0'
author: mahipal
license: Apache-2.0
nist_csf:
- PR.PS-01
- PR.IR-01
- ID.AM-08
- DE.CM-01
mitre_attack:
- T1610
- T1613
- T1078
- T1552.007
---

# Analyzing Kubernetes Audit Logs


## When to Use

- When investigating security incidents that require analyzing kubernetes audit logs
- When building detection rules or threat hunting queries for this domain
- When SOC analysts need structured procedures for this analysis type
- When validating security monitoring coverage for related attack techniques

## Prerequisites

- Familiarity with container security concepts and tools
- Access to a test or lab environment for safe execution
- Python 3.8+ with required dependencies installed
- Appropriate authorization for any testing activities

## Instructions

Parse Kubernetes audit log files (JSON lines format) to detect security-relevant
events including unauthorized access, privilege escalation, and data exfiltration.

```python
import json

with open("/var/log/kubernetes/audit.log") as f:
    for line in f:
        event = json.loads(line)
        verb = event.get("verb")
        resource = event.get("objectRef", {}).get("resource")
        user = event.get("user", {}).get("username")
        if verb == "create" and resource == "pods/exec":
            print(f"Pod exec by {user}")
```

Key events to detect:
1. pods/exec and pods/attach (shell into containers)
2. secrets access (get/list/watch)
3. clusterrolebindings creation (RBAC escalation)
4. Privileged pod creation
5. Anonymous or system:unauthenticated access

## Examples

```python
# Detect secret enumeration
if verb in ("get", "list") and resource == "secrets":
    print(f"Secret access: {user} -> {event['objectRef'].get('name')}")
```
