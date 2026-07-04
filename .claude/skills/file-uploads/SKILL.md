---
name: file-uploads
description: "File Uploads — File Uploads 相关功能和最佳实践"
  Cloudflare R2, 预签名URL, 多部分上传和图像优化。
  知道如何处理大文件而不阻塞。
risk: none
source: vibeship-spawner-skills (Apache 2.0)
date_added: 2026-02-27
---

# 文件上传与存储

擅长处理文件上传和云存储。涵盖 S3、
Cloudflare R2、预签名URL、多部分上传和图像
优化。知道如何处理大文件而不阻塞。

**角色**：文件上传专家

注重安全和性能。从不信任文件
扩展名。知道大文件需要特殊处理。
倾向于使用预签名URL而不是服务器代理。

### 原则

- 从不信任客户端提供的文件类型声明
- 使用预签名URL进行直接上传
- 流式传输大文件，绝不缓冲
- 上传时验证，上传后优化

## 尖锐问题

### 信任客户端提供的文件类型

严重性：关键

情况：用户上传重命名为image.jpg的malware.exe。你检查
扩展名，看起来没问题。存储它。提供它。另一个用户
下载并执行它。

症状：
- 恶意软件作为图像上传
- 提供错误的内容类型

为什么这会出问题：
文件扩展名和Content-Type头部可以被伪造。
攻击者重命名可执行文件以绕过过滤器。

推荐修复：

# 检查魔数字节

import { fileTypeFromBuffer } from "file-type";

async function validateImage(buffer: Buffer) {
  const type = await fileTypeFromBuffer(buffer);
  
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  
  if (!type || !allowedTypes.includes(type.mime)) {
    throw new Error("Invalid file type");
  }
  
  return type;
}

// 对于流
import { fileTypeFromStream } from "file-type";
const type = await fileTypeFromStream(readableStream);

### /u6ca1/u6709/u4e0a/u4f20/u5927/u5c0f/u9650/u5236

Severity: HIGH

Situation: No file size limit. Attacker uploads 10GB file. Server runs
out of memory or disk. Denial of service. Or massive
storage bill.

Symptoms:
- Server crashes on large uploads
- Massive storage bills
- Memory exhaustion

Why this breaks:
Without limits, attackers can exhaust resources. Even
legitimate users might accidentally upload huge files.

Recommended fix:

# SET SIZE LIMITS

// Formidable
const form = formidable({
  maxFileSize: 10 * 1024 * 1024, // 10MB
});

// Multer
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Client-side early check
if (file.size > 10 * 1024 * 1024) {
  alert("File too large (max 10MB)");
  return;
}

// Presigned URL with size limit
const command = new PutObjectCommand({
  Bucket: BUCKET,
  Key: key,
  ContentLength: expectedSize, // Enforce size
});

### /u7528/u6237/u63a7/u5236/u7684/u6587/u4ef6/u540d/u5bfc/u81f4/u8def/u5f84/u904d/u5386

Severity: CRITICAL

Situation: User uploads file named "../../../etc/passwd". You use
filename directly. File saved outside upload directory.
System files overwritten.

Symptoms:
- Files outside upload directory
- System file access

Why this breaks:
User input should never be used directly in file paths.
Path traversal sequences can escape intended directories.

Recommended fix:

# SANITIZE FILENAMES

import path from "path";
import crypto from "crypto";

function safeFilename(userFilename: string): string {
  // Extract just the base name
  const base = path.basename(userFilename);
  
  // Remove any remaining path chars
  const sanitized = base.replace(/[^a-zA-Z0-9.-]/g, "_");
  
  // Or better: generate new name entirely
  const ext = path.extname(userFilename).toLowerCase();
  const allowed = [".jpg", ".png", ".pdf"];
  
  if (!allowed.includes(ext)) {
    throw new Error("Invalid extension");
  }
  
  return crypto.randomUUID() + ext;
}

// 绝不 do this
const path = "uploads/" + req.body.filename; // DANGER!

// Do this
const path = "uploads/" + safeFilename(req.body.filename);

### /u9884/u7b7e/u540d URL /u5171/u4eab/u6216/u7f13/u5b58/u4e0d/u6b63/u786e

Severity: MEDIUM

Situation: Presigned URL for private file returned in API response.
Response cached by CDN. Anyone with cached URL can access
private file for hours.

Symptoms:
- Private files accessible via cached URLs
- Access after expiry

Why this breaks:
Presigned URLs grant temporary access. If cached or shared,
access extends beyond intended scope.

Recommended fix:

# CONTROL PRESIGNED URL DISTRIBUTION

// Short expiry for sensitive files
const url = await getSignedUrl(s3, command, {
  expiresIn: 300, // 5 minutes
});

// No-cache headers for presigned URL responses
return Response.json({ url }, {
  headers: {
    "Cache-Control": "no-store, max-age=0",
  },
});

// Or use CloudFront signed URLs for more control

## /u9a8c/u8bc1/u68c0/u67e5

### /u4ec5/u68c0/u67e5/u6587/u4ef6/u6269/u5c55/u540d

Severity: CRITICAL

Message: Check magic bytes, not just extension

Fix action: Use file-type library to verify actual type

### /u7528/u6237/u6587/u4ef6/u540d/u76f4/u63a5/u7528/u4e8e/u8def/u5f84

Severity: CRITICAL

Message: Sanitize filenames to prevent path traversal

Fix action: Use path.basename() and generate safe name

## /u534f/u4f5c

### /u59d4/u6258/u89e6/u53d1/u5668

- image optimization CDN -> performance-optimization (Image delivery)
- storing file metadata -> postgres-wizard (Database schema)

## /u4f55/u65f6/u4f7f/u7528
- User mentions or implies: file upload
- User mentions or implies: S3
- User mentions or implies: R2
- User mentions or implies: presigned URL
- User mentions or implies: multipart
- User mentions or implies: image upload
- User mentions or implies: cloud storage

## /u9650/u5236
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
