# 任务管理命令使用指南 本文档详细介绍了 Doge Code 中的任务管理命令，帮助您高效管理任务。 ## 命令概览 ### 1. 简单任务创建 (/task)
**用途**: 快速创建简单的任务记录
**特点**: 简洁、快速、适合临时任务 ### 2. 完整任务管理 (/task-create)
**用途**: 完整的任务管理系统
**特点**: 支持创建、列表、完成、删除、清理等完整功能 ## 详细使用说明 ### 📝 /task 命令（简单任务创建） #### 基本用法
```bash
# 创建简单任务
/task "编写一个记事本软件"
/task "完成项目文档"
/task "修复bug"
``` #### 命令输出示例
```
## 任务已创建 ✓ **任务名称**: 编写一个记事本软件
**任务ID**: simple_1720140000000
**状态**: 待处理
**创建时间**: 2024-07-05 12:00:00 > 提示：使用 /task-create list 查看所有任务
> 使用 /task-create done simple_1720140000000 标记为完成
``` #### 查看帮助
```bash
# 查看命令帮助
/task
``` ### 📋 /task-create 命令（完整任务管理） #### 1. 创建任务
```bash
# 创建基本任务
/task-create "编写一个记事本软件" # 创建带优先级的任务
/task-create "修复紧急bug" high
/task-create "编写文档" medium
/task-create "整理代码" low # 创建紧急任务
/task-create "服务器宕机" urgent
``` #### 2. 查看任务列表
```bash
# 查看所有任务
/task-create list
/task-create ls # 空参数也显示列表
/task-create
``` #### 3. 标记任务完成
```bash
# 标记任务为完成状态
/task-create done <taskId>
/task-create complete <taskId> # 示例
/task-create done task_1720140000000
``` #### 4. 删除任务
```bash
# 删除指定任务
/task-create delete <taskId>
/task-create rm <taskId> # 示例
/task-create delete task_1720140000000
``` #### 5. 清理已完成任务
```bash
# 清理所有已完成的任务
/task-create clear-done
``` ## 任务状态说明 - **pending**: 待处理（默认状态）
- **in-progress**: 进行中
- **done**: 已完成
- **cancelled**: 已取消 ## 优先级说明 - **urgent**: 紧急（最高优先级）
- **high**: 高优先级
- **medium**: 中优先级（默认）
- **low**: 低优先级 ## 使用场景建议 ### 场景1：快速记录想法
```bash
# 快速记录临时想法或待办事项
/task "研究新的UI框架"
/task "学习TypeScript高级特性"
``` ### 场景2：项目管理
```bash
# 创建项目任务
/task-create "设计数据库架构" high
/task-create "编写用户认证模块" medium
/task-create "编写单元测试" low # 查看项目进度
/task-create list # 完成任务
/task-create done task_1720140000001
``` ### 场景3：Bug跟踪
```bash
# 记录bug
/task-create "修复登录页面样式问题" high
/task-create "优化数据库查询性能" medium # 标记bug已修复
/task-create done task_1720140000002
``` ## 常见问题 ### Q1: /task 和 /task-create 有什么区别？
- **/task**: 简单快速，只创建任务，适合临时记录
- **/task-create**: 功能完整，支持任务的全生命周期管理 ### Q2: 任务数据存储在哪里？
任务数据持久化存储在本地，重启应用后仍然存在。 ### Q3: 如何查看任务ID？
使用 `/task-create list` 命令查看所有任务及其ID。 ### Q4: 可以批量操作吗？
目前支持批量清理已完成任务：`/task-create clear-done` ## 最佳实践 1. **命名规范**: 任务名称要具体明确
2. **优先级合理**: 根据重要性设置优先级
3. **及时清理**: 定期使用 `/task-create clear-done` 清理已完成任务
4. **结合使用**: 快速想法用 `/task`，正式任务用 `/task-create` ## 示例工作流 ```bash
# 1. 快速记录想法
/task "研究响应式设计" # 2. 创建正式开发任务
/task-create "实现首页响应式布局" high # 3. 查看所有任务
/task-create list # 4. 完成任务
/task-create done task_1720140000003 # 5. 清理已完成任务
/task-create clear-done
``` --- **提示**: 所有命令都有内置帮助，输入命令不带参数即可查看使用方法。
