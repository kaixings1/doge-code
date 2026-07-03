---
name: analyzing-prefetch-files-for-execution-history
description:  解析 Windows Prefetch 文件以确定程序执行历史，包括运行计数、时间戳和引用的文件，用于取证调查。
domain: cybersecurity
subdomain: digital-forensics
tags:
- forensics
- prefetch
- windows-artifacts
- execution-history
- timeline-analysis
- evidence-collection
version: '1.0'
author: mahipal
license: Apache-2.0
nist_csf:
- RS.AN-01
- RS.AN-03
- DE.AE-02
- RS.MA-01
mitre_attack:
- T1059.001
- T1003.001
- T1021.002
- T1567.002
---

# Analyzing Prefetch Files for Execution History

## When to Use
- When determining which programs were executed on a Windows system and when
- During malware investigations to confirm execution of suspicious binaries
- For establishing a timeline of application usage during an incident
- When correlating program execution with other forensic artifacts
- To identify anti-forensic tools or unauthorized software that was run

## Prerequisites
- Access to Windows Prefetch directory (C:\Windows\Prefetch\) from forensic image
- PECmd (Eric Zimmerman), WinPrefetchView, or python-prefetch parser
- Understanding of Prefetch file format (versions 17, 23, 26, 30)
- Windows system with Prefetch enabled (default on client OS, disabled on servers)
- Knowledge of Prefetch naming conventions (APPNAME-HASH.pf)

## Workflow

### Step 1: Extract Prefetch Files from Forensic Image

```bash
# Mount the forensic image
mount -o ro,loop,offset=$((2048*512)) /cases/case-2024-001/images/evidence.dd /mnt/evidence

# Copy all prefetch files
mkdir -p /cases/case-2024-001/prefetch/
cp /mnt/evidence/Windows/Prefetch/*.pf /cases/case-2024-001/prefetch/

# Count and list prefetch files
ls -la /cases/case-2024-001/prefetch/ | wc -l
ls -la /cases/case-2024-001/prefetch/ | head -30

# Hash all prefetch files for integrity
sha256sum /cases/case-2024-001/prefetch/*.pf > /cases/case-2024-001/prefetch/pf_hashes.txt

# Note: Prefetch filename format is EXECUTABLE_NAME-XXXXXXXX.pf
# The hash (XXXXXXXX) is based on the executable path
# Same executable from different paths creates different prefetch files
```

### Step 2: Parse Prefetch Files with PECmd

```bash
# Using Eric Zimmerman's PECmd (Windows or via Mono/Wine on Linux)
# Download from https://ericzimmerman.github.io/

# Parse a single prefetch file
PECmd.exe -f "C:\cases\prefetch\POWERSHELL.EXE-A]B2C3D4.pf"

# Parse all prefetch files and output to CSV
PECmd.exe -d "C:\cases\prefetch\" --csv "C:\cases\analysis\" --csvf prefetch_results.csv

# Parse with JSON output
PECmd.exe -d "C:\cases\prefetch\" --json "C:\cases\analysis\" --jsonf prefetch_results.json

# Output includes for each file:
# - Executable name and path
# - Run count
# - Last run time (up to 8 timestamps in Windows 10)
# - Files and directories referenced during execution
# - Volume information (serial number, creation date)
# - Prefetch file creation time
```

### Step 3: Parse with Python for Linux-Based Analysis

```bash
pip install prefetch

python3 << 'PYEOF'
import os
import json
from datetime import datetime

# Parse prefetch files using python
import struct

def parse_prefetch(filepath):
    """Parse a Windows Prefetch file."""
    with open(filepath, 'rb') as f:
        data = f.read()

    # Check for MAM compressed format (Windows 10)
    if data[:4] == b'MAM\x04':
        import lznt1  # or use DecompressBuffer
        # Windows 10 prefetch files are compressed
        print(f"  [Compressed Win10 format - use PECmd for full parsing]")
        return None

    # Version 17 (XP), 23 (Vista/7), 26 (8.1), 30 (10)
    version = struct.unpack('<I', data[0:4])[0]
    signature = data[4:8]

    if signature != b'SCCA':
        print(f"  Invalid prefetch signature")
        return None

    file_size = struct.unpack('<I', data[8:12])[0]
    exec_name = data[16:76].decode('utf-16-le').strip('\x00')
    run_count = struct.unpack('<I', data[208:212])[0] if version >= 23 else struct.unpack('<I', data[144:148])[0]

    result = {
        'version': version,
        'executable': exec_name,
        'file_size': file_size,
        'run_count': run_count,
    }

    # Extract last execution timestamps
    if version == 23:  # Vista/7 - 1 timestamp
        ts = struct.unpack('<Q', data[128:136])[0]
        result['last_run'] = filetime_to_datetime(ts)
    elif version >= 26:  # Win8+ - up to 8 timestamps
        timestamps = []
        for i in range(8):
            ts = struct.unpack('<Q', data[128+i*8:136+i*8])[0]
            if ts > 0:
                timestamps.append(filetime_to_datetime(ts))
        result['last_run_times'] = timestamps

    return result

def filetime_to_datetime(ft):
    """Convert Windows FILETIME to datetime string."""
    if ft == 0:
        return None
    timestamp = (ft - 116444736000000000) / 10000000
    try:
        return datetime.utcfromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S UTC')
    except (OSError, ValueError):
        return None

# Process all prefetch files
prefetch_dir = '/cases/case-2024-001/prefetch/'
results = []

for filename in sorted(os.listdir(prefetch_dir)):
    if filename.lower().endswith('.pf'):
        filepath = os.path.join(prefetch_dir, filename)
        print(f"\n=== {filename} ===")
        result = parse_prefetch(filepath)
        if result:
            print(f"  Executable: {result['executable']}")
            print(f"  Run Count:  {result['run_count']}")
            if 'last_run' in result:
                print(f"  Last Run:   {result['last_run']}")
            elif 'last_run_times' in result:
                for i, ts in enumerate(result['last_run_times']):
                    print(f"  Run Time {i+1}: {ts}")
            results.append(result)

# Save results
with open('/cases/case-2024-001/analysis/prefetch_analysis.json', 'w') as f:
    json.dump(results, f, indent=2)
PYEOF
```

### Step 4: Identify Suspicious Execution Evidence

```bash
# Search for known malicious tool names in prefetch
ls /cases/case-2024-001/prefetch/ | grep -iE \
   '(MIMIKATZ|PSEXEC|WMIC|COBALT|BEACON|PWDUMP|PROCDUMP|LAZAGNE|RUBEUS|BLOODHOUND|SHARPHOUND|CERTUTIL|BITSADMIN)'

# Search for script interpreters (potential malicious execution)
ls /cases/case-2024-001/prefetch/ | grep -iE \
   '(POWERSHELL|CMD\.EXE|WSCRIPT|CSCRIPT|MSHTA|REGSVR32|RUNDLL32|MSIEXEC)'

# Search for remote access tools
ls /cases/case-2024-001/prefetch/ | grep -iE \
   '(TEAMVIEWER|ANYDESK|LOGMEIN|VNC|SPLASHTOP|SCREENCONNECT|AMMYY)'

# Search for data exfiltration tools
ls /cases/case-2024-001/prefetch/ | grep -iE \
   '(RAR|7Z|ZIP|RCLONE|MEGA|DROPBOX|ONEDRIVE|GDRIVE|FTP|CURL|WGET)'

# Find recently created prefetch files (newest executables run)
ls -lt /cases/case-2024-001/prefetch/ | head -20

# Cross-reference with Shimcache and Amcache for confirmation
# Prefetch existence = program was executed at least once
```

### Step 5: Build Execution Timeline

```bash
# Create timeline from prefetch data
python3 << 'PYEOF'
import json
import csv

with open('/cases/case-2024-001/analysis/prefetch_analysis.json') as f:
    data = json.load(f)

timeline = []
for entry in data:
    if 'last_run_times' in entry:
        for ts in entry['last_run_times']:
            if ts:
                timeline.append({
                    'timestamp': ts,
                    'executable': entry['executable'],
                    'run_count': entry['run_count'],
                    'source': 'Prefetch'
                })
    elif 'last_run' in entry and entry['last_run']:
        timeline.append({
            'timestamp': entry['last_run'],
            'executable': entry['executable'],
            'run_count': entry['run_count'],
            'source': 'Prefetch'
        })

# Sort chronologically
timeline.sort(key=lambda x: x['timestamp'])

# Write timeline CSV
with open('/cases/case-2024-001/analysis/execution_timeline.csv', 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=['timestamp', 'executable', 'run_count', 'source'])
    writer.writeheader()
    writer.writerows(timeline)

# Print suspicious time window
for entry in timeline:
    if '2024-01-15' in entry['timestamp'] or '2024-01-16' in entry['timestamp']:
        print(f"  {entry['timestamp']} | {entry['executable']} (x{entry['run_count']})")
PYEOF
```

## Key Concepts

| Concept | Description |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 10 MINUTES 24 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE