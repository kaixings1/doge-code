---
name: analyzing-indicators-of-compromise
description:  分析入侵指标 (IOC)，包括 IP 地址、域名、文件哈希、URL 和电子邮件
  工件，以确定恶意置信度、活动归因和阻止优先级。适用于对钓鱼邮件、安全告警或
  外部威胁源的 IOC 进行分类，以及用多源情报丰富原始 IOC。
  intelligence; or making block/monitor/whitelist decisions. Activates for requests
  involving VirusTotal, AbuseIPDB, MalwareBazaar, MISP, or IOC enrichment pipelines.

  '
domain: cybersecurity
subdomain: threat-intelligence
tags:
- IOC
- VirusTotal
- AbuseIPDB
- MalwareBazaar
- MISP
- threat-intelligence
- STIX
- NIST-CSF
version: 1.0.0
author: mahipal
license: Apache-2.0
atlas_techniques:
- AML.T0052
nist_csf:
- ID.RA-01
- ID.RA-05
- DE.CM-01
- DE.AE-02
mitre_attack:
- T1071
- T1105
- T1041
- T1567
mitre_f3:
  version: '1.1'
  tactics:
  - reconnaissance
  - resource-development
  - initial-access
  techniques:
  - id: T1598
    name: Phishing for Information
    tactic: reconnaissance
    source: attack
  - id: T1660
    name: Phishing
    tactic: initial-access
    source: attack
  - id: T1583.001
    name: 'Acquire Infrastructure: Domains'
    tactic: resource-development
    source: attack
  - id: F1020.002
    name: 'Create Fake Materials: Fake Website'
    tactic: resource-development
    source: f3
---
# Analyzing Indicators of Compromise

## When to Use

Use this skill when:
- A phishing email or alert generates IOCs (URLs, IP addresses, file hashes) requiring rapid triage
- Automated feeds deliver bulk IOCs that need confidence scoring before ingestion into blocking controls
- An incident investigation requires contextual enrichment of observed network artifacts

**Do not use** this skill in isolation for high-stakes blocking decisions — always combine automated enrichment with analyst judgment, especially for shared infrastructure (CDNs, cloud providers).

## Prerequisites

- VirusTotal API key (free or Enterprise) for multi-AV and sandbox lookup
- AbuseIPDB API key for IP reputation checks
- MISP instance or TIP for cross-referencing against known campaigns
- Python with `requests` and `vt-py` libraries, or SOAR platform with pre-built connectors

## Workflow

### Step 1: Normalize and Classify IOC Types

Before enriching, classify each IOC:
- **IPv4/IPv6 address**: Check if RFC 1918 private (skip external enrichment), validate format
- **Domain/FQDN**: Defang for safe handling (`evil[.]com`), extract registered domain via tldextract
- **URL**: Extract domain + path separately; check for redirectors
- **File hash**: Identify hash type (MD5/SHA-1/SHA-256); prefer SHA-256 for uniqueness
- **Email address**: Split into domain (check MX/DMARC) and local part for pattern analysis

Defang IOCs in documentation (replace `.` with `[.]` and `://` with `[://]`) to prevent accidental clicks.

### Step 2: Multi-Source Enrichment

**VirusTotal (file hash, URL, IP, domain)**:
```python
import vt

client = vt.Client("YOUR_VT_API_KEY")

# File hash lookup
file_obj = client.get_object(f"/files/{sha256_hash}")
detections = file_obj.last_analysis_stats
print(f"Malicious: {detections['malicious']}/{sum(detections.values())}")

# Domain analysis
domain_obj = client.get_object(f"/domains/{domain}")
print(domain_obj.last_analysis_stats)
print(domain_obj.reputation)
client.close()
```

**AbuseIPDB (IP addresses)**:
```python
import requests

response = requests.get(
    "https://api.abuseipdb.com/api/v2/check",
    headers={"Key": "YOUR_KEY", "Accept": "application/json"},
    params={"ipAddress": "1.2.3.4", "maxAgeInDays": 90}
)
data = response.json()["data"]
print(f"Confidence: {data['abuseConfidenceScore']}%, Reports: {data['totalReports']}")
```

**MalwareBazaar (file hashes)**:
```python
response = requests.post(
    "https://mb-api.abuse.ch/api/v1/",
    data={"query": "get_info", "hash": sha256_hash}
)
result = response.json()
if result["query_status"] == "ok":
    print(result["data"][0]["tags"], result["data"][0]["signature"])
```

### Step 3: Contextualize with Campaign Attribution

Query MISP for existing events matching the IOC:
```python
from pymisp import PyMISP

misp = PyMISP("https://misp.example.com", "API_KEY")
results = misp.search(value="evil-domain.com", type_attribute="domain")
for event in results:
    print(event["Event"]["info"], event["Event"]["threat_level_id"])
```

Check Shodan for IP context (hosting provider, open ports, banners) to identify if the IP belongs to bulletproof hosting or a legitimate cloud provider (false positive risk).

### Step 4: Assign Confidence Score and Disposition

Apply a tiered decision framework:
- **Block (High Confidence ≥ 70%)**: ≥15 AV detections on VT, AbuseIPDB score ≥70, matches known malware family or campaign
- **Monitor/Alert (Medium 40–69%)**: 5–14 AV detections, moderate AbuseIPDB score, no campaign attribution
- **Whitelist/Investigate (Low <40%)**: ≤4 AV detections, no abuse reports, legitimate service (Google, Cloudflare CDN IPs)
- **False Positive**: Legitimate business service incorrectly flagged; document and exclude from future alerts

### Step 5: Document and Distribute

Record findings in TIP/MISP with:
- All enrichment data collected (timestamps, source, score)
- Disposition decision and rationale
- Blocking actions taken (firewall, proxy, DNS sinkhole)
- Related incident ticket number

Export to STIX indicator object with confidence field set appropriately.

## Key Concepts

| Term | Definition |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 10 MINUTES 45 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE