---
name: mtls-configuration
description: "为零信任服务间通信配置双向 TLS (mTLS)。适用于实现零信任网络、证书管理或保护内部服务通信。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# mTLS Configuration

Comprehensive guide to implementing mutual TLS for zero-trust service mesh communication.

## Do not use this skill when

- The task is unrelated to mtls configuration
- You need a different domain or tool outside this scope

## Instructions

- Clarify goals, constraints, and required inputs.
- Apply relevant best practices and validate outcomes.
- Provide actionable steps and verification.
- If detailed examples are required, open `resources/implementation-playbook.md`.

## Use this skill when

- Implementing zero-trust networking
- Securing service-to-service communication
- Certificate rotation and management
- Debugging TLS handshake issues
- Compliance requirements (PCI-DSS, HIPAA)
- Multi-cluster secure communication

## Core Concepts

### 1. mTLS Flow

```
┌─────────┐                              ┌─────────┐
│ Service │                              │ Service │
│    A    │                              │    B    │
└────┬────┘                              └────┬────┘
     │                                        │
┌────┴────┐      TLS Handshake          ┌────┴────┐
│  Proxy  │◄───────────────────────────►│  Proxy  │
│(Sidecar)│  1. ClientHello             │(Sidecar)│
│         │  2. ServerHello + Cert      │         │
│         │  3. Client Cert             │         │
│         │  4. Verify Both Certs       │         │
│         │  5. Encrypted Channel       │         │
└─────────┘                              └─────────┘
```

### 2. Certificate Hierarchy

```
Root CA (Self-signed, long-lived)
    │
    ├── Intermediate CA (Cluster-level)
    │       │
    │       ├── Workload Cert (Service A)
    │       └── Workload Cert (Service B)
    │
    └── Intermediate CA (Multi-cluster)
            │
            └── Cross-cluster certs
```

## Templates

### Template 1: Istio mTLS (Strict Mode)

```yaml
# Enable strict mTLS mesh-wide
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT
---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 32 MINUTES 43 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE