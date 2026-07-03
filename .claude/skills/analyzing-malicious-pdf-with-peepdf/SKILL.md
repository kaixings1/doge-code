---
name: analyzing-malicious-pdf-with-peepdf
description:  使用 peepdf、pdfid 和 pdf-parser 对恶意 PDF 文档执行静态分析，提取嵌入的 JavaScript、shellcode 和可疑对象。
domain: cybersecurity
subdomain: malware-analysis
tags:
- malware-analysis
- pdf
- peepdf
- pdfid
- pdf-parser
- static-analysis
- reverse-engineering
- dfir
version: '1.0'
author: mahipal
license: Apache-2.0
nist_csf:
- DE.AE-02
- RS.AN-03
- ID.RA-01
- DE.CM-01
mitre_attack:
- T1204.002
- T1059.007
- T1027
- T1106
---

# Analyzing Malicious PDF with peepdf

## When to Use

- When triaging suspicious PDF attachments from phishing emails
- During malware analysis of PDF-based exploit documents
- When extracting embedded JavaScript, shellcode, or executables from PDFs
- For forensic examination of weaponized document artifacts
- When building detection signatures for PDF-based threats

## Prerequisites

- Python 3.8+ with peepdf-3 installed (pip install peepdf-3)
- pdfid.py and pdf-parser.py from Didier Stevens suite
- Isolated analysis environment (VM or sandbox)
- Optional: PyV8 for JavaScript emulation within peepdf
- Optional: Pylibemu for shellcode analysis

## Workflow

1. **Triage with pdfid**: Scan PDF for suspicious keywords (/JS, /JavaScript, /OpenAction, /Launch, /EmbeddedFile).
2. **Interactive Analysis**: Open PDF in peepdf interactive mode to explore object structure.
3. **Identify Suspicious Objects**: Locate objects containing JavaScript, streams, or encoded data.
4. **Extract Content**: Dump suspicious streams and decode filters (FlateDecode, ASCIIHexDecode).
5. **Deobfuscate JavaScript**: Analyze extracted JS for shellcode, heap sprays, or exploit code.
6. **Check VirusTotal**: Use peepdf vtcheck to cross-reference file hash with AV detections.
7. **Generate IOCs**: Extract URLs, domains, hashes, and shellcode signatures.

## Key Concepts

| Concept | Description |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 10 MINUTES 37 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE