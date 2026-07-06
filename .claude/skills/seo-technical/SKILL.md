---
name: seo-technical
description: "技术性SEO审计 — 涵盖9个类别的技术SEO审计：可爬取性、可索引性、安全性、URL结构、移动端、核心Web指标、结构化数据、JavaScript渲染和IndexNow协议。当用户提到'技术性SEO'、'爬取问题'、'robots.txt'、'核心Web指标'、'网站速度'或'安全头'时使用。"
user-invocable: true
参数-hint: "[url]"
license: MIT
metadata:
  author: AgriciDaniel
  version: "2.2.0"
  category: seo
---

# 技术性SEO审计

## 审计类别

### 1. 可爬取性
- robots.txt：是否存在、是否有效、是否未阻止重要资源
- XML站点地图：是否存在、是否在robots.txt中被引用、格式是否有效
- Noindex标签：有意的还是意外的
- 爬取深度：重要页面是否在首页3次点击内
- JavaScript渲染：检查关键内容是否需要JS执行
- 爬取预算：对于大型网站（>10k页面），效率很重要

#### AI爬虫管理

截至2025-2026年，AI公司积极爬取网络以训练模型和驱动AI搜索。通过robots.txt管理这些爬虫是一个关键的技术SEO考虑因素。

**已知的AI爬虫：**

| 爬虫名称 | 公司 | robots.txt令牌 | 目的 |
|---|---|---|---|
| CCBot | Common Crawl | CCBot | 通用网络爬取，用于训练语言模型 |
| GPTBot | OpenAI | GPTBot | 训练OpenAI模型 |
| Claude-Web | Anthropic | Claude-Web | 训练Claude模型 |
| Google-Extended | Google | Google-Extended | 训练Google AI模型 |
| FacebookBot | Meta | FacebookBot | 训练Meta AI模型 |

### 2. 可索引性
- 正确的HTTP状态码（200、301、404等）
- 规范的URL实施
- 元机器人标签配置
- 页面内容可访问性

### 3. 安全性
- HTTPS实施和重定向
- 安全头配置（CSP、HSTS、X-Frame-Options等）
- 混合内容检查
- 安全漏洞扫描

### 4. URL结构
- URL语义和可读性
- 参数处理
- 重定向链分析
- URL规范化

### 5. 移动端
- 响应式设计实现
- 移动端页面速度
- 移动端可用性
- 加速移动页面（AMP）状态

### 6. 核心Web指标
- 最大内容绘制（LCP）
- 首次输入延迟（FID）/交互下次绘制（INP）
- 累积布局偏移（CLS）
- 性能优化建议

### 7. 结构化数据
- 架构.org标记实施
- 丰富网页摘要测试
- 结构化数据验证
- 标记覆盖率和准确性

### 8. JavaScript渲染
- 预渲染配置
- 动态内容可索引性
- JavaScript框架SEO考虑
- 渲染时间分析

### 9. IndexNow协议
- IndexNow API集成
- 实时索引更新
- 提交URL管理
- 性能监控

## 审计流程

### 第1步：初始分析
1. 收集网站URL
2. 运行基本爬取
3. 识别技术堆栈
4. 建立基准指标

### 第2步：深入检查
1. 执行全面爬取
2. 分析技术配置
3. 测试关键用户流程
4. 收集性能数据

### 第3步：问题识别
1. 分类技术问题
2. 优先级排序
3. 影响评估
4. 修复建议

### 第4步：报告生成
1. 创建详细报告
2. 提供可操作建议
3. 设置监控指标
4. 制定实施计划

## 工具推荐

### 爬取和分析工具
- Screaming Frog SEO Spider
- Sitebulb
- DeepCrawl
- Botify

### 性能测试工具
- Google PageSpeed Insights
- WebPageTest
- Lighthouse
- GTmetrix

### 安全审计工具
- SecurityHeaders.com
- Mozilla Observatory
- SSL Labs
- Qualys SSL Server Test

### 结构化数据工具
- Google Rich Results Test
- 架构 Markup Validator
- JSON-LD Playground
- Structured Data Testing Tool

## 最佳实践

### 可爬取性优化
- 保持robots.txt简洁有效
- 定期更新XML站点地图
- 监控爬取错误
- 优化内部链接结构

### 性能优化
- 实施懒加载
- 优化图像和资源
- 使用CDN
- 最小化JavaScript和CSS

### 移动端优先
- 实施响应式设计
- 优化触摸目标
- 减少页面重量
- 改善交互性能

### 安全加固
- 强制HTTPS
- 实施CSP
- 定期安全审计
- 监控安全头

## 常见问题解决

### 爬取问题
- 修复损坏的robots.txt规则
- 解决重定向链
- 优化爬取预算
- 处理JavaScript渲染

### 索引问题
- 修复规范URL问题
- 解决重复内容
- 优化元机器人标签
- 改善页面可访问性

### 性能问题
- 优化核心Web指标
- 减少服务器响应时间
- 改善资源加载
- 实施缓存策略

## 报告模板

### 执行摘要
- 总体得分
- 关键发现
- 优先级建议

### 详细分析
- 按类别的问题列表
- 具体技术细节
- 影响评估

### 行动计划
- 短期修复（1-2周）
- 中期优化（1-3个月）
- 长期策略（3-6个月）

### 监控指标
- 关键绩效指标
- 基准比较
- 改进跟踪