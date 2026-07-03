---
name: analyzing-email-headers-for-phishing-investigation
description:  解析和分析电子邮件头以追踪钓鱼邮件的来源、验证发送者真实性，
  并通过 SPF、DKIM 和 DMARC 验证识别欺骗。
domain: cybersecurity
subdomain: digital-forensics
tags:
- forensics
- email-analysis
- phishing
- spf
- dkim
- dmarc
- header-analysis
version: '1.0'
author: mahipal
license: Apache-2.0
atlas_techniques:
- AML.T0052
nist_csf:
- RS.AN-01
- RS.AN-03
- DE.AE-02
- RS.MA-01
mitre_attack:
- T1566.001
- T1566.002
- T1598.003
mitre_f3:
  version: '1.1'
  tactics:
  - reconnaissance
  - initial-access
  - stealth
  - resource-development
  techniques:
  - id: T1598
    name: Phishing for Information
    tactic: reconnaissance
    source: attack
  - id: T1660
    name: Phishing
    tactic: initial-access
    source: attack
  - id: T1672
    name: Email Spoofing
    tactic: stealth
    source: attack
  - id: F1032
    name: Impersonate Official
    tactic: initial-access
    source: f3
  - id: T1583.001
    name: 'Acquire Infrastructure: Domains'
    tactic: resource-development
    source: attack
  - id: F1020.002
    name: 'Create Fake Materials: Fake Website'
    tactic: resource-development
    source: f3
---

# Analyzing Email Headers for Phishing Investigation

## When to Use
- When investigating a suspected phishing email to determine its true origin
- For verifying sender authenticity and detecting email spoofing
- During incident response when a user has clicked a phishing link
- When tracing the delivery path and relay servers of a suspicious email
- For validating SPF, DKIM, and DMARC alignment to identify forgery

## Prerequisites
- Raw email headers from the suspicious message (EML or MSG format)
- Understanding of SMTP protocol and email header fields
- Access to DNS lookup tools (dig, nslookup) for SPF/DKIM/DMARC verification
- Email header analysis tools (MHA, emailheaders.net concepts)
- Python with email parsing libraries for automated analysis
- Access to threat intelligence platforms for IP/domain reputation

## Workflow

### Step 1: Extract Raw Email Headers

```bash
# Export from Outlook: Open email > File > Properties > Internet Headers
# Export from Gmail: Open email > Three dots > Show original
# Export from Thunderbird: View > Message Source

# If working with EML file from forensic image
cp /mnt/evidence/Users/suspect/AppData/Local/Microsoft/Outlook/phishing_email.eml \
   /cases/case-2024-001/email/

# If working with PST file, extract individual messages
pip install pypff
python3 << 'PYEOF'
import pypff

pst = pypff.file()
pst.open("/cases/case-2024-001/email/outlook.pst")
root = pst.get_root_folder()

def extract_messages(folder, path=""):
    for i in range(folder.get_number_of_sub_messages()):
        msg = folder.get_sub_message(i)
        headers = msg.get_transport_headers()
        subject = msg.get_subject()
        if headers:
            filename = f"/cases/case-2024-001/email/msg_{i}_{subject[:30]}.txt"
            with open(filename, 'w') as f:
                f.write(headers)
    for i in range(folder.get_number_of_sub_folders()):
        extract_messages(folder.get_sub_folder(i))

extract_messages(root)
PYEOF
```

### Step 2: Parse the Email Header Chain

```bash
# Parse headers using Python email library
python3 << 'PYEOF'
import email
from email import policy

with open('/cases/case-2024-001/email/phishing_email.eml', 'r') as f:
    msg = email.message_from_file(f, policy=policy.default)

print("=== KEY HEADER FIELDS ===")
print(f"From:          {msg['From']}")
print(f"To:            {msg['To']}")
print(f"Subject:       {msg['Subject']}")
print(f"Date:          {msg['Date']}")
print(f"Message-ID:    {msg['Message-ID']}")
print(f"Reply-To:      {msg['Reply-To']}")
print(f"Return-Path:   {msg['Return-Path']}")
print(f"X-Mailer:      {msg['X-Mailer']}")
print(f"X-Originating-IP: {msg['X-Originating-IP']}")

print("\n=== RECEIVED HEADERS (bottom-up = chronological) ===")
received_headers = msg.get_all('Received')
if received_headers:
    for i, header in enumerate(reversed(received_headers)):
        print(f"\nHop {i+1}: {header.strip()}")

print("\n=== AUTHENTICATION RESULTS ===")
auth_results = msg.get_all('Authentication-Results')
if auth_results:
    for result in auth_results:
        print(result)

print(f"\nARC-Authentication-Results: {msg.get('ARC-Authentication-Results', 'Not present')}")
print(f"Received-SPF: {msg.get('Received-SPF', 'Not present')}")
print(f"DKIM-Signature: {msg.get('DKIM-Signature', 'Not present')}")
PYEOF
```

### Step 3: Validate SPF, DKIM, and DMARC Records

```bash
# Extract the envelope sender domain
SENDER_DOMAIN="example-corp.com"

# Check SPF record
dig TXT $SENDER_DOMAIN +short | grep "v=spf1"
# Example: "v=spf1 include:_spf.google.com include:sendgrid.net ~all"

# Check DKIM record (selector from DKIM-Signature header, e.g., "s=selector1")
DKIM_SELECTOR="selector1"
dig TXT ${DKIM_SELECTOR}._domainkey.${SENDER_DOMAIN} +short

# Check DMARC record
dig TXT _dmarc.${SENDER_DOMAIN} +short
# Example: "v=DMARC1; p=reject; rua=mailto:dmarc@example-corp.com; pct=100"

# Verify the sending IP against SPF
# Extract IP from first Received header
SENDING_IP="203.0.113.45"

# Manual SPF check using python
python3 << 'PYEOF'
import spf  # pip install pyspf

result, explanation = spf.check2(
    i='203.0.113.45',
    s='sender@example-corp.com',
    h='mail.example-corp.com'
)
print(f"SPF Result: {result}")
print(f"Explanation: {explanation}")
# Results: pass, fail, softfail, neutral, none, temperror, permerror
PYEOF

# Check if sending IP is in known malicious IP lists
# Query AbuseIPDB or VirusTotal
curl -s "https://api.abuseipdb.com/api/v2/check?ipAddress=${SENDING_IP}" \
   -H "Key: YOUR_API_KEY" -H "Accept: application/json" | python3 -m json.tool
```

### Step 4: Analyze Sender Domain and Infrastructure

```bash
# WHOIS lookup on sender domain
whois $SENDER_DOMAIN | grep -iE '(registrar|creation|expiration|registrant|nameserver)'

# Check domain age (recently registered domains are suspicious)
# DNS record investigation
dig A $SENDER_DOMAIN +short
dig MX $SENDER_DOMAIN +short
dig NS $SENDER_DOMAIN +short

# Reverse DNS on sending IP
dig -x $SENDING_IP +short

# Check for lookalike/typosquatting domains
# Compare with legitimate domain using visual similarity
python3 << 'PYEOF'
import Levenshtein  # pip install python-Levenshtein

legitimate = "microsoft.com"
suspicious = "micr0soft.com"

distance = Levenshtein.distance(legitimate, suspicious)
ratio = Levenshtein.ratio(legitimate, suspicious)
print(f"Edit distance: {distance}")
print(f"Similarity ratio: {ratio:.2%}")
if ratio > 0.8:
    print("WARNING: Likely typosquatting/lookalike domain!")
PYEOF

# Check domain reputation on VirusTotal
curl -s "https://www.virustotal.com/api/v3/domains/${SENDER_DOMAIN}" \
   -H "x-apikey: YOUR_VT_API_KEY" | python3 -m json.tool

# Check if the Reply-To differs from From (common phishing indicator)
python3 -c "
import email
with open('/cases/case-2024-001/email/phishing_email.eml') as f:
    msg = email.message_from_file(f)
from_addr = email.utils.parseaddr(msg['From'])[1]
reply_to = email.utils.parseaddr(msg.get('Reply-To', msg['From']))[1]
if from_addr != reply_to:
    print(f'WARNING: From ({from_addr}) != Reply-To ({reply_to})')
else:
    print('From and Reply-To match')
"
```

### Step 5: Examine Email Body and Attachments

```bash
# Extract URLs from email body
python3 << 'PYEOF'
import email
import re
from email import policy

with open('/cases/case-2024-001/email/phishing_email.eml', 'r') as f:
    msg = email.message_from_file(f, policy=policy.default)

body = msg.get_body(preferencelist=('html', 'plain'))
if body:
    content = body.get_content()
    urls = re.findall(r'https?://[^\s<>"\']+', content)
    print("=== URLs FOUND IN EMAIL BODY ===")
    for url in set(urls):
        print(f"  {url}")

    # Check for URL obfuscation (display text != href)
    href_pattern = re.findall(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', content, re.DOTALL)
    print("\n=== HYPERLINK ANALYSIS ===")
    for href, text in href_pattern:
        display_url = re.findall(r'https?://[^\s<]+', text)
        if display_url and display_url[0] != href:
            print(f"  MISMATCH: Display='{display_url[0]}' -> Actual='{href}'")

# Extract and hash attachments
print("\n=== ATTACHMENTS ===")
for part in msg.walk():
    if part.get_content_disposition() == 'attachment':
        filename = part.get_filename()
        content = part.get_payload(decode=True)
        import hashlib
        sha256 = hashlib.sha256(content).hexdigest()
        print(f"  File: {filename}, Size: {len(content)}, SHA-256: {sha256}")
        with open(f'/cases/case-2024-001/email/attachments/{filename}', 'wb') as af:
            af.write(content)
PYEOF

# Submit attachment hashes to VirusTotal
# Submit URLs to URLhaus or PhishTank for reputation check
```

## Key Concepts

| Concept | Description |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 10 MINUTES 47 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE