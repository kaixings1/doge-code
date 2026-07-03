---
name: analyzing-mft-for-deleted-file-recovery
description:  分析 NTFS 主文件表（$MFT），通过检查 MFT 记录条目、$LogFile、$UsnJrnl 和 MFT 空闲空间，使用 MFTECmd、analyzeMFT 和 X-Ways Forensics 恢复已删除文件的元数据和内容。
domain: cybersecurity
subdomain: digital-forensics
tags:
- mft
- ntfs
- deleted-files
- file-recovery
- mftecmd
- usn-journal
- logfile
- mft-slack-space
- file-system-forensics
- dfir
version: '1.0'
author: mahipal
license: Apache-2.0
nist_csf:
- RS.AN-01
- RS.AN-03
- DE.AE-02
- RS.MA-01
mitre_attack:
- T1070.004
- T1070.006
- T1005
---

# Analyzing MFT for Deleted File Recovery

## Overview

The NTFS Master File Table ($MFT) is the central metadata repository for every file and directory on an NTFS volume. Each file is represented by at least one 1024-byte MFT record containing attributes such as $STANDARD_INFORMATION (timestamps, permissions), $FILE_NAME (name, parent directory, timestamps), and $DATA (file content or cluster run pointers). When a file is deleted, its MFT record is marked as inactive (InUse flag cleared) but the metadata remains until the entry is reallocated by a new file. This persistence makes MFT analysis a primary technique for recovering deleted file evidence, reconstructing file system timelines, and detecting anti-forensic activity such as timestomping.


## When to Use

- When investigating security incidents that require analyzing mft for deleted file recovery
- When building detection rules or threat hunting queries for this domain
- When SOC analysts need structured procedures for this analysis type
- When validating security monitoring coverage for related attack techniques

## Prerequisites

- Forensic disk image (E01, raw/dd, VMDK, or VHDX format)
- MFTECmd (Eric Zimmerman) or analyzeMFT (Python-based)
- FTK Imager, Arsenal Image Mounter, or similar for image mounting
- Timeline Explorer or Excel for CSV analysis
- Python 3.8+ for custom analysis scripts
- Understanding of NTFS file system internals

## MFT Structure and Record Layout

### MFT Record Header

Each MFT record begins with the signature "FILE" (0x46494C45) and contains:

| Offset | Size | Field |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 10 MINUTES 33 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE