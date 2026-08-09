# 项目工具与命令能力清单

> 本文档由审计工具自动生成，用于记录项目中用到的所有工具、命令及能力。

## 系统命令
（审计工具会自动提取所有调用的系统命令，例如：）
- `grep`：文本搜索
- `awk`：文本处理
- `sed`：流编辑器
- `curl`：网络请求
- `docker`：容器管理
- `kubectl`：Kubernetes 集群管理
- `git`：版本控制
- `npm`/`yarn`：包管理
- `make`：构建工具
- `gcc`/`g++`：C/C++ 编译器

## 第三方工具
（审计工具会自动提取所有第三方工具调用，例如：）
- `jq`：JSON 处理
- `yq`：YAML 处理
- `httpie`：HTTP 客户端
- `fzf`：模糊搜索
- `bat`：文件内容查看
- `exa`：文件列表查看

## 自定义脚本与函数
（审计工具会自动提取所有自定义脚本和函数，例如：）
- `src/audit.sh`：审计主入口
- `src/scanner.sh`：源码扫描模块
- `src/doc_parser.sh`：文档解析模块
- `src/comparator.sh`：差异对比模块

## 配置文件能力
（审计工具会自动提取配置文件中的能力定义，例如：）
- `config/audit.conf`：审计规则配置
- `.gitignore`：Git 忽略规则配置
- `package.json`：Node.js 项目依赖与脚本配置
- `Dockerfile`：Docker 镜像构建配置

## 更新记录
| 日期 | 更新内容 | 更新人 |
| --- | --- | --- |
| 2024-XX-XX | 初始版本，包含所有审计到的工具与命令 | 审计工具 |
