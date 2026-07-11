---
name: 设置
description: "设置 — Claude Code 设置和配置功能"
level: 2
---

# 设置

使用 `/oh-my-claudecode:设置` 作为统一的设置/配置入口点。

## 使用方法

```bash
/oh-my-claudecode:设置                # 完整设置向导
/oh-my-claudecode:设置 doctor         # 安装诊断
/oh-my-claudecode:设置 mcp            # MCP 服务器配置
/oh-my-claudecode:设置 wizard --local # 显式向导路径
```

## 路由规则

仅根据**第一个参数**处理请求，以便安装/设置问题立即进入正确的流程：

- 无参数、`wizard`、`local`、`global` 或 `--force` -> 路由到 `/oh-my-claudecode:omc-设置`，带有相同的剩余参数
- `doctor` -> 路由到 `/oh-my-claudecode:omc-doctor`，带有 `doctor` 令牌之后的所有内容
- `mcp` -> 路由到 `/oh-my-claudecode:mcp-设置`，带有 `mcp` 令牌之后的所有内容

示例：

```bash
/oh-my-claudecode:设置 --local          # => /oh-my-claudecode:omc-设置 --local
/oh-my-claudecode:设置 doctor --json    # => /oh-my-claudecode:omc-doctor --json
/oh-my-claudecode:设置 mcp github       # => /oh-my-claudecode:mcp-设置 github
```

## 功能说明

### 完整设置向导
- 交互式配置 Claude Code
- 设置 API 密钥和端点
- 配置 MCP 服务器
- 设置环境变量
- 验证安装完整性

### 安装诊断
- 检查系统依赖
- 验证 API 连接
- 测试工具功能
- 诊断常见问题
- 生成诊断报告

### MCP 服务器配置
- 添加 MCP 服务器
- 配置服务器连接
- 管理服务器列表
- 测试服务器连接
- 更新服务器配置

## 配置选项

### 本地配置
- 项目级配置
- 用户级配置
- 环境变量配置
- 配置文件管理

### 全局配置
- 系统级设置
- 默认值配置
- 模板管理
- 插件配置

## 最佳实践

### 初始设置
1. 运行完整设置向导
2. 配置 API 端点
3. 添加 MCP 服务器
4. 验证安装

### 故障排除
1. 运行安装诊断
2. 检查错误日志
3. 验证网络连接
4. 更新配置

### 维护更新
1. 定期检查更新
2. 备份配置
3. 测试新功能
4. 更新文档

## 注意事项

- `/oh-my-claudecode:omc-设置`、`/oh-my-claudecode:omc-doctor` 和 `/oh-my-claudecode:mcp-设置` 仍然是有效的兼容性入口点。
- 在新文档和用户指南中优先使用 `/oh-my-claudecode:设置`。

## 常见问题

### 配置问题
- 配置文件位置错误
- 权限问题
- 格式错误
- 依赖缺失

### 连接问题
- API 端点不可达
- 认证失败
- 网络限制
- 超时设置

### 功能问题
- 工具不可用
- 命令未识别
- 性能问题
- 兼容性问题

## 支持资源

### 文档
- 官方文档
- 社区指南
- 故障排除手册
- API 参考

### 社区
- 问题跟踪
- 讨论论坛
- 贡献指南
- 更新日志

任务：{{ARGUMENTS}}
