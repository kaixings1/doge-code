---
name: 危险函数
description: "用于查找已知危险函数使用的技能。涵盖命令注入、代码执行、路径遍历等不安全的 API 调用。"
version: 1.0.0
---

# 危险函数参考

## 目的

提供跨编程语言的安全敏感函数（接收器）的全面知识，用于白盒渗透测试。这些函数在代码审查期间是常见的目标，因为不当使用会导致严重漏洞。

## 使用场景

Activate this skill during:
- Code review phase of whitebox security review
- Searching for potential vulnerability entry points
- Building grep patterns for sink identification
- Understanding language-specific security risks

## 核心概念

### 源 vs 接收器

**源**: 用户输入进入应用程序的入口点
- HTTP 参数、标头、cookie
- 文件上传、数据库读取
- 环境变量、命令行参数

**接收器**: 恶意输入造成损害的函数
- 命令执行、SQL 查询
- 文件操作、反序列化
- 代码评估、模板渲染

### 风险类别

| 类别 | 影响 | 常见语言 |
|----------|--------|------------------|
| 命令注入 | 远程代码执行 | 所有 |
| 代码注入 | 远程代码执行 | PHP、Python、JS |
| SQL 注入 | 数据泄露 | 所有使用数据库的 |
| 反序列化 | 远程代码执行 | Java、PHP、Python、.NET |
| 文件操作 | LFI/RFI/任意写入 | 所有 |
| SSRF | 内部网络访问 | 所有 |
| 模板注入 | 远程代码执行 | Python、Java、JS |
| 重入 | 资金窃取 | Solidity |
| 闪电贷攻击 | 价格/状态操纵 | Solidity |
| 访问控制 | 权限提升 | Solidity |

## 方法论

### 步骤 1: 识别应用程序语言

确定使用的主要语言：
- 检查文件扩展名（.php、.java、.py、.js、.cs、.go、.rb）
- 查看包管理器（composer.json、pom.xml、requirements.txt、package.json）
- 检查框架指示器

### 步骤 2: 加载语言特定参考

查阅适当的参考文件以获取全面的接收器列表：
- `references/php-sinks.md` 用于 PHP 应用程序
- `references/java-sinks.md` 用于 Java 应用程序
- `references/python-sinks.md` 用于 Python 应用程序
- `references/javascript-sinks.md` 用于 Node.js/JavaScript
- `references/dotnet-sinks.md` 用于 .NET/C# 应用程序
- `references/go-ruby-sinks.md` 用于 Go 和 Ruby
- `references/rust-sinks.md` 用于 Rust 应用程序
- `references/kotlin-sinks.md` 用于 Kotlin/Android 应用程序 *(预览——不在支持的语言列表中)*
- `references/swift-sinks.md` 用于 Swift/iOS 应用程序 *(预览——不在支持的语言列表中)*
- `references/solidity-sinks.md` 用于 Solidity 智能合约

### 步骤 3: 搜索接收器

使用 Grep 工具搜索危险函数：
- 一次搜索一个类别（命令、代码、SQL、文件等）
- 使用不区分大小写的搜索以获得更好的覆盖范围
- 包含所有相关的文件扩展名

### 步骤 4: 记录发现

对于每个已识别的接收器，记录：
- 文件路径和行号
- 函数名称和上下文
- 输入源（如果可见）
- 初始风险评估

### 步骤 5: 测试优先级排序

使用此框架对发现进行排名：

| 优先级 | 标准 |
|----------|----------|
| 严重 | 直接用户输入到达接收器 |
| 高 | 数据库/文件数据（用户控制）到达接收器 |
| 中 | 已认证用户输入到达接收器 |
| 低 | 仅管理员输入到达接收器 |
| 信息 | 仅硬编码值 |

## 优先级框架

在审查已识别的接收器时，考虑：

1. **输入接近度**: 用户输入距离接收器有多近？
2. **认证**: 利用是否需要认证？
3. **权限级别**: 需要什么访问级别？
4. **影响**: 攻击者可以实现什么？
5. **可利用性**: 是否有过滤器或清理措施？

## 其他资源

### 参考文件

有关按语言分类的全面函数列表，请查阅：
- **`references/php-sinks.md`** - PHP 危险函数，带 grep 模式
- **`references/java-sinks.md`** - Java 危险函数，带 grep 模式
- **`references/python-sinks.md`** - Python 危险函数，带 grep 模式
- **`references/javascript-sinks.md`** - JavaScript/Node.js 危险函数
- **`references/dotnet-sinks.md`** - .NET/C# 危险函数
- **`references/go-ruby-sinks.md`** - Go 和 Ruby 危险函数
- **`references/rust-sinks.md`** - Rust 危险函数（不安全、FFI 等）
- **`references/kotlin-sinks.md`** - Kotlin/Android 危险函数 *(预览——不在支持的语言列表中)*
- **`references/swift-sinks.md`** - Swift/iOS 危险函数 *(预览——不在支持的语言列表中)*
- **`references/solidity-sinks.md`** - Solidity 智能合约接收器（重入、访问控制、闪电贷）

### 与其他技能的集成

- 使用 **vuln-patterns** 技能获取每种漏洞类型的利用技术
- 使用 **data-flow-tracing** 技能追踪输入从源到已识别接收器的流程
- 使用 **exploit-techniques** 技能为已确认的漏洞开发 PoC
