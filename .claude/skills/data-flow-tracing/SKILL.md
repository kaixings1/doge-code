---
name: 数据流追踪
description: "用于追踪从输入到接收器的用户数据流的技能。进行污点分析以发现未经验证的输入如何流向敏感操作。"
version: 1.0.0
---

# 数据流追踪

## 目的

指导追踪用户控制的输入从入口点（来源）经过应用程序到达安全敏感函数（接收器）的过程。这对于确认漏洞的可利用性至关重要。

## 使用场景

在以下情况下激活此技能：
- 确认已识别的接收器是否接收用户输入
- 映射从来源到接收器的路径
- 了解数据转换和过滤器
- 确定清洗是否可以被绕过

## 核心概念

### 来源（输入入口点）

**HTTP 来源**：
| 语言 | 常见来源 |
|----------|----------------|
| PHP | `$_GET`, `$_POST`, `$_REQUEST`, `$_COOKIE`, `$_FILES`, `$_SERVER` |
| Java | `请求.getParameter()`, `请求.getHeader()`, `@RequestParam` |
| Python | `请求.args`, `请求.form`, `请求.data`, `请求.json` |
| Node.js | `req.查询`, `req.body`, `req.params`, `req.headers` |
| .NET | `请求.QueryString`, `请求.Form`, `请求["param"]` |

**其他来源**：
- 数据库查询（存储的用户数据）
- 文件内容（用户上传或修改）
- 环境变量
- 外部 API 响应

### 接收器（危险函数）

有关完整的接收器列表，请参考 **dangerous-functions** 技能。

### 数据转换

追踪数据在来源和接收器之间的变化：
- 编码/解码（base64、URL、HTML）
- 与其他字符串的拼接
- 数组/对象属性访问
- 类型转换
- 字符串操作

## 追踪方法

### 步骤 1：识别接收器
从代码审查期间识别的危险函数开始。

### 步骤 2：查找直接参数
确定传递给接收器的变量/参数。

```
示例：system($cmd);
直接参数：$cmd
```

### 步骤 3：向后追踪
跟踪每个参数到其来源：

1. 检查函数参数
2. 检查变量赋值
3. 检查条件分支
4. 检查循环迭代
5. 检查包含/引用的文件

### 步骤 4：识别来源
确定用户输入进入的位置：

```
$cmd = $_GET['command'];  // 直接来源
$cmd = $row['command'];   // 数据库（检查存储方式）
$cmd = $config['cmd'];    // 配置文件（检查用户是否可修改）
```

### 步骤 5：映射转换
记录数据的所有更改：

```
来源：$_GET['input']
  -> urldecode()
  -> str_replace(['../', '..\\'], '', $input)
  -> escapeshellarg()
  -> Sink: exec()
```

### Step 6: Assess Exploitability
考虑:
- Are filters/sanitization bypassable?
- Is the full input controllable?
- Are there alternative paths?

## Tracing Techniques

### Static Analysis (Manual)

**Forward Tracing**: Start from source, follow to sinks
```
$input = $_GET['x'];
$processed = process($input);
dangerous_function($processed);
```

**Backward Tracing**: Start from sink, trace to source
```
dangerous_function($var);
  <- $var = transform($data);
  <- $data = $_POST['param'];
```

### Using IDE Features

- Find all references to variable
- Go to definition
- Find usages
- Call hierarchy

### Using Grep

```bash
# Find where variable is assigned
grep -rn "\$varname\s*=" --include="*.php"

# Find where variable is used
grep -rn "\$varname" --include="*.php"

# Find function calls
grep -rn "functionName\s*(" --include="*.php"
```

## 常见模式

### Direct Flow
```
$input = $_GET['cmd'];
system($input);  // Vulnerable
```

### Database-Mediated Flow
```
// Store
$db->insert(['cmd' => $_POST['cmd']]);

// Later, retrieve and execute
$row = $db->查询("SELECT cmd FROM jobs")->fetch();
system($row['cmd']);  // Vulnerable if original input wasn't sanitized
```

### 配置 Flow
```
// Config loaded from user-modifiable file
$config = parse_ini_file('/var/www/config.ini');
system($config['backup_cmd']);  // Vulnerable if config is modifiable
```

### Multi-File Flow
```
// file1.php
$_SESSION['cmd'] = $_GET['cmd'];

// file2.php
system($_SESSION['cmd']);  // Vulnerable
```

## Sanitization Analysis

### Identify Sanitization Functions
```
$input = htmlspecialchars($_GET['x']);  // XSS protection
$input = escapeshellarg($_GET['x']);    // Command injection protection
$input = intval($_GET['x']);            // Type casting
$input = preg_replace('/[^a-z]/', '', $_GET['x']);  // Whitelist
```

### Assess Bypass Potential

| Sanitization | Bypass 考虑ations |
|--------------|----------------------|
| Blacklist | Missing characters, encoding |
| Whitelist | Logic errors, regex flaws |
| Type casting | Depends on sink requirements |
| Encoding | Double encoding, context |
| Length limits | Truncation attacks |

### Common Bypass Techniques

- Case variations
- Encoding (URL, Unicode, HTML)
- Null bytes
- Double encoding
- Alternative representations

## Documentation Template

When tracing, document findings:

```markdown
## Finding: [Vulnerability Type]

### Sink
- File: path/to/file.php
- Line: 42
- Function: system($cmd)

### Source
- File: path/to/file.php  
- Line: 35
- Source: $_GET['command']

### Data Flow
1. $_GET['command'] received (line 35)
2. Passed to sanitize() function (line 36)
3. Concatenated with prefix (line 38)
4. Passed to system() (line 42)

### Sanitization
- sanitize() removes semicolons and pipes
- Bypass: Use newline (%0a) or $() syntax

### Exploitability
- Confirmed exploitable
- 载荷: `valid_command%0awhoami`
```

## 集成 with Other Skills

- Use **dangerous-functions** to identify sinks
- Use **vuln-patterns** for exploitation techniques
- Use **exploit-techniques** to develop PoC
