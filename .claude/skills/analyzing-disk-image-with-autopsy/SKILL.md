---
name: analyzing-disk-image-with-autopsy
description:  使用 Autopsy 对磁盘镜像执行全面取证分析，
  恢复文件、检查工件并构建调查时间线。
domain: cybersecurity
subdomain: digital-forensics
tags:
- forensics
- autopsy
- disk-analysis
- sleuth-kit
- file-recovery
- artifact-analysis
version: '1.0'
author: mahipal
license: Apache-2.0
nist_csf:
- RS.AN-01
- RS.AN-03
- DE.AE-02
- RS.MA-01
mitre_attack:
- T1005
- T1074.001
- T1070.004
- T1083
---

# Analyzing Disk Image with Autopsy

## When to Use
- When you have a forensic disk image and need structured analysis of its contents
- During investigations requiring file recovery, keyword searching, and timeline analysis
- When non-technical stakeholders need visual reports from forensic evidence
- For examining file system metadata, deleted files, and embedded artifacts
- When building a comprehensive case from multiple disk images

## Prerequisites
- Autopsy 4.x installed (Windows) or Autopsy 4.x with The Sleuth Kit (Linux)
- Forensic disk image in raw (dd), E01 (EnCase), or AFF format
- Minimum 8GB RAM (16GB recommended for large images)
- Java Runtime Environment (JRE) 8+ for Autopsy
- Sufficient disk space for the Autopsy case database (2-3x image size)
- Hash databases (NSRL, known-bad hashes) for file identification

## Workflow

### Step 1: Install Autopsy and Configure Environment

```bash
# On Linux, install Sleuth Kit and Autopsy
sudo apt-get install autopsy sleuthkit

# Download Autopsy 4.x (GUI version) from official source
wget https://github.com/sleuthkit/autopsy/releases/download/autopsy-4.21.0/autopsy-4.21.0.zip
unzip autopsy-4.21.0.zip -d /opt/autopsy

# On Windows, run the MSI installer from sleuthkit.org
# Launch Autopsy
/opt/autopsy/bin/autopsy --nosplash

# For Sleuth Kit command-line analysis alongside Autopsy
sudo apt-get install sleuthkit
```

### Step 2: Create a New Case and Add the Disk Image

```
1. Launch Autopsy > "New Case"
2. Enter Case Name: "CASE-2024-001-Workstation"
3. Set Base Directory: /cases/case-2024-001/autopsy/
4. Enter Case Number, Examiner Name
5. Click "Add Data Source"
6. Select "Disk Image or VM File"
7. Browse to: /cases/case-2024-001/images/evidence.dd
8. Select Time Zone of the original system
9. Configure Ingest Modules (see Step 3)
```

```bash
# Alternatively, use Sleuth Kit CLI to verify the image first
img_stat /cases/case-2024-001/images/evidence.dd

# List partitions in the image
mmls /cases/case-2024-001/images/evidence.dd

# Output example:
# DOS Partition Table
# Offset Sector: 0
# Units are in 512-byte sectors
#      Slot    Start        End          Length       Description
#      00:  ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 10 MINUTES 50 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE