为 Web 应用生成内容安全策略（CSP）响应头。

## 步骤

1. 扫描项目的前端资源及其来源：
   - JavaScript 文件：内联脚本、外部 CDN 脚本、动态导入。
   - CSS 文件：内联样式、外部样式表、CSS-in-JS 库。
   - 图片：本地资源、外部图片 CDN、数据 URI。
   - 字体：Google Fonts、自托管、CDN 托管。
   - API 调用：`fetch`、`XMLHttpRequest`、WebSocket 连接。
   - 框架：iframe、嵌入内容。
2. 识别代码库中引用的所有外部域名。
3. 构建 CSP 指令：
   - `default-src`：回退策略。
   - `script-src`：带有 nonce 或哈希策略的 JavaScript 源。
   - `style-src`：CSS 源。
   - `img-src`：图片源。
   - `connect-src`：API 端点、WebSocket URL。
   - `font-src`：字体源。
   - `frame-src`：iframe 源。
   - `object-src`：插件源（应为 `'none'`）。
4. 添加报告配置：`report-uri` 或 `report-to`。
5. 生成强制执行和仅报告两种标头。
6. 输出为 HTTP 标头格式和 meta 标签格式。

## 格式

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}' https://cdn.example.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://images.example.com;
  connect-src 'self' https://api.example.com;
  font-src 'self' https://fonts.gstatic.com;
  object-src 'none';
  frame-ancestors 'none';
  report-uri /csp-report;
```

## 规则

- 绝不对脚本使用 `unsafe-inline`；优先使用 nonce 或哈希。
- 始终包含 `object-src 'none'` 和 `frame-ancestors 'self'`。
- 从严格的策略开始，仅在需要时放宽。
- 提供 `Content-Security-Policy-Report-Only` 标头用于测试。
- 记录每个允许的域名，并附上注释说明为何需要它。
