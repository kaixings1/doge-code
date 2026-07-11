---
description: 推送前运行安全扫描关卡。
---

1. 确保依赖项已安装：
   ```bash
   pip install safety==3.2.4
   brew install gitleaks  # or appropriate package manager
   ```
2. Scan for committed secrets:
   ```bash
   gitleaks detect --verbose --redact
   ```
   - Resolve any findings before continuing.
3. Audit Python dependencies (if requirements files exist):
   ```bash
   for f in $(find . -name "requirements*.txt" 2>/dev/null); do
       safety check --full-report --file "$f"
   done
   ```
4. Record results in the commit template's Testing section.
5. After a clean pass, proceed with commit and push workflow.
