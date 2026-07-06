---
name: abusing-shadow-credentials-for-privesc
description: "利用 pyWhisker、Whisker 和 Certipy 将备用证书密钥写入 msDS-KeyCredentialLink（Shadow Credentials），接管 Active Directory 用户和计算机账户，并通过 PKINIT 进行身份验证。"
domain: cybersecurity
subdomain: red-teaming
tags:
- red-team
- active-directory
- shadow-credentials
- pywhisker
- certipy
- pkinit
- key-credential-link
- privilege-escalation
version: '1.0'
author: mahipal
license: Apache-2.0
nist_csf:
- PR.AA-05
mitre_attack:
- T1098.005
---
# Abusing Shadow Credentials for Privilege Escalation

> **Legal Notice:** This skill is for authorized security testing and educational purposes only. Shadow Credentials grant full takeover of the targeted account. Use only against systems you own or are explicitly authorized in writing to test. Unauthorized access is a crime.

## 概述

The **Shadow Credentials** technique abuses the `msDS-KeyCredentialLink` attribute of Active Directory user and computer objects. This attribute stores raw public keys ("Key Credentials") used by Windows Hello for Business and Azure AD device registration for passwordless certificate-based logon via PKINIT (Public Key Cryptography for Initial Authentication in Kerberos). If an attacker has write permission over a target object's `msDS-KeyCredentialLink` — typically granted by `GenericWrite`, `GenericAll`, `WriteProperty`, or `AddKeyCredentialLink` ACEs surfaced in BloodHound — they can append their own attacker-generated public key. They then 请求 a TGT for the target via PKINIT using the matching private key and recover the target's NT hash, achieving complete account takeover **without resetting the password**, which is far stealthier than a forced password reset.

The technique was published by Elad Shamir (*"Shadow Credentials: Abusing Key Trust Account Mapping for Account Takeover"*) and implemented in the C# tool **Whisker**. The Python equivalent **pyWhisker** (ShutdownRepo) manipulates the attribute over LDAP, and **Certipy** integrates the entire chain via `certipy shadow auto`. The target environment must support PKINIT and have at least one Domain Controller running Windows Server 2016 or later. Sources: [pyWhisker](https://github.com/ShutdownRepo/pywhisker), [Whisker](https://github.com/eladshamir/Whisker), [The Hacker Recipes — Shadow Credentials](https://www.thehacker.recipes/ad/movement/kerberos/shadow-credentials).

## 使用场景

- When BloodHound reveals `GenericWrite`/`GenericAll`/`AddKeyCredentialLink` over a higher-value user or computer
- As a stealthier alternative to `ForceChangePassword` (no password reset = less disruption/alerting)
- To take over a computer account to chain into Resource-Based Constrained Delegation (RBCD)
- During red-team operations needing account takeover without locking out the legitimate user
- For purple-team exercises generating `msDS-KeyCredentialLink` modification telemetry

## 前提条件

- Authorized engagement scope including AD credential-access techniques
- Control of a principal with write access to the target's `msDS-KeyCredentialLink`
- A DC running Windows Server 2016+ with PKINIT enabled (domain functional level supporting Key Trust)
- Network reachability to LDAP (389/636) and Kerberos (88) on a DC
- Linux attack host with Python 3.8+; install the tooling:
  ```bash
  # pyWhisker (from source)
  git clone https://github.com/ShutdownRepo/pywhisker
  cd pywhisker && pip install .
  # Certipy (integrated shadow attack)
  pipx install certipy-ad
  # PKINITtools for manual TGT/NT-hash extraction
  git clone https://github.com/dirkjanm/PKINITtools
  ```

## Objectives

- Confirm write access over a target's `msDS-KeyCredentialLink`
- Generate a key pair and append a Key Credential to the target object
- 请求 a TGT for the target via PKINIT using the new key
- Recover the target's NT hash for pass-the-hash / further movement
- Clean up the injected Key Credential to restore the object's state
- Document the ACL path that enabled the attack for remediation

## MITRE ATT&CK Mapping

| ID | Technique | Application in this skill |
