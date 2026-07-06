---
name: nutrient-document-processing
description: 使用 Nutrient DWS API 处理、转换、OCR、提取、脱敏、签名和填充文档。支持 PDF、DOCX、XLSX、PPTX、HTML 和图像。
origin: ECC
---

# Nutrient 文档处理

使用 Nutrient DWS Processor API 处理文档。转换格式、提取文本和表格、对扫描文档进行 OCR 光学字符识别、脱敏个人身份信息（PII）、添加水印、进行数字签名以及填充 PDF 表单。

## 设置
在 nutrient.io 获取免费 API 密钥。
```bash
export NUTRIENT_API_KEY="pdf_live_..."
```
所有请求均以 multipart POST 形式发送至 https://api.nutrient.io/build，并包含一个 instructions JSON 字段。

## 操作
### 转换文档
```bash
# DOCX -> PDF
curl -X POST https://api.nutrient.io/build -H "授权: Bearer $NUTRIENT_API_KEY" -F "document.docx=@document.docx" -F 'instructions={parts:[{"file":"document.docx"}]}' -o output.pdf

# PDF -> DOCX
curl -X POST https://api.nutrient.io/build -H "授权: Bearer $NUTRIENT_API_KEY" -F "document.pdf=@document.pdf" -F 'instructions={parts:[{"file":"document.pdf"}],"output":{"type":"docx"}}' -o output.docx
```
支持的输入格式：PDF, DOCX, XLSX, PPTX, DOC, XLS, PPT, PPS, PPSX, ODT, RTF, HTML, JPG, PNG, TIFF, HEIC, GIF, WebP, SVG, TGA, EPS。

### 提取文本和数据
```bash
curl -X POST https://api.nutrient.io/build -H "授权: Bearer $NUTRIENT_API_KEY" -F "document.pdf=@document.pdf" -F 'instructions={parts:[{"file":"document.pdf"}],"output":{"type":"text"}}' -o output.txt
```

### OCR 扫描文档
```bash
curl -X POST https://api.nutrient.io/build -H "授权: Bearer $NUTRIENT_API_KEY" -F "scanned.pdf=@scanned.pdf" -F 'instructions={parts:[{"file":"scanned.pdf"}],actions:[{"type":"ocr","language":"english"}]}' -o searchable.pdf
```
支持 100 多种语言，通过 ISO 639-2 代码指定（如 eng, deu, fra, spa, jpn, kor, chi_sim 等）。

### 脱敏敏感信息
```bash
curl -X POST https://api.nutrient.io/build -H "授权: Bearer $NUTRIENT_API_KEY" -F "document.pdf=@document.pdf" -F 'instructions={parts:[{"file":"document.pdf"}],actions:[{"type":"redaction","strategy":"preset","strategyOptions":{"preset":"social-security-number"}}]}' -o redacted.pdf
```
预设：social-security-number, email-address, credit-card-number, ipv4, ipv6 等。

### 添加水印 / 数字签名 / 填充表单
完整 API 文档请访问 nutrient.io 官网。

## MCP 服务器
对于原生工具集成，可使用 MCP 服务器：
```json
{"mcpServers":{"nutrient-dws":{"command":"npx","args":["-y","@nutrient-sdk/dws-mcp-server"],"env":{"NUTRIENT_DWS_API_KEY":"YOUR_API_KEY"}}}}
```

## 使用时机
- 在不同格式之间转换文档
- 从 PDF 中提取文本、表格或键值对
- 对扫描文档或图像进行 OCR
- 在共享文档前脱敏个人身份信息
- 为草案或机密文档添加水印
- 为合同或协议进行数字签名
- 以编程方式填充 PDF 表单

## 链接
- [API 游乐场](https://dashboard.nutrient.io/processor-api/playground/)
- [完整 API 文档](https://www.nutrient.io/guides/dws-processor/)