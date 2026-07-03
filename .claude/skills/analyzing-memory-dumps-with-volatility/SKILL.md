---
name: analyzing-memory-dumps-with-volatility
description:  使用 Volatility 框架分析受损系统的 RAM 内存转储，识别恶意进程、注入代码、网络连接、加载的模块和提取的凭证。支持 Windows、Linux 和 macOS 内存取证。适用于内存取证、RAM 分析、易失数据检查、进程注入检测或常驻内存恶意软件调查。

  '
domain: cybersecurity
subdomain: malware-analysis
tags:
- malware
- memory-forensics
- Volatility
- RAM-analysis
- incident-response
mitre_attack:
- T1055
- T1003
- T1059
- T1620
version: 1.0.0
author: mahipal
license: Apache-2.0
nist_csf:
- DE.AE-02
- RS.AN-03
- ID.RA-01
- DE.CM-01
---

# Analyzing Memory Dumps with Volatility

## When to Use

- A compromised system's RAM has been captured and needs forensic analysis for malware artifacts
- Detecting fileless malware that exists only in memory without persistent disk artifacts
- Extracting encryption keys, passwords, or decrypted configuration from process memory
- Identifying process injection, DLL injection, or process hollowing in a compromised system
- Analyzing rootkit activity that hides from standard disk-based forensic tools

**Do not use** for disk image analysis; use Autopsy, FTK, or Sleuth Kit for disk forensics.

## Prerequisites

- Volatility 3 installed (`pip install volatility3`) with symbol tables for target OS
- Memory dump file acquired from the target system (using WinPmem, LiME, or DumpIt)
- Knowledge of the source OS version for correct profile/symbol selection
- Sufficient disk space (memory dumps can be 4-64 GB)
- YARA rules for scanning memory for known malware signatures
- Strings utility for extracting readable strings from memory regions

## Workflow

### Step 1: Identify the Memory Dump Profile

Determine the operating system and version from the memory dump:

```bash
# Volatility 3: Automatic OS detection
vol3 -f memory.dmp windows.info

# List available plugins
vol3 -f memory.dmp --help

# If symbols are needed, download from:
# https://downloads.volatilityfoundation.org/volatility3/symbols/

# For Volatility 2 (legacy):
vol2 -f memory.dmp imageinfo
vol2 -f memory.dmp kdbgscan
```

### Step 2: Enumerate Running Processes

List all processes and identify suspicious entries:

```bash
# List all processes
vol3 -f memory.dmp windows.pslist

# Process tree (parent-child relationships)
vol3 -f memory.dmp windows.pstree

# Scan for hidden/unlinked processes (rootkit detection)
vol3 -f memory.dmp windows.psscan

# Compare pslist vs psscan to find hidden processes
# Processes in psscan but not pslist are potentially hidden by rootkits

# Check for process hollowing
vol3 -f memory.dmp windows.pslist --dump
# Then verify the dumped EXE matches the expected binary on disk
```

```
Suspicious Process Indicators:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- svchost.exe not spawned by services.exe (wrong parent)
- csrss.exe/lsass.exe with unusual parent process
- Multiple instances of lsass.exe (should be only one)
- Processes with misspelled names (scvhost.exe, lssas.exe)
- cmd.exe or powershell.exe spawned by WINWORD.EXE or browser
- Processes running from unusual paths (%TEMP%, %APPDATA%)
- Processes with no parent (orphaned - parent terminated)
```

### Step 3: Detect Malicious Code Injection

Scan for injected code and process hollowing:

```bash
# Detect injected code in processes (malfind)
vol3 -f memory.dmp windows.malfind

# Malfind looks for:
# - Memory regions with PAGE_EXECUTE_READWRITE protection
# - Memory regions containing PE headers (MZ/PE signature)
# - VAD (Virtual Address Descriptor) anomalies

# Dump injected memory regions for analysis
vol3 -f memory.dmp windows.malfind --dump --pid 2184

# List loaded DLLs per process
vol3 -f memory.dmp windows.dlllist --pid 2184

# Detect hollowed processes by comparing mapped image to disk
vol3 -f memory.dmp windows.hollowfind

# Scan for loaded drivers (potential rootkit drivers)
vol3 -f memory.dmp windows.driverscan

# List kernel modules
vol3 -f memory.dmp windows.modules
```

### Step 4: Analyze Network Connections

Extract active and closed network connections:

```bash
# List all network connections (active and listening)
vol3 -f memory.dmp windows.netscan

# Output columns: Offset, Protocol, LocalAddr, LocalPort, ForeignAddr, ForeignPort, State, PID, Owner

# Filter for established connections to external IPs
vol3 -f memory.dmp windows.netscan | grep ESTABLISHED

# For older Windows (XP/2003):
vol3 -f memory.dmp windows.netstat

# Cross-reference PIDs with process list
# Suspicious: svchost.exe connected to external IP on non-standard port
# Suspicious: notepad.exe or calc.exe with network connections
```

### Step 5: Extract Artifacts and Credentials

Recover sensitive data from memory:

```bash
# Dump process memory for a specific PID
vol3 -f memory.dmp windows.memmap --dump --pid 2184

# Extract command-line history
vol3 -f memory.dmp windows.cmdline

# Extract environment variables
vol3 -f memory.dmp windows.envars --pid 2184

# Registry analysis (extract Run keys for persistence)
vol3 -f memory.dmp windows.registry.printkey \
  --key "Software\Microsoft\Windows\CurrentVersion\Run"

# Extract hashed/cached credentials
vol3 -f memory.dmp windows.hashdump
vol3 -f memory.dmp windows.cachedump
vol3 -f memory.dmp windows.lsadump

# Extract clipboard contents
vol3 -f memory.dmp windows.clipboard

# File extraction from memory
vol3 -f memory.dmp windows.filescan | grep -i "payload\|malware\|suspicious"
vol3 -f memory.dmp windows.dumpfiles --virtaddr 0xFA8001234560
```

### Step 6: Scan Memory with YARA Rules

Apply YARA signatures to detect known malware in memory:

```bash
# Scan entire memory dump with YARA rules
vol3 -f memory.dmp yarascan.YaraScan --yara-file malware_rules.yar

# Scan specific process memory
vol3 -f memory.dmp yarascan.YaraScan --yara-file malware_rules.yar --pid 2184

# Built-in YARA scan for common patterns
vol3 -f memory.dmp yarascan.YaraScan --yara-rules "rule FindC2 { strings: \$s1 = \"gate.php\" condition: \$s1 }"

# Scan for encryption key material
vol3 -f memory.dmp yarascan.YaraScan --yara-rules "rule AES_Key { strings: \$sbox = { 63 7C 77 7B F2 6B 6F C5 } condition: \$sbox }"
```

### Step 7: Timeline and Report Generation

Create an analysis timeline and compile findings:

```bash
# Generate comprehensive timeline
vol3 -f memory.dmp timeliner.Timeliner --output-file timeline.csv

# Timeline includes:
# - Process creation/exit times
# - Network connection timestamps
# - Registry modification times
# - File access times

# Export process list for reporting
vol3 -f memory.dmp windows.pslist --output csv > processes.csv

# Export network connections
vol3 -f memory.dmp windows.netscan --output csv > network.csv
```

## Key Concepts

| Term | Definition |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 10 MINUTES 34 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE