# REST API 快速参考

当 MCP 工具不可用时使用这些命令。需要 Obsidian 中运行 Local REST API 插件（端口 27124）。

运行任何命令前设置你的密钥：
```bash
API="https://127.0.0.1:27124"
KEY="你的-api-密钥"
```

---

## 读取文件

```bash
curl -sk \
  -H "Authorization: Bearer $KEY" \
  "$API/vault/wiki/index.md"
```

---

## 创建或替换文件

```bash
curl -sk -X PUT \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: text/markdown" \
  --data-binary @local-file.md \
  "$API/vault/wiki/entities/Name.md"
```

或使用内联内容：
```bash
curl -sk -X PUT \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: text/markdown" \
  --data "# Page Title

此处为内容。" \
  "$API/vault/wiki/concepts/Name.md"
```

---

## 追加到文件

```bash
curl -sk -X POST \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: text/markdown" \
  --data "- New log entry" \
  "$API/vault/wiki/log.md"
```

---

## 修补前置元数据字段

```bash
curl -sk -X PATCH \
  -H "Authorization: Bearer $KEY" \
  -H "Operation: replace" \
  -H "Target-Type: frontmatter" \
  -H "Target: status" \
  -H "Content-Type: application/json" \
  --data '"mature"' \
  "$API/vault/wiki/concepts/Name.md"
```

---

## 在标题下追加内容

```bash
curl -sk -X PATCH \
  -H "Authorization: Bearer $KEY" \
  -H "Operation: append" \
  -H "Target-Type: heading" \
  -H "Target: Connections" \
  -H "Content-Type: text/markdown" \
  --data "- [[New Page]]" \
  "$API/vault/wiki/entities/Name.md"
```

---

## 搜索

简单关键词搜索：
```bash
curl -sk -X POST \
  -H "Authorization: Bearer $KEY" \
  "$API/search/simple/?query=machine+learning"
```

Dataview 查询：
```bash
curl -sk -X POST \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/vnd.olrapi.dataview.dql+txt" \
  --data 'TABLE status FROM "wiki" WHERE status = "seed"' \
  "$API/search/"
```

---

## 列出所有标签

```bash
curl -sk \
  -H "Authorization: Bearer $KEY" \
  "$API/tags/"
```

---

## 列出文件夹中的文件

```bash
curl -sk \
  -H "Authorization: Bearer $KEY" \
  "$API/vault/wiki/entities/"
```
