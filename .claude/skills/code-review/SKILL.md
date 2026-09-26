---
name: code-review
description: 执行彻底的代码审查，含安全性、性能和可维护性分析。当用户要求审查代码、检查 bug 或审计代码库时使用。
---

# 代码审查技能

你现在具备执行全面代码审查的专长。请遵循此结构化方法：

## 审查清单

### 1. 安全性（关键）

检查：
- [ ] **注入漏洞**：SQL、命令、XSS、模板注入
- [ ] **认证问题**：硬编码凭证、弱认证
- [ ] **授权缺陷**：缺少访问控制、IDOR
- [ ] **数据暴露**：日志、错误消息中的敏感数据
- [ ] **密码学**：弱算法、密钥管理不当
- [ ] **依赖**：已知漏洞（用 `npm audit`、`pip-audit` 检查）

```bash
# 快速安全扫描
npm audit                    # Node.js
pip-audit                    # Python
cargo audit                  # Rust
grep -r "password\|secret\|api_key" --include="*.py" --include="*.js"
```

### 2. 正确性

检查：
- [ ] **逻辑错误**：差一错误、空值处理、边界情况
- [ ] **竞态条件**：无同步的并发访问
- [ ] **资源泄漏**：未关闭的文件、连接、内存
- [ ] **错误处理**：被吞掉的异常、缺失的错误路径
- [ ] **类型安全**：隐式转换、any 类型

### 3. 性能

检查：
- [ ] **N+1 查询**：循环中的数据库调用
- [ ] **内存问题**：大量分配、被保留的引用
- [ ] **阻塞操作**：异步代码中的同步 I/O
- [ ] **低效算法**：本可 O(n) 却用 O(n^2)
- [ ] **缺少缓存**：重复的高开销计算

### 4. 可维护性

检查：
- [ ] **命名**：清晰、一致、具描述性
- [ ] **复杂度**：函数 > 50 行、嵌套 > 3 层
- [ ] **重复**：复制粘贴的代码块
- [ ] **死代码**：未使用的导入、不可达分支
- [ ] **注释**：过时、冗余，或在需要处缺失

### 5. 测试

检查：
- [ ] **覆盖**：关键路径已测试
- [ ] **边界情况**：null、空值、边界值
- [ ] **Mock**：外部依赖已隔离
- [ ] **断言**：有意义、具体的检查

## 审查输出格式

```markdown
## 代码审查：[文件/组件名]

### 摘要
[1-2 句话概述]

### 严重问题
1. **[问题]**（第 X 行）：[描述]
   - 影响：[可能出什么问题]
   - 修复：[建议方案]

### 改进建议
1. **[建议]**（第 X 行）：[描述]

### 正面评价
- [做得好的地方]

### 结论
[ ] 可以合并
[ ] 需要小幅修改
[ ] 需要大幅修订
```

## 常见需标记的模式

### Python
```python
# 错误：SQL 注入
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
# 正确：
cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))

# 错误：命令注入
os.system(f"ls {user_input}")
# 正确：
subprocess.run(["ls", user_input], check=True)

# 错误：可变默认参数
def append(item, lst=[]):  # 缺陷：共享的可变默认值
# 正确：
def append(item, lst=None):
    lst = lst or []
```

### JavaScript/TypeScript
```javascript
// 错误：原型污染
Object.assign(target, userInput)
// 正确：
Object.assign(target, sanitize(userInput))

// 错误：使用 eval
eval(userCode)
// 正确：绝不对用户输入使用 eval

// 错误：回调地狱
getData(x => process(x, y => save(y, z => done(z))))
// 正确：
const data = await getData();
const processed = await process(data);
await save(processed);
```

## 审查命令

```bash
# 显示最近的变更
git diff HEAD~5 --stat
git log --oneline -10

# 查找潜在问题
grep -rn "TODO\|FIXME\|HACK\|XXX" .
grep -rn "password\|secret\|token" . --include="*.py"

# 检查复杂度（Python）
pip install radon && radon cc . -a

# 检查依赖
npm outdated  # Node
pip list --outdated  # Python
```

## 审查工作流

1. **理解上下文**：阅读 PR 描述与关联议题
2. **运行代码**：如可能，构建、测试、本地运行
3. **自顶向下阅读**：从主要入口点开始
4. **检查测试**：变更是否有测试？测试是否通过？
5. **安全扫描**：运行自动化工具
6. **人工审查**：使用上面的清单
7. **撰写反馈**：具体、给出修复建议、保持友善
