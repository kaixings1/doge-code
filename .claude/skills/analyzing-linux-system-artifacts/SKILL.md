---
name: analyzing-linux-system-artifacts
description:  检查 Linux 系统工件，包括认证日志、cron 作业、shell 历史、系统配置，以发现入侵或未授权活动的证据。
domain: cybersecurity
subdomain: digital-forensics
tags:
- forensics
- linux-forensics
- system-artifacts
- log-analysis
- persistence-detection
- incident-investigation
version: '1.0'
author: mahipal
license: Apache-2.0
nist_csf:
- RS.AN-01
- RS.AN-03
- DE.AE-02
- RS.MA-01
mitre_attack:
- T1070
- T1059.004
- T1543.002
- T1053.003
---

# Analyzing Linux System Artifacts

## When to Use
- When investigating a compromised Linux server or workstation
- For identifying persistence mechanisms (cron, systemd, SSH keys)
- When tracing user activity through shell history and authentication logs
- During incident response to determine the scope of a Linux-based breach
- For detecting rootkits, backdoors, and unauthorized modifications

## Prerequisites
- Forensic image or live access to the Linux system (read-only)
- Understanding of Linux file system hierarchy (FHS)
- Knowledge of common Linux logging locations (/var/log/)
- Tools: chkrootkit, rkhunter, AIDE, auditd logs
- Familiarity with systemd, cron, and PAM configurations
- Root access for complete artifact collection

## Workflow

### Step 1: Mount and Collect System Artifacts

```bash
# Mount forensic image read-only
mount -o ro,loop,offset=$((2048*512)) /cases/case-2024-001/images/linux_evidence.dd /mnt/evidence

# Create collection directories
mkdir -p /cases/case-2024-001/linux/{logs,config,users,persistence,network}

# Collect authentication logs
cp /mnt/evidence/var/log/auth.log* /cases/case-2024-001/linux/logs/
cp /mnt/evidence/var/log/secure* /cases/case-2024-001/linux/logs/
cp /mnt/evidence/var/log/syslog* /cases/case-2024-001/linux/logs/
cp /mnt/evidence/var/log/kern.log* /cases/case-2024-001/linux/logs/
cp /mnt/evidence/var/log/audit/audit.log* /cases/case-2024-001/linux/logs/
cp /mnt/evidence/var/log/wtmp /cases/case-2024-001/linux/logs/
cp /mnt/evidence/var/log/btmp /cases/case-2024-001/linux/logs/
cp /mnt/evidence/var/log/lastlog /cases/case-2024-001/linux/logs/
cp /mnt/evidence/var/log/faillog /cases/case-2024-001/linux/logs/

# Collect user artifacts
for user_dir in /mnt/evidence/home/*/; do
    username=$(basename "$user_dir")
    mkdir -p /cases/case-2024-001/linux/users/$username
    cp "$user_dir"/.bash_history /cases/case-2024-001/linux/users/$username/ 2>/dev/null
    cp "$user_dir"/.zsh_history /cases/case-2024-001/linux/users/$username/ 2>/dev/null
    cp -r "$user_dir"/.ssh/ /cases/case-2024-001/linux/users/$username/ 2>/dev/null
    cp "$user_dir"/.bashrc /cases/case-2024-001/linux/users/$username/ 2>/dev/null
    cp "$user_dir"/.profile /cases/case-2024-001/linux/users/$username/ 2>/dev/null
    cp "$user_dir"/.viminfo /cases/case-2024-001/linux/users/$username/ 2>/dev/null
    cp "$user_dir"/.wget-hsts /cases/case-2024-001/linux/users/$username/ 2>/dev/null
    cp "$user_dir"/.python_history /cases/case-2024-001/linux/users/$username/ 2>/dev/null
done

# Collect root user artifacts
cp /mnt/evidence/root/.bash_history /cases/case-2024-001/linux/users/root/ 2>/dev/null
cp -r /mnt/evidence/root/.ssh/ /cases/case-2024-001/linux/users/root/ 2>/dev/null

# Collect system configuration
cp /mnt/evidence/etc/passwd /cases/case-2024-001/linux/config/
cp /mnt/evidence/etc/shadow /cases/case-2024-001/linux/config/
cp /mnt/evidence/etc/group /cases/case-2024-001/linux/config/
cp /mnt/evidence/etc/sudoers /cases/case-2024-001/linux/config/
cp -r /mnt/evidence/etc/sudoers.d/ /cases/case-2024-001/linux/config/
cp /mnt/evidence/etc/hosts /cases/case-2024-001/linux/config/
cp /mnt/evidence/etc/resolv.conf /cases/case-2024-001/linux/config/
cp -r /mnt/evidence/etc/ssh/ /cases/case-2024-001/linux/config/
```

### Step 2: Analyze User Accounts and Authentication

```bash
# Analyze user accounts for anomalies
python3 << 'PYEOF'
print("=== USER ACCOUNT ANALYSIS ===\n")

# Parse /etc/passwd
with open('/cases/case-2024-001/linux/config/passwd') as f:
    for line in f:
        parts = line.strip().split(':')
        if len(parts) >= 7:
            username, _, uid, gid, comment, home, shell = parts[0], parts[1], int(parts[2]), int(parts[3]), parts[4], parts[5], parts[6]

            # Flag accounts with UID 0 (root equivalent)
            if uid == 0 and username != 'root':
                print(f"  ALERT: UID 0 account: {username} (shell: {shell})")

            # Flag accounts with login shells that shouldn't have them
            if shell not in ('/bin/false', '/usr/sbin/nologin', '/bin/sync') and uid >= 1000:
                print(f"  User: {username} (UID:{uid}, Shell:{shell}, Home:{home})")

            # Flag system accounts with login shells
            if uid < 1000 and uid > 0 and shell in ('/bin/bash', '/bin/sh', '/bin/zsh'):
                print(f"  WARNING: System account with shell: {username} (UID:{uid}, Shell:{shell})")

# Parse /etc/shadow for account status
print("\n=== PASSWORD STATUS ===")
with open('/cases/case-2024-001/linux/config/shadow') as f:
    for line in f:
        parts = line.strip().split(':')
        if len(parts) >= 3:
            username = parts[0]
            pwd_hash = parts[1]
            last_change = parts[2]

            if pwd_hash and pwd_hash not in ('*', '!', '!!', ''):
                hash_type = 'Unknown'
                if pwd_hash.startswith('$6$'): hash_type = 'SHA-512'
                elif pwd_hash.startswith('$5$'): hash_type = 'SHA-256'
                elif pwd_hash.startswith('$y$'): hash_type = 'yescrypt'
                elif pwd_hash.startswith('$1$'): hash_type = 'MD5 (WEAK)'
                print(f"  {username}: {hash_type} hash, last changed: day {last_change}")
PYEOF

# Analyze login history
last -f /cases/case-2024-001/linux/logs/wtmp > /cases/case-2024-001/linux/analysis/login_history.txt
lastb -f /cases/case-2024-001/linux/logs/btmp > /cases/case-2024-001/linux/analysis/failed_logins.txt 2>/dev/null
```

### Step 3: Examine Persistence Mechanisms

```bash
# Check cron jobs for all users
echo "=== CRON JOBS ===" > /cases/case-2024-001/linux/persistence/cron_analysis.txt

# System cron
for cronfile in /mnt/evidence/etc/crontab /mnt/evidence/etc/cron.d/*; do
    echo "---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 10 MINUTES 40 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE