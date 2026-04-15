# version.md

## 版本显示技能 (version)

### 功能说明

该技能用于显示当前会话运行的 Claude Code 版本信息，包括：
- 版本号（如 `1.0.0`）
- 构建时间（如果可用）

### 输出格式

```
Claude Code v1.0.0 (built 2026-04-15)
```

或仅显示版本号（当无 BUILD_TIME 时）：

```
Claude Code v1.0.0
```

### 使用方式

#### 交互式模式

**方法一：命令行调用**
```bash
claude version
```

**方法二：通过环境变量启用**
该技能仅在以下条件下可用：
- 设置环境变量：`USER_TYPE=ant`

```bash
export USER_TYPE=ant
claude version
```

#### 非交互式模式

当在脚本中调用时，会自动检测并显示版本。

### 配置示例

**settings.json 配置：**
```json
{
  "version": {
    "enabled": true,
    "isEnabled": () => process.env.USER_TYPE === 'ant'
  }
}
```

---
