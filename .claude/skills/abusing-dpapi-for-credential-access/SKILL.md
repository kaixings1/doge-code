---
name: DPAPI 凭据窃取
description: "离线或在线提取受 DPAPI 保护的敏感信息，包括凭据和浏览器数据等。"
domain: cybersecurity
subdomain: red-teaming
tags:
- red-team
- credential-access
- dpapi
- sharpdpapi
- post-exploitation
- active-directory
- windows
- mimikatz
version: '1.0'
author: mahipal
license: Apache-2.0
nist_csf:
- DE.CM-01
mitre_attack:
- T1555.004
---
# Abusing DPAPI for Credential Access

> **Legal Notice:** 此技能适用于 authorized penetration testing, red-team engagements, and educational purposes only. Extracting credentials from systems you do not own or lack explicit written authorization to test is illegal and may violate computer fraud and abuse laws. 始终 operate within a signed rules-of-engagement and document every action.

## 概述

The Windows Data Protection API (DPAPI) is the operating system's built-in symmetric-encryption service that applications use to protect secrets at rest: saved RDP and Windows Credential Manager credentials, web and Wi-Fi credentials in the Credential Vault, browser saved logins and cookies (Chrome/Edge), KeePass keys, certificate private keys, and Scheduled Task passwords. DPAPI derives a per-user (or per-machine) **master key** from the user's password (or the machine account secret), and that master key encrypts individual "DPAPI blobs." The encrypted master keys live under `%APPDATA%\Microsoft\Protect\<SID>\` (user) and `%WINDIR%\System32\Microsoft\Protect\` (machine).

Red teamers abuse DPAPI to recover plaintext secrets after gaining a foothold, mapping to MITRE ATT&CK **T1555.004 (Credentials from Password Stores: Windows Credential Manager)**. There are three primary decryption paths:

1. **Online / context-based** — running as the target user, DPAPI APIs (`CryptUnprotectData`) transparently decrypt the user's blobs. SharpDPAPI's `/unprotect` flag uses this.
2. **Offline with the user password or NTLM hash** — decrypt the user's master keys with `/password:` or `/ntlm:`, then decrypt the blobs offline (great for triaged files pulled from a host).
3. **Domain-wide with the DPAPI backup key** — Domain Admins can extract the domain's RSA DPAPI backup key (`.pvk`) once, then decrypt *any* domain user's master keys forever, online or offline, with `/pvk:`.

The canonical tooling is **SharpDPAPI** (GhostPack, a C# port of Mimikatz DPAPI functionality) for Windows, **SharpChrome** for browser secrets, and **Mimikatz** (`dpapi::*`) as the original implementation. On Linux, Impacket's `dpapi.py` and `donpapi` perform remote/offline triage.

## 使用场景

- After compromising a Windows host where the user has saved RDP, browser, or vault credentials worth harvesting for lateral movement.
- When you hold a user's password or NTLM hash and want to decrypt their DPAPI-protected secrets offline.
- When you have Domain Admin and want to obtain the domain DPAPI backup key to decrypt any user's protected data across the estate.
- When triaging exfiltrated `Credentials`, `Vault`, or `Protect` directories from disk images.
- During purple-team exercises to validate detection of DPAPI master-key access and LSASS/Protect-folder reads.

## 前提条件

- An authorized foothold (interactive 会话, beacon, or remote admin) on the target Windows host.
- Knowledge of the target user's SID, and one of: the user's 会话, password, NTLM hash, or Domain Admin rights for the backup key.
- Tooling (compile from source or use release binaries; obtain only from official upstreams):

```bash
# SharpDPAPI / SharpChrome (GhostPack) — build with Visual Studio / msbuild
git clone https://github.com/GhostPack/SharpDPAPI.git
# Open SharpDPAPI.sln and build Release, or:
msbuild SharpDPAPI.sln /p:Configuration=Release

# Mimikatz (original DPAPI implementation)
# https://github.com/gentilkiwi/mimikatz/releases

# Linux remote/offline triage (Impacket)
pipx install impacket            # provides dpapi.py / impacket-dpapi
pipx install donpapi             # https://github.com/login-securite/DonPAPI
```

## 目标

- Triage a host for DPAPI-protected credential, vault, RDP, and certificate blobs.
- Decrypt user master keys online (`/unprotect`), with a password/hash, or with the domain backup key.
- Recover plaintext Credential Manager and Vault secrets.
- Extract browser saved logins and cookies with SharpChrome.
- Obtain and reuse the domain DPAPI backup key for estate-wide decryption.

## MITRE ATT&CK Mapping

| Technique ID | Name | Tactic | Relevance |