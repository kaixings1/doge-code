---
name: analyzing-security-logs-with-splunk
description:  利用 Splunk Enterprise Security 和 SPL 分析安全日志、通过日志关联、时间线重建和异常检测调查安全事件。涵盖 Windows 事件日志、防火墙日志、代理日志和认证数据分析。适用于 Splunk 调查、SPL 查询、SIEM 日志分析、安全事件关联或基于日志的事件响应。
  investigation.

  '
domain: cybersecurity
subdomain: incident-response
tags:
- splunk
- SPL
- SIEM
- log-analysis
- security-monitoring
mitre_attack:
- T1110
- T1550.002
- T1021.001
- T1059.001
- T1003.001
version: 1.0.0
author: mahipal
license: Apache-2.0
atlas_techniques:
- AML.T0070
- AML.T0066
- AML.T0082
d3fend_techniques:
- Executable Denylisting
- Execution Isolation
- File Metadata Consistency Validation
- Content Format Conversion
- File Content Analysis
nist_ai_rmf:
- MEASURE-2.7
- MAP-5.1
- MANAGE-2.4
- MANAGE-3.1
- MEASURE-3.1
nist_csf:
- RS.MA-01
- RS.MA-02
- RS.AN-03
- RC.RP-01
---

# Analyzing Security Logs with Splunk

## When to Use

- Investigating a security incident that requires correlation across multiple log sources
- Hunting for adversary activity using known TTPs and IOCs
- Building detection rules for specific attack patterns
- Reconstructing an incident timeline from disparate log sources
- Analyzing authentication anomalies, lateral movement, or data exfiltration patterns

**Do not use** for real-time packet-level analysis; use Wireshark or Zeek for full packet capture analysis.

## Prerequisites

- Splunk Enterprise or Splunk Cloud with Enterprise Security (ES) app installed
- Log sources ingested: Windows Event Logs (via Splunk Universal Forwarder or WEF), firewall, proxy, DNS, EDR, email gateway
- Splunk CIM (Common Information Model) data models configured for normalized field names
- SPL proficiency at intermediate level or higher
- Role-based access with `search` and `accelerate_search` capabilities in Splunk

## Workflow

### Step 1: Scope the Investigation in Splunk

Define search parameters based on incident triage data:

```spl
| Set initial investigation scope
index=windows OR index=firewall OR index=proxy
  earliest="2025-11-14T00:00:00" latest="2025-11-16T00:00:00"
  (host="WKSTN-042" OR src_ip="10.1.5.42" OR user="jsmith")
| stats count by index, sourcetype, host
| sort -count
```

This query establishes which log sources contain relevant data for the investigation timeframe and affected assets.

### Step 2: Analyze Authentication Events

Investigate suspicious authentication patterns using Windows Security Event Logs:

```spl
| Detect brute force and credential stuffing
index=windows sourcetype="WinEventLog:Security" EventCode=4625
  earliest=-24h
| stats count as failed_attempts, values(src_ip) as source_ips,
  dc(src_ip) as unique_sources by TargetUserName
| where failed_attempts > 10
| sort -failed_attempts

| Detect pass-the-hash (Logon Type 9 - NewCredentials)
index=windows sourcetype="WinEventLog:Security" EventCode=4624
  Logon_Type=9
| table _time, host, TargetUserName, src_ip, LogonProcessName

| Detect lateral movement via RDP
index=windows sourcetype="WinEventLog:Security" EventCode=4624
  Logon_Type=10
| stats count, values(host) as targets by TargetUserName, src_ip
| where count > 3
| sort -count
```

### Step 3: Trace Process Execution

Use Sysmon logs to reconstruct process execution chains:

```spl
| Process creation with parent chain (Sysmon Event ID 1)
index=sysmon EventCode=1 host="WKSTN-042"
  earliest="2025-11-15T14:00:00" latest="2025-11-15T15:00:00"
| table _time, ParentImage, ParentCommandLine, Image, CommandLine, User, Hashes
| sort _time

| Detect suspicious PowerShell execution
index=sysmon EventCode=1 Image="*\\powershell.exe"
  (CommandLine="*-enc*" OR CommandLine="*-encodedcommand*"
   OR CommandLine="*downloadstring*" OR CommandLine="*iex*")
| table _time, host, User, ParentImage, CommandLine
| sort _time

| Detect LSASS credential dumping
index=sysmon EventCode=10 TargetImage="*\\lsass.exe"
  GrantedAccess=0x1010
| table _time, host, SourceImage, SourceUser, GrantedAccess
```

### Step 4: Analyze Network Activity

Correlate network logs with endpoint events:

```spl
| Detect C2 beaconing pattern
index=proxy OR index=firewall dest_ip="185.220.101.42"
| timechart span=1m count by src_ip
| where count > 0

| Detect DNS tunneling (high query volume to single domain)
index=dns
| rex field=query "(?<subdomain>[^\.]+)\.(?<domain>[^\.]+\.[^\.]+)$"
| stats count, avg(len(query)) as avg_query_len by domain, src_ip
| where count > 500 AND avg_query_len > 40
| sort -count

| Detect large data transfers (potential exfiltration)
index=proxy action=allowed
| stats sum(bytes_out) as total_bytes by src_ip, dest_ip, dest_host
| eval total_MB=round(total_bytes/1024/1024,2)
| where total_MB > 100
| sort -total_MB
```

### Step 5: Build the Incident Timeline

Reconstruct a unified timeline across all log sources:

```spl
| Unified incident timeline
index=windows OR index=sysmon OR index=proxy OR index=firewall
  (host="WKSTN-042" OR src_ip="10.1.5.42" OR user="jsmith")
  earliest="2025-11-15T14:00:00" latest="2025-11-15T16:00:00"
| eval event_summary=case(
    sourcetype=="WinEventLog:Security" AND EventCode==4624, "Logon: ".TargetUserName." from ".src_ip,
    sourcetype=="WinEventLog:Security" AND EventCode==4625, "Failed logon: ".TargetUserName,
    sourcetype=="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" AND EventCode==1,
      "Process: ".Image." by ".User,
    sourcetype=="proxy", "Web: ".http_method." ".url,
    1==1, sourcetype.": ".EventCode)
| table _time, sourcetype, host, event_summary
| sort _time
```

### Step 6: Create Detection Rules

Convert investigation findings into persistent Splunk correlation searches:

```spl
| Correlation search: PowerShell spawned by Office applications
index=sysmon EventCode=1
  Image="*\\powershell.exe"
  (ParentImage="*\\winword.exe" OR ParentImage="*\\excel.exe"
   OR ParentImage="*\\outlook.exe")
| eval severity="high"
| eval mitre_technique="T1059.001"
| collect index=notable_events
```

## Key Concepts

| Term | Definition |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 10 MINUTES 17 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE