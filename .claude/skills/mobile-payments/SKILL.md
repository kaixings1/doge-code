---
name: 移动支付安全
description: "用于审计移动应用支付处理安全的技能。涵盖 Stripe、Adyen、Google Pay、Apple Pay 等支付集成的漏洞模式。"
version: 1.0.0
---

# 移动支付安全模式

## When this skill applies

The user is reviewing mobile (Android/iOS) code that handles:

- Card tokenization (PAN/CVV/expiry → opaque token)
- Payment processor SDK integration (Braintree, Stripe, Adyen, FirstData-
  style iframe encryptors)
- Wallets (Google Pay, Apple Pay, Cash App, Venmo)
- Encrypted PAN encryption in WebViews
- Issuer / PIE (Public Initialization Encryption) key management

Signals: files under `**/payment/**`, `**/checkout/**`, `**/tokenize*/**`, `**/services/**/api/`, mentions of "PIE key", "iframe shim", "EncryptionListener", "PaymentMethodType".

## The PIE / iframe-shim / Braintree tokenization shape

Most modern card tokenization on Android follows this template:

1. The app fetches an **encryption key** (RSA pubkey or symmetric salt) from a backend.
2. The app fetches the **tokenization endpoint URL** from a backend.
3. The app builds a **JavaScript payload** that contains:
   - The key material
   - The card data (PAN/CVV/expiry) interpolated into JS literals
   - A `<script>` block that calls into an exposed `@JavascriptInterface`
4. The app dispatches the JS into a **WebView** with `setJavaScriptEnabled(true)`.
5. The WebView's encryption JS produces an opaque token, which the bridge returns to native code.
6. The native code submits the token to the processor over HTTPS.

Each step has a corresponding VulnScout detector:

| Step | Detector | What goes wrong |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 33 MINUTES 13 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE