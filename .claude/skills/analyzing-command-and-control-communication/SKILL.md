---
name: analyzing-command-and-control-communication
description:  分析恶意软件命令与控制 (C2) 通信协议，理解信标模式、
  命令结构、数据编码和基础设施。涵盖 HTTP、HTTPS、DNS 和自定义协议
  C2 分析，用于检测开发和威胁情报。适用于涉及 C2 分析、信标检测、
  C2 协议逆向工程或命令与控制基础设施映射的请求。

  '
domain: cybersecurity
subdomain: malware-analysis
tags:
- malware
- C2
- command-and-control
- beacon
- protocol-analysis
version: 1.0.0
author: mahipal
license: Apache-2.0
nist_csf:
- DE.AE-02
- RS.AN-03
- ID.RA-01
- DE.CM-01
mitre_attack:
- T1071.001
- T1573
- T1571
- T1008
- T1095
---

# Analyzing Command-and-Control Communication

## When to Use

- Reverse engineering a malware sample has revealed network communication that needs protocol analysis
- Building network-level detection signatures for a specific C2 framework (Cobalt Strike, Metasploit, Sliver)
- Mapping C2 infrastructure including primary servers, fallback domains, and dead drops
- Analyzing encrypted or encoded C2 traffic to understand the command set and data format
- Attributing malware to a threat actor based on C2 infrastructure patterns and tooling

**Do not use** for general network anomaly detection; this is specifically for understanding known or suspected C2 protocols from malware analysis.

## Prerequisites

- PCAP capture of malware network traffic (from sandbox, network tap, or full packet capture)
- Wireshark/tshark for packet-level analysis
- Reverse engineering tools (Ghidra, dnSpy) for understanding C2 code in the malware binary
- Python 3.8+ with `scapy`, `dpkt`, and `requests` for protocol analysis and replay
- Threat intelligence databases for C2 infrastructure correlation (VirusTotal, Shodan, Censys)
- JA3/JA3S fingerprint databases for TLS-based C2 identification

## Workflow

### Step 1: Identify the C2 Channel

Determine the protocol and transport used for C2 communication:

```
C2 Communication Channels:
━━━━━━━━━━━━━━━━━━━━━━━━━
HTTP/HTTPS:     Most common; uses standard web traffic to blend in
                Indicators: Regular POST/GET requests, specific URI patterns, custom headers

DNS:            Tunneling data through DNS queries and responses
                Indicators: High-volume TXT queries, long subdomain names, high entropy

Custom TCP/UDP: Proprietary binary protocol on non-standard port
                Indicators: Non-HTTP traffic on high ports, unknown protocol

ICMP:           Data encoded in ICMP echo/reply payloads
                Indicators: ICMP packets with large or non-standard payloads

WebSocket:      Persistent bidirectional connection for real-time C2
                Indicators: WebSocket upgrade followed by binary frames

Cloud Services: Using legitimate APIs (Telegram, Discord, Slack, GitHub)
                Indicators: API calls to cloud services from unexpected processes

Email:          SMTP/IMAP for C2 commands and data exfiltration
                Indicators: Automated email operations from non-email processes
```

### Step 2: Analyze Beacon Pattern

Characterize the periodic communication pattern:

```python
from scapy.all import rdpcap, IP, TCP
from collections import defaultdict
import statistics
import json

packets = rdpcap("c2_traffic.pcap")

# Group TCP SYN packets by destination
connections = defaultdict(list)
for pkt in packets:
    if IP in pkt and TCP in pkt and (pkt[TCP].flags & 0x02):
        key = f"{pkt[IP].dst}:{pkt[TCP].dport}"
        connections[key].append(float(pkt.time))

# Analyze each destination for beaconing
for dst, times in sorted(connections.items()):
    if len(times) < 3:
        continue

    intervals = [times[i+1] - times[i] for i in range(len(times)-1)]
    avg_interval = statistics.mean(intervals)
    stdev = statistics.stdev(intervals) if len(intervals) > 1 else 0
    jitter_pct = (stdev / avg_interval * 100) if avg_interval > 0 else 0
    duration = times[-1] - times[0]

    beacon_data = {
        "destination": dst,
        "connections": len(times),
        "duration_seconds": round(duration, 1),
        "avg_interval_seconds": round(avg_interval, 1),
        "stdev_seconds": round(stdev, 1),
        "jitter_percent": round(jitter_pct, 1),
        "is_beacon": 5 < avg_interval < 7200 and jitter_pct < 25,
    }

    if beacon_data["is_beacon"]:
        print(f"[!] BEACON DETECTED: {dst}")
        print(f"    Interval: {avg_interval:.0f}s +/- {stdev:.0f}s ({jitter_pct:.0f}% jitter)")
        print(f"    Sessions: {len(times)} over {duration:.0f}s")
```

### Step 3: Decode C2 Protocol Structure

Reverse engineer the message format from captured traffic:

```python
# HTTP-based C2 protocol analysis
import dpkt
import base64

with open("c2_traffic.pcap", "rb") as f:
    pcap = dpkt.pcap.Reader(f)

for ts, buf in pcap:
    eth = dpkt.ethernet.Ethernet(buf)
    if not isinstance(eth.data, dpkt.ip.IP):
        continue
    ip = eth.data
    if not isinstance(ip.data, dpkt.tcp.TCP):
        continue
    tcp = ip.data

    if tcp.dport == 80 or tcp.dport == 443:
        if len(tcp.data) > 0:
            try:
                http = dpkt.http.Request(tcp.data)
                print(f"\n---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 10 MINUTES 53 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE