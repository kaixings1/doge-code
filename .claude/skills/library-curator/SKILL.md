---
name: library-curator
description: "Library Curator — Library Curator 相关功能和最佳实践"
  Search the OD Library (the global asset registry) and apply matching assets
  into the current project mid-task. Use when the user asks to reuse an image
  they captured/uploaded earlier, "pull a logo/screenshot from my library", or
  to find and drop a stored asset into the page being built.
triggers:
  - "from my library"
  - "library asset"
  - "use the image I captured"
  - "insert from library"
od:
  mode: utility
  category: assets
---

# 图书馆策展人

重用已存在于用户 OD 库中的资产—使用 OD Clipper 捕获的图片、手动上传、代理生成媒体和设计系统素材—无需要求用户重新上传。

## 何时使用

- 用户引用他们已经拥有的资产（"我剪切的截图"、"我的标志"、"之前那个主图"）。
- 你需要为正在构建的页面制作图片，且用户倾向于使用自己的库而非新生成的媒体。

## 工具（工具令牌方式）

两个端点都使用运行的 tool token（`OD_TOOL_TOKEN`，由守护进程注入）进行认证，并对运行所属的项目进行操作。

### 搜索

`POST /api/tools/library/search`

```json
{ "query": "蓝色主图背景", "kind": "image", "limit": 20 }
```

返回 `{ "results": [{ "asset": { "id": "...", "kind": "image", "sourceTitle": "...", "width": 1600, "height": 900, "sources": [...] }, "score": 0 }], "semantic": false }`。

`semantic: false` 表示关键词/元数据匹配（未配置嵌入模型）。根据资产元数据自行筛选和排序结果。

### 应用

`POST /api/tools/library/apply`

```json
{ "assetId": "<搜索结果的 ID>", "dir": "assets" }
```

将资产复制到项目中（默认子目录 `library/`，或你传入的 `dir`）并返回 `{ "relPath": "assets/<hash>.png" }`。在你编写的 HTML/CSS 中引用该 `relPath`（例如 `<img src="assets/ab12cd34ef.png">`）。

## 操作步骤

1. 使用精确查询搜索所需类型的资产。
2. 根据尺寸/标题/来源选择最佳结果。
3. 应用它以获取项目相对路径。
4. 将该路径接入你正在编辑的工件中。

如果搜索无结果，回退到媒体生成而不是猜测路径—切勿编造 `apply` 未返回的 `relPath`。
