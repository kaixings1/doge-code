---
name: acquiring-disk-image-with-dd-and-dcfldd
description: 使用 dd 和 dcfldd 创建取证级逐位磁盘镜像，通过哈希验证确保证据完整性。
domain: cybersecurity
subdomain: digital-forensics
tags:
- forensics
- disk-imaging
- evidence-acquisition
- dd
- dcfldd
- hash-verification
version: '1.0'
author: mahipal
license: Apache-2.0
nist_csf:
- RS.AN-01
- RS.AN-03
- DE.AE-02
- RS.MA-01
mitre_attack:
- T1006
- T1005
- T1025
- T1074.001
---

# 使用 dd 和 dcfldd 获取磁盘镜像

## 何时使用
- 当需要为调查创建可疑驱动器的取证副本时
- 在事件响应期间，分析前保存易失性磁盘证据时
- 当执法或法律程序需要经过验证的逐位副本时
- 在对存储设备执行任何破坏性分析之前
- 当从物理驱动器、USB设备或存储卡获取镜像时

## 前提条件
- 基于Linux的取证工作站（SIFT、Kali或任何Linux发行版）
- `dd`（所有Linux系统预装）或`dcfldd`（增强的取证版本）
- 写阻止器硬件或配置的软件写阻止
- 具有足够存储空间的目标驱动器（大于源驱动器）
- 取证工作站上的root/sudo权限
- SHA-256或MD5哈希工具（`sha256sum`、`md5sum`）

## Workflow

### Step 1: Identify the Target Device and Enable Write Protection

```bash
# List all connected block devices to identify the target
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL

# Verify the device details
fdisk -l /dev/sdb

# Enable software write-blocking (if no hardware blocker)
blockdev --setro /dev/sdb

# Verify read-only status
blockdev --getro /dev/sdb
# Output: 1 (means read-only is enabled)

# Alternatively, use udev rules for persistent write-blocking
echo 'SUBSYSTEM=="block", ATTRS{serial}=="WD-WCAV5H861234", ATTR{ro}="1"' > /etc/udev/rules.d/99-writeblock.rules
udevadm control --reload-rules
```

### Step 2: Prepare the Destination and Document the Source

```bash
# Create case directory structure
mkdir -p /cases/case-2024-001/{images,hashes,logs,notes}

# Document source drive information
hdparm -I /dev/sdb > /cases/case-2024-001/notes/source_drive_info.txt

# Record the serial number and model
smartctl -i /dev/sdb >> /cases/case-2024-001/notes/source_drive_info.txt

# Pre-hash the source device
sha256sum /dev/sdb | tee /cases/case-2024-001/hashes/source_hash_before.txt
```

### Step 3: Acquire the Image Using dd

```bash
# Basic dd acquisition with progress and error handling
dd if=/dev/sdb of=/cases/case-2024-001/images/evidence.dd \
   bs=4096 \
   conv=noerror,sync \
   status=progress 2>&1 | tee /cases/case-2024-001/logs/dd_acquisition.log

# For compressed images to save space
dd if=/dev/sdb bs=4096 conv=noerror,sync status=progress | \
   gzip -c > /cases/case-2024-001/images/evidence.dd.gz

# Using dd with a specific count for partial acquisition
dd if=/dev/sdb of=/cases/case-2024-001/images/first_1gb.dd \
   bs=1M count=1024 status=progress
```

### Step 4: Acquire Using dcfldd (Preferred Forensic Method)

```bash
# Install dcfldd if not present
apt-get install dcfldd

# Acquire image with built-in hashing and split output
dcfldd if=/dev/sdb \
   of=/cases/case-2024-001/images/evidence.dd \
   hash=sha256,md5 \
   hashwindow=1G \
   hashlog=/cases/case-2024-001/hashes/acquisition_hashes.txt \
   bs=4096 \
   conv=noerror,sync \
   errlog=/cases/case-2024-001/logs/dcfldd_errors.log

# Split large images into manageable segments
dcfldd if=/dev/sdb \
   of=/cases/case-2024-001/images/evidence.dd \
   hash=sha256 \
   hashlog=/cases/case-2024-001/hashes/split_hashes.txt \
   bs=4096 \
   split=2G \
   splitformat=aa

# Acquire with verification pass
dcfldd if=/dev/sdb \
   of=/cases/case-2024-001/images/evidence.dd \
   hash=sha256 \
   hashlog=/cases/case-2024-001/hashes/verification.txt \
   vf=/cases/case-2024-001/images/evidence.dd \
   verifylog=/cases/case-2024-001/logs/verify.log
```

### Step 5: Verify Image Integrity

```bash
# Hash the acquired image
sha256sum /cases/case-2024-001/images/evidence.dd | \
   tee /cases/case-2024-001/hashes/image_hash.txt

# Compare source and image hashes
diff <(sha256sum /dev/sdb | awk '{print $1}') \
     <(sha256sum /cases/case-2024-001/images/evidence.dd | awk '{print $1}')

# If using split images, verify each segment
sha256sum /cases/case-2024-001/images/evidence.dd.* | \
   tee /cases/case-2024-001/hashes/split_image_hashes.txt

# Re-hash source to confirm no changes occurred
sha256sum /dev/sdb | tee /cases/case-2024-001/hashes/source_hash_after.txt
diff /cases/case-2024-001/hashes/source_hash_before.txt \
     /cases/case-2024-001/hashes/source_hash_after.txt
```

### Step 6: Document the Acquisition Process

```bash
# Generate acquisition report
cat << 'EOF' > /cases/case-2024-001/notes/acquisition_report.txt
DISK IMAGE ACQUISITION REPORT
==============================
Case Number: 2024-001
Date/Time: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Examiner: [Name]

Source Device: /dev/sdb
Model: [from hdparm output]
Serial: [from hdparm output]
Size: [from fdisk output]

Acquisition Tool: dcfldd v1.9.1
Block Size: 4096
Write Blocker: [Hardware/Software model]

Image File: evidence.dd
Image Hash (SHA-256): [from hash file]
Source Hash (SHA-256): [from hash file]
Hash Match: YES/NO

Errors During Acquisition: [from error log]
EOF

# Compress logs for archival
tar -czf /cases/case-2024-001/acquisition_package.tar.gz \
   /cases/case-2024-001/hashes/ \
   /cases/case-2024-001/logs/ \
   /cases/case-2024-001/notes/
```

## Key Concepts

| Concept | Description |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 12 MINUTES 24 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE