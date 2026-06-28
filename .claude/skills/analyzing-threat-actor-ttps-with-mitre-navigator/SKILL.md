---
name: analyzing-threat-actor-ttps-with-mitre-navigator
description:  使用 MITRE ATT&CK Navigator 和 attackcti Python 库将 APT 组织的战术、技术和程序 (TTP) 映射到 MITRE ATT&CK 框架。分析师查询 STIX/TAXII 数据以获取组织-技术关联，生成 Navigator 层文件用于可视化，并将防御覆盖与对手画像进行比较。适用于 APT TTP 映射、ATT&CK 分析。
  Navigator layers, threat actor profiling, or MITRE technique coverage analysis.

  '
domain: cybersecurity
subdomain: threat-intelligence
tags:
- mitre-attack
- navigator
- threat-intelligence
- apt
- ttp-mapping
- stix
- attackcti
version: '1.0'
author: mahipal
license: Apache-2.0
nist_ai_rmf:
- MEASURE-2.7
- MAP-5.1
- MANAGE-2.4
atlas_techniques:
- AML.T0070
- AML.T0066
- AML.T0082
d3fend_techniques:
- File Metadata Consistency Validation
- Application Protocol Command Analysis
- Identifier Analysis
- Content Format Conversion
- Message Analysis
nist_csf:
- ID.RA-01
- ID.RA-05
- DE.CM-01
- DE.AE-02
mitre_attack:
- T1566.001
- T1059.001
- T1071.001
- T1547.001
- T1053.005
---
# Analyzing Threat Actor TTPs with MITRE Navigator

## Overview

The MITRE ATT&CK Navigator is a web application for annotating and visualizing ATT&CK matrices.
Combined with the attackcti Python library (which queries ATT&CK STIX data via TAXII), analysts
can programmatically generate Navigator layer files mapping specific threat group TTPs, compare
multiple groups, and assess detection coverage gaps against known adversaries.


## When to Use

- When investigating security incidents that require analyzing threat actor ttps with mitre navigator
- When building detection rules or threat hunting queries for this domain
- When SOC analysts need structured procedures for this analysis type
- When validating security monitoring coverage for related attack techniques

## Prerequisites

- Python 3.8+ with attackcti and stix2 libraries installed
- MITRE ATT&CK Navigator (web UI or local instance)
- Understanding of STIX 2.1 objects and relationships

## Steps

1. Query ATT&CK STIX data for target threat group using attackcti
2. Extract techniques associated with the group via STIX relationships
3. Generate ATT&CK Navigator layer JSON with technique annotations
4. Overlay detection coverage to identify gaps
5. Export layer for team review and defensive planning

## Expected Output

```json
{
  "name": "APT29 TTPs",
  "domain": "enterprise-attack",
  "techniques": [
    {"techniqueID": "T1566.001", "score": 1, "comment": "Spearphishing Attachment"},
    {"techniqueID": "T1059.001", "score": 1, "comment": "PowerShell"}
  ]
}
```
