---
name: linux-故障排除
description: "用于诊断和解决系统问题、性能问题和服务故障的 Linux 系统故障排除工作流。"
category: granular-工作流-bundle
risk: safe
source: personal
date_added: "2026-02-27"
---

# Linux 故障排除工作流

## 概述

专门用于诊断和解决 Linux 系统问题的工作流，包括性能问题、服务故障、网络问题和资源限制。

## 何时使用此工作流

在以下情况使用此工作流：
- 诊断系统性能问题时
- 排除服务故障时
- 调查网络问题时
- 解决磁盘空间问题时
- 调试应用程序错误时

## 工作流阶段

### 阶段 1：初步评估

#### 调用的技能
- `bash-linux` - Linux 命令
- `devops-troubleshooter` - 故障排除

#### 操作步骤
1. 检查系统运行时间
2. 检查最近的更改
3. 识别症状
4. 收集错误消息
5. 记录发现

#### 命令
```bash
uptime
hostnamectl
cat /etc/os-release
dmesg | tail -50
```

#### 复制粘贴提示
```
使用 @bash-linux 收集系统信息
```

### 阶段 2：资源分析

#### 调用的技能
- `bash-linux` - 资源命令
- `performance-engineer` - 性能分析

#### 操作步骤
1. 检查 CPU 使用率
2. 分析内存
3. 检查磁盘空间
4. 监控 I/O
5. 检查网络

#### 命令
```bash
top -bn1 | head -20
free -h
df -h
iostat -x 1 5
```

#### 复制粘贴提示
```
Use @performance-engineer to analyze system resources
```

### 阶段 3：进程调查

#### 调用的技能
- `bash-linux` - 进程命令
- `server-management` - 进程管理

#### 操作步骤
1. 列出运行中的进程
2. 识别资源大户
3. 检查进程状态
4. 查看进程树
5. 分析 strace 输出

#### 命令
```bash
ps aux --sort=-%cpu | head -10
pstree -p
lsof -p PID
strace -p PID
```

#### 复制粘贴提示
```
Use @server-management to investigate processes
```

### 阶段 4：日志分析

#### 调用的技能
- `bash-linux` - 日志命令
- `error-detective` - 错误检测

#### 操作步骤
1. 检查系统日志
2. 查看应用日志
3. 搜索错误
4. 分析日志模式
5. 关联事件

#### 命令
```bash
journalctl -xe
tail -f /var/log/syslog
grep -i error /var/log/*
```

#### 复制粘贴提示
```
Use @error-detective to analyze log files
```

### 阶段 5：网络诊断

#### 调用的技能
- `bash-linux` - 网络命令
- `network-engineer` - 网络故障排除

#### 操作步骤
1. 检查网络接口
2. 测试连通性
3. 分析连接
4. 查看防火墙规则
5. 检查 DNS 解析

#### 命令
```bash
ip addr show
ss -tulpn
curl -v http://target
dig domain
```

#### 复制粘贴提示
```
Use @network-engineer to diagnose network issues
```

### 阶段 6：服务故障排除

#### 调用的技能
- `server-management` - 服务管理
- `systematic-debugging` - 调试

#### 操作步骤
1. 检查服务状态
2. 查看服务日志
3. 测试服务重启
4. 验证依赖
5. 检查配置

#### 命令
```bash
systemctl status service
journalctl -u service -f
systemctl restart service
```

#### 复制粘贴提示
```
Use @systematic-debugging to troubleshoot service issues
```

### 阶段 7：解决方案

#### 调用的技能
- `incident-responder` - 事件响应
- `bash-pro` - 修复实现

#### 操作步骤
1. 实施修复
2. 验证解决
3. 监控稳定性
4. 记录解决方案
5. 创建预防计划

#### 复制粘贴提示
```
Use @incident-responder to implement resolution
```

## 故障排除检查清单

- [ ] 系统信息已收集
- [ ] 资源已分析
- [ ] 日志已查看
- [ ] 网络已测试
- [ ] 服务已验证
- [ ] 问题已解决
- [ ] 文档已创建

## 质量关卡

- [ ] 根本原因已识别
- [ ] 修复已验证
- [ ] 监控已到位
- [ ] 文档已完备

## 相关工作流捆绑包

- `os-scripting` - OS 脚本
- `bash-scripting` - Bash 脚本
- `cloud-devops` - DevOps

## 局限性
- 仅当任务明确匹配上述范围时使用此技能。
- 不要将输出视为特定环境验证、测试或专家审查的替代品。
- 如果缺少所需的输入、权限、安全边界或成功标准，请停止并要求澄清。
