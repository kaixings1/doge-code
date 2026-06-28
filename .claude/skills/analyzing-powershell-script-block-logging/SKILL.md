---
name: analyzing-powershell-script-block-logging
description:  从 EVTX 文件中解析 Windows PowerShell 脚本块日志（Event ID 4104），检测混淆命令、编码负载和 living-off-the-land 技术。使用 python-evtx 提取和重建多块脚本，应用熵分析和模式匹配检测 Base64 编码命令、Invoke-Expression 滥用、下载启动器和 AMSI 绕过尝试。
domain: cybersecurity
subdomain: security-operations
tags:
- powershell
- script-block-logging
- event-id-4104
- obfuscation-detection
- windows-forensics
- endpoint-security
version: '1.0'
author: mahipal
license: Apache-2.0
nist_csf:
- DE.CM-01
- RS.MA-01
- GV.OV-01
- DE.AE-02
mitre_attack:
- T1059.001
- T1027.010
- T1140
- T1105
---


# Analyzing PowerShell Script Block Logging


## When to Use

- When investigating security incidents that require analyzing powershell script block logging
- When building detection rules or threat hunting queries for this domain
- When SOC analysts need structured procedures for this analysis type
- When validating security monitoring coverage for related attack techniques

## Prerequisites

- Familiarity with security operations concepts and tools
- Access to a test or lab environment for safe execution
- Python 3.8+ with required dependencies installed
- Appropriate authorization for any testing activities

## Instructions

1. Install dependencies: `pip install python-evtx lxml`
2. Collect PowerShell Operational logs: `Microsoft-Windows-PowerShell%4Operational.evtx`
3. Parse Event ID 4104 entries using python-evtx to extract ScriptBlockText, ScriptBlockId, and MessageNumber/MessageTotal for multi-part script reconstruction.
4. Apply detection heuristics:
   - Base64-encoded commands (`-EncodedCommand`, `FromBase64String`)
   - Download cradles (`DownloadString`, `DownloadFile`, `Invoke-WebRequest`, `Net.WebClient`)
   - AMSI bypass patterns (`AmsiUtils`, `amsiInitFailed`)
   - Obfuscation indicators (high entropy, tick-mark insertion, string concatenation)
5. Generate a report with reconstructed scripts, risk scores, and MITRE ATT&CK mappings.

```bash
python scripts/agent.py --evtx-file /path/to/PowerShell-Operational.evtx --output ps_analysis.json
```

## Examples

### Detect Encoded Command Execution
```python
import base64
if "-encodedcommand" in script_text.lower():
    encoded = script_text.split()[-1]
    decoded = base64.b64decode(encoded).decode("utf-16-le")
```

### Reconstruct Multi-Block Script
Scripts split across multiple 4104 events share a `ScriptBlockId`. Concatenate blocks ordered by `MessageNumber` to recover the full script.
